// Every pixel in Solmara is drawn here, on canvases, at run time. No image file is
// ever loaded. The factory caches by key so a hundred buildings share a handful of
// textures, and each method returns a CanvasTexture ready for a material.

import { Rng } from '../core/random.js';
import { TAU } from '../core/math.js';

/** 5x7 bitmap capitals so signs can carry real words without shipping a font. */
const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '&': ['.##..', '#..#.', '#..#.', '.##..', '#.#.#', '#..#.', '.##.#'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
};

export function textWidth(text, scale = 1, spacing = 1) {
  return text.length * (5 + spacing) * scale;
}

/** Draws bitmap text with the top left corner at (x, y). */
export function drawTinyText(context, text, x, y, scale, color, spacing = 1) {
  context.fillStyle = color;
  const clean = String(text).toUpperCase();
  let cursor = x;
  for (const char of clean) {
    const glyph = FONT[char] ?? FONT[' '];
    for (let row = 0; row < glyph.length; row += 1) {
      const line = glyph[row];
      for (let column = 0; column < line.length; column += 1) {
        if (line[column] === '#') {
          context.fillRect(cursor + column * scale, y + row * scale, scale, scale);
        }
      }
    }
    cursor += (5 + spacing) * scale;
  }
  return cursor - x;
}

export const FACADE_VARIANTS = [
  'officeGlass',
  'officeStone',
  'residential',
  'stucco',
  'neonHotel',
  'warehouse',
  'hangar',
  'shack',
  'civic',
];

const FACADE_TILE = { width: 12.8, height: 13.6, floors: 4, bays: 4 };

export class TextureFactory {
  constructor(options = {}) {
    this.seed = options.seed ?? 'solmara-textures';
    this.size = options.size ?? 256;
    this.anisotropy = options.anisotropy ?? 2;
    this.cache = new Map();
    this.rng = options.rng ?? new Rng(this.seed);
  }

  setAnisotropy(value) {
    this.anisotropy = value;
    for (const texture of this.cache.values()) {
      if (texture?.isTexture) texture.anisotropy = value;
    }
  }

