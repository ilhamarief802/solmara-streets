// Solmara's seven districts. Each is a data record: the palette its buildings and pavement are
// drawn from, how tall and how dense its massing is, and which street furniture it seeds. The
// city plan asks this module which district a point belongs to; the builders ask for the rest.

/** How a district's buildings are massed. heights are metres; lots are how many per block. */
export const DISTRICTS = {
  downtown: {
    id: 'downtown',
    label: 'Downtown Core',
    blurb: 'Glass towers over the bay, the bank towers of Solmara.',
    palette: {
      facades: [0xc9c6bd, 0xb8bcc4, 0x9aa6b2, 0xd6cfc2, 0xa8b0b8, 0xbfc6cc],
      trim: 0x6f7680,
      glass: [0x7fa8c4, 0x8fb4c8, 0x6f96ad, 0xa8c4d2],
      pavement: 0x9a9a96,
      accents: [0xd8a24a, 0x3f8fa6],
    },
    massing: { minHeight: 26, maxHeight: 132, floors: [8, 38], setbackChance: 0.55, lots: [1, 3], towerChance: 0.5 },
    props: { palm: 0.35, streetlight: 1, bench: 0.3, bin: 0.5, hydrant: 0.5, stall: 0.15, sign: 0.5, trafficLight: 0.9, planter: 0.6 },
    sidewalk: 7,
  },
  marina: {
    id: 'marina',
    label: 'Marina Quarter',
    blurb: 'White stucco, teal awnings, and a thousand masts.',
    palette: {
      facades: [0xf2ece0, 0xe8dfcd, 0xf6f1e6, 0xdfd6c4, 0xeae4d6],
      trim: 0x3f8fa6,
      glass: [0x8fb4bc, 0x9cc4c8],
      pavement: 0xc8bfae,
      accents: [0x2f7f8f, 0xd8a24a, 0xf0f0e8],
    },
    massing: { minHeight: 9, maxHeight: 30, floors: [3, 9], setbackChance: 0.25, lots: [2, 4], towerChance: 0.05 },
    props: { palm: 0.85, streetlight: 0.85, bench: 0.6, bin: 0.5, hydrant: 0.3, stall: 0.5, sign: 0.4, trafficLight: 0.45, planter: 0.5 },
    sidewalk: 5.5,
  },
  verano: {
    id: 'verano',
    label: 'Little Verano',
    blurb: 'Ochre low-rise, laundry lines, the old neighbourhood.',
    palette: {
      facades: [0xd9a066, 0xc98c5a, 0xe0b483, 0xc47a56, 0xe8c79a, 0xb87454],
      trim: 0x8a5238,
      glass: [0x9ab0a8, 0xa8b8ac],
      pavement: 0xb8a894,
      accents: [0x6f8f4a, 0xc0483c, 0xe8d8a8],
    },
    massing: { minHeight: 6, maxHeight: 15, floors: [2, 4], setbackChance: 0.12, lots: [3, 6], towerChance: 0 },
    props: { palm: 0.45, streetlight: 0.7, bench: 0.5, bin: 0.5, hydrant: 0.5, stall: 0.55, sign: 0.3, trafficLight: 0.25, planter: 0.4 },
    sidewalk: 4.5,
  },
  neon: {
    id: 'neon',
    label: 'Neon Strip',
    blurb: 'Clubs, motels and signs that stay lit until dawn.',
    palette: {
      facades: [0x4a3a44, 0x3d3340, 0x574450, 0x2f2a34, 0x5a4650],
      trim: 0x1d1a22,
      glass: [0x6a5a70, 0x54485e],
      pavement: 0x6a6470,
      accents: [0xff5d9e, 0x5ce1e6, 0xffc94a, 0xb05cff],
    },
    massing: { minHeight: 7, maxHeight: 22, floors: [2, 6], setbackChance: 0.1, lots: [2, 5], towerChance: 0.04 },
    props: { palm: 0.55, streetlight: 1, bench: 0.25, bin: 0.5, hydrant: 0.3, stall: 0.5, sign: 1, trafficLight: 0.5, planter: 0.2 },
    sidewalk: 5,
  },
  harbour: {
    id: 'harbour',
    label: 'Harbour Works',
    blurb: 'Gantry cranes, containers, the night shift.',
    palette: {
      facades: [0x8a9298, 0x9aa0a4, 0x767c82, 0xa8a8a0, 0x8f8a80],
      trim: 0x4a5054,
      glass: [0x7a8a90],
      pavement: 0x8a8a86,
      accents: [0xd8823a, 0x2f5f7f, 0xc8c8c0],
    },
    massing: { minHeight: 6, maxHeight: 14, floors: [1, 3], setbackChance: 0.05, lots: [1, 2], towerChance: 0 },
    props: { palm: 0.08, streetlight: 0.7, bench: 0.1, bin: 0.4, hydrant: 0.3, stall: 0.05, sign: 0.3, trafficLight: 0.3, planter: 0.05 },
    sidewalk: 4,
  },
  beach: {
    id: 'beach',
    label: 'Solmara Beach',
    blurb: 'The boardwalk, the pier, and the long white sand.',
    palette: {
      facades: [0xf4e8d4, 0xe8dcc4, 0xf8f0e0, 0xdcd0b8, 0xf0e0c8],
      trim: 0x7a9aa8,
      glass: [0x9cc4cc, 0x8fb8c0],
      pavement: 0xd8c8a8,
      accents: [0xe85c5c, 0x3f9fa6, 0xffd88a],
    },
    massing: { minHeight: 5, maxHeight: 14, floors: [1, 4], setbackChance: 0.1, lots: [2, 4], towerChance: 0.02 },
    props: { palm: 1, streetlight: 0.6, bench: 0.8, bin: 0.6, hydrant: 0.2, stall: 0.7, sign: 0.4, trafficLight: 0.15, planter: 0.2 },
    sidewalk: 6,
  },
  airstrip: {
    id: 'airstrip',
    label: 'Marsh Airstrip',
    blurb: 'One dirt runway, two hangars, and a lot of mosquitoes.',
    palette: {
      facades: [0x9a8f78, 0x8a7f68, 0xa89880, 0x7a7060],
      trim: 0x4a4438,
      glass: [0x7a8078],
      pavement: 0x8a7f6a,
      accents: [0xc8b898, 0x4a5f4a],
    },
    massing: { minHeight: 5, maxHeight: 11, floors: [1, 2], setbackChance: 0, lots: [1, 1], towerChance: 0 },
    props: { palm: 0.1, streetlight: 0.3, bench: 0, bin: 0.2, hydrant: 0.1, stall: 0, sign: 0.2, trafficLight: 0, planter: 0 },
    sidewalk: 2.5,
  },
};

