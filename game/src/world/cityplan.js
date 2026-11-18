// The plan of Solmara: where land is, where the water is, where the streets run, which
// district owns each block and where the crossings are. Everything downstream (roads,
// buildings, props, terrain, the road graph, the minimap) reads this one object, so
// the whole city stays consistent and reproducible from a single seed.

import { Rng } from '../core/random.js';
import { districtById } from './districts.js';

export const CITY = Object.freeze({
  pitch: 72, // street centre to street centre
  blockSize: 56, // paved block inside the streets
  buildSize: 46, // buildable footprint once sidewalks are taken off
  roadWidth: 16,
  sidewalkWidth: 6,
  sidewalkHeight: 0.22,
  kerbHeight: 0.24,

  // Mainland street grid, in line indices (world = index * pitch).
  mainX: { min: -7, max: 7 },
  mainZ: { min: -6, max: 3 },
  // Beach island street grid.
  beachX: { min: -3, max: 4 },
  beachZ: { min: 5, max: 6 },

  channelNear: 224, // south kerb of the last mainland street
  channelFar: 352, // north kerb of the first beach street
  seaLevel: -0.35,
  landHeight: 0,
  shoreFalloff: 46,
  beachSlope: 78,

  bridgeX: 0, // the Old Bridge
  causewayX: -216, // the beach causeway
  highwayHeight: 15,
  runwayZ: -384,
  runwayFrom: 176,
  runwayTo: 500,

  terrainExtent: 1800,
  waterExtent: 3200,
});

const MAIN_X = [];
for (let i = CITY.mainX.min; i <= CITY.mainX.max; i += 1) MAIN_X.push(i);
const MAIN_Z = [];
for (let j = CITY.mainZ.min; j <= CITY.mainZ.max; j += 1) MAIN_Z.push(j);
const BEACH_X = [];
for (let i = CITY.beachX.min; i <= CITY.beachX.max; i += 1) BEACH_X.push(i);
const BEACH_Z = [];
for (let j = CITY.beachZ.min; j <= CITY.beachZ.max; j += 1) BEACH_Z.push(j);

/** Flat pieces of land. Water is simply "not land", and the terrain slopes between. */
export const LAND_RECTS = [
  { id: 'mainland', x0: -560, x1: 1100, z0: -1500, z1: 240, kind: 'city' },
  { id: 'beach', x0: -252, x1: 324, z0: 352, z1: 484, kind: 'beach' },
];

/** Zoning overlays on the mainland: grass marsh around the airstrip. */
export const LAND_KINDS = [
  { id: 'marsh', x0: 168, x1: 512, z0: -480, z1: -296, kind: 'marsh' },
  { id: 'dunes', x0: 300, x1: 460, z0: 236, z1: 300, kind: 'sand' },
];

/** Which district a world point belongs to. Ordered rules, first match wins. */
export function districtAt(x, z) {
  if (x >= -252 && x <= 324 && z >= 352 && z <= 484) return 'beach';
  if (x >= 168 && z <= -296) return 'marsh';
  if (x <= -252 && z <= -120) return 'harbour';
  if (x <= -252 && z >= 36) return 'marina';
  if (x >= 108 && z >= -180 && z <= 36) return 'neon';
  if (Math.abs(x) <= 180 && z >= -396 && z <= 108) return 'downtown';
  return 'verano';
}

export function insideRect(rect, x, z) {
  return x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1;
}

export function isLand(x, z) {
  for (const rect of LAND_RECTS) if (insideRect(rect, x, z)) return true;
  return false;
}

export function landKindAt(x, z) {
  for (const overlay of LAND_KINDS) if (insideRect(overlay, x, z)) return overlay.kind;
  if (x >= -252 && x <= 324 && z >= 352 && z <= 484) return 'beach';
  for (const rect of LAND_RECTS) if (insideRect(rect, x, z)) return rect.kind;
  return 'water';
}

function nodeId(x, z) {
  return `n${x / 10 | 0}_${z / 10 | 0}`;
}

/**
 * Builds the whole plan. Deterministic for a given seed: the same streets, the same
 * districts, the same handful of special blocks every load.
 */
