// The seven districts of Solmara. Each one is a small data record: where it sits, how tall
// it builds, which facades and neon it likes, and what street furniture it tolerates. The
// plan zones blocks from these rectangles; buildings, textures and props read the palette
// and density, so a district looks like itself everywhere.

export const DISTRICTS = {
  downtown: {
    id: 'downtown',
    name: 'Downtown Core',
    blurb: 'Glass towers, bank plazas and the long shadow of the Avenida Sol.',
    accent: 0x63c7ff,
    bounds: { x0: -20, x1: 580, z0: -580, z1: 160 },
    zoning: 'commercial',
    density: 1,
    height: [34, 148],
    lot: [42, 68],
    setbackChance: 0.72,
    parkChance: 0.04,
    // Which entry of the palette's facade list a lot starts on; the walk cycles from there.
    facadeCycle: 2,
    palette: {
      facades: [0x9fb4c4, 0xc4c9c2, 0x7f93a8, 0xb9ab97],
      glass: 0x2f5d78,
      trim: 0x3a4148,
      ground: 0x6e7076,
      glow: 0x9fe4ff,
      signage: [0x63c7ff, 0xffd36e, 0xff7a5c, 0xffffff],
    },
    props: { palms: 0.12, lights: 1, benches: 0.5, bins: 0.7, hydrants: 0.8, stalls: 0, cars: 0.9, signs: 0.5, planters: 0.7 },
  },
  marina: {
    id: 'marina',
    name: 'Marina Quarter',
    blurb: 'White mid-rises, yacht brokers and a boardwalk that smells of salt.',
    accent: 0x5fd8c4,
    bounds: { x0: -880, x1: -45, z0: -560, z1: 280 },
    zoning: 'mixed',
    density: 0.68,
    height: [16, 62],
    lot: [30, 52],
    setbackChance: 0.45,
    parkChance: 0.1,
    facadeCycle: 3,
    palette: {
      facades: [0xd8d2c4, 0xa9c4c9, 0xc9b7a2, 0x92a9b8],
      glass: 0x3b7a86,
      trim: 0x4a5157,
      ground: 0x8b877c,
      glow: 0x8bf0dd,
      signage: [0x5fd8c4, 0xffffff, 0xffc46e, 0x8fb8ff],
    },
    props: { palms: 0.8, lights: 0.8, benches: 0.7, bins: 0.6, hydrants: 0.5, stalls: 0.25, cars: 0.7, signs: 0.4, planters: 0.6 },
  },
  verano: {
    id: 'verano',
    name: 'Little Verano',
    blurb: 'Sun-bleached low-rise, laundromats, corner bakeries and bougainvillea.',
    accent: 0xff8f5e,
    bounds: { x0: 100, x1: 720, z0: 160, z1: 620 },
    zoning: 'residential',
    density: 0.45,
    height: [7, 24],
    lot: [22, 36],
    setbackChance: 0.25,
    parkChance: 0.14,
    facadeCycle: 4,
    palette: {
      facades: [0xe8d3b0, 0xd9a98a, 0xc9d6b2, 0xe6bfae, 0xbfc9c9],
      glass: 0x4a6a72,
      trim: 0x6b4f3a,
      ground: 0x9a8f7c,
      glow: 0xffb27a,
      signage: [0xff8f5e, 0xffd36e, 0xe86a9a, 0x8fd16e],
    },
    props: { palms: 0.5, lights: 0.6, benches: 0.6, bins: 0.6, hydrants: 0.7, stalls: 0.65, cars: 0.6, signs: 0.7, planters: 0.5 },
  },
  neon: {
    id: 'neon',
    name: 'Neon Strip',
    blurb: 'Clubs, motels and twenty-four-hour pawn shops under a permanent glow.',
    accent: 0xff5fc8,
    bounds: { x0: -300, x1: 380, z0: -960, z1: -600 },
    zoning: 'entertainment',
    density: 0.9,
    height: [12, 46],
    lot: [26, 44],
    setbackChance: 0.18,
    parkChance: 0.02,
    facadeCycle: 3,
    palette: {
      facades: [0x3b3238, 0x4c3a46, 0x30343f, 0x5a4038],
      glass: 0x5a2f55,
      trim: 0x221d24,
      ground: 0x4a444c,
      glow: 0xff5fc8,
      signage: [0xff5fc8, 0x63e8ff, 0xffe066, 0x9d6bff, 0xff4a4a],
    },
    props: { palms: 0.35, lights: 1, benches: 0.3, bins: 0.5, hydrants: 0.3, stalls: 0.3, cars: 1, signs: 1, planters: 0.2 },
  },
  harbour: {
    id: 'harbour',
    name: 'Harbour Works',
    blurb: 'Container stacks, gantry cranes and the smell of diesel and cold fish.',
    accent: 0xffb02e,
    bounds: { x0: -880, x1: -190, z0: 280, z1: 620 },
    zoning: 'industrial',
    density: 0.5,
    height: [8, 20],
    lot: [34, 56],
    setbackChance: 0.05,
    parkChance: 0,
    facadeCycle: 1,
    palette: {
      facades: [0x8a8f8c, 0x6d7778, 0x9a9184, 0x5d6a6d],
      glass: 0x33484c,
      trim: 0x2e3335,
      ground: 0x77736a,
      glow: 0xffd36e,
      signage: [0xffb02e, 0xff6b3d, 0xd8e0e0],
    },
    props: { palms: 0.05, lights: 0.9, benches: 0.15, bins: 0.4, hydrants: 0.6, stalls: 0.1, cars: 0.5, signs: 0.4, planters: 0.1 },
  },
  beach: {
    id: 'beach',
    name: 'Solmara Beach',
    blurb: 'Sand, boardwalk, a pier of yachts and the long low sun on the water.',
    accent: 0x8ee6ff,
    bounds: { x0: 720, x1: 1260, z0: 160, z1: 640 },
    zoning: 'leisure',
    density: 0.3,
    height: [4, 16],
    lot: [28, 46],
    setbackChance: 0.2,
    parkChance: 0.2,
    facadeCycle: 3,
    palette: {
      facades: [0xf0e6d2, 0xe8c9a8, 0xcde2e6, 0xffd6c2],
      glass: 0x4a8ea0,
      trim: 0x7a6a55,
      ground: 0xc9b795,
      glow: 0xffe2a8,
      signage: [0x8ee6ff, 0xff8f8f, 0xffffff, 0xffd36e],
    },
    props: { palms: 1, lights: 0.7, benches: 0.9, bins: 0.5, hydrants: 0.3, stalls: 0.8, cars: 0.4, signs: 0.5, planters: 0.4 },
  },
  airstrip: {
    id: 'airstrip',
    name: 'Marsh Airstrip',
    blurb: 'One runway, two hangars and the wind off the reeds.',
    accent: 0xc8d98a,
    bounds: { x0: -900, x1: -420, z0: -980, z1: -600 },
    zoning: 'marsh',
    density: 0.18,
    height: [5, 14],
    lot: [24, 48],
    setbackChance: 0.1,
    parkChance: 0.5,
    facadeCycle: 1,
    palette: {
      facades: [0x9aa08a, 0x7d8778, 0xa8a190, 0x6f7a6a],
      glass: 0x3d5148,
      trim: 0x393f36,
      ground: 0x6f7358,
      glow: 0xffe2a8,
      signage: [0xc8d98a, 0xffd36e, 0xdfe8d0],
    },
    props: { palms: 0.02, lights: 0.5, benches: 0.1, bins: 0.2, hydrants: 0.2, stalls: 0.1, cars: 0.25, signs: 0.2, planters: 0.05 },
  },
};