/** The order the plan tests regions in; the first match wins. */
export const DISTRICT_IDS = ['downtown', 'marina', 'verano', 'neon', 'harbour', 'beach', 'airstrip'];

/** The city's land bounds, in metres: west, north, east, south. */
export const LAND_BOUNDS = { minX: -980, minZ: -980, maxX: 1180, maxZ: 700 };

/**
 * Which district a ground point belongs to, or null over water. The tests are deliberately
 * coarse and readable, in the order the plan's own regions nest: the harbour peninsula past
 * the channel, the southern beach band, the marsh in the north-west, then the city quarters.
 */
export function districtIdAt(x, z, isWater = false) {
  if (isWater) return null;
  if (x >= 880) return 'harbour';
  if (z >= 300) return 'beach';
  if (x < -744) return 'airstrip';
  if (z >= 120 && x < 200) return 'neon';
  if (x >= 150) return 'marina';
  if (x < -180) return 'verano';
  return 'downtown';
}

/** A district record by id, always defined (unknown ids fall back to downtown). */
export function districtOf(id) {
  return DISTRICTS[id] ?? DISTRICTS.downtown;
}

/** A colour from a district palette, cycling deterministically with the given index. */
export function paletteColor(palette, index) {
  const list = palette.facades;
  return list[((index % list.length) + list.length) % list.length];
}