  /** Allocates (and caches) a drawing surface under a key. */
  surface(key, size = this.size) {
    let entry = this.cache.get(`surface:${key}`);
    if (!entry) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      entry = { canvas, context: canvas.getContext('2d') };
      this.cache.set(`surface:${key}`, entry);
    }
    return entry;
  }

  wrap(entry, options = {}) {
    const texture = new THREE.CanvasTexture(entry.canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = this.anisotropy;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.colorSpace = options.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    texture.name = options.name ?? 'canvas';
    return texture;
  }

  /** Fetches or draws a single texture. The draw callback gets (context, size, rng). */
  once(key, draw, options = {}) {
    if (this.cache.has(key)) return this.cache.get(key);
    const size = options.size ?? this.size;
    const entry = this.surface(key, size);
    const rng = this.rng.fork(key);
    draw(entry.context, entry.canvas.width, rng);
    const texture = this.wrap(entry, { name: key });
    this.cache.set(key, texture);
    return texture;
  }

  /** Facade style metadata: tile size, window count, lit fraction, colours. */
  facadeStyle(variant) {
    const table = {
      officeGlass: { wall: [0x2f3a4a, 0x28313f], frame: 0x8fa4b8, glass: [0x3d5a76, 0x51718f], lit: 0.3, litColour: '#cfe4ff', fill: 0.72, sill: false, band: true },
      officeStone: { wall: [0x9aa2a8, 0x8b9399], frame: 0x6d757c, glass: [0x40566b, 0x54708a], lit: 0.22, litColour: '#ffd9a0', fill: 0.5, sill: true, band: true },
      residential: { wall: [0xc9a882, 0xb89474], frame: 0x6b5844, glass: [0x2f4250, 0x3d5462], lit: 0.42, litColour: '#ffcf8a', fill: 0.42, sill: true, band: false },
      stucco: { wall: [0xd08a58, 0xc07a4c], frame: 0x7a4a30, glass: [0x2c3c44, 0x3a4e56], lit: 0.45, litColour: '#ffc078', fill: 0.4, sill: true, band: false },
      neonHotel: { wall: [0x3d3348, 0x514060], frame: 0x241d2c, glass: [0x2a2440, 0x3b3050], lit: 0.55, litColour: '#ff9ad4', fill: 0.55, sill: false, band: true },
      warehouse: { wall: [0x777c80, 0x6a7074], frame: 0x4c5256, glass: [0x3c4a50, 0x4c5a60], lit: 0.16, litColour: '#ffe0a8', fill: 0.24, sill: false, band: false },
      hangar: { wall: [0x8a8f8c, 0x7b807c], frame: 0x5c6260, glass: [0x44525a, 0x546269], lit: 0.12, litColour: '#ffe6b8', fill: 0.2, sill: false, band: false },
      shack: { wall: [0xe8d8b4, 0xd8c8a0], frame: 0x8a7454, glass: [0x35484e, 0x445a60], lit: 0.4, litColour: '#ffd08a', fill: 0.36, sill: true, band: false },
      civic: { wall: [0xd6d2c6, 0xc6c2b6], frame: 0x8a8578, glass: [0x3b4c5c, 0x4f6578], lit: 0.2, litColour: '#ffe2b0', fill: 0.46, sill: true, band: true },
    };
    return table[variant] ?? table.residential;
  }

  /**
   * A facade tile and its matching night emissive twin. Both are 4 floors by 4 bays
   * (12.8 m by 13.6 m), so a wall's UVs are simply its metres of size.
   */
  facade(variant) {
    const key = `facade:${variant}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const style = this.facadeStyle(variant);
    const size = 256;
    const albedo = this.surface(`facade-albedo:${variant}`, size);
    const lamps = this.surface(`facade-emissive:${variant}`, size);
    const rng = this.rng.fork(key);

    const wall = style.wall[0];
    albedo.context.fillStyle = hexCss(wall);
    albedo.context.fillRect(0, 0, size, size);
    lamps.context.fillStyle = '#000000';
    lamps.context.fillRect(0, 0, size, size);

    const bayWidth = size / FACADE_TILE.bays;
    const floorHeight = size / FACADE_TILE.floors;
    const frame = hexCss(style.frame);

    for (let floor = 0; floor < FACADE_TILE.floors; floor += 1) {
      const y = floor * floorHeight;
      // Horizontal floor band: a slab edge or a shadow line between storeys.
      if (style.band) {
        albedo.context.fillStyle = hexCss(wall, 0.86);
        albedo.context.fillRect(0, y, size, floorHeight * 0.16);
        albedo.context.fillStyle = frame;
        albedo.context.fillRect(0, y, size, 2);
      }
      for (let bay = 0; bay < FACADE_TILE.bays; bay += 1) {
        const x = bay * bayWidth;
        const padX = bayWidth * (1 - style.fill) * 0.5;
        const padTop = floorHeight * 0.2;
        const windowWidth = bayWidth - padX * 2;
        const windowHeight = floorHeight * (style.fill > 0.5 ? 0.68 : 0.6);
        // Frame
        albedo.context.fillStyle = frame;
        albedo.context.fillRect(x + padX - 2, y + padTop - 2, windowWidth + 4, windowHeight + 4);
        // Glass, shaded per bay so the wall is not repetitive
        const glassHex = rng.pick(style.glass);
        albedo.context.fillStyle = hexCss(glassHex, rng.float(0.82, 1.12));
        albedo.context.fillRect(x + padX, y + padTop, windowWidth, windowHeight);
        // A single bright diagonal so the glass reads as reflective
        albedo.context.fillStyle = 'rgba(255,255,255,0.10)';
        albedo.context.beginPath();
        albedo.context.moveTo(x + padX, y + padTop + windowHeight);
        albedo.context.lineTo(x + padX + windowWidth * 0.55, y + padTop);
        albedo.context.lineTo(x + padX + windowWidth, y + padTop);
        albedo.context.lineTo(x + padX + windowWidth * 0.45, y + padTop + windowHeight);
        albedo.context.closePath();
        albedo.context.fill();
        // Mullions
        albedo.context.fillStyle = frame;
        albedo.context.fillRect(x + padX + windowWidth * 0.5 - 1, y + padTop, 2, windowHeight);
        if (style.sill) {
          albedo.context.fillStyle = hexCss(wall, 0.78);
          albedo.context.fillRect(x + padX - 3, y + padTop + windowHeight, windowWidth + 6, 3);
        }
        // Night: this window is lit, and its spill shows on the wall below it.
        if (rng.chance(style.lit)) {
          const inset = 2;
          lamps.context.fillStyle = style.litColour;
          lamps.context.globalAlpha = rng.float(0.55, 1);
          lamps.context.fillRect(x + padX + inset, y + padTop + inset, windowWidth - inset * 2, windowHeight - inset * 2);
          if (rng.chance(0.4)) {
            lamps.context.globalAlpha = 0.22;
            lamps.context.fillRect(x + padX - 4, y + padTop + windowHeight, windowWidth + 8, floorHeight * 0.25);
          }
          lamps.context.globalAlpha = 1;
        }
      }
    }

    // Grime so walls are not flat colour.
    specks(albedo.context, rng, { count: 260, size: 2, colors: ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.045)'] });

    const entry = {
      map: this.wrap(albedo, { name: `facade-${variant}` }),
      emissive: this.wrap(lamps, { name: `facade-emissive-${variant}` }),
      tileWidth: FACADE_TILE.width,
      tileHeight: FACADE_TILE.height,
    };
    this.cache.set(key, entry);
    return entry;
  }

  /** Plain asphalt, used for junctions and parking. */
  asphalt() {
    return this.once('asphalt', (context, size, rng) => {
      context.fillStyle = '#3b3d40';
      context.fillRect(0, 0, size, size);
      for (let i = 0; i < 42; i += 1) {
        context.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.09)';
        const w = rng.float(size * 0.1, size * 0.5);
        const h = rng.float(size * 0.1, size * 0.4);
        context.fillRect(rng.float(0, size), rng.float(0, size), w, h);
      }
      specks(context, rng, { count: 2600, size: 1.6, colors: ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.16)'] });
      // Tar seams
      context.strokeStyle = 'rgba(20,20,22,0.5)';
      context.lineWidth = 2;
      for (let i = 0; i < 3; i += 1) {
        context.beginPath();
        let y = rng.float(0, size);
        context.moveTo(0, y);
        for (let x = 0; x <= size; x += size / 6) {
          y += rng.float(-6, 6);
          context.lineTo(x, y);
        }
        context.stroke();
      }
    });
  }

  /**
   * Road surface with lane paint baked in: u runs along the road and repeats every
   * 12 m, v spans the full carriageway once. Edge lines at the kerbs, a dashed
   * centre line, and solid double yellow for the wide variant.
   */
  road(options = {}) {
    const wide = options.wide === true;
    const key = wide ? 'road-wide' : 'road';
    return this.once(key, (context, size, rng) => {
      const height = wide ? 384 : 256;
      context.canvas.height = height;
      context.fillStyle = wide ? '#404247' : '#3b3d40';
      context.fillRect(0, 0, size, height);
      for (let i = 0; i < 30; i += 1) {
        context.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)';
        context.fillRect(rng.float(0, size), rng.float(0, height), rng.float(20, 120), rng.float(20, 90));
      }
      specks(context, rng, { count: 2200, size: 1.6, colors: ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.14)'] });

      // Tyre worn bands, subtle darker stripes where wheels run.
      context.fillStyle = 'rgba(0,0,0,0.07)';
      for (const t of [0.22, 0.34, 0.66, 0.78]) {
        context.fillRect(0, height * t, size, height * 0.07);
      }

      paintLine(context, 0.045, height, '#e8e4d8', 3);
      paintLine(context, 0.955, height, '#e8e4d8', 3);
      if (wide) {
        paintLine(context, 0.487, height, '#e0c24c', 3);
        paintLine(context, 0.513, height, '#e0c24c', 3);
        // Lane divider dashes either side of the median
        dashLine(context, 0.25, height, size, '#e8e4d8', 3);
        dashLine(context, 0.75, height, size, '#e8e4d8', 3);
      } else {
        dashLine(context, 0.5, height, size, '#e8e4d8', 4);
      }
    }, { size: 128 });
  }

  /** Junction pad: plain carriageway with a faint cross hatch. */
  junction() {
    return this.once('junction', (context, size, rng) => {
      context.fillStyle = '#3b3d40';
      context.fillRect(0, 0, size, size);
      specks(context, rng, { count: 1800, size: 1.7, colors: ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.15)'] });
      for (let i = 0; i < 16; i += 1) {
        context.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.07)';
        context.fillRect(rng.float(0, size), rng.float(0, size), rng.float(18, 90), rng.float(18, 70));
      }
    });
  }

  /** Sidewalk paving: slabs with grout, worn corners, a kerb edge tint. */
  sidewalk() {
    return this.once('sidewalk', (context, size, rng) => {
      context.fillStyle = '#b3b2ac';
      context.fillRect(0, 0, size, size);
      const slabs = 4;
      const step = size / slabs;
      for (let row = 0; row < slabs; row += 1) {
        for (let column = 0; column < slabs; column += 1) {
          const offset = row % 2 === 0 ? 0 : step * 0.5;
          const x = (column * step + offset) % size;
          const y = row * step;
          context.fillStyle = hexCss(0xb3b2ac, rng.float(0.9, 1.08));
          context.fillRect(x + 1.5, y + 1.5, step - 3, step - 3);
          context.strokeStyle = 'rgba(90,90,88,0.45)';
          context.lineWidth = 2;
          context.strokeRect(x + 1.5, y + 1.5, step - 3, step - 3);
        }
      }
      specks(context, rng, { count: 1400, size: 1.4, colors: ['rgba(0,0,0,0.06)', 'rgba(255,255,255,0.07)'] });
    });
  }

  /** Poured concrete: kerbs, plinths, bridge parapets. */
  concrete(tint = 0x9a9a94) {
    return this.once(`concrete:${tint.toString(16)}`, (context, size, rng) => {
      context.fillStyle = hexCss(tint);
      context.fillRect(0, 0, size, size);
      for (let i = 0; i < 22; i += 1) {
        context.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
        context.fillRect(rng.float(0, size), rng.float(0, size), rng.float(20, 110), rng.float(20, 90));
      }
      specks(context, rng, { count: 1600, size: 1.5, colors: ['rgba(0,0,0,0.07)', 'rgba(255,255,255,0.06)'] });
      context.strokeStyle = 'rgba(60,60,58,0.25)';
      context.lineWidth = 2;
      context.strokeRect(0, 0, size, size);
    });
  }

  /** Bitumen roof with gravel speckle and a few darker patches. */
  roof() {
    return this.once('roof', (context, size, rng) => {
      context.fillStyle = '#585c60';
      context.fillRect(0, 0, size, size);
      for (let i = 0; i < 60; i += 1) {
        context.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.04)';
        const r = rng.float(6, 34);
        context.beginPath();
        context.arc(rng.float(0, size), rng.float(0, size), r, 0, TAU);
        context.fill();
      }
      specks(context, rng, { count: 3000, size: 1.6, colors: ['rgba(255,255,255,0.09)', 'rgba(0,0,0,0.18)'] });
    });
  }

  grass() {
    return this.once('grass', (context, size, rng) => {
      context.fillStyle = '#5d7d43';
      context.fillRect(0, 0, size, size);
      for (let i = 0; i < 2600; i += 1) {
        const shade = rng.float(0.75, 1.25);
        context.fillStyle = hexCss(0x5d7d43, shade);
        context.fillRect(rng.float(0, size), rng.float(0, size), rng.float(1, 3), rng.float(1, 5));
      }
      for (let i = 0; i < 26; i += 1) {
        context.fillStyle = 'rgba(120,140,90,0.18)';
        context.beginPath();
        context.arc(rng.float(0, size), rng.float(0, size), rng.float(10, 40), 0, TAU);
        context.fill();
      }
    });
  }

  /** Salt marsh: drier, yellower than lawn grass, with reed tufts. */
  marsh() {
    return this.once('marsh', (context, size, rng) => {
      context.fillStyle = '#6d7350';
      context.fillRect(0, 0, size, size);
      for (let i = 0; i < 2200; i += 1) {
        context.fillStyle = hexCss(rng.chance(0.5) ? 0x7d8258 : 0x5c6244, rng.float(0.8, 1.2));
        context.fillRect(rng.float(0, size), rng.float(0, size), rng.float(1, 2), rng.float(2, 7));
      }
      for (let i = 0; i < 40; i += 1) {
        context.fillStyle = 'rgba(150,150,110,0.16)';
        context.beginPath();
        context.arc(rng.float(0, size), rng.float(0, size), rng.float(8, 30), 0, TAU);
        context.fill();
      }
    });
  }

  sand() {
    return this.once('sand', (context, size, rng) => {
      context.fillStyle = '#dcc79a';
      context.fillRect(0, 0, size, size);
      for (let i = 0; i < 30; i += 1) {
        context.fillStyle = rng.chance(0.5) ? 'rgba(255,246,220,0.25)' : 'rgba(160,140,100,0.14)';
        context.beginPath();
        context.arc(rng.float(0, size), rng.float(0, size), rng.float(8, 44), 0, TAU);
        context.fill();
      }
      specks(context, rng, { count: 3200, size: 1.5, colors: ['rgba(255,255,255,0.14)', 'rgba(120,100,70,0.12)'] });
      // Wind ripples
      context.strokeStyle = 'rgba(180,160,120,0.3)';
      context.lineWidth = 2;
      for (let i = 0; i < 9; i += 1) {
        context.beginPath();
        const y = (i / 9) * size + rng.float(-4, 4);
        context.moveTo(0, y);
        for (let x = 0; x <= size; x += size / 8) {
          context.quadraticCurveTo(x + size / 16, y + rng.float(-3, 3), x + size / 8, y);
        }
        context.stroke();
      }
    });
  }

  /** Dirt runway and service tracks: compacted earth with tyre ruts. */
  dirt() {
    return this.once('dirt', (context, size, rng) => {
      context.fillStyle = '#8a7256';
      context.fillRect(0, 0, size, size);
      for (let i = 0; i < 40; i += 1) {
        context.fillStyle = rng.chance(0.5) ? 'rgba(120,96,70,0.3)' : 'rgba(190,170,140,0.12)';
        context.fillRect(rng.float(0, size), rng.float(0, size), rng.float(20, 120), rng.float(10, 60));
      }
      context.strokeStyle = 'rgba(90,70,50,0.35)';
      context.lineWidth = 3;
      for (const t of [0.34, 0.66]) {
        context.beginPath();
        context.moveTo(0, size * t);
        for (let x = 0; x <= size; x += size / 6) context.lineTo(x, size * t + rng.float(-2.5, 2.5));
        context.stroke();
      }
      specks(context, rng, { count: 2600, size: 1.6, colors: ['rgba(0,0,0,0.1)', 'rgba(255,255,255,0.05)'] });
    });
  }

  /** Boardwalk planking. */
  boardwalk() {
    return this.once('boardwalk', (context, size, rng) => {
      context.fillStyle = '#9a7b52';
      context.fillRect(0, 0, size, size);
      const planks = 8;
      const step = size / planks;
      for (let i = 0; i < planks; i += 1) {
        context.fillStyle = hexCss(0x9a7b52, rng.float(0.82, 1.16));
        context.fillRect(0, i * step + 1, size, step - 2);
        context.strokeStyle = 'rgba(70,52,34,0.55)';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(0, i * step);
        context.lineTo(size, i * step);
        context.stroke();
        for (let k = 0; k < 6; k += 1) {
          context.fillStyle = 'rgba(80,60,40,0.18)';
          context.fillRect(rng.float(0, size), i * step + rng.float(2, step - 3), rng.float(6, 26), 1.5);
        }
      }
    });
  }

  /** Corrugated siding for warehouses and hangars. */
  siding(tint = 0x8a9096) {
    return this.once(`siding:${tint.toString(16)}`, (context, size, rng) => {
      context.fillStyle = hexCss(tint);
      context.fillRect(0, 0, size, size);
      const ribs = 16;
      const step = size / ribs;
      for (let i = 0; i < ribs; i += 1) {
        const x = i * step;
        const shade = i % 2 === 0 ? 1.08 : 0.9;
        context.fillStyle = hexCss(tint, shade);
        context.fillRect(x, 0, step * 0.62, size);
        context.fillStyle = 'rgba(0,0,0,0.10)';
        context.fillRect(x + step * 0.62, 0, step * 0.12, size);
      }
      // Rust runs and dents
      for (let i = 0; i < 22; i += 1) {
        context.fillStyle = `rgba(${130 + rng.int(0, 40)},${70 + rng.int(0, 30)},40,${rng.float(0.08, 0.24)})`;
        context.fillRect(rng.float(0, size), rng.float(0, size), rng.float(3, 14), rng.float(10, 70));
      }
      specks(context, rng, { count: 900, size: 1.5, colors: ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.06)'] });
    });
  }

  /** Shipping container: ribbed steel with a painted end and a number. */
  container(index = 0) {
    const tints = [0xb1452f, 0x2f6f8f, 0xc78a2a, 0x3f7a4a, 0x8a3f6a, 0x6d7076];
    const tint = tints[index % tints.length];
    return this.once(`container:${index}`, (context, size, rng) => {
      context.fillStyle = hexCss(tint);
      context.fillRect(0, 0, size, size);
      const ribs = 26;
      const step = size / ribs;
      for (let i = 0; i < ribs; i += 1) {
        context.fillStyle = hexCss(tint, i % 2 === 0 ? 1.1 : 0.86);
        context.fillRect(i * step, 0, step * 0.6, size);
      }
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.fillRect(0, size * 0.44, size, 4);
      context.fillStyle = 'rgba(255,255,255,0.5)';
      drawTinyText(context, `SLM-${100 + index * 37}`, 10, size * 0.52, 4, 'rgba(255,255,255,0.55)');
      for (let i = 0; i < 30; i += 1) {
        context.fillStyle = `rgba(${120 + rng.int(0, 50)},${60 + rng.int(0, 30)},36,${rng.float(0.06, 0.2)})`;
        context.fillRect(rng.float(0, size), rng.float(0, size), rng.float(4, 18), rng.float(4, 30));
      }
    });
  }

  /** Curtain wall glass with mullion grid and a night twin. */
  glass() {
    const key = 'glass';
    if (this.cache.has(key)) return this.cache.get(key);
    const size = 256;
    const albedo = this.surface('glass-albedo', size);
    const lamps = this.surface('glass-emissive', size);
    const rng = this.rng.fork('glass');
    albedo.context.fillStyle = '#4a6f8c';
    albedo.context.fillRect(0, 0, size, size);
    lamps.context.fillStyle = '#000000';
    lamps.context.fillRect(0, 0, size, size);
    const cols = 6;
    const rows = 8;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < cols; column += 1) {
        const x = (column * size) / cols;
        const y = (row * size) / rows;
        albedo.context.fillStyle = hexCss(rng.chance(0.5) ? 0x6f9ec2 : 0x57809f, rng.float(0.88, 1.12));
        albedo.context.fillRect(x + 2, y + 2, size / cols - 4, size / rows - 4);
        albedo.context.fillStyle = 'rgba(220,240,255,0.16)';
        albedo.context.beginPath();
        albedo.context.moveTo(x + 2, y + size / rows - 2);
        albedo.context.lineTo(x + size / cols * 0.55, y + 2);
        albedo.context.lineTo(x + size / cols - 2, y + 2);
        albedo.context.lineTo(x + 2, y + size / rows - 2);
        albedo.context.closePath();
        albedo.context.fill();
        if (rng.chance(0.24)) {
          lamps.context.fillStyle = rng.chance(0.6) ? '#bcd8f4' : '#ffe6b4';
          lamps.context.globalAlpha = rng.float(0.5, 0.95);
          lamps.context.fillRect(x + 3, y + 3, size / cols - 6, size / rows - 6);
          lamps.context.globalAlpha = 1;
        }
      }
    }
    const entry = { map: this.wrap(albedo, { name: 'glass' }), emissive: this.wrap(lamps, { name: 'glass-emissive' }) };
    this.cache.set(key, entry);
    return entry;
  }

  /** Animated harbour water: deep teal with layered swell lines. */
  water() {
    return this.once('water', (context, size, rng) => {
      context.fillStyle = '#123c58';
      context.fillRect(0, 0, size, size);
      for (let i = 0; i < 46; i += 1) {
        context.fillStyle = `rgba(${30 + rng.int(0, 40)},${110 + rng.int(0, 60)},${140 + rng.int(0, 60)},${rng.float(0.08, 0.22)})`;
        context.beginPath();
        const y = rng.float(0, size);
        context.moveTo(0, y);
        for (let x = 0; x <= size; x += size / 10) {
          context.quadraticCurveTo(x + size / 20, y + rng.float(-7, 7), x + size / 10, y + rng.float(-3, 3));
        }
        context.lineTo(size, y + 22);
        context.lineTo(0, y + 22);
        context.closePath();
        context.fill();
      }
      // Sun glitter streaks
      for (let i = 0; i < 240; i += 1) {
        context.fillStyle = `rgba(200,230,255,${rng.float(0.04, 0.16)})`;
        context.fillRect(rng.float(0, size), rng.float(0, size), rng.float(2, 16), 1.6);
      }
      // Tileable edges: repeat the top rows at the bottom so the seam is hidden.
      context.globalAlpha = 0.35;
      context.drawImage(context.canvas, 0, 0, size, 10, 0, size - 10, size, 10);
      context.globalAlpha = 1;
    }, { size: 256 });
  }

  /** Additive sparkle layer that rides above the water plane. */
  waterGlint() {
    return this.once('water-glint', (context, size, rng) => {
      context.clearRect(0, 0, size, size);
      for (let i = 0; i < 320; i += 1) {
        const x = rng.float(0, size);
        const y = rng.float(0, size);
        const radius = rng.float(2, 12);
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(255,255,255,${rng.float(0.1, 0.4)})`);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, radius, 0, TAU);
        context.fill();
      }
    });
  }

  /** Warm pool of light under a street lamp, drawn additively on the ground. */
  lampGlow() {
    return this.once('lamp-glow', (context, size) => {
      context.clearRect(0, 0, size, size);
      const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, 'rgba(255,236,190,0.85)');
      gradient.addColorStop(0.35, 'rgba(255,214,150,0.32)');
      gradient.addColorStop(0.72, 'rgba(255,196,120,0.09)');
      gradient.addColorStop(1, 'rgba(255,180,110,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
    }, { size: 128 });
  }

  /** Crosswalk stripes: one bar and one gap, tiled across the carriageway. */
  zebra() {
    return this.once('zebra', (context, size) => {
      context.clearRect(0, 0, size, size);
      context.fillStyle = 'rgba(236,232,220,0.88)';
      context.fillRect(0, 0, size * 0.5, size);
      context.fillStyle = 'rgba(60,60,60,0.12)';
      context.fillRect(0, 0, size * 0.5, size);
    }, { size: 64 });
  }

  /** Neon sign: dark plate with glowing lettering, plus a night emissive twin. */
  sign(text, hue = 0xff4f9e) {
    const key = `sign:${text}:${hue.toString(16)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const width = 256;
    const height = 64;
    const albedo = this.surface(`sign-a:${key}`, width);
    albedo.canvas.height = height;
    const lamps = this.surface(`sign-e:${key}`, width);
    lamps.canvas.height = height;
    const rng = this.rng.fork(key);
    const scale = Math.max(2, Math.min(9, Math.floor((width - 40) / (text.length * 6))));

    for (const entry of [albedo, lamps]) {
      entry.context.fillStyle = '#141018';
      entry.context.fillRect(0, 0, width, height);
      entry.context.strokeStyle = 'rgba(255,255,255,0.12)';
      entry.context.lineWidth = 3;
      entry.context.strokeRect(2, 2, width - 4, height - 4);
    }
    const textX = (width - textWidth(text, scale)) / 2;
    const textY = (height - 7 * scale) / 2;
    drawTinyText(albedo.context, text, textX, textY, scale, hexCss(hue, 0.55));
    drawTinyText(lamps.context, text, textX, textY, scale, '#ffffff');
    // Neon tube glow around the letters on the emissive twin.
    lamps.context.globalAlpha = 0.5;
    for (let i = 0; i < 3; i += 1) {
      drawTinyText(lamps.context, text, textX - i - 1, textY, scale, hexCss(hue, 0.8));
      drawTinyText(lamps.context, text, textX + i + 1, textY, scale, hexCss(hue, 0.8));
    }
    lamps.context.globalAlpha = 1;
    albedo.context.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 40; i += 1) {
      albedo.context.fillRect(rng.float(0, width), rng.float(0, height), rng.float(2, 18), 1.4);
    }
    const entry = {
      map: this.wrap(albedo, { name: `${key}-albedo` }),
      emissive: this.wrap(lamps, { name: `${key}-emissive` }),
      aspect: width / height,
    };
    this.cache.set(key, entry);
    return entry;
  }

  /** Large advertising board: a poster with a headline and a colour field. */
  billboard(headline, sub, hue = 0x2f8fd0) {
    const key = `billboard:${headline}:${hue.toString(16)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const width = 256;
    const height = 128;
    const surface = this.surface(`billboard:${key}`, width);
    surface.canvas.height = height;
    const { context } = surface;
    const rng = this.rng.fork(key);
    context.fillStyle = hexCss(hue, 0.85);
    context.fillRect(0, 0, width, height);
    for (let i = 0; i < 16; i += 1) {
      context.fillStyle = hexCss(i % 2 === 0 ? hue : 0xffffff, rng.float(0.06, 0.2));
      context.fillRect(rng.float(-20, width), rng.float(-10, height), rng.float(30, 150), rng.float(10, 90));
    }
    context.fillStyle = 'rgba(0,0,0,0.55)';
    context.fillRect(0, height * 0.58, width, height * 0.42);
    drawTinyText(context, headline, 12, 12, 6, '#f6fbff');
    drawTinyText(context, sub, 14, height * 0.66, 3, '#cfe6f6');
    context.strokeStyle = 'rgba(255,255,255,0.35)';
    context.lineWidth = 4;
    context.strokeRect(3, 3, width - 6, height - 6);
    const texture = this.wrap(surface, { name: key });
    this.cache.set(key, texture);
    return texture;
  }

  /** Painted mural for the Little Verano walls: bold flat shapes, no text. */
  mural(index = 0) {
    const hues = [
      [0xe05a3c, 0xf0a83c, 0x2f6f8f],
      [0x3f9a7a, 0xf2d06b, 0xc2456a],
      [0x7a4fa8, 0xf07a4a, 0x3fc0c8],
    ];
    const palette = hues[index % hues.length];
    return this.once(`mural:${index}`, (context, size, rng) => {
      context.fillStyle = hexCss(palette[2], 0.55);
      context.fillRect(0, 0, size, size);
      for (let i = 0; i < 9; i += 1) {
        context.fillStyle = hexCss(rng.pick(palette), rng.float(0.75, 1.15));
        if (rng.chance(0.5)) {
          context.beginPath();
          context.arc(rng.float(0, size), rng.float(0, size), rng.float(18, 62), 0, TAU);
          context.fill();
        } else {
          context.fillRect(rng.float(-20, size), rng.float(-20, size), rng.float(40, 150), rng.float(40, 120));
        }
      }
      // Sun over a horizon, the local motif.
      context.fillStyle = hexCss(palette[1]);
      context.beginPath();
      context.arc(size * 0.72, size * 0.28, size * 0.16, 0, TAU);
      context.fill();
      for (let i = 0; i < 14; i += 1) {
        context.fillStyle = 'rgba(255,255,255,0.10)';
        context.fillRect(0, rng.float(0, size), size, rng.float(2, 8));
      }
    });
  }

  /** Moon surface: bright disc with maria, used on the sky dome's moon. */
  moon() {
    return this.once('moon', (context, size, rng) => {
      context.fillStyle = '#e9eeff';
      context.fillRect(0, 0, size, size);
      for (let i = 0; i < 26; i += 1) {
        context.fillStyle = `rgba(150,165,205,${rng.float(0.12, 0.34)})`;
        context.beginPath();
        context.arc(rng.float(size * 0.1, size * 0.9), rng.float(size * 0.1, size * 0.9), rng.float(6, 30), 0, TAU);
        context.fill();
      }
      for (let i = 0; i < 60; i += 1) {
        context.fillStyle = `rgba(120,135,175,${rng.float(0.08, 0.24)})`;
        context.beginPath();
        context.arc(rng.float(0, size), rng.float(0, size), rng.float(2, 9), 0, TAU);
        context.fill();
      }
    }, { size: 128 });
  }

  /** Wood for piers, crates and market stalls. */
  planks(tint = 0x8a6a44) {
    return this.once(`planks:${tint.toString(16)}`, (context, size, rng) => {
      context.fillStyle = hexCss(tint);
      context.fillRect(0, 0, size, size);
      const rows = 6;
      const step = size / rows;
      for (let row = 0; row < rows; row += 1) {
        context.fillStyle = hexCss(tint, rng.float(0.85, 1.14));
        context.fillRect(0, row * step + 1, size, step - 2);
        for (let k = 0; k < 5; k += 1) {
          context.fillStyle = 'rgba(60,42,26,0.22)';
          context.fillRect(rng.float(0, size), row * step + rng.float(2, step - 4), rng.float(10, 40), 1.4);
        }
      }
      specks(context, rng, { count: 700, size: 1.4, colors: ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.05)'] });
    });
  }

  /** Weathered metal for cranes, railings and lamp posts. */
  metal(tint = 0x6d7378) {
    return this.once(`metal:${tint.toString(16)}`, (context, size, rng) => {
      context.fillStyle = hexCss(tint);
      context.fillRect(0, 0, size, size);
      specks(context, rng, { count: 1200, size: 1.6, colors: ['rgba(0,0,0,0.14)', 'rgba(255,255,255,0.08)'] });
      for (let i = 0; i < 18; i += 1) {
        context.fillStyle = `rgba(${120 + rng.int(0, 40)},${70 + rng.int(0, 20)},44,${rng.float(0.06, 0.2)})`;
        context.fillRect(rng.float(0, size), rng.float(0, size), rng.float(4, 24), rng.float(3, 20));
      }
    });
  }

  /** Tiling asphalt/concrete for plazas and parking aprons. */
  plaza() {
    return this.once('plaza', (context, size, rng) => {
      context.fillStyle = '#a8a49a';
      context.fillRect(0, 0, size, size);
      const grid = 6;
      const step = size / grid;
      for (let row = 0; row < grid; row += 1) {
        for (let column = 0; column < grid; column += 1) {
          context.fillStyle = hexCss(0xa8a49a, rng.float(0.9, 1.08));
          context.fillRect(column * step + 1, row * step + 1, step - 2, step - 2);
        }
      }
      specks(context, rng, { count: 900, size: 1.5, colors: ['rgba(0,0,0,0.06)', 'rgba(255,255,255,0.06)'] });
    });
  }

  dispose() {
    for (const value of this.cache.values()) {
      if (value?.isTexture) value.dispose();
      else if (value?.map?.isTexture) {
        value.map.dispose();
        value.emissive?.dispose();
      }
    }
    this.cache.clear();
  }
}

/** Sprinkles deterministic specks over a surface. */
function specks(context, rng, options) {
  const { count = 800, size = 1.5, colors = ['rgba(0,0,0,0.1)'] } = options;
  const width = context.canvas.width;
  const height = context.canvas.height;
  for (let i = 0; i < count; i += 1) {
    context.fillStyle = rng.pick(colors);
    context.fillRect(rng.float(0, width), rng.float(0, height), rng.float(0.6, size), rng.float(0.6, size));
  }
}

/** A solid lane line at a normalised height across the texture. */
function paintLine(context, t, height, color, thickness) {
  context.fillStyle = color;
  context.globalAlpha = 0.82;
  context.fillRect(0, Math.round(height * t - thickness / 2), context.canvas.width, thickness);
  context.globalAlpha = 1;
}

/** A dashed line: one dash per tile so the tiles repeat seamlessly. */
function dashLine(context, t, height, width, color, thickness) {
  context.fillStyle = color;
  context.globalAlpha = 0.86;
  context.fillRect(0, Math.round(height * t - thickness / 2), Math.round(width * 0.3), thickness);
  context.globalAlpha = 1;
}

function hexCss(hex, tint = 1) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * tint));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * tint));
  const b = Math.min(255, Math.round((hex & 255) * tint));
  return `rgb(${r},${g},${b})`;
}

export function createTextureFactory(options) {
  return new TextureFactory(options);
}
