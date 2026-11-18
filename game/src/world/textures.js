// All of Solmara's art is drawn here, on canvases, at load. Nothing is loaded from disk: every
// texture is a CanvasTexture built from code, so the game ships no image files at all.
//
// The palettes are deliberately neutral (white-ish base) so meshes can tint the same texture with
// vertex colours: one draw call covers a whole district's facades. Facade families also get a
// companion emissive map holding only their window lights, which the clock fades in after dusk.

import { Random } from '../core/rng.js';
import { clamp, lerp } from '../core/math.js';

const cache = new Map();

/** Makes (and memoises) a canvas of the given size. */
function canvas2d(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx };
}

function finish(canvas, { repeat = [1, 1], anisotropy = 4, srgb = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = anisotropy;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Grain: per-pixel noise, the cheapest way to stop a flat fill looking like plastic. */
function grain(ctx, width, height, random, amount = 14, alpha = 0.5) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (random.float() - 0.5) * amount * 2;
    data[i] = clamp(data[i] + n, 0, 255);
    data[i + 1] = clamp(data[i + 1] + n, 0, 255);
    data[i + 2] = clamp(data[i + 2] + n, 0, 255);
    data[i + 3] = Math.min(255, data[i + 3] * alpha + 255 * (1 - alpha));
  }
  ctx.putImageData(image, 0, 0);
}

/** Speckles: small darker/lighter dots, for asphalt and concrete. */
function speckle(ctx, width, height, random, count, colors, size = 2) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(random.float() * colors.length)];
    const s = size * (0.4 + random.float());
    ctx.fillRect(random.float() * width, random.float() * height, s, s);
  }
}

/**
 * Road surface: asphalt with the centre line, lane dashes and edge lines baked in. The texture
 * repeats along the road's length only, so one quad per segment is all a street costs.
 */
function asphaltTexture() {
  const W = 128;
  const H = 512;
  const { canvas, ctx } = canvas2d(W, H);
  const random = new Random('tex:asphalt');
  ctx.fillStyle = '#3a3b3d';
  ctx.fillRect(0, 0, W, H);
  // Patchy repairs, subtly lighter and darker rectangles.
  for (let i = 0; i < 26; i++) {
    const shade = 46 + Math.floor(random.float() * 22);
    ctx.fillStyle = `rgb(${shade},${shade},${shade + 2})`;
    ctx.fillRect(random.float() * W, random.float() * H, 12 + random.float() * 46, 10 + random.float() * 60);
  }
  speckle(ctx, W, H, random, 2600, ['#33343a', '#4a4b50', '#414247', '#2e2f33'], 1.6);
  grain(ctx, W, H, random, 10, 0.85);

  // Edge lines: solid, worn.
  ctx.fillStyle = 'rgba(214,208,190,0.62)';
  ctx.fillRect(W * 0.055, 0, 2.5, H);
  ctx.fillRect(W * 0.93, 0, 2.5, H);
  // Lane dashes, one cycle per 12 m of road (H is one cycle along the road).
  ctx.fillStyle = 'rgba(222,214,190,0.55)';
  ctx.fillRect(W * 0.5 - 1.4, 0, 2.8, H * 0.34);
  // A faint second pair for four-lane avenues: the texture is shared, so keep them soft.
  ctx.fillStyle = 'rgba(214,208,190,0.24)';
  ctx.fillRect(W * 0.275, H * 0.12, 2, H * 0.3);
  ctx.fillRect(W * 0.715, H * 0.5, 2, H * 0.3);

  // A tyre-polish band down each lane.
  const polish = ctx.createLinearGradient(0, 0, W, 0);
  polish.addColorStop(0, 'rgba(0,0,0,0)');
  polish.addColorStop(0.24, 'rgba(0,0,0,0.10)');
  polish.addColorStop(0.36, 'rgba(0,0,0,0)');
  polish.addColorStop(0.64, 'rgba(0,0,0,0)');
  polish.addColorStop(0.76, 'rgba(0,0,0,0.10)');
  polish.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = polish;
  ctx.fillRect(0, 0, W, H);
  return finish(canvas, { repeat: [1, 1], anisotropy: 8 });
}

