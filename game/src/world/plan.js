// The city plan: block grid, road graph, coastline, channel, bridges, the elevated
// highway ring, district zoning and the queries later systems need (nearest lane,
// nearest node, water/land tests). Pure data plus small helpers, no meshes: every
// visual is built from this plan by the world modules.

import { Random } from '../core/rng.js';
import { districtIdAt, DISTRICT_IDS, DISTRICTS } from './districts.js';

/** The block grid. One cell is a road-centreline crossing; the block sits inside it. */
export const GRID = {
  originX: -960,
  originZ: -960,
  cell: 130,
  cols: 18,
  rows: 14,
  roadWidth: 18,
  laneWidth: 6.4,
  sidewalk: 4.2,
  kerbInset: 9.5,
  blockWidth: 104,
};

/** Where the sea is. Two coasts and the channel that splits the city. */
export const WATER = {
  seaSouthZ: 640,
  seaWestX: -880,
  channelX0: -45,
  channelX1: 25,
  channelZ0: -640,
  level: -0.45,
};

/** Harbour quay, cranes and the container yard on the south-west waterfront. */
export const HARBOUR = {
  x0: -880,
  x1: -420,
  z0: 320,
  z1: 620,
  quayZ: 596,
  craneXs: [-790, -680, -570, -470],
};

/** Solmara Beach: sand, the boardwalk line and the pier that reaches into the sea. */
export const BEACH = {
  x0: 720,
  x1: 1260,
  z0: 360,
  z1: 640,
  boardwalkZ: 470,
  pierX: 930,
  pierEndZ: 820,
};

/** The marsh airstrip in the north-west: dirt runway, apron, hangars. */
export const AIRSTRIP = {
  x0: -900,
  x1: -420,
  z0: -960,
  z1: -600,
  runwayX: -660,
  runwayZ0: -930,
  runwayZ1: -640,
  runwayWidth: 34,
  apronZ: -700,
};

/** The elevated ring highway: a closed loop over the downtown edge. */
export const HIGHWAY = {
  height: 13.5,
  width: 15,
  points: [
    { x: -180, z: -720 },
    { x: 660, z: -720 },
    { x: 780, z: -560 },
    { x: 780, z: 260 },
    { x: 620, z: 360 },
    { x: -180, z: 360 },
    { x: -300, z: 160 },
    { x: -300, z: -520 },
  ],
};

// ------------------------------------------------------------------ land tests
// Every placement pass asks these before it raises anything, so they are the cheapest
// possible shape: plain rectangle comparisons.

export function isWaterAt(x, z) {
  if (z > WATER.seaSouthZ) return true;
  if (x < WATER.seaWestX) return true;
  return x > WATER.channelX0 && x < WATER.channelX1 && z > WATER.channelZ0;
}

export function isHarbourAt(x, z) {
  return x > HARBOUR.x0 && x < HARBOUR.x1 && z > HARBOUR.z0 && z < HARBOUR.z1;
}

export function isBeachAt(x, z) {
  return x > BEACH.x0 && x < BEACH.x1 && z > BEACH.z0 && z < BEACH.z1;
}

export function isAirstripAt(x, z) {
  return x > AIRSTRIP.x0 && x < AIRSTRIP.x1 && z > AIRSTRIP.z0 && z < AIRSTRIP.z1;
}

/** True on the sand itself, not the promenade north of it. */
export function isSandAt(x, z) {
  return isBeachAt(x, z) && z > BEACH.z0 + 60 && !isWaterAt(x, z);
}

// ------------------------------------------------------------------ grid graph
const nodeId = (i, j) => `n-${i}-${j}`;
const edgeId = (i, j, axis) => `e-${axis}-${i}-${j}`;
const indexKey = (i, j) => `${i},${j}`;

/** The two rows where the grid crosses the channel on bridges. */
const BRIDGE_ROWS = new Set([6, 11]);
const CHANNEL_COL = 7;

