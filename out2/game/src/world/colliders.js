// Static collision and ground data for the city. Buildings and walls register an
// axis-aligned box; the registry buckets them in a coarse grid so a circle test near a
// tower checks a handful of boxes, not nine hundred. The player, the cars, the bullets
// and the camera all query it. It also answers "how high is the ground here", which is
// all the flat city needs until the player can climb.

import { WATER } from './plan.js';

const CELL = 64;

/** The grid buckets by a string key; building it once per box keeps the hot query path cheap. */
const cellKey = (cx, cz) => `${cx},${cz}`;

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
    // The box goes in every 64 m cell it touches, so a query only walks its own cells.
    for (let cz = Math.floor(box.minZ / CELL); cz <= Math.floor(box.maxZ / CELL); cz += 1) {
      for (let cx = Math.floor(box.minX / CELL); cx <= Math.floor(box.maxX / CELL); cx += 1) {
        const key = cellKey(cx, cz);
        const bucket = this.grid.get(key);
        if (bucket) bucket.push(box);
        else this.grid.set(key, [box]);
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
    const found = [];
    const seen = new Set();
    const z0 = Math.floor((z - radius) / CELL);
    const z1 = Math.floor((z + radius) / CELL);
    const x0 = Math.floor((x - radius) / CELL);
    const x1 = Math.floor((x + radius) / CELL);
    for (let cz = z0; cz <= z1; cz += 1) {
      for (let cx = x0; cx <= x1; cx += 1) {
        const bucket = this.grid.get(cellKey(cx, cz));
        if (!bucket) continue;
        for (const box of bucket) {
          // A box spanning several cells is in each of them; count it once.
          if (seen.has(box.id)) continue;
          seen.add(box.id);
          found.push(box);
        }
      }
    }
    this.lastQueryCount = found.length;
    return found;
  }

  /** The solid box a point is inside, or null. */
  blockedAt(x, z, clearance = 0) {
    for (const box of this.near(x, z, clearance)) {
      const inside =
        x > box.minX - clearance && x < box.maxX + clearance && z > box.minZ - clearance && z < box.maxZ + clearance;
      if (inside) return box;
    }
    return null;
  }

  /** The tallest solid box under a vertical ray at (x, z), or null. */
  columnAt(x, z) {
    let best = null;
    for (const box of this.near(x, z)) {
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue;
      if (!best || box.top > best.top) best = box;
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
        const dx = px - closestX;
        const dz = pz - closestZ;
        const distance = Math.hypot(dx, dz);
        if (distance >= radius) continue;
        blocked = true;
        moved = true;
        if (distance < 0.0001) {
          // The centre is inside the box: leave along the shallowest axis.
          const toLeft = px - box.minX;
          const toRight = box.maxX - px;
          const toBack = pz - box.minZ;
          const toFront = box.maxZ - pz;
          const min = Math.min(toLeft, toRight, toBack, toFront);
          if (min === toLeft) px = box.minX - radius;
          else if (min === toRight) px = box.maxX + radius;
          else if (min === toBack) pz = box.minZ - radius;
          else pz = box.maxZ + radius;
        } else {
          const push = radius - distance + 0.002;
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
    const overWater =
      x < WATER.seaWestX ||
      z > WATER.seaSouthZ ||
      (x > WATER.channelX0 && x < WATER.channelX1 && z > WATER.channelZ0);
    if (overWater) height = onWater ?? WATER.level;

    let platformTop = null;
    for (const platform of this.platforms) {
      if (x < platform.minX || x > platform.maxX || z < platform.minZ || z > platform.maxZ) continue;
      if (platformTop === null || platform.top > platformTop) platformTop = platform.top;
    }
    if (platformTop !== null && platformTop > height) height = platformTop;
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