export function createCityPlan(options = {}) {
  const seed = options.seed ?? 'solmara-01';
  const rng = options.rng ?? new Rng(seed);
  const mini = rng.fork('plan-minor');

  // --- blocks -------------------------------------------------------------
  const blocks = [];
  for (const i of MAIN_X.slice(0, -1)) {
    for (const j of MAIN_Z.slice(0, -1)) {
      const cx = (i + 0.5) * CITY.pitch;
      const cz = (j + 0.5) * CITY.pitch;
      blocks.push(makeBlock(i, j, cx, cz, 'mainland'));
    }
  }
  for (const i of BEACH_X.slice(0, -1)) {
    for (const j of BEACH_Z.slice(0, -1)) {
      const cx = (i + 0.5) * CITY.pitch;
      const cz = (j + 0.5) * CITY.pitch;
      blocks.push(makeBlock(i, j, cx, cz, 'beach'));
    }
  }

  // Landmark and open-space blocks, chosen by index so they never move.
  const specials = {
    '0,0': { kind: 'plaza', landmark: 'solmara-plaza' },
    '1,-4': { kind: 'tower', landmark: 'solmara-tower' },
    '-3,2': { kind: 'stadium', landmark: 'verano-stadium' },
    '-6,-2': { kind: 'docks', landmark: 'harbour-docks' },
    '3,-4': { kind: 'park' },
    '5,-5': { kind: 'airstrip' },
    '4,-5': { kind: 'airstrip' },
    '6,-4': { kind: 'airstrip' },
    '-7,1': { kind: 'park' },
    '4,2': { kind: 'park' },
  };
  for (const block of blocks) {
    const key = `${block.i},${block.j}`;
    const special = specials[key];
    if (special) {
      block.kind = special.kind;
      if (special.landmark) block.landmark = special.landmark;
      if (special.kind === 'airstrip' || special.kind === 'stadium') block.buildings = false;
    }
    const landKind = landKindAt(block.cx, block.cz);
    block.landKind = landKind;
    if (landKind === 'marsh' && block.kind === 'buildings') block.kind = 'marsh-scrub';
  }

  const beachBlocks = blocks.filter((block) => block.island === 'beach');
  for (const block of beachBlocks) {
    if (block.j === 5 && block.i % 2 === 0) block.kind = 'boardwalk';
    block.landKind = 'beach';
  }

  // --- streets ------------------------------------------------------------
  const xLines = MAIN_X.map((i) => ({ i, x: i * CITY.pitch, boulevard: i === 0 }));
  const zLines = MAIN_Z.map((j) => ({ j, z: j * CITY.pitch, boulevard: j === -1 }));
  const beachXLines = BEACH_X.map((i) => ({ i, x: i * CITY.pitch, boulevard: false }));
  const beachZLines = BEACH_Z.map((j) => ({ j, z: j * CITY.pitch, boulevard: false }));

  // --- junctions, nodes and edges: the road graph --------------------------
  const nodes = [];
  const nodeAt = new Map();
  const addNode = (x, z, district, island) => {
    const id = nodeId(x, z);
    let node = nodeAt.get(id);
    if (!node) {
      node = { id, x, z, district, island, links: [], degree: 0, signals: false, index: nodes.length };
      nodeAt.set(id, node);
      nodes.push(node);
    }
    return node;
  };

  for (const line of xLines) {
    for (const cross of zLines) {
      addNode(line.x, cross.z, districtAt(line.x, cross.z), 'mainland');
    }
  }
  for (const line of beachXLines) {
    for (const cross of beachZLines) {
      addNode(line.x, cross.z, 'beach', 'beach');
    }
  }

  const edges = [];
  const link = (a, b, axis, wide) => {
    const length = Math.hypot(a.x - b.x, a.z - b.z);
    const edge = {
      id: `${a.id}->${b.id}`,
      a: a.id,
      b: b.id,
      ax: a.x,
      az: a.z,
      bx: b.x,
      bz: b.z,
      axis,
      length,
      width: wide ? 22 : CITY.roadWidth,
      wide: wide === true,
      district: a.district,
      bridge: false,
    };
    edges.push(edge);
    a.links.push(edge.id);
    b.links.push(edge.id);
    a.degree += 1;
    b.degree += 1;
    return edge;
  };

  for (const line of xLines) {
    for (let k = 0; k < zLines.length - 1; k += 1) {
      const a = addNode(line.x, zLines[k].z, districtAt(line.x, zLines[k].z), 'mainland');
      const b = addNode(line.x, zLines[k + 1].z, districtAt(line.x, zLines[k + 1].z), 'mainland');
      link(a, b, 'z', line.boulevard);
    }
  }
  for (const cross of zLines) {
    for (let k = 0; k < xLines.length - 1; k += 1) {
      const a = addNode(xLines[k].x, cross.z, districtAt(xLines[k].x, cross.z), 'mainland');
      const b = addNode(xLines[k + 1].x, cross.z, districtAt(xLines[k + 1].x, cross.z), 'mainland');
      link(a, b, 'x', cross.boulevard);
    }
  }
  for (const line of beachXLines) {
    for (let k = 0; k < beachZLines.length - 1; k += 1) {
      const a = addNode(line.x, beachZLines[k].z, 'beach', 'beach');
      const b = addNode(line.x, beachZLines[k + 1].z, 'beach', 'beach');
      link(a, b, 'z', false);
    }
  }
  for (const cross of beachZLines) {
    for (let k = 0; k < beachXLines.length - 1; k += 1) {
      const a = addNode(beachXLines[k].x, cross.z, 'beach', 'beach');
      const b = addNode(beachXLines[k + 1].x, cross.z, 'beach', 'beach');
      link(a, b, 'x', false);
    }
  }

  // --- bridges: the only edges that cross the channel ----------------------
  const bridges = [];
  const addBridge = (x, name, kind) => {
    const south = addNode(x, CITY.mainZ.max * CITY.pitch, districtAt(x, CITY.mainZ.max * CITY.pitch), 'mainland');
    const north = addNode(x, CITY.beachZ.min * CITY.pitch, 'beach', 'beach');
    const edge = link(south, north, 'bridge', true);
    edge.bridge = true;
    edge.width = kind === 'suspension' ? 20 : 17;
    const bridge = {
      id: name,
      name,
      kind,
      x,
      from: CITY.channelNear,
      to: CITY.channelFar,
      width: edge.width,
      deckHeight: kind === 'suspension' ? 9 : 6,
      towers: kind === 'suspension' ? 2 : 0,
      edge: edge.id,
      district: 'oldbridge',
      midpoint: { x, z: (CITY.channelNear + CITY.channelFar) / 2 },
    };
    bridges.push(bridge);
    return bridge;
  };
  addBridge(CITY.bridgeX, 'The Old Bridge', 'suspension');
  addBridge(CITY.causewayX, 'Beach Causeway', 'girder');

  // --- traffic signals -----------------------------------------------------
  // Signals sit on junctions of the two boulevards and on a scattered selection of
  // others, so the strip and downtown read as signalled while back streets do not.
  for (const node of nodes) {
    if (node.island === 'beach') continue;
    const onBoulevard = node.x === 0 || node.z === -CITY.pitch;
    const scattered = mini.chance(0.34);
    node.signals = onBoulevard || scattered;
  }

  // --- elevated highway ring ----------------------------------------------
  const highway = {
    height: CITY.highwayHeight,
    width: 20,
    loop: [
      { x: CITY.mainX.min * CITY.pitch, z: CITY.mainZ.min * CITY.pitch },
      { x: CITY.mainX.max * CITY.pitch, z: CITY.mainZ.min * CITY.pitch },
      { x: CITY.mainX.max * CITY.pitch, z: CITY.mainZ.max * CITY.pitch },
      { x: CITY.mainX.min * CITY.pitch, z: CITY.mainZ.max * CITY.pitch },
    ],
    ramps: [
      { x: CITY.mainX.min * CITY.pitch, z: -180, axis: 'x', length: 92 },
      { x: CITY.mainX.max * CITY.pitch, z: 60, axis: 'x', length: 92 },
      { x: 210, z: CITY.mainZ.min * CITY.pitch, axis: 'z', length: 92 },
      { x: -140, z: CITY.mainZ.max * CITY.pitch, axis: 'z', length: 92 },
    ],
  };

  const plan = {
    seed,
    city: CITY,
    rng,
    blocks,
    xLines,
    zLines,
    beachXLines,
    beachZLines,
    landRects: LAND_RECTS,
    landKinds: LAND_KINDS,
    nodes,
    edges,
    bridges,
    highway,
    specials,
    landmarks: {
      tower: { x: 1.5 * CITY.pitch, z: -3.5 * CITY.pitch, block: '1,-4' },
      plaza: { x: 0.5 * CITY.pitch, z: 0.5 * CITY.pitch, block: '0,0' },
      stadium: { x: -2.5 * CITY.pitch, z: 2.5 * CITY.pitch, block: '-3,2' },
      docks: { x: -5.5 * CITY.pitch, z: -1.5 * CITY.pitch, block: '-6,-2' },
      pier: { x: -640, z: 150 },
      cranes: { x: -560, z: -300 },
      airstrip: { x: (CITY.runwayFrom + CITY.runwayTo) / 2, z: CITY.runwayZ },
      boardwalk: { x: 108, z: 400 },
      orange: { x: 108, z: -60 },
    },
    districtAt,
    isLand,
    landKindAt,
    placeholders: {},
  };

  return plan;
}