function landNodes() {
  const nodes = [];
  for (let j = 0; j < GRID.rows; j += 1) {
    for (let i = 0; i < GRID.cols; i += 1) {
      const x = GRID.originX + i * GRID.cell;
      const z = GRID.originZ + j * GRID.cell;
      if (isWaterAt(x, z)) continue;
      // The far south-east is beach and the far north-west is marsh: the grid still
      // runs there, the districts simply raise nothing tall on it.
      nodes.push({
        id: nodeId(i, j),
        i,
        j,
        x,
        z,
        district: districtIdAt(x, z, false),
        signal: (i + j) % 3 === 0,
        // A bridgehead is a node the channel edge may attach to.
        bridgehead: BRIDGE_ROWS.has(j) && (i === CHANNEL_COL || i === CHANNEL_COL + 1),
      });
    }
  }
  return nodes;
}

/** One direction of travel: the centreline pushed half a lane to one side. */
function laneFor(from, to, side, speed) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  const nx = -dz / length;
  const nz = dx / length;
  const offset = (GRID.laneWidth / 2) * side;
  return {
    from: { x: from.x + nx * offset, z: from.z + nz * offset },
    to: { x: to.x + nx * offset, z: to.z + nz * offset },
    dirX: dx / length,
    dirZ: dz / length,
    length,
    offset,
    speed,
  };
}

// Downtown traffic crawls, the strip is a little quicker, everywhere else flows.
const SPEEDS = { downtown: 12.5, neon: 10, default: 15 };

function makeEdge(id, a, b, axis, options = {}) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  const district = districtIdAt((a.x + b.x) / 2, (a.z + b.z) / 2, false);
  const speed = SPEEDS[district] ?? SPEEDS.default;
  return {
    id,
    axis,
    a: a.id,
    b: b.id,
    ax: a.x,
    az: a.z,
    bx: b.x,
    bz: b.z,
    length,
    district,
    bridge: Boolean(options.bridge),
    highway: Boolean(options.highway),
    width: options.width ?? GRID.roadWidth,
    lanes: [laneFor(a, b, 1, speed), laneFor(b, a, -1, speed)],
  };
}

function buildGraph(nodes) {
  const byIndex = new Map();
  for (const node of nodes) byIndex.set(indexKey(node.i, node.j), node);
  const edges = [];
  const bridges = [];

  const tryEdge = (a, b, axis) => {
    if (!a || !b) return;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const crossesChannel = isWaterAt(mx, mz);
    if (crossesChannel) {
      // Only a marked bridgehead pair on a bridge row may jump the channel.
      const spansBridgeRow = BRIDGE_ROWS.has(a.j) && BRIDGE_ROWS.has(b.j);
      if (!(spansBridgeRow && (a.bridgehead || b.bridgehead) && axis === 'h')) return;
    }
    const edge = makeEdge(edgeId(a.i, a.j, axis), a, b, axis, { bridge: crossesChannel });
    edges.push(edge);
    if (crossesChannel) {
      bridges.push({
        id: `bridge-${bridges.length + 1}`,
        edge: edge.id,
        z: mz,
        x0: Math.min(a.x, b.x),
        x1: Math.max(a.x, b.x),
        width: 24,
        kind: a.j === 6 ? 'stone' : 'steel',
        districtA: a.district,
        districtB: b.district,
      });
    }
  };

  for (let j = 0; j < GRID.rows; j += 1) {
    for (let i = 0; i < GRID.cols - 1; i += 1) {
      tryEdge(byIndex.get(indexKey(i, j)), byIndex.get(indexKey(i + 1, j)), 'h');
    }
  }
  for (let i = 0; i < GRID.cols; i += 1) {
    for (let j = 0; j < GRID.rows - 1; j += 1) {
      tryEdge(byIndex.get(indexKey(i, j)), byIndex.get(indexKey(i, j + 1)), 'v');
    }
  }
  return { edges, bridges };
}

