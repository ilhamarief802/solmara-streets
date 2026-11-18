// The city plan: the one file that decides where Solmara's streets, blocks, water and districts
// are. Everything else in world/ reads this plan instead of inventing coordinates, so the
// buildings, props, colliders and the road graph can never disagree about where a block is.
//
// Coordinates are metres on the XZ plane: +X east, +Z south, +Y up. The bay is south of
// OCEAN_Z, the harbour channel runs north-south at CHANNEL, and the harbour peninsula sits east
// of the channel. Two bridges cross to it; one of them is the old rail bridge.

import { Random } from '../core/rng.js';
import { districtIdAt, DISTRICTS } from './districts.js';

/** Street grid: 13 avenues north-south, 12 east-west, 120 m apart. */
export const GRID = {
  xs: [-720, -600, -480, -360, -240, -120, 0, 120, 240, 360, 480, 600, 720],
  zs: [-900, -780, -660, -540, -420, -300, -180, -60, 60, 180, 300, 420],
  streetWidth: 14,
};

/** Water: the bay to the south and the channel to the east. */
export const WATER = {
  oceanZ: 556,
  channelX0: 792,
  channelX1: 884,
  channelZ0: -700,
  channelZ1: 520,
};

/** The harbour peninsula, east of the channel. */
export const HARBOUR = {
  x0: 884,
  x1: 1220,
  z0: -620,
  z1: 420,
};

/** The marsh airstrip, west of the grid in the north-west corner. */
export const AIRSTRIP = {
  x0: -1080,
  x1: -744,
  z0: -1000,
  z1: -700,
  runwayZ: -860,
};

/** Sand and boardwalk bands along the bay. */
export const BEACH = {
  sandZ0: 470,
  sandZ1: WATER.oceanZ,
  boardwalkZ: 500,
  promenadeZ: 434,
};

/** The elevated ring highway, at the outermost boulevards, 17 m up. */
export const HIGHWAY = {
  x0: GRID.xs[0],
  x1: GRID.xs[GRID.xs.length - 1],
  z0: GRID.zs[0],
  z1: GRID.zs[GRID.zs.length - 1],
  height: 17,
  deckWidth: 21,
  pierEvery: 96,
};

/**
 * Blocks that are something other than ordinary development, keyed "column,row" where column is
 * the avenue to the block's west and row the street to its north. One role per special block.
 */
const BLOCK_ROLES = {
  // The downtown landmark and the two blocks its plaza runs across.
  '5,4': 'landmarkTower',
  '5,3': 'plaza',
  // The stadium takes four blocks at the western edge of Little Verano.
  '0,4': 'stadium',
  '1,4': 'stadium',
  '0,5': 'stadium',
  '1,5': 'stadium',
  // Green pockets, one downtown and one in the marina.
  '4,6': 'park',
  '5,6': 'park',
  '9,7': 'park',
  '10,7': 'park',
  // Working civic blocks the missions will use.
  '3,6': 'hospital',
  '8,9': 'fireStation',
  '6,10': 'pierApproach',
  // The strip's plaza, where the neon boulevard opens out.
  '3,8': 'plaza',
};

/** Blocks left undeveloped on purpose: a construction site and two car parks. */
const EMPTY_ROLES = {
  '2,6': 'construction',
  '8,2': 'carPark',
  '11,8': 'carPark',
};

/** Whether a ground point is over water: the bay, the channel, or the open sea. */
export function isWaterAt(x, z) {
  if (z >= WATER.oceanZ) return true;
  if (x < WATER.channelX0 || x > WATER.channelX1) return false;
  return z > WATER.channelZ0 && z < WATER.channelZ1;
}

/** Whether a point is on the harbour peninsula, east of the channel. */
export function isHarbourAt(x, z) {
  return x >= HARBOUR.x0 && z >= HARBOUR.z0 && z <= HARBOUR.z1;
}

/** Whether a point is on the airstrip's marsh ground, west of the grid. */
export function isAirstripAt(x, z) {
  return x >= AIRSTRIP.x0 && x <= AIRSTRIP.x1 && z >= AIRSTRIP.z0 && z <= AIRSTRIP.z1;
}

/** Every block of the grid, with its bounds, district and role. */
function buildBlocks() {
  const { xs, zs, streetWidth } = GRID;
  const half = streetWidth / 2;
  const blocks = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const x0 = xs[i] + half;
      const x1 = xs[i + 1] - half;
      const z0 = zs[j] + half;
      const z1 = zs[j + 1] - half;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      if (isWaterAt(cx, cz) || isHarbourAt(cx, cz) || isAirstripAt(cx, cz)) continue;
      const key = `${i},${j}`;
      const role = BLOCK_ROLES[key] ?? EMPTY_ROLES[key] ?? 'built';
      const districtId = districtIdAt(cx, cz);
      blocks.push({
        id: `block-${i}-${j}`,
        column: i,
        row: j,
        x0, x1, z0, z1,
        cx, cz,
        width: x1 - x0,
        depth: z1 - z0,
        role,
        districtId,
        district: DISTRICTS[districtId] ?? DISTRICTS.downtown,
        isPark: role === 'park' || role === 'plaza',
        isBeachfront: cz >= 380,
      });
    }
  }
  return blocks;
}

