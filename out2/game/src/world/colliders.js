// Static collision and ground data for the city. Buildings and walls register an
// axis-aligned box; the registry buckets them in a coarse grid so a circle test near a
// tower checks a handful of boxes, not nine hundred. Later sessions query it for the
// player, cars, bullets and camera collision. It also answers "how high is the ground
// here", which is all the flat city needs until the player can climb.

import { WATER } from './plan.js';

const CELL = 64;

function key(cx, cz) {
  return `${cx},${cz}`;
}

export class ColliderWorld {
  constructor({ baseGround = 0 } = {}) {
    this.boxes = [];
    this.grid = new Map();
    this.platforms = [];
    this.baseGround = baseGround;
    this.lastQueryCount = 0;
  }

  /** min/max are ground-plane coordinates; top is the height of the box. */
  addBox(minX, minZ, maxX, maxZ, top = 3, kind = 'building', data = null) {
    const box = {
      id: this.boxes.length,
      minX: Math.min(minX, maxX),
      minZ: Math.min(minZ, maxZ),
      maxX: Math.max(minX, maxX),
      maxZ: Math.max(minZ, maxZ),
      top,
      kind,
      data,
    };
    this.boxes.push(box);
    const x0 = Math.floor(box.minX / CELL);
    const x1 = Math.floor(box.maxX / CELL);
    const z0 = Math.floor(box.minZ / CELL);
    const z1 = Math.floor(box.maxZ / CELL);
    for (let cz = z0; cz <= z1; cz += 1) {
      for (let cx = x0; cx <= x1; cx += 1) {
        const bucket = key(cx, cz);
        let list = this.grid.get(bucket);
        if (!list) {
          list = [];
          this.grid.set(bucket, list);
        }
        list.push(box);
      }
    }
    return box;
  }

  /** A box from a centre and a half extent, which is how props are placed. */
  addBoxAt(x, z, halfWidth, halfDepth, top, kind = 'prop', data = null) {
    return this.addBox(x - halfWidth, z - halfDepth, x + halfWidth, z + halfDepth, top, kind, data);
  }

  /** A walkable elevated surface (a bridge deck or a plaza roof). */
  addPlatform(minX, minZ, maxX, maxZ, top, kind = 'platform') {
    const platform = { minX, minZ, maxX, maxZ, top, kind };
    this.platforms.push(platform);
    return platform;
  }

  /** Every box that could touch (x, z) within radius, deduplicated. */
  near(x, z, radius = 0) {
    const x0 = Math.floor((x - radius) / CELL);
    const x1 = Math.floor((x + radius) / CELL);
    const z0 = Math.floor((z - radius) / CELL);
    const z1 = Math.floor((z + radius) / CELL);
    const found = [];
    const seen = new Set();
    for (let cz = z0; cz <= z1; cz += 1) {
      for (let cx = x0; cx <= x1; cx += 1) {
        const list = this.grid.get(key(cx, cz));
        if (!list) continue;
        for (const box of list) {
          if (seen.has(box.id)) continue;
          seen.add(box.id);
          found.push(box);
        }
      }
    }
    this.lastQueryCount = found.length;
    return found;
  }

  /** True when a point is inside a solid box footprint. */
  blockedAt(x, z, clearance = 0) {
    for (const box of this.near(x, z, clearance)) {
      if (x > box.minX - clearance && x < box.maxX + clearance && z > box.minZ - clearance && z < box.maxZ + clearance) {
        return box;
      }
    }
    return null;
  }

  /** The first solid box under a vertical ray at (x, z), or null. */
  columnAt(x, z) {
    let best = null;
    for (const box of this.near(x, z)) {
      if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ) {
        if (!best || box.top > best.top) best = box;
      }
    }
    return best;
  }

  /**
   * Pushes a circle out of every solid it overlaps. Two passes are enough for the
   * rectangular city; returns the corrected position and whether anything moved.
   */
  resolveCircle(x, z, radius, { iterations = 2 } = {}) {
    let px = x;
    let pz = z;
    let blocked = false;
    for (let pass = 0; pass < iterations; pass += 1) {
      let moved = false;
      for (const box of this.near(px, pz, radius)) {
        const closestX = Math.max(box.minX, Math.min(px, box.maxX));
        const closestZ = Math.max(box.minZ, Math.min(pz, box.maxZ));
        let dx = px - closestX;
        let dz = pz - closestZ;
        let distance = Math.hypot(dx, dz);
        if (distance >= radius) continue;
        blocked = true;
        moved = true;
        if (distance < 0.0001) {
          // The centre is inside the box: leave along the shallowest axis.
          const left = px - box.minX;
          const right = box.maxX - px;
          const back = pz - box.minZ;
          const front = box.maxZ - pz;
          const min = Math.min(left, right, back, front);
          if (min === left) px = box.minX - radius;
          else if (min === right) px = box.maxX + radius;
          else if (min === back) pz = box.minZ - radius;
          else pz = box.maxZ + radius;
        } else {
          const push = (radius - distance) + 0.002;
          px += (dx / distance) * push;
          pz += (dz / distance) * push;
        }
      }
      if (!moved) break;
    }
    return { x: px, z: pz, blocked };
  }

  /** The ground height at a point: water level over water, platform top on one. */
  groundHeight(x, z, { onWater = null } = {}) {
    let height = this.baseGround;
    if (x < WATER.seaWestX || z > WATER.seaSouthZ || (x > WATER.channelX0 && x < WATER.channelX1 && z > WATER.channelZ0)) {
      height = onWater ?? WATER.level;
    }
    let topPlatform = null;
    for (const platform of this.platforms) {
      if (x >= platform.minX && x <= platform.maxX && z >= platform.minZ && z <= platform.maxZ) {
        if (topPlatform === null || platform.top > topPlatform) topPlatform = platform.top;
      }
    }
    if (topPlatform !== null && topPlatform > height) height = topPlatform;
    return height;
  }

  get stats() {
    return {
      boxes: this.boxes.length,
      platforms: this.platforms.length,
      buckets: this.grid.size,
      cells: this.grid.size,
    };
  }

  clear() {
    this.boxes.length = 0;
    this.platforms.length = 0;
    this.grid.clear();
  }
}

/** The world's single registry; world.js fills it during generation. */
export function createColliders() {
  return new ColliderWorld();
}