function buildBlocks(nodes) {
  const byIndex = new Map();
  for (const node of nodes) byIndex.set(indexKey(node.i, node.j), node);
  const blocks = [];
  for (let j = 0; j < GRID.rows - 1; j += 1) {
    for (let i = 0; i < GRID.cols - 1; i += 1) {
      const a = byIndex.get(indexKey(i, j));
      const b = byIndex.get(indexKey(i + 1, j + 1));
      if (!a || !b) continue;
      const x0 = a.x + GRID.kerbInset;
      const z0 = a.z + GRID.kerbInset;
      const x1 = b.x - GRID.kerbInset;
      const z1 = b.z - GRID.kerbInset;
      if (x1 - x0 < 20 || z1 - z0 < 20) continue;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      if (isWaterAt(cx, cz)) continue;
      const district = districtIdAt(cx, cz, false);
      // A deterministic sprinkle of parks: no downtown, no working waterfront.
      const parkable = district !== 'downtown' && district !== 'harbour' && district !== 'airstrip';
      blocks.push({
        id: `b-${i}-${j}`,
        i,
        j,
        district,
        x0: Math.round(x0),
        z0: Math.round(z0),
        x1: Math.round(x1),
        z1: Math.round(z1),
        cx: Math.round(cx),
        cz: Math.round(cz),
        width: Math.round(x1 - x0),
        depth: Math.round(z1 - z0),
        park: parkable && (i * 7 + j * 11) % 13 === 0,
        inner: {
          x0: Math.round(x0 + GRID.sidewalk),
          z0: Math.round(z0 + GRID.sidewalk),
          x1: Math.round(x1 - GRID.sidewalk),
          z1: Math.round(z1 - GRID.sidewalk),
        },
        innerWidth: GRID.blockWidth - GRID.sidewalk * 2,
      });
    }
  }
  return blocks;
}

function buildHighway() {
  const points = HIGHWAY.points.map((point) => ({ ...point }));
  const segments = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    segments.push({
      index: i,
      ax: a.x,
      az: a.z,
      bx: b.x,
      bz: b.z,
      length,
      dirX: dx / length,
      dirZ: dz / length,
      y: HIGHWAY.height,
      width: HIGHWAY.width,
    });
  }
  return { points, segments, height: HIGHWAY.height, width: HIGHWAY.width };
}

const SPAWNS = [
  {
    id: 'downtown-boulevard',
    name: 'Avenida Sol, Downtown',
    district: 'downtown',
    x: 340,
    z: 80,
    heading: -Math.PI / 2,
    camera: { distance: 9, height: 4.8, yaw: -1.7, pitch: -0.12 },
  },
  {
    id: 'beach-boardwalk',
    name: 'Playa Boardwalk',
    district: 'beach',
    x: 960,
    z: 470,
    heading: Math.PI,
    camera: { distance: 10, height: 4.2, yaw: 2.4, pitch: -0.08 },
  },
  {
    id: 'harbour',
    name: 'Harbour Works, Pier 9',
    district: 'harbour',
    x: -640,
    z: 560,
    heading: -Math.PI / 2,
    camera: { distance: 12, height: 5.5, yaw: -1.2, pitch: -0.1 },
  },
  {
    id: 'airstrip',
    name: 'Marsh Airstrip',
    district: 'airstrip',
    x: -620,
    z: -820,
    heading: Math.PI,
    camera: { distance: 14, height: 6, yaw: 0.4, pitch: -0.15 },
  },
  {
    id: 'neon-strip',
    name: 'Neon Strip',
    district: 'neon',
    x: 160,
    z: -700,
    heading: Math.PI / 2,
    camera: { distance: 9, height: 4.5, yaw: 1.5, pitch: -0.1 },
  },
  {
    id: 'marina',
    name: 'Marina Quarter',
    district: 'marina',
    x: -360,
    z: 60,
    heading: 0,
    camera: { distance: 11, height: 5, yaw: 0.2, pitch: -0.12 },
  },
];

/** Which blocks get a handcrafted landmark instead of procedural buildings. */
function pickLandmarkBlocks(plan) {
  const picks = {};
  const taken = new Set();
  const take = (key, predicate) => {
    const block = plan.blocks.find((candidate) => predicate(candidate) && !taken.has(candidate.id));
    if (!block) return;
    picks[key] = block.id;
    taken.add(block.id);
  };
  take('tower', (block) => block.district === 'downtown' && block.cx > 60 && block.cx < 260 && block.cz > -260 && block.cz < -40);
  take('stadium', (block) => block.district === 'verano' && block.cx > 520 && block.cz > 260);
  take('market', (block) => block.district === 'verano' && block.cx > 200 && block.cx < 420 && block.cz > 200 && block.cz < 360);
  take('pier', (block) => block.district === 'beach' && block.cz > 380);
  take('cranes', (block) => block.district === 'harbour' && block.cz > 380 && block.cx < -560);
  take('hangars', (block) => block.district === 'airstrip');
  return picks;
}