function makeBlock(i, j, cx, cz, island) {
  return {
    i,
    j,
    cx,
    cz,
    size: CITY.blockSize,
    build: CITY.buildSize,
    districtId: districtAt(cx, cz),
    kind: 'buildings',
    landmark: null,
    island,
    buildable: true,
    seedOffset: ((i * 73856093) ^ (j * 19349663)) >>> 0,
  };
}

/** The block whose paved square contains a point, or null. */
export function blockAt(plan, x, z) {
  for (const block of plan.blocks) {
    if (Math.abs(x - block.cx) <= block.size / 2 + 8 && Math.abs(z - block.cz) <= block.size / 2 + 8) {
      return block;
    }
  }
  return null;
}

export function districtOf(plan, x, z) {
  return districtById(districtAt(x, z));
}

/** A short summary for the boot log: how big the city turned out. */
export function planSummary(plan) {
  const counts = new Map();
  for (const block of plan.blocks) {
    counts.set(block.districtId, (counts.get(block.districtId) ?? 0) + 1);
  }
  const spread = [...counts.entries()].map(([id, count]) => `${id}:${count}`).join(' ');
  return `${plan.blocks.length} blocks, ${plan.nodes.length} road nodes, ${plan.edges.length} edges, ${plan.bridges.length} bridges (${spread})`;
}