/** Sidewalk: poured concrete slabs with joints, a kerb edge on one side. */
function pavementTexture() {
  const SIZE = 256;
  const { canvas, ctx } = canvas2d(SIZE, SIZE);
  const random = new Random('tex:pavement');
  ctx.fillStyle = '#b9b4a8';
  ctx.fillRect(0, 0, SIZE, SIZE);
  // 2 x 2 slabs per tile, each a slightly different tone.
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      const tone = 176 + Math.floor(random.float() * 24);
      ctx.fillStyle = `rgb(${tone},${tone - 4},${tone - 16})`;
      ctx.fillRect(x * 128 + 2, y * 128 + 2, 124, 124);
    }
  }
  speckle(ctx, SIZE, SIZE, random, 900, ['#a8a294', '#c8c2b4', '#9c968a'], 2);
  grain(ctx, SIZE, SIZE, random, 8, 0.9);
  // Joints.
  ctx.strokeStyle = 'rgba(96,92,84,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(SIZE, 128);
  ctx.moveTo(128, 0);
  ctx.lineTo(128, SIZE);
  ctx.stroke();
  return finish(canvas, { repeat: [1, 1], anisotropy: 8 });
}

/** Boardwalk planks, running one way with nail pairs and gaps. */
function boardwalkTexture() {
  const W = 256;
  const H = 256;
  const { canvas, ctx } = canvas2d(W, H);
  const random = new Random('tex:boardwalk');
  ctx.fillStyle = '#8a6a4a';
  ctx.fillRect(0, 0, W, H);
  const plank = 32;
  for (let i = 0; i < H / plank; i++) {
    const tone = 118 + Math.floor(random.float() * 46);
    ctx.fillStyle = `rgb(${tone},${Math.floor(tone * 0.74)},${Math.floor(tone * 0.5)})`;
    ctx.fillRect(0, i * plank, W, plank - 2);
    // Grain lines along the plank.
    for (let g = 0; g < 6; g++) {
      ctx.strokeStyle = `rgba(60,40,26,${0.06 + random.float() * 0.12})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const y = i * plank + 3 + random.float() * (plank - 8);
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(W * 0.3, y + random.range(-2, 2), W * 0.7, y + random.range(-2, 2), W, y);
      ctx.stroke();
    }
    // Nails.
    ctx.fillStyle = 'rgba(44,32,22,0.55)';
    ctx.fillRect(10, i * plank + plank / 2 - 1, 3, 3);
    ctx.fillRect(W - 14, i * plank + plank / 2 - 1, 3, 3);
  }
  grain(ctx, W, H, random, 6, 0.9);
  return finish(canvas, { repeat: [1, 1], anisotropy: 4 });
}

/** Window layout for the facade families: rows and columns inside a texture tile of `floors`. */
function drawFacade(options) {
  const {
    key, size = 256, floors = 4, bays = 4, base = '#cfc8ba', windowBase = '#5e6b74',
    litChance = 0.34, lit = '#ffcb7a', style = 'punched', trim = '#9a9284', randomSeed = key,
  } = options;
  const random = new Random(`tex:${randomSeed}`);
  const { canvas, ctx } = canvas2d(size, size);
  const litCanvas = document.createElement('canvas');
  litCanvas.width = size;
  litCanvas.height = size;
  const litCtx = litCanvas.getContext('2d');
  litCtx.fillStyle = '#000000';
  litCtx.fillRect(0, 0, size, size);

  // The wall itself.
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // A plaster wash with faint horizontal banding: sun-bleached mood without a pattern.
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(255,255,255,${random.float() * 0.05})`;
    ctx.fillRect(0, random.float() * size, size, 1 + random.float() * 6);
  }
  speckle(ctx, size, size, random, 700, ['rgba(120,110,96,0.16)', 'rgba(255,248,232,0.14)'], 2.5);

  const cw = size / bays;
  const ch = size / floors;

  if (style === 'curtain') {
    // A glass curtain wall: mullions and a vertical reflected-sky gradient.
    for (let f = 0; f < floors; f++) {
      for (let b = 0; b < bays; b++) {
        const x = b * cw;
        const y = f * ch;
        const grad = ctx.createLinearGradient(x, y, x, y + ch);
        const top = 70 + Math.floor(random.float() * 30);
        grad.addColorStop(0, `rgb(${top + 34},${top + 56},${top + 66})`);
        grad.addColorStop(0.55, `rgb(${top + 12},${top + 34},${top + 46})`);
        grad.addColorStop(1, `rgb(${top - 12},${top + 6},${top + 18})`);
        ctx.fillStyle = grad;
        ctx.fillRect(x + 2, y + 2, cw - 4, ch - 4);
        if (random.float() < litChance) {
          litCtx.fillStyle = lit;
          litCtx.globalAlpha = 0.55 + random.float() * 0.45;
          litCtx.fillRect(x + 3, y + 3, cw - 6, ch - 6);
          litCtx.globalAlpha = 1;
        }
      }
    }
    // Mullions.
    ctx.strokeStyle = 'rgba(52,60,66,0.85)';
    ctx.lineWidth = 3;
    for (let b = 0; b <= bays; b++) {
      ctx.beginPath();
      ctx.moveTo(b * cw, 0);
      ctx.lineTo(b * cw, size);
      ctx.stroke();
    }
    for (let f = 0; f <= floors; f++) {
      ctx.beginPath();
      ctx.moveTo(0, f * ch);
      ctx.lineTo(size, f * ch);
      ctx.stroke();
    }
    // Spandrel band: a solid strip under each floor's glass.
    ctx.fillStyle = 'rgba(210,206,196,0.5)';
    for (let f = 0; f < floors; f++) ctx.fillRect(0, f * ch + ch * 0.82, size, ch * 0.16);
  } else {
    // Punched windows: a wall with a window opening per bay and floor, sills and a shadow.
    for (let f = 0; f < floors; f++) {
      for (let b = 0; b < bays; b++) {
        const x = b * cw;
        const y = f * ch;
        const wx = x + cw * 0.18;
        const wy = y + ch * 0.18;
        const ww = cw * 0.64;
        const wh = ch * 0.5;
        // Reveal shadow.
        ctx.fillStyle = 'rgba(40,38,34,0.22)';
        ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        const shade = 58 + Math.floor(random.float() * 34);
        const grad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
        grad.addColorStop(0, `rgb(${shade + 16},${shade + 26},${shade + 34})`);
        grad.addColorStop(1, `rgb(${shade - 8},${shade + 2},${shade + 8})`);
        ctx.fillStyle = grad;
        ctx.fillRect(wx, wy, ww, wh);
        // A reflection streak across the glass.
        ctx.fillStyle = 'rgba(210,228,236,0.16)';
        ctx.beginPath();
        ctx.moveTo(wx, wy + wh * 0.62);
        ctx.lineTo(wx + ww * 0.55, wy);
        ctx.lineTo(wx + ww * 0.78, wy);
        ctx.lineTo(wx, wy + wh * 0.92);
        ctx.closePath();
        ctx.fill();
        // Sill.
        ctx.fillStyle = trim;
        ctx.fillRect(wx - 3, wy + wh, ww + 6, 3);
        if (random.float() < litChance) {
          litCtx.fillStyle = lit;
          litCtx.globalAlpha = 0.5 + random.float() * 0.5;
          litCtx.fillRect(wx, wy, ww, wh);
          litCtx.globalAlpha = 1;
        }
      }
    }
    // Horizontal floor shadow line: cheap depth without geometry.
    ctx.fillStyle = 'rgba(50,46,40,0.08)';
    for (let f = 0; f < floors; f++) ctx.fillRect(0, f * ch + ch * 0.92, size, ch * 0.08);
  }

  const map = finish(canvas, { anisotropy: 8 });
  const emissive = finish(litCanvas, { anisotropy: 4 });
  return { map, emissive };
}

/** Corrugated warehouse siding with rust streaks. */
function sidingTexture() {
  const W = 256;
  const H = 256;
  const { canvas, ctx } = canvas2d(W, H);
  const random = new Random('tex:siding');
  ctx.fillStyle = '#9aa0a2';
  ctx.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 10) {
    const tone = 140 + Math.floor(20 * Math.sin(x * 0.7));
    ctx.fillStyle = `rgba(${tone},${tone + 4},${tone + 6},0.55)`;
    ctx.fillRect(x, 0, 6, H);
    ctx.fillStyle = 'rgba(30,34,36,0.18)';
    ctx.fillRect(x + 6, 0, 3, H);
  }
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = `rgba(150,86,44,${0.05 + random.float() * 0.14})`;
    const x = random.float() * W;
    ctx.fillRect(x, random.float() * H * 0.4, 3 + random.float() * 10, 40 + random.float() * 120);
  }
  grain(ctx, W, H, random, 8, 0.92);
  return finish(canvas, { repeat: [1, 1] });
}

