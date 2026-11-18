// The collider registry: an axis-aligned box world the player, cars and later the police collide
// against, plus the ground height under a point. Boxes are bucketed into a coarse grid so a query
// near the player tests a handful of candidates instead of the whole city.
//
// A collider is { minX, maxX, minZ, maxZ, top, kind, id }: it blocks from the ground up to `top`.
// Buildings register one box per footprint; curbs and planters register low ones; bridges register
// their deck as a `walkable` box the ground query can stand on.

import { MeshBuilder } from './geometry.js';

const CELL = 48;

export class ColliderWorld {
  constructor() {
    /** @type {Array<object>} */
    this.boxes = [];
    /** @type {Map<string, object[]>} */
    this.cells = new Map();
    this._stamp = 0;
  }

  /** A cell key from a world position. */
  _key(cx, cz) {
    return `${cx}:${cz}`;
  }

  /** Registers a blocking box. */
  addBox(minX, minZ, maxX, maxZ, top, kind = 'building', extra = {}) {
    const box = {
      id: extra.id ?? `c${this.boxes.length}`,
      minX: Math.min(minX, maxX),
      maxX: Math.max(minX, maxX),
      minZ: Math.min(minZ, maxZ),
      maxZ: Math.max(minZ, maxZ),
      top,
      kind,
      ...extra,
    };
    box.cx = (box.minX + box.maxX) / 2;
    box.cz = (box.minZ + box.maxZ) / 2;
    this.boxes.push(box);
    const x0 = Math.floor(box.minX / CELL);
    const x1 = Math.floor(box.maxX / CELL);
    const z0 = Math.floor(box.minZ / CELL);
    const z1 = Math.floor(box.maxZ / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const key = this._key(cx, cz);
        let list = this.cells.get(key);
        if (!list) {
          list = [];
          this.cells.set(key, list);
        }
        list.push(box);
      }
    }
    return box;
  }

  /** A box from a centre and size, which is how the builders think about buildings. */
  addFootprint(cx, cz, width, depth, top, kind = 'building', extra = {}) {
    return this.addBox(cx - width / 2, cz - depth / 2, cx + width / 2, cz + depth / 2, top, kind, extra);
  }

  /** Every box whose cells overlap the given rectangle (may hold duplicates; callers dedupe). */
  queryRect(minX, minZ, maxX, maxZ) {
    const out = [];
    const x0 = Math.floor(minX / CELL);
    const x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL);
    const z1 = Math.floor(maxZ / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.cells.get(this._key(cx, cz));
        if (!list) continue;
        for (const box of list) out.push(box);
      }
    }
    return out;
  }

  /**
   * Pushes a circle out of every box it overlaps, on the ground plane. Returns the corrected
   * position and whether anything blocked; `radius` is the body's radius, `height` its feet-to-head
   * span (a low box is stepped over if it is shorter than the body's step height).
   */
  resolveCircle(x, z, radius, height = 1.7, stepHeight = 0.45) {
    const candidates = this.queryRect(x - radius, z - radius, x + radius, z + radius);
    let px = x;
    let pz = z;
    let blocked = false;
    let guard = 0;
    for (const box of candidates) {
      if (box.top <= stepHeight) continue;
      if (box.walkable) continue;
      // Closest point on the box to the circle's centre.
      const nearestX = Math.max(box.minX, Math.min(px, box.maxX));
      const nearestZ = Math.max(box.minZ, Math.min(pz, box.maxZ));
      let dx = px - nearestX;
      let dz = pz - nearestZ;
      let distance = Math.hypot(dx, dz);
      if (distance >= radius) continue;
      blocked = true;
      if (distance < 0.0001) {
        // Dead centre inside the box: push out through its nearest face.
        const left = px - box.minX;
        const right = box.maxX - px;
        const up = pz - box.minZ;
        const down = box.maxZ - pz;
        const smallest = Math.min(left, right, up, down);
        if (smallest === left) px = box.minX - radius;
        else if (smallest === right) px = box.maxX + radius;
        else if (smallest === up) pz = box.minZ - radius;
        else pz = box.maxZ + radius;
        continue;
      }
      const push = radius - distance;
      dx /= distance;
      dz /= distance;
      px += dx * push;
      pz += dz * push;
      if (++guard > 8) break;
    }
    return { x: px, z: pz, blocked };
  }

  /** Whether a circle overlaps any taller-than-a-step box at this position. */
  blockedAt(x, z, radius = 0.4, stepHeight = 0.45) {
    for (const box of this.queryRect(x - radius, z - radius, x + radius, z + radius)) {
      if (box.top <= stepHeight || box.walkable) continue;
      const nearestX = Math.max(box.minX, Math.min(x, box.maxX));
      const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
      const dx = x - nearestX;
      const dz = z - nearestZ;
      if (dx * dx + dz * dz < radius * radius) return box;
    }
    return null;
  }

  /**
   * The height of the ground under a point: 0 on the city plane, raised for bridge decks and
   * other walkable surfaces, and the walkable box with the highest top wins.
   */
  groundHeight(x, z) {
    let best = 0;
    for (const box of this.queryRect(x, z, x, z)) {
      if (!box.walkable) continue;
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue;
      if (box.top > best) best = box.top;
    }
    return best;
  }

  /** A downward ray test, the shape the camera needs to keep from clipping into a building. */
  raycastDown(x, z, fromY) {
    let best = -Infinity;
    let hit = null;
    for (const box of this.queryRect(x, z, x, z)) {
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue;
      if (box.top <= fromY && box.top > best) {
        best = box.top;
        hit = box;
      }
    }
    return hit ? { y: best, box: hit } : null;
  }

  /**
   * Segment/circle test: every box the straight line from (x0,z0) to (x1,z1) passes through,
   * returned with the nearest hit. Used by bullets and by the camera's line-of-sight checks.
   */
  raycast2D(x0, z0, x1, z1, radius = 0) {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.ceil(length / 6));
    let nearest = null;
    let nearestT = Infinity;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      const hit = this.blockedAt(x, z, Math.max(radius, 0.15));
      if (hit && t < nearestT) {
        nearest = hit;
        nearestT = t;
      }
    }
    return nearest ? { box: nearest, t: nearestT, x: x0 + (x1 - x0) * nearestT, z: z0 + (z1 - z0) * nearestT } : null;
  }

  get count() {
    return this.boxes.length;
  }

  /** A debug mesh of every box, for the settings' collider view. */
  buildDebugMesh() {
    const builder = new MeshBuilder('colliders');
    for (const box of this.boxes) {
      builder.box((box.minX + box.maxX) / 2, box.top / 2, (box.minZ + box.maxZ) / 2, box.maxX - box.minX, box.top, box.maxZ - box.minZ, {
        color: box.walkable ? [0.2, 0.8, 1] : [1, 0.3, 0.4],
        skipTop: false,
      });
    }
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true, transparent: true, opacity: 0.35 });
    return builder.build(material);
  }
}
