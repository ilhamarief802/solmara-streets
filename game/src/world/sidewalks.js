// The walkable city. The road graph is for cars; this is the pedestrian layer on top of the
// same plan: the pavement ring around every block, the crossing links that join two rings
// at a signalised corner, the kerbside parking spots the car system fills, and the one
// surface query everything standing on the ground shares ("what is under me, and how high
// is it"). Pure data and small helpers, no meshes.

import { Random } from '../core/rng.js';
import { GRID, WATER, isSandAt, isWaterAt } from './plan.js';

/** Walking surfaces, in metres above the datum the terrain and roads were built at. */
export const SURFACE = {
  pavement: 0.18,
  road: 0.09,
  ground: 0.03,
  sand: 0.03,
  // Only the surface query returns this; nobody stands on the water.
  water: WATER.level,
};

/** The pavement ring's centreline sits half a pavement width inside the block edge. */
const RING = GRID.sidewalk / 2;
/** A block spans this far inside the junction coordinates on every side. */
const EDGE_IN = GRID.kerbInset;
const EDGE_OUT = GRID.cell - GRID.kerbInset;

/** Kerbside car colours, picked per parking spot. */
const PAINT = [0xc94a3f, 0x2f5d8a, 0x3f7a55, 0xb8872f, 0x6d5a8f, 0xd8d2c4, 0x2b3a44, 0x9a3f5c];
const PARKED_TYPES = ['sedan', 'sedan', 'coupe', 'van', 'taxi', 'sedan', 'coupe'];

/**
 * Builds the pedestrian and parking layer for a plan.
 * @param {object} plan the city plan
 * @param {object} colliders the collider registry (used to keep parked cars clear)
 */