/** Shipping-container metal: ribs, a painted band, scuffs. */
function containerTexture() {
  const W = 128;
  const H = 128;
  const { canvas, ctx } = canvas2d(W, H);
  const random = new Random('tex:container');
  ctx.fillStyle = '#c8c4bc';
  ctx.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 8) {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x, 0, 4, H);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x + 5, 0, 2, H);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fillRect(0, H * 0.06, W, 6);
  for (let i = 0; i < 22; i++) {
    ctx.fillStyle = `rgba(70,60,48,${0.06 + random.float() * 0.18})`;
    ctx.fillRect(random.float() * W, random.float() * H, 3 + random.float() * 14, 2 + random.float() * 10);
  }
  grain(ctx, W, H, random, 7, 0.9);
  return finish(canvas, { repeat: [1, 1] });
}

/** Grass and scrub: two-tone noise with tufts, for parks and the marsh. */
function grassTexture() {
  const SIZE = 256;
  const { canvas, ctx } = canvas2d(SIZE, SIZE);
  const random = new Random('tex:grass');
  ctx.fillStyle = '#6f7f45';
  ctx.fillRect(0, 0, SIZE, SIZE);
  speckle(ctx, SIZE, SIZE, random, 5200, ['#5f7040', '#7b8c4c', '#586a3c', '#86955a', '#4f6038'], 3);
  for (let i = 0; i < 500; i++) {
    ctx.strokeStyle = `rgba(${90 + random.float() * 50},${110 + random.float() * 40},${50 + random.float() * 30},0.35)`;
    ctx.lineWidth = 1;
    const x = random.float() * SIZE;
    const y = random.float() * SIZE;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + random.range(-3, 3), y - 3 - random.float() * 5);
    ctx.stroke();
  }
  grain(ctx, SIZE, SIZE, random, 6, 0.9);
  return finish(canvas, { repeat: [1, 1] });
}

