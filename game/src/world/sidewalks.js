// The walkable city. The road graph is for cars; this is the pedestrian layer on top of
// the same plan: the pavement ring around every block, the crossing links that join two
// rings at a signalised corner, the kerbside parking spots the car system fills, and the
// one surface query everything standing on the ground shares ("what is under me, and how
// high is it"). Pure data and small helpers, no meshes.

import { Random } from '../core/rng.js';
import { GRID, WATER, isSandAt, isWaterAt } from './plan.js';

/** Walking surfaces, in metres above the datum the terrain and roads were built at. */
export const SURFACE = {
  pavement: 0.18,
  road: 0.09,
  ground: 0.03,
  sand: 0.03,
  water: WATER.level,
};

/** The pavement ring's centreline sits half a pavement width inside the block edge. */
const RING = GRID.sidewalk / 2;
/** A block spans this far inside the junction coordinates on every side. */
const EDGE_IN = GRID.kerbInset;
const EDGE_OUT = GRID.cell - GRID.kerbInset;

const PAINT = [0xc94a3f, 0x2f5d8a, 0x3f7a55, 0xb8872f, 0x6d5a8f, 0xd8d2c4, 0x2b3a44, 0x9a3f5c];

/**
 * Builds the pedestrian and parking layer for a plan.
 * @param {object} plan the city plan
 * @param {object} colliders the world collider registry (used to keep parked cars clear)
 */
export function createWalkNetwork(plan, colliders = null) {
  const random = new Random(`${plan.seed}:walk`);
  const blockById = new Map(plan.blocks.map((block) => [block.id, block]));

  /** The block whose south-west junction is (i, j), or null. */
  function blockAt(i, j) {
    return blockById.get(`b-${i}-${j}`) ?? null;
  }

  /** Grid cell a world point falls in. Blocks sit south-east of their junction. */
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
    const i = block.i + (corner === 1 || corner === 2 ? 1 : 0);
    const j = block.j + (corner === 2 || corner === 3 ? 1 : 0);
    return plan.nodeById.get(`n-${i}-${j}`) ?? null;
  }

  /**
   * Where a pedestrian at a ring corner would step to cross the street straight ahead:
   * the ring corner of the block across the road, or null when there is no block, no
   * signal, or the water is in the way. Corners are taken clockwise, so the crossing is
   * always the "keep going straight" option.
   */
  function crossingFrom(block, corner) {
    const node = cornerNode(block, corner);
    if (!node || !node.signal) return null;
    let target = null;
    let targetCorner = 0;
    if (corner === 0) {
      target = blockAt(block.i, block.j - 1);
      targetCorner = 3;
    } else if (corner === 1) {
      target = blockAt(block.i + 1, block.j);
      targetCorner = 0;
    } else if (corner === 2) {
      target = blockAt(block.i, block.j + 1);
      targetCorner = 1;
    } else {
      target = blockAt(block.i - 1, block.j);
      targetCorner = 2;
    }
    if (!target) return null;
    const a = ring(block)[corner];
    const b = ring(target)[targetCorner];
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    if (isWaterAt(mid.x, mid.z)) return null;
    return { block: target, corner: targetCorner, from: a, to: b };
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
      if (!isWaterAt(x, z)) return { kind: 'road', y: SURFACE.road };
    }
    if (isSandAt(x, z)) return { kind: 'sand', y: SURFACE.sand };
    return { kind: 'ground', y: SURFACE.ground };
  }

  /** The ring point closest to a position, used when a pedestrian has to rejoin. */
  function nearestCorner(block, x, z) {
    const points = ring(block);
    let best = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < points.length; index += 1) {
      const distance = Math.hypot(points[index].x - x, points[index].z - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return { corner: best, distance: bestDistance, point: points[best] };
  }

  // ---------------------------------------------------------------- parking
  // Kerbside spots, 2.2 m into the roadway from each block edge, outside the traffic
  // lane the plan paints at 3.2 m from the centreline. One or two sides per block, a
  // couple of spaces per side: enough that a car is always within sight.
  const parking = [];
  const blocked = (x, z) => Boolean(colliders?.blockedAt(x, z, 1.1));
  const addSpace = (x, z, heading, type = null) => {
    if (isWaterAt(x, z) || blocked(x, z)) return false;
    for (const spot of parking) {
      if (Math.hypot(spot.x - x, spot.z - z) < 6.2) return false;
    }
    const cell = cellAt(x, z);
    for (const node of plan.nodes) {
      if (node.i !== cell.i && node.i !== cell.i + 1) continue;
      if (node.j !== cell.j && node.j !== cell.j + 1) continue;
      if (Math.hypot(node.x - x, node.z - z) < 17) return false;
    }
    parking.push({
      id: `park-${parking.length + 1}`,
      x: Number(x.toFixed(2)),
      z: Number(z.toFixed(2)),
      heading,
      type: type ?? random.pick(['sedan', 'sedan', 'coupe', 'van', 'taxi', 'sedan', 'coupe']),
      color: random.pick(PAINT),
    });
    return true;
  };

  const parkAlong = (block, side) => {
    const inset = 2.2;
    let x0 = 0;
    let x1 = 0;
    let z0 = 0;
    let z1 = 0;
    let heading = 0;
    if (side === 'n') {
      x0 = block.x0 + 15;
      x1 = block.x1 - 15;
      z0 = z1 = block.z0 - inset;
      heading = -Math.PI / 2;
    } else if (side === 's') {
      x0 = block.x0 + 15;
      x1 = block.x1 - 15;
      z0 = z1 = block.z1 + inset;
      heading = Math.PI / 2;
    } else if (side === 'w') {
      z0 = block.z0 + 15;
      z1 = block.z1 - 15;
      x0 = x1 = block.x0 - inset;
      heading = 0;
    } else {
      z0 = block.z0 + 15;
      z1 = block.z1 - 15;
      x0 = x1 = block.x1 + inset;
      heading = Math.PI;
    }
    const length = Math.hypot(x1 - x0, z1 - z0);
    const spaces = Math.floor(length / 8.5);
    for (let index = 0; index < spaces; index += 1) {
      if (!random.chance(0.42)) continue;
      const t = (index + 0.5) / Math.max(1, spaces);
      addSpace(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, heading);
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
    parking.push({
      id: `park-curated-${spot.type}`,
      x: spot.x,
      z: spot.z,
      heading: spot.heading,
      type: spot.type,
      color: spot.color,
    });
  }

  for (const block of plan.blocks) {
    if (isWaterAt(block.cx, block.cz)) continue;
    const sides = random.shuffle(['n', 's', 'w', 'e']);
    const count = random.int(1, 2);
    for (const side of sides.slice(0, count)) parkAlong(block, side);
  }

  // Nearest free spot lookup, for a car released by its driver, and for tests.
  function nearestParking(x, z, maxDistance = 12) {
    let best = null;
    let bestDistance = maxDistance;
    for (const spot of parking) {
      const distance = Math.hypot(spot.x - x, spot.z - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = spot;
      }
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