export function createWalkNetwork(plan, colliders = null) {
  const random = new Random(`${plan.seed}:walk`);
  const blockById = new Map(plan.blocks.map((block) => [block.id, block]));

  /** The block whose south-west junction is (i, j), or null. */
  function blockAt(i, j) {
    return blockById.get(`b-${i}-${j}`) ?? null;
  }

  /** The grid cell a world point falls in. Blocks sit south-east of their junction. */
  function cellAt(x, z) {
    return {
      i: Math.floor((x - GRID.originX) / GRID.cell),
      j: Math.floor((z - GRID.originZ) / GRID.cell),
    };
  }

  /** The block containing a point, or null (a street, the sea, off the grid). */
  function blockContaining(x, z) {
    const { i, j } = cellAt(x, z);
    if (i < 0 || j < 0 || i >= GRID.cols - 1 || j >= GRID.rows - 1) return null;
    return blockAt(i, j);
  }

  /**
   * The pavement ring of a block, clockwise seen from above, as four corners:
   * 0 north-west, 1 north-east, 2 south-east, 3 south-west.
   */
  function ring(block) {
    const x0 = block.x0 + RING;
    const x1 = block.x1 - RING;
    const z0 = block.z0 + RING;
    const z1 = block.z1 - RING;
    return [
      { x: x0, z: z0 },
      { x: x1, z: z0 },
      { x: x1, z: z1 },
      { x: x0, z: z1 },
    ];
  }

  /** The junction that touches each ring corner. */
  function cornerNode(block, corner) {
    // Corner 0 shares the block's own junction; the others step one cell east and/or south.
    const i = block.i + (corner === 1 || corner === 2 ? 1 : 0);
    const j = block.j + (corner === 2 || corner === 3 ? 1 : 0);
    return plan.nodeById.get(`n-${i}-${j}`) ?? null;
  }

  // Walking straight off each corner lands on this neighbouring cell and that corner of it.
  const CROSSING_TARGETS = [
    { di: 0, dj: -1, corner: 3 },
    { di: 1, dj: 0, corner: 0 },
    { di: 0, dj: 1, corner: 1 },
    { di: -1, dj: 0, corner: 2 },
  ];

  /**
   * Where a pedestrian at a ring corner would step to cross the street straight ahead: the
   * ring corner of the block across the road, or null when there is no block, no signal, or
   * the water is in the way.
   */
  function crossingFrom(block, corner) {
    const node = cornerNode(block, corner);
    if (!node || !node.signal) return null;
    const target = CROSSING_TARGETS[corner];
    const neighbour = blockAt(block.i + target.di, block.j + target.dj);
    if (!neighbour) return null;
    const from = ring(block)[corner];
    const to = ring(neighbour)[target.corner];
    const mid = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
    if (isWaterAt(mid.x, mid.z)) return null;
    return { block: neighbour, corner: target.corner, from, to };
  }

  /** True when a point stands on a block's pavement ring. */
  function isSidewalk(x, z) {
    return surfaceAt(x, z).kind === 'pavement';
  }

  /** What is under a point, and how high its surface is. */
  function surfaceAt(x, z) {
    if (isWaterAt(x, z)) return { kind: 'water', y: SURFACE.water };

    const { i, j } = cellAt(x, z);
    if (i >= 0 && j >= 0 && i < GRID.cols - 1 && j < GRID.rows - 1) {
      const block = blockAt(i, j);
      if (block) {
        // Position inside the cell, measured from the junction at its north-west corner.
        const ux = x - (GRID.originX + i * GRID.cell);
        const uz = z - (GRID.originZ + j * GRID.cell);
        if (ux >= EDGE_IN && ux <= EDGE_OUT && uz >= EDGE_IN && uz <= EDGE_OUT) {
          const ringWidth = GRID.sidewalk;
          const onRing =
            ux <= EDGE_IN + ringWidth ||
            ux >= EDGE_OUT - ringWidth ||
            uz <= EDGE_IN + ringWidth ||
            uz >= EDGE_OUT - ringWidth;
          return onRing ? { kind: 'pavement', y: SURFACE.pavement } : { kind: 'lot', y: SURFACE.ground };
        }
      }
      return { kind: 'road', y: SURFACE.road };
    }

    if (isSandAt(x, z)) return { kind: 'sand', y: SURFACE.sand };
    return { kind: 'ground', y: SURFACE.ground };
  }

  /** The ring corner closest to a position, used when a pedestrian has to rejoin. */
  function nearestCorner(block, x, z) {
    const points = ring(block);
    let best = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < points.length; index += 1) {
      const distance = Math.hypot(points[index].x - x, points[index].z - z);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = index;
    }
    return { corner: best, distance: bestDistance, point: points[best] };
  }

  // ---------------------------------------------------------------- parking
  // Kerbside spots, 2.2 m into the roadway from each block edge, outside the traffic lane
  // the plan paints at 3.2 m from the centreline. One or two sides per block, a couple of
  // spaces per side: enough that a car is always within sight.
  const parking = [];
  const blocked = (x, z) => Boolean(colliders?.blockedAt(x, z, 1.1));

  /** True when a junction is close enough to the spot to make parking there a joke. */
  function nearJunction(x, z) {
    const cell = cellAt(x, z);
    // Only the four junctions of this cell can be within 17 m.
    for (const node of plan.nodes) {
      if (node.i !== cell.i && node.i !== cell.i + 1) continue;
      if (node.j !== cell.j && node.j !== cell.j + 1) continue;
      if (Math.hypot(node.x - x, node.z - z) < 17) return true;
    }
    return false;
  }

  const addSpace = (x, z, heading, type = null) => {
    if (isWaterAt(x, z) || blocked(x, z) || nearJunction(x, z)) return false;
    for (const spot of parking) {
      // 6.2 m is a car and a half: two spaces closer than that would overlap.
      if (Math.hypot(spot.x - x, spot.z - z) < 6.2) return false;
    }
    parking.push({
      id: `park-${parking.length + 1}`,
      x: Number(x.toFixed(2)),
      z: Number(z.toFixed(2)),
      heading,
      type: type ?? random.pick(PARKED_TYPES),
      color: random.pick(PAINT),
    });
    return true;
  };

  // Each side of a block is a kerb line inset into the road; the heading faces the kerb.
  const PARK_SIDES = {
    n: (block) => ({ x0: block.x0 + 15, x1: block.x1 - 15, z: block.z0 - 2.2, heading: -Math.PI / 2 }),
    s: (block) => ({ x0: block.x0 + 15, x1: block.x1 - 15, z: block.z1 + 2.2, heading: Math.PI / 2 }),
    w: (block) => ({ z0: block.z0 + 15, z1: block.z1 - 15, x: block.x0 - 2.2, heading: 0 }),
    e: (block) => ({ z0: block.z0 + 15, z1: block.z1 - 15, x: block.x1 + 2.2, heading: Math.PI }),
  };

  const parkAlong = (block, side) => {
    const line = PARK_SIDES[side](block);
    const horizontal = side === 'n' || side === 's';
    const length = horizontal ? line.x1 - line.x0 : line.z1 - line.z0;
    // 8.5 m per space leaves room for a car and its bumpers.
    const spaces = Math.floor(length / 8.5);
    for (let index = 0; index < spaces; index += 1) {
      // Only some slots fill; an empty kerb reads better than a queue of cars.
      if (!random.chance(0.42)) continue;
      const t = (index + 0.5) / Math.max(1, spaces);
      const x = horizontal ? line.x0 + (line.x1 - line.x0) * t : line.x;
      const z = horizontal ? line.z : line.z0 + (line.z1 - line.z0) * t;
      addSpace(x, z, line.heading);
    }
  };

  // The curated spots come first: a coupe for the drive shot and a sedan for the opening
  // view on the Avenida Sol, a taxi up the kerb, and a van on the Neon Strip.
  const curated = [
    { x: 332.5, z: 58, heading: Math.PI, type: 'coupe', color: 0x1f6f78 },
    { x: 332.5, z: 44, heading: Math.PI, type: 'sedan', color: 0xb23a32 },
    { x: 332.5, z: 72, heading: Math.PI, type: 'taxi', color: 0xe8b21f },
    { x: 168, z: -690.2, heading: Math.PI / 2, type: 'van', color: 0x4a5a68 },
  ];
  for (const spot of curated) {
    parking.push({ id: `park-curated-${spot.type}`, ...spot });
  }

  for (const block of plan.blocks) {
    if (isWaterAt(block.cx, block.cz)) continue;
    const sides = random.shuffle(['n', 's', 'w', 'e']);
    const count = random.int(1, 2);
    for (const side of sides.slice(0, count)) parkAlong(block, side);
  }

  /** Nearest free spot, for a car released by its driver, and for tests. */
  function nearestParking(x, z, maxDistance = 12) {
    let best = null;
    let bestDistance = maxDistance;
    for (const spot of parking) {
      const distance = Math.hypot(spot.x - x, spot.z - z);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = spot;
    }
    return best;
  }

  return {
    blockAt,
    blockContaining,
    cellAt,
    ring,
    cornerNode,
    crossingFrom,
    nearestCorner,
    surfaceAt,
    isSidewalk,
    parking,
    nearestParking,
    stats: {
      blocks: plan.blocks.length,
      parkingSpots: parking.length,
      crossings: plan.nodes.filter((node) => node.signal).length,
    },
  };
}