/** Dry beach sand with tide lines and scattered shell grit. */
function sandTexture() {
  const SIZE = 256;
  const { canvas, ctx } = canvas2d(SIZE, SIZE);
  const random = new Random('tex:sand');
  ctx.fillStyle = '#e6d6b0';
  ctx.fillRect(0, 0, SIZE, SIZE);
  speckle(ctx, SIZE, SIZE, random, 4200, ['#dccaa2', '#efe2c2', '#d2bf96', '#f2e8cc'], 2);
  // Ripple lines: the tide's own drawing.
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = `rgba(186,166,124,${0.10 + random.float() * 0.16})`;
    ctx.lineWidth = 1 + random.float() * 2;
    ctx.beginPath();
    const y = random.float() * SIZE;
    ctx.moveTo(0, y);
    for (let x = 0; x <= SIZE; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 3);
    ctx.stroke();
  }
  grain(ctx, SIZE, SIZE, random, 9, 0.9);
  return finish(canvas, { repeat: [1, 1] });
}

/** Marsh mud and reeds, darker than the beach. */
function marshTexture() {
  const SIZE = 256;
  const { canvas, ctx } = canvas2d(SIZE, SIZE);
  const random = new Random('tex:marsh');
  ctx.fillStyle = '#5d6242';
  ctx.fillRect(0, 0, SIZE, SIZE);
  speckle(ctx, SIZE, SIZE, random, 3600, ['#4a5236', '#6c734a', '#3f4a30', '#7a8058'], 3);
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = `rgba(70,84,72,${0.2 + random.float() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(random.float() * SIZE, random.float() * SIZE, 8 + random.float() * 24, 4 + random.float() * 12, random.float() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx, SIZE, SIZE, random, 8, 0.9);
  return finish(canvas, { repeat: [1, 1] });
}

/** Concrete: the apron, the quay and the highway deck. */
function concreteTexture() {
  const SIZE = 256;
  const { canvas, ctx } = canvas2d(SIZE, SIZE);
  const random = new Random('tex:concrete');
  ctx.fillStyle = '#a8a49c';
  ctx.fillRect(0, 0, SIZE, SIZE);
  speckle(ctx, SIZE, SIZE, random, 2400, ['#9c988f', '#b4b0a6', '#8f8b83', '#c0bcb2'], 3);
  // Expansion joints and hairline cracks.
  ctx.strokeStyle = 'rgba(70,68,64,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, SIZE * 0.5);
  ctx.lineTo(SIZE, SIZE * 0.5);
  ctx.moveTo(SIZE * 0.5, 0);
  ctx.lineTo(SIZE * 0.5, SIZE);
  ctx.stroke();
  for (let i = 0; i < 9; i++) {
    ctx.strokeStyle = `rgba(60,58,54,${0.1 + random.float() * 0.16})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    let x = random.float() * SIZE;
    let y = random.float() * SIZE;
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += random.range(-24, 24);
      y += random.range(-24, 24);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  grain(ctx, SIZE, SIZE, random, 7, 0.92);
  return finish(canvas, { repeat: [1, 1] });
}