export const DISTRICT_IDS = ['downtown', 'marina', 'verano', 'neon', 'harbour', 'beach', 'airstrip'];

/** The playable land rectangle, slightly outside the built districts. */
export const LAND_BOUNDS = { minX: -920, minZ: -980, maxX: 1280, maxZ: 680 };

// The order rectangles are tested in: the small, specific districts win any overlap with
// the big downtown and marina rectangles.
const LOOKUP_ORDER = ['airstrip', 'harbour', 'beach', 'neon', 'downtown', 'marina', 'verano'];

function inside(bounds, x, z) {
  return x >= bounds.x0 && x <= bounds.x1 && z >= bounds.z0 && z <= bounds.z1;
}

/**
 * The district at a position. Water gets the nearest shore district, so a boat or a
 * swimmer still reports something sensible.
 */
export function districtIdAt(x, z, isWater = false) {
  for (const id of LOOKUP_ORDER) {
    if (inside(DISTRICTS[id].bounds, x, z)) return id;
  }
  if (isWater) {
    if (z > 300 && x > 500) return 'beach';
    if (z > 260 && x < -300) return 'harbour';
    if (x < -45) return 'marina';
  }
  // Open land outside every rectangle falls back to the nearest reasonable neighbour.
  if (z < -600) return 'neon';
  if (x < -45) return 'marina';
  if (z > 160) return 'verano';
  return 'downtown';
}

export function districtOf(id) {
  return DISTRICTS[id] ?? DISTRICTS.downtown;
}

/** Cycles a palette array safely, including for negative indices. */
export function paletteColor(palette, index) {
  const list = palette?.facades ?? DISTRICTS.downtown.palette.facades;
  return list[((index % list.length) + list.length) % list.length];
}

/** The district's short name for labels. */
export function districtName(id) {
  return districtOf(id).name;
}
