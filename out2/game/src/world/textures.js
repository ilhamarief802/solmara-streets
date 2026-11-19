// Every pixel in Solmara is painted at boot on a 2D canvas: asphalt, lane paint,
// pavements, facades with lit windows, curtain-wall glass, grass, sand, water, concrete,
// warehouse siding, boardwalk planks and neon signs. Nothing is fetched. Textures are
// cached by name, wrapped and mip-mapped once, and reuse a single seeded random stream
// so the same wall has the same lit windows every run.
//
// Facades come as a pair: `map` is the daylight wall, `lights` is black with only the
// lit windows, used as an emissive map that the world turns up after dusk.

import { Random } from '../core/rng.js';
import { DISTRICTS, districtOf } from './districts.js';

const NEON_WORDS = ['SOLMARA', 'NEON', 'CLUB LUNA', 'MOTEL', 'PIER 9', 'VERANO', 'TIDES', '24 HOURS', 'PALMAS', 'RADIO'];

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function hex(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function mixHex(a, b, t) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

function speckle(ctx, random, width, height, count, palette, alpha = 0.16) {
  for (let i = 0; i < count; i += 1) {
    const x = random.range(0, width);
    const y = random.range(0, height);
    const size = random.range(0.6, 2.6);
    ctx.fillStyle = hex(random.pick(palette));
    ctx.globalAlpha = random.range(alpha * 0.35, alpha);
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;
}

/** A soft rectangle of colour, used for stains and shade. */
function blotch(ctx, random, width, height, count, color, alpha) {
  for (let i = 0; i < count; i += 1) {
    const x = random.range(0, width);
    const y = random.range(0, height);
    const r = random.range(width * 0.05, width * 0.28);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, ${alpha})`);
    gradient.addColorStop(1, `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function baseAsphalt(ctx, random, width, height, tint = 0x3c3e43) {
  ctx.fillStyle = hex(tint);
  ctx.fillRect(0, 0, width, height);
  blotch(ctx, random, width, height, 26, 0x101216, 0.22);
  blotch(ctx, random, width, height, 18, 0x565a5e, 0.08);
  speckle(ctx, random, width, height, 2600, [0x1c1e21, 0x494c50, 0x63666a, 0x3a3d41], 0.28);
  // Hairline cracks.
  ctx.strokeStyle = 'rgba(18, 19, 22, 0.55)';
  for (let i = 0; i < 7; i += 1) {
    ctx.lineWidth = random.range(0.6, 1.6);
    ctx.beginPath();
    let x = random.range(0, width);
    let y = random.range(0, height);
    ctx.moveTo(x, y);
    for (let step = 0; step < 6; step += 1) {
      x += random.range(-26, 26);
      y += random.range(4, 30);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

export class TextureLibrary {
  constructor(renderer = null) {
    this.renderer = renderer;
    this.cache = new Map();
    this.facadeCache = new Map();
    this.neonCache = new Map();
    this.anisotropy = renderer?.userData?.software ? 1 : 4;
    try {
      if (!renderer?.userData?.software) this.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() ?? 4);
    } catch {
      this.anisotropy = 4;
    }
    this.count = 0;
  }

  _texture(name, canvas, { repeat = [1, 1], srgb = true } = {}) {
    const key = name;
    if (this.cache.has(key)) return this.cache.get(key);
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = name;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
    texture.anisotropy = this.anisotropy;
    if (srgb && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    texture.userData = { generated: true, name };
    this.cache.set(key, texture);
    this.count += 1;
    return texture;
  }

  // ---------------------------------------------------------------- ground surfaces

  asphalt() {
    if (this.cache.has('asphalt')) return this.cache.get('asphalt');
    const size = 512;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    baseAsphalt(ctx, new Random('asphalt'), size, size);
    return this._texture('asphalt', canvas, { repeat: [1, 1] });
  }

  /** A road ribbon: edge lines and a dashed centre line, drawn along V. */
  road() {
    if (this.cache.has('road')) return this.cache.get('road');
    const width = 256;
    const height = 512;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const random = new Random('road');
    baseAsphalt(ctx, random, width, height, 0x42454a);
    // Edge lines, just inside the kerb.
    ctx.fillStyle = 'rgba(232, 230, 218, 0.8)';
    ctx.fillRect(12, 0, 6, height);
    ctx.fillRect(width - 18, 0, 6, height);
    // Dashed centre, two lanes.
    ctx.fillStyle = 'rgba(240, 226, 168, 0.85)';
    for (let y = 0; y < height; y += 96) ctx.fillRect(width / 2 - 3, y, 6, 46);
    blotch(ctx, random, width, height, 16, 0x14161a, 0.2);
    return this._texture('road', canvas, { repeat: [1, 1] });
  }

  crossing() {
    if (this.cache.has('crossing')) return this.cache.get('crossing');
    const size = 256;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const random = new Random('crossing');
    baseAsphalt(ctx, random, size, size, 0x3e4146);
    ctx.fillStyle = 'rgba(238, 233, 216, 0.82)';
    for (let i = 0; i < 6; i += 1) {
      ctx.fillRect(18 + i * 38, 10, 22, size - 20);
    }
    speckle(ctx, random, size, size, 600, [0x1b1d20, 0x5a5d60], 0.2);
    return this._texture('crossing', canvas, { repeat: [1, 1] });
  }

  sidewalk() {
    if (this.cache.has('sidewalk')) return this.cache.get('sidewalk');
    const size = 256;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const random = new Random('sidewalk');
    ctx.fillStyle = '#b7b1a6';
    ctx.fillRect(0, 0, size, size);
    blotch(ctx, random, size, size, 18, 0x8e887d, 0.22);
    speckle(ctx, random, size, size, 1800, [0x9d978c, 0xcac4b8, 0x8a857b], 0.3);
    // Paving joints, one texture tile is about four slabs.
    ctx.strokeStyle = 'rgba(88, 84, 78, 0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i += 1) {
      const p = (i / 4) * size;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }
    return this._texture('sidewalk', canvas, { repeat: [1, 1] });
  }

  concrete() {
    if (this.cache.has('concrete')) return this.cache.get('concrete');
    const size = 256;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const random = new Random('concrete');
    ctx.fillStyle = '#8f8d86';
    ctx.fillRect(0, 0, size, size);
    blotch(ctx, random, size, size, 22, 0x6d6b64, 0.2);
    blotch(ctx, random, size, size, 10, 0xb5b2aa, 0.12);
    speckle(ctx, random, size, size, 1400, [0x7b7972, 0xa3a199, 0x696760], 0.25);
    ctx.strokeStyle = 'rgba(70, 68, 63, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.stroke();
    return this._texture('concrete', canvas, { repeat: [1, 1] });
  }

  grass() {
    if (this.cache.has('grass')) return this.cache.get('grass');
    const size = 256;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const random = new Random('grass');
    ctx.fillStyle = '#6f8a4a';
    ctx.fillRect(0, 0, size, size);
    blotch(ctx, random, size, size, 30, 0x4f6a34, 0.3);
    blotch(ctx, random, size, size, 18, 0x93a95e, 0.2);
    for (let i = 0; i < 2600; i += 1) {
      ctx.fillStyle = hex(random.pick([0x567239, 0x7e9a54, 0x48602f, 0x9aae68]));
      ctx.globalAlpha = random.range(0.2, 0.6);
      ctx.fillRect(random.range(0, size), random.range(0, size), random.range(0.6, 2), random.range(2, 6));
    }
    ctx.globalAlpha = 1;
    return this._texture('grass', canvas, { repeat: [1, 1] });
  }

  sand() {
    if (this.cache.has('sand')) return this.cache.get('sand');
    const size = 256;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const random = new Random('sand');
    ctx.fillStyle = '#d9c49a';
    ctx.fillRect(0, 0, size, size);
    blotch(ctx, random, size, size, 26, 0xc2a97a, 0.18);
    blotch(ctx, random, size, size, 14, 0xeadcbc, 0.2);
    speckle(ctx, random, size, size, 2400, [0xbda779, 0xe8d8b4, 0xcfb98c], 0.4);
    // Wind ripples.
    ctx.strokeStyle = 'rgba(178, 154, 110, 0.22)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i += 1) {
      const y = random.range(0, size);
      ctx.beginPath();
      for (let x = 0; x <= size; x += 16) {
        ctx.lineTo(x, y + Math.sin(x * 0.06 + i) * 6);
      }
      ctx.stroke();
    }
    return this._texture('sand', canvas, { repeat: [1, 1] });
  }

  water() {
    if (this.cache.has('water')) return this.cache.get('water');
    const size = 256;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const random = new Random('water');
    ctx.fillStyle = '#1d4a58';
    ctx.fillRect(0, 0, size, size);
    blotch(ctx, random, size, size, 20, 0x0e2c38, 0.3);
    blotch(ctx, random, size, size, 12, 0x35707c, 0.2);
    ctx.strokeStyle = 'rgba(190, 226, 220, 0.16)';
    for (let i = 0; i < 40; i += 1) {
      const y = random.range(0, size);
      ctx.lineWidth = random.range(0.6, 1.8);
      ctx.beginPath();
      ctx.moveTo(random.range(0, size * 0.5), y);
      ctx.bezierCurveTo(size * 0.3, y + 5, size * 0.6, y - 5, size, y + 2);
      ctx.stroke();
    }
    return this._texture('water', canvas, { repeat: [1, 1] });
  }

  terrainGrit() {
    if (this.cache.has('terrain-grit')) return this.cache.get('terrain-grit');
    const size = 256;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const random = new Random('grit');
    ctx.fillStyle = '#6d6a5e';
    ctx.fillRect(0, 0, size, size);
    blotch(ctx, random, size, size, 30, 0x555246, 0.3);
    speckle(ctx, random, size, size, 2600, [0x4c4a40, 0x7d7a6c, 0x8f8b7a, 0x5d5a4c], 0.5);
    return this._texture('terrain-grit', canvas, { repeat: [1, 1] });
  }

  boardwalk() {
    if (this.cache.has('boardwalk')) return this.cache.get('boardwalk');
    const width = 256;
    const height = 256;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const random = new Random('boardwalk');
    ctx.fillStyle = '#9a7b55';
    ctx.fillRect(0, 0, width, height);
    const plank = 32;
    for (let y = 0; y < height; y += plank) {
      ctx.fillStyle = hex(mixHex(0x9a7b55, random.pick([0x7d6142, 0xb08e63, 0x8b6d4b]), random.range(0.2, 0.7)));
      ctx.fillRect(0, y, width, plank - 3);
      ctx.fillStyle = 'rgba(60, 44, 30, 0.55)';
      ctx.fillRect(0, y + plank - 3, width, 3);
      ctx.strokeStyle = 'rgba(80, 60, 40, 0.25)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i += 1) {
        const gy = y + random.range(4, plank - 5);
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(width * 0.3, gy + 2, width * 0.6, gy - 2, width, gy);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(50, 40, 28, 0.5)';
      ctx.fillRect(12, y + plank / 2, 3, 3);
      ctx.fillRect(width - 15, y + plank / 2, 3, 3);
    }
    return this._texture('boardwalk', canvas, { repeat: [1, 1] });
  }

  runway() {
    if (this.cache.has('runway')) return this.cache.get('runway');
    const width = 512;
    const height = 512;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const random = new Random('runway');
    baseAsphalt(ctx, random, width, height, 0x4a4640);
    ctx.fillStyle = 'rgba(230, 224, 200, 0.7)';
    for (let y = 0; y < height; y += 120) ctx.fillRect(width / 2 - 2, y, 4, 62);
    ctx.fillRect(24, 0, 3, height);
    ctx.fillRect(width - 27, 0, 3, height);
    return this._texture('runway', canvas, { repeat: [1, 1] });
  }

  roof() {
    if (this.cache.has('roof')) return this.cache.get('roof');
    const size = 128;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const random = new Random('roof');
    ctx.fillStyle = '#5c5d60';
    ctx.fillRect(0, 0, size, size);
    blotch(ctx, random, size, size, 14, 0x3f4043, 0.3);
    speckle(ctx, random, size, size, 1400, [0x4a4b4e, 0x747578, 0x343538], 0.5);
    return this._texture('roof', canvas, { repeat: [1, 1] });
  }

  // -------------------------------------------------------------------- facades

  /**
   * A facade pair for a district. variant picks a wall colour from the district's
   * palette and a window pattern; the emissive map contains only the lit windows.
   */
  facade(districtId, variant = 0) {
    const key = `facade:${districtId}:${variant}`;
    if (this.facadeCache.has(key)) return this.facadeCache.get(key);
    const district = districtOf(districtId);
    const palette = district.palette;
    const wall = palette.facades[((variant % palette.facades.length) + palette.facades.length) % palette.facades.length];
    const width = 256;
    const height = 512;
    const canvas = createCanvas(width, height);
    const lightsCanvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const lightCtx = lightsCanvas.getContext('2d');
    const random = new Random(`${key}:wall`);
    const lightRandom = new Random(`${key}:lights`);

    ctx.fillStyle = hex(wall);
    ctx.fillRect(0, 0, width, height);
    blotch(ctx, random, width, height, 28, mixHex(wall, 0x000000, 0.35), 0.16);
    blotch(ctx, random, width, height, 18, mixHex(wall, 0xffffff, 0.3), 0.1);
    speckle(ctx, random, width, height, 1600, [mixHex(wall, 0x000000, 0.2), mixHex(wall, 0xffffff, 0.2)], 0.18);

    lightCtx.fillStyle = '#000000';
    lightCtx.fillRect(0, 0, width, height);

    // A storefront band at the bottom of the texture.
    const shopTop = height - 96;
    ctx.fillStyle = hex(mixHex(wall, 0x000000, 0.28));
    ctx.fillRect(0, shopTop, width, 96);
    ctx.fillStyle = hex(palette.glass);
    for (let i = 0; i < 4; i += 1) ctx.fillRect(10 + i * 62, shopTop + 16, 50, 64);

    const cols = 5;
    const rows = 10;
    const marginX = 18;
    const gapX = (width - marginX * 2) / cols;
    const top = 26;
    const rowHeight = (shopTop - top - 8) / rows;
    const litChance = districtId === 'neon' ? 0.5 : districtId === 'downtown' ? 0.4 : 0.32;
    const warm = [0xffc978, 0xffe3a8, 0xffd08a, 0xfff1cf];
    const cool = [0xb8d8e8, 0x9fc4dc];

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = marginX + col * gapX + gapX * 0.16;
        const y = top + row * rowHeight + rowHeight * 0.18;
        const w = gapX * 0.68;
        const h = rowHeight * 0.58;
        const lit = lightRandom.chance(litChance);
        const glassTint = random.pick(cool);
        ctx.fillStyle = hex(lit ? random.pick(warm) : mixHex(palette.glass, glassTint, random.range(0, 0.4)));
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = hex(mixHex(wall, 0x000000, 0.45));
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        // A sill and a little balcony on the residential districts.
        ctx.fillStyle = hex(mixHex(wall, 0xffffff, 0.14));
        ctx.fillRect(x - 2, y + h, w + 4, 3);
        if (districtId === 'verano' && row % 3 === 1) {
          ctx.fillStyle = hex(palette.trim);
          ctx.fillRect(x - 3, y + h + 3, w + 6, 4);
        }
        if (lit) {
          lightCtx.fillStyle = hex(random.pick(warm));
          lightCtx.fillRect(x, y, w, h);
        }
      }
      if (districtId === 'neon' && row % 2 === 0) {
        ctx.fillStyle = 'rgba(20, 16, 22, 0.45)';
        ctx.fillRect(0, top + row * rowHeight + rowHeight - 3, width, 3);
      }
    }

    // Signage band for the neon strip and downtown lobbies.
    if (districtId === 'neon' || districtId === 'downtown') {
      const accent = palette.signage[variant % palette.signage.length];
      ctx.fillStyle = hex(accent);
      ctx.globalAlpha = 0.85;
      ctx.fillRect(14, 8, width - 28, 10);
      ctx.globalAlpha = 1;
      lightCtx.fillStyle = hex(accent);
      lightCtx.fillRect(14, 8, width - 28, 10);
    }

    const map = this._texture(`facade-map:${key}`, canvas);
    const lights = this._texture(`facade-lights:${key}`, lightsCanvas);
    lights.wrapS = THREE.RepeatWrapping;
    lights.wrapT = THREE.RepeatWrapping;
    const pair = { map, lights, district: districtId, variant };
    this.facadeCache.set(key, pair);
    return pair;
  }

  /** Curtain wall: deep glass panels with mullions and scattered lit offices. */
  glassWall(districtId = 'downtown', variant = 0) {
    const key = `glass:${districtId}:${variant}`;
    if (this.facadeCache.has(key)) return this.facadeCache.get(key);
    const district = districtOf(districtId);
    const width = 256;
    const height = 512;
    const canvas = createCanvas(width, height);
    const lightsCanvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const lightCtx = lightsCanvas.getContext('2d');
    const random = new Random(key);
    const base = mixHex(district.palette.glass, 0x6a92a8, variant * 0.12);
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, width, height);
    lightCtx.fillStyle = '#000';
    lightCtx.fillRect(0, 0, width, height);
    // Sky reflection gradient down the wall.
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `rgba(${(base >> 16) & 255}, ${(base >> 8) & 255}, ${base & 255}, 0.10)`);
    gradient.addColorStop(0.5, 'rgba(210, 235, 245, 0.22)');
    gradient.addColorStop(1, 'rgba(12, 18, 24, 0.35)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    const cols = 8;
    const rows = 16;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = (col / cols) * width;
        const y = (row / rows) * height;
        const w = width / cols;
        const h = height / rows;
        ctx.fillStyle = `rgba(255, 255, 255, ${random.range(0.02, 0.1)})`;
        ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
        if (random.chance(0.22)) {
          const warm = random.pick([0xffdca8, 0xfff0d0, 0xa8d8ff]);
          ctx.fillStyle = hex(warm);
          ctx.globalAlpha = 0.55;
          ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
          ctx.globalAlpha = 1;
          lightCtx.fillStyle = hex(warm);
          lightCtx.fillRect(x + 3, y + 3, w - 6, h - 6);
        }
      }
    }
    ctx.strokeStyle = 'rgba(24, 30, 34, 0.75)';
    ctx.lineWidth = 3;
    for (let col = 0; col <= cols; col += 1) {
      ctx.beginPath();
      ctx.moveTo((col / cols) * width, 0);
      ctx.lineTo((col / cols) * width, height);
      ctx.stroke();
    }
    for (let row = 0; row <= rows; row += 1) {
      ctx.beginPath();
      ctx.moveTo(0, (row / rows) * height);
      ctx.lineTo(width, (row / rows) * height);
      ctx.stroke();
    }
    const pair = {
      map: this._texture(`glass-map:${key}`, canvas),
      lights: this._texture(`glass-lights:${key}`, lightsCanvas),
      district: districtId,
      variant,
    };
    this.facadeCache.set(key, pair);
    return pair;
  }

  /** Corrugated warehouse siding, with a painted band at the bottom. */
  siding() {
    if (this.cache.has('siding')) return this.cache.get('siding');
    const width = 256;
    const height = 256;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const random = new Random('siding');
    ctx.fillStyle = '#7e8a85';
    ctx.fillRect(0, 0, width, height);
    for (let x = 0; x < width; x += 10) {
      ctx.fillStyle = `rgba(30, 36, 36, ${random.range(0.12, 0.3)})`;
      ctx.fillRect(x, 0, 3, height);
      ctx.fillStyle = `rgba(230, 236, 230, ${random.range(0.05, 0.14)})`;
      ctx.fillRect(x + 4, 0, 2, height);
    }
    blotch(ctx, random, width, height, 16, 0x4b514d, 0.3);
    speckle(ctx, random, width, height, 900, [0x5b6560, 0x9aa39d, 0x6f7974], 0.3);
    ctx.fillStyle = '#9c5a32';
    ctx.fillRect(0, height - 26, width, 26);
    return this._texture('siding', canvas, { repeat: [1, 1] });
  }

  // ----------------------------------------------------------------------- neon

  /** A glowing sign built from text, a border and a few scanlines. */
  neon(text, colorHex = 0xff5fc8, { vertical = false } = {}) {
    const key = `neon:${text}:${colorHex}:${vertical}`;
    if (this.neonCache.has(key)) return this.neonCache.get(key);
    const width = vertical ? 128 : 512;
    const height = vertical ? 512 : 128;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(10, 8, 16, 0.9)';
    ctx.fillRect(0, 0, width, height);
    const color = hex(colorHex);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.strokeRect(8, 8, width - 16, height - 16);
    ctx.fillStyle = color;
    ctx.font = vertical ? 'bold 62px "Arial Narrow", Arial, sans-serif' : 'bold 62px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (vertical) {
      const letters = text.replace(/\s+/g, '').slice(0, 7).split('');
      const step = (height - 40) / Math.max(1, letters.length);
      letters.forEach((letter, index) => ctx.fillText(letter, width / 2, 34 + step * (index + 0.5)));
    } else {
      ctx.fillText(text, width / 2, height / 2 + 3, width - 44);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000';
    for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 1);
    ctx.globalAlpha = 1;
    const texture = this._texture(key, canvas);
    texture.userData.neon = true;
    texture.userData.text = text;
    texture.userData.vertical = vertical;
    this.neonCache.set(key, texture);
    return texture;
  }

  /** A deterministic sign for a district and index, used on building faces. */
  buildingSign(districtId, index) {
    const district = districtOf(districtId);
    const color = district.palette.signage[((index % district.palette.signage.length) + district.palette.signage.length) % district.palette.signage.length];
    const word = districtId === 'neon' ? NEON_WORDS[index % NEON_WORDS.length] : districtId === 'harbour' ? ['PIER 9', 'CARGO', 'HAULAGE'][index % 3] : ['SOLMARA', 'VERANO', 'MARINA', 'CAFÉ SOL'][index % 4];
    return this.neon(word, color, { vertical: districtId === 'neon' && index % 3 === 0 });
  }

  /** A soft radial glow, used for lamp pools on the pavement and signal halos. */
  glow() {
    if (this.cache.has('glow')) return this.cache.get('glow');
    const size = 128;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 236, 196, 0.95)');
    gradient.addColorStop(0.35, 'rgba(255, 208, 140, 0.45)');
    gradient.addColorStop(1, 'rgba(255, 190, 110, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return this._texture('glow', canvas, { srgb: true });
  }

  // ---------------------------------------------------------------------- misc

  /** A flat colour texture, for materials that want a tint without a pattern. */
  flat(name, colorHex) {
    const key = `flat:${name}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const canvas = createCanvas(8, 8);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = hex(colorHex);
    ctx.fillRect(0, 0, 8, 8);
    return this._texture(key, canvas);
  }

  /** Every generated texture, for disposal and for the dossier's texture count. */
  list() {
    return [...this.cache.values()];
  }

  dispose() {
    for (const texture of this.cache.values()) texture.dispose();
    this.cache.clear();
    this.facadeCache.clear();
    this.neonCache.clear();
    this.count = 0;
  }
}

export { NEON_WORDS, hex as textureHex, mixHex };