/** Rooftop gravel and tar, for the tops the player only ever sees from above. */
function rooftopTexture() {
  const SIZE = 128;
  const { canvas, ctx } = canvas2d(SIZE, SIZE);
  const random = new Random('tex:rooftop');
  ctx.fillStyle = '#77746e';
  ctx.fillRect(0, 0, SIZE, SIZE);
  speckle(ctx, SIZE, SIZE, random, 2200, ['#6a6760', '#85827a', '#5e5b55', '#918e86'], 2);
  grain(ctx, SIZE, SIZE, random, 10, 0.9);
  return finish(canvas, { repeat: [1, 1] });
}

/** Neon: a sign board with glowing tubes. Used as an emissive map at night. */
function neonTexture(seed, hue) {
  const W = 512;
  const H = 256;
  const { canvas, ctx } = canvas2d(W, H);
  const random = new Random(`tex:neon:${seed}`);
  // A dark board...
  ctx.fillStyle = '#0d0b12';
  ctx.fillRect(0, 0, W, H);
  // ...with a neon frame...
  ctx.strokeStyle = hue;
  ctx.lineWidth = 7;
  ctx.shadowColor = hue;
  ctx.shadowBlur = 22;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  // ...and stacked glowing bars standing in for lettering: abstract, so no borrowed sign.
  const rows = 3 + Math.floor(random.float() * 2);
  for (let r = 0; r < rows; r++) {
    const y = 42 + r * ((H - 84) / rows);
    const width = W * (0.32 + random.float() * 0.46);
    const x = (W - width) / 2;
    ctx.fillStyle = r % 2 === 0 ? hue : '#ffe9c8';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 26;
    ctx.fillRect(x, y, width, 14 + random.float() * 14);
    // A couple of tube breaks, like a sign that has been up a while.
    if (random.chance(0.4)) {
      ctx.fillStyle = '#0d0b12';
      ctx.shadowBlur = 0;
      ctx.fillRect(x + width * random.range(0.2, 0.6), y, 10, 20);
    }
  }
  ctx.shadowBlur = 0;
  const map = finish(canvas, { anisotropy: 4 });
  return map;
}