/**
 * Creates the whole plan. Deterministic for a given seed; the default seed is the
 * city's fixed one, and shots may pass another only to vary their camera, never the
 * layout they inspect.
 */
export function createCityPlan(seed = 'solmara-01') {
  const random = new Random(`${seed}:plan`);
  const nodes = landNodes();
  const { edges, bridges } = buildGraph(nodes);
  const blocks = buildBlocks(nodes);
  const highway = buildHighway();

  const lanes = [];
  for (const edge of edges) {
    edge.lanes.forEach((lane, index) => {
      lanes.push({ id: `${edge.id}-${index}`, edge, ...lane });
    });
  }

  const districtCounts = {};
  for (const id of DISTRICT_IDS) {
    districtCounts[id] = blocks.filter((block) => block.district === id).length;
  }

  const plan = {
    seed,
    grid: GRID,
    water: WATER,
    harbour: HARBOUR,
    beach: BEACH,
    airstrip: AIRSTRIP,
    highway,
    nodes,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    edges,
    edgeById: new Map(edges.map((edge) => [edge.id, edge])),
    lanes,
    blocks,
    bridges,
    districts: districtCounts,
    spawns: SPAWNS.map((spawn) => ({ ...spawn })),
    random,
    stats: {
      nodes: nodes.length,
      edges: edges.length,
      lanes: lanes.length,
      blocks: blocks.length,
      bridges: bridges.length,
      highwaySegments: highway.segments.length,
    },
  };

  plan.landmarkBlocks = pickLandmarkBlocks(plan);
  plan.spawns = plan.spawns.map((spawn) => ({
    ...spawn,
    districtName: DISTRICTS[spawn.district]?.name ?? spawn.district,
  }));
  return plan;
}

/** True when a position is inside the land bounds of the playable city. */
export function isOnLand(x, z) {
  return !isWaterAt(x, z) && x > -940 && x < 1290 && z > -980 && z < 690;
}

/** Nearest point on any lane to (x, z): the traffic and navigation query. */
export function nearestLanePoint(plan, x, z, maxDistance = Infinity) {
  let best = null;
  let bestDistance = maxDistance;
  for (const lane of plan.lanes) {
    const { from, to } = lane;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const lengthSq = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - from.x) * dx + (z - from.z) * dz) / lengthSq));
    const px = from.x + dx * t;
    const pz = from.z + dz * t;
    const distance = Math.hypot(x - px, z - pz);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { lane, edge: lane.edge, point: { x: px, z: pz }, t, distance };
    }
  }
  return best;
}

/** Nearest road node to (x, z): used for junctions, signals and patrol routes. */
export function nearestRoadNode(plan, x, z) {
  let best = null;
  let bestDistance = Infinity;
  for (const node of plan.nodes) {
    const distance = Math.hypot(x - node.x, z - node.z);
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    best = node;
  }
  return best ? { node: best, distance: bestDistance } : null;
}

/** Nodes within a radius, for traffic spawning and minimap ticks. */
export function nodesWithin(plan, x, z, radius) {
  const out = [];
  const r2 = radius * radius;
  for (const node of plan.nodes) {
    const dx = node.x - x;
    const dz = node.z - z;
    if (dx * dx + dz * dz <= r2) out.push(node);
  }
  return out;
}

/** Edges connected to a node. */
export function edgesAt(plan, nodeIdToFind) {
  return plan.edges.filter((edge) => edge.a === nodeIdToFind || edge.b === nodeIdToFind);
}

/** The district a point belongs to, with the plan's default fallbacks. */
export function districtAt(x, z) {
  return districtIdAt(x, z, isWaterAt(x, z));
}

/** Spawn lookup by id. */
export function spawnById(plan, id) {
  return plan.spawns.find((spawn) => spawn.id === id) ?? null;
}