/** Road graph nodes on every grid intersection that is on land. */
function buildGridNodes() {
  const nodes = [];
  const index = new Map();
  const { xs, zs } = GRID;
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < zs.length; j++) {
      const x = xs[i];
      const z = zs[j];
      if (isWaterAt(x, z)) continue;
      const id = `n-${i}-${j}`;
      const node = {
        id,
        index: nodes.length,
        x,
        z,
        y: 0,
        column: i,
        row: j,
        districtId: districtIdAt(x, z),
        isCorner: i === 0 || j === 0 || i === xs.length - 1 || j === zs.length - 1,
      };
      nodes.push(node);
      index.set(id, node);
    }
  }
  return { nodes, index };
}

/** A road edge between two graph nodes, with its direction, width and nominal speed. */
function makeEdge(a, b, { width = GRID.streetWidth, kind = 'avenue', length = null } = {}) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1) return null;
  return {
    id: '',
    a: a.id,
    b: b.id,
    ax: a.x, az: a.z, bx: b.x, bz: b.z,
    length: length ?? dist,
    dx: dx / dist,
    dz: dz / dist,
    lanes: kind === 'avenue' ? 4 : 2,
    width,
    kind,
    speed: kind === 'avenue' ? 15 : kind === 'harbour' ? 11 : kind === 'dirt' ? 9 : 13,
  };
}

/** Lane edges between adjacent grid nodes, one per street segment. */
function buildGridEdges(nodeIndex) {
  const edges = [];
  const { xs, zs } = GRID;
  for (let j = 0; j < zs.length; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      const edge = makeEdge(nodeIndex.get(`n-${i}-${j}`), nodeIndex.get(`n-${i + 1}-${j}`), { kind: 'avenue' });
      if (edge) edges.push(edge);
    }
  }
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const edge = makeEdge(nodeIndex.get(`n-${i}-${j}`), nodeIndex.get(`n-${i}-${j + 1}`), { kind: 'avenue' });
      if (edge) edges.push(edge);
    }
  }
  return edges;
}

/** The harbour peninsula's own quay lanes: three north-south rows, six east-west spurs. */
function buildHarbourRoads(nodes, nodeIndex) {
  const edges = [];
  const xs = [HARBOUR.x0 + 24, HARBOUR.x0 + 148, HARBOUR.x0 + 272];
  const zs = [-560, -380, -200, -20, 160, 340];
  const local = new Map();
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < zs.length; j++) {
      const id = `h-${i}-${j}`;
      const node = {
        id,
        index: nodes.length,
        x: xs[i],
        z: zs[j],
        y: 0,
        column: i,
        row: j,
        districtId: 'harbour',
        isCorner: false,
      };
      nodes.push(node);
      nodeIndex.set(id, node);
      local.set(id, node);
    }
  }
  const at = (i, j) => local.get(`h-${i}-${j}`) ?? null;
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < zs.length; j++) {
      if (i + 1 < xs.length) {
        const edge = makeEdge(at(i, j), at(i + 1, j), { kind: 'harbour', width: 12 });
        if (edge) edges.push(edge);
      }
      if (j + 1 < zs.length) {
        const edge = makeEdge(at(i, j), at(i, j + 1), { kind: 'harbour', width: 12 });
        if (edge) edges.push(edge);
      }
    }
  }
  return { edges, xs, zs, nodes: Array.from(local.values()) };
}

/**
 * Bridges across the channel. Each is two edges through a mid-channel node: the new road bridge
 * carries traffic, the old rail bridge is narrow and closed to cars.
 */
function buildBridges(nodes, nodeIndex, harbourNodes) {
  const bridges = [];
  const specs = [
    { z: -300, name: 'Verano Crossing', width: 22, rail: false },
    { z: -20, name: 'Old Rail Bridge', width: 13, rail: true },
  ];
  const westColumn = GRID.xs.length - 1;
  for (const spec of specs) {
    // The grid row nearest this crossing's z, so both bridges land on a real junction.
    let west = null;
    let bestRow = Infinity;
    for (let row = 0; row < GRID.zs.length; row++) {
      const distance = Math.abs(GRID.zs[row] - spec.z);
      if (distance < bestRow) {
        bestRow = distance;
        west = nodeIndex.get(`n-${westColumn}-${row}`);
      }
    }
    // The harbour quay node nearest this channel crossing.
    let east = null;
    let best = Infinity;
    for (const node of harbourNodes) {
      if (node.column !== 0) continue;
      const distance = Math.abs(node.z - spec.z);
      if (distance < best) {
        best = distance;
        east = node;
      }
    }
    if (!west || !east) continue;
    // The deck runs level from the west abutment to the east one; its mid node sits between.
    const deckZ = (west.z + east.z) / 2;
    const mid = {
      id: `b-${spec.rail ? 'rail' : 'road'}`,
      index: nodes.length,
      x: (west.x + east.x) / 2,
      z: deckZ,
      y: 2.4,
      districtId: null,
      isCorner: false,
      onBridge: true,
    };
    nodes.push(mid);
    nodeIndex.set(mid.id, mid);
    const first = makeEdge(west, mid, { kind: 'bridge', width: spec.width });
    const second = makeEdge(mid, east, { kind: 'bridge', width: spec.width });
    const edges = [first, second].filter(Boolean);
    for (const edge of edges) edge.rail = spec.rail;
    bridges.push({
      name: spec.name,
      rail: spec.rail,
      z: deckZ,
      width: spec.width,
      x0: west.x,
      x1: east.x,
      west,
      east,
      mid,
      edges,
    });
  }
  return bridges;
}