/** A soft round glow sprite, for lamp pools and neon bloom on the ground. */
function glowTexture() {
  const SIZE = 128;
  const { canvas, ctx } = canvas2d(SIZE, SIZE);
  const gradient = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.28, 'rgba(255,255,255,0.44)');
  gradient.addColorStop(0.62, 'rgba(255,255,255,0.11)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const texture = finish(canvas, { anisotropy: 2 });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** A palm frond: an alpha-cut leaf cluster, drawn once and used on cross-planes. */
function palmFrondTexture() {
  const W = 128;
  const H = 128;
  const { canvas, ctx } = canvas2d(W, H);
  const random = new Random('tex:frond');
  ctx.clearRect(0, 0, W, H);
  const mid = W / 2;
  // The rib, then leaflets either side of it.
  ctx.strokeStyle = 'rgba(74,96,44,0.95)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(mid, H);
  ctx.lineTo(mid, 8);
  ctx.stroke();
  for (let i = 0; i < 16; i++) {
    const t = i / 16;
    const y = H - t * (H - 12);
    const len = 18 + (1 - t) * 44;
    const droop = 6 + t * 10;
    for (const side of [-1, 1]) {
      ctx.strokeStyle = `rgb(${58 + random.float() * 30},${86 + random.float() * 34},${34 + random.float() * 22})`;
      ctx.lineWidth = 3.4 - t * 1.4;
      ctx.beginPath();
      ctx.moveTo(mid, y);
      ctx.quadraticCurveTo(mid + side * len * 0.6, y - droop * 0.4, mid + side * len, y + droop);
      ctx.stroke();
    }
  }
  const texture = finish(canvas, { anisotropy: 4 });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** A star burst for the stadium and the neon strip's lights, drawn soft on black. */
function burstTexture() {
  const SIZE = 128;
  const { canvas, ctx } = canvas2d(SIZE, SIZE);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, SIZE, SIZE);
  const gradient = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.2, 'rgba(255,240,210,0.7)');
  gradient.addColorStop(0.5, 'rgba(255,220,160,0.16)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // Four soft rays.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate((i * Math.PI) / 4);
    const ray = ctx.createLinearGradient(-SIZE / 2, 0, SIZE / 2, 0);
    ray.addColorStop(0, 'rgba(255,230,190,0)');
    ray.addColorStop(0.5, 'rgba(255,236,200,0.5)');
    ray.addColorStop(1, 'rgba(255,230,190,0)');
    ctx.fillStyle = ray;
    ctx.fillRect(-SIZE / 2, -1.5, SIZE, 3);
    ctx.restore();
  }
  const texture = finish(canvas, { anisotropy: 2 });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Every texture the world needs, built once on demand and shared. */
export class TextureLibrary {
  constructor(seed = 'solmara-01') {
    this.seed = seed;
    this.cache = new Map();
  }

  _get(key, build) {
    let value = this.cache.get(key);
    if (!value) {
      value = build();
      this.cache.set(key, value);
    }
    return value;
  }

  get asphalt() {
    return this._get('asphalt', asphaltTexture);
  }

  get pavement() {
    return this._get('pavement', pavementTexture);
  }

  get boardwalk() {
    return this._get('boardwalk', boardwalkTexture);
  }

  get siding() {
    return this._get('siding', sidingTexture);
  }

  get container() {
    return this._get('container', containerTexture);
  }

  get grass() {
    return this._get('grass', grassTexture);
  }

  get sand() {
    return this._get('sand', sandTexture);
  }

  get marsh() {
    return this._get('marsh', marshTexture);
  }

  get concrete() {
    return this._get('concrete', concreteTexture);
  }

  get rooftop() {
    return this._get('rooftop', rooftopTexture);
  }

  get glow() {
    return this._get('glow', glowTexture);
  }

  get frond() {
    return this._get('frond', palmFrondTexture);
  }

  get burst() {
    return this._get('burst', burstTexture);
  }

  /** The facade families, each with a matching emissive map of just its lit windows. */
  get facadeTower() {
    return this._get('facadeTower', () => drawFacade({
      key: 'tower', floors: 5, bays: 5, base: '#cfcbc2', litChance: 0.3, style: 'curtain', lit: '#ffd08a',
    }));
  }

  get facadeOffice() {
    return this._get('facadeOffice', () => drawFacade({
      key: 'office', floors: 4, bays: 4, base: '#d8d2c4', litChance: 0.4, style: 'punched', trim: '#a8a296',
    }));
  }

  get facadeLowrise() {
    return this._get('facadeLowrise', () => drawFacade({
      key: 'lowrise', floors: 3, bays: 3, base: '#efe6d2', windowBase: '#4c5c5c', litChance: 0.34,
      style: 'punched', trim: '#b8ac94', lit: '#ffc878',
    }));
  }

  get facadeStrip() {
    return this._get('facadeStrip', () => drawFacade({
      key: 'strip', floors: 3, bays: 4, base: '#6c5a62', windowBase: '#2a2430', litChance: 0.55,
      style: 'punched', trim: '#3a2e36', lit: '#ff9ec8', randomSeed: 'strip',
    }));
  }

  get facadeHarbour() {
    return this._get('facadeHarbour', () => drawFacade({
      key: 'harbour', floors: 2, bays: 3, base: '#a8aa9e', litChance: 0.2, style: 'punched', trim: '#7a7c72',
    }));
  }

  /** A neon board; `index` chooses a colour and layout from the fixed set. */
  neon(index = 0) {
    const hues = ['#ff5d9e', '#5ce1e6', '#ffc94a', '#b05cff', '#ff7a3c', '#7cffb2'];
    const i = ((index % hues.length) + hues.length) % hues.length;
    return this._get(`neon:${i}`, () => neonTexture(`n${i}`, hues[i]));
  }

  dispose() {
    for (const value of this.cache.values()) {
      if (value && value.dispose) value.dispose();
    }
    this.cache.clear();
  }

  /** For the build summary and the perf overlay. */
  get count() {
    return this.cache.size;
  }
}

export { cache as textureCache };