/** The airstrip's dirt access road from the grid's north-west corner out to the apron. */
function buildAirstripRoads(nodes, nodeIndex) {
  const anchor = nodeIndex.get('n-0-0');
  const gate = { id: 'a-gate', index: nodes.length, x: -744, z: AIRSTRIP.runwayZ, y: 0, districtId: 'airstrip', isCorner: false };
  nodes.push(gate);
  nodeIndex.set(gate.id, gate);
  const apron = { id: 'a-apron', index: nodes.length, x: -900, z: AIRSTRIP.runwayZ, y: 0, districtId: 'airstrip', isCorner: false };
  nodes.push(apron);
  nodeIndex.set(apron.id, apron);
  const edges = [];
  const first = makeEdge(anchor, gate, { kind: 'dirt', width: 9 });
  const second = makeEdge(gate, apron, { kind: 'dirt', width: 9 });
  if (first) edges.push(first);
  if (second) edges.push(second);
  return { edges, nodes: [gate, apron] };
}

/**
 * Builds the whole plan for a seed. Deterministic: the same seed gives the same blocks, the same
 * graph and the same reserved roles, which is what makes the shot rig reproducible.
 */
export function createCityPlan(seed = 'solmara-01') {
  const random = new Random(`plan:${seed}`);
  const { nodes, index } = buildGridNodes();
  const blocks = buildBlocks();

  const edges = [];
  const push = (list) => {
    for (const edge of list) {
      edge.id = `e-${edges.length}`;
      edges.push(edge);
    }
  };
  push(buildGridEdges(index));
  const harbour = buildHarbourRoads(nodes, index);
  push(harbour.edges);
  const airstrip = buildAirstripRoads(nodes, index);
  push(airstrip.edges);
  const bridges = buildBridges(nodes, index, harbour.nodes);
  for (const bridge of bridges) push(bridge.edges);

  // Adjacency: each node's edges in both directions, for the traffic and navigation layers.
  const adjacency = new Map();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) {
    adjacency.get(edge.a)?.push(edge);
    adjacency.get(edge.b)?.push({
      ...edge,
      a: edge.b, b: edge.a,
      ax: edge.bx, az: edge.bz, bx: edge.ax, bz: edge.az,
      dx: -edge.dx, dz: -edge.dz,
      reversed: true,
    });
  }

  const districtCounts = {};
  for (const block of blocks) {
    districtCounts[block.districtId] = (districtCounts[block.districtId] ?? 0) + 1;
  }
  const roles = new Map();
  for (const block of blocks) if (block.role !== 'built') roles.set(block.id, block);

  const plan = {
    seed,
    random,
    grid: GRID,
    blocks,
    nodes,
    edges,
    adjacency,
    bridges,
    harbour,
    airstrip,
    roles,
    districtCounts,
    water: WATER,
    beach: BEACH,
    highway: HIGHWAY,
    builtBlocks: blocks.filter((block) => block.role === 'built').length,
  };

  plan.byId = new Map(nodes.map((node) => [node.id, node]));
  plan.blockAt = (x, z) => blocks.find((block) => x >= block.x0 && x <= block.x1 && z >= block.z0 && z <= block.z1) ?? null;
  return plan;
}

/**
 * Nearest point on the road graph, for placing the player, cars and mission markers, and for the
 * navigation the traffic layer will want: the edge, the point on it, t along it, and distance.
 */
export function nearestLanePoint(plan, x, z, maxDistance = Infinity) {
  let best = null;
  for (const edge of plan.edges) {
    const vx = edge.bx - edge.ax;
    const vz = edge.bz - edge.az;
    const len2 = vx * vx + vz * vz;
    let t = len2 > 0 ? ((x - edge.ax) * vx + (z - edge.az) * vz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = edge.ax + vx * t;
    const pz = edge.az + vz * t;
    const dx = x - px;
    const dz = z - pz;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance > maxDistance) continue;
    if (!best || distance < best.distance) best = { edge, t, x: px, z: pz, distance };
  }
  return best;
}

/** Nearest road-graph node, for spawn snapping and mission markers. */
export function nearestRoadNode(plan, x, z) {
  let best = null;
  let bestDistance = Infinity;
  for (const node of plan.nodes) {
    const dx = node.x - x;
    const dz = node.z - z;
    const distance = dx * dx + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = node;
    }
  }
  return { node: best, distance: Math.sqrt(bestDistance) };
}
