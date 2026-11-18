// The static collision registry. Phase one only fills it: boxes for buildings, walls,
// poles, piers, cranes and parked cars, plus a ground sampler and the road queries the
// walking player, the cars and the bullets of later phases will ask for. Lookups go
// through a coarse grid so a frame does not scan ten thousand boxes.

import { CITY, blockAt } from './cityplan.js';
import { clamp } from '../core/math.js';

const CELL = 64;

export class ColliderRegistry {
  constructor({ plan, heightField = null }) {
    this.plan = plan;
    this.heightField = heightField;
    this.boxes = [];
    this.buckets = new Map();
    this.kinds = new Map();
    this.lastId = 0;
    this.decks = this.collectDecks();
  }

  /** Bridge decks, the runway pad and the elevated highway: walkable surfaces. */
  collectDecks() {
    const decks = [];
    for (const bridge of this.plan.bridges) {
      decks.push({
        kind: 'bridge',
        name: bridge.name,
        x0: bridge.x - bridge.width / 2,
        x1: bridge.x + bridge.width / 2,
        z0: bridge.from,
        z1: bridge.to,
        y: bridge.deckHeight,
      });
    }
    const runway = this.plan.city;
    decks.push({
      kind: 'runway',
      name: 'airstrip',
      x0: runway.runwayFrom,
      x1: runway.runwayTo,
      z0: runway.runwayZ - 13,
      z1: runway.runwayZ + 13,
      y: 0.9,
    });
    return decks;
  }

  addBox(box) {
    if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.z)) return null;
    const rotationY = box.rotationY ?? 0;
    const width = box.width ?? 1;
    const depth = box.depth ?? 1;
    const height = box.height ?? 1;
    // Conservative axis aligned extents for a rotated box.
    const cos = Math.abs(Math.cos(rotationY));
    const sin = Math.abs(Math.sin(rotationY));
    const halfX = (width * cos + depth * sin) / 2;
    const halfZ = (width * sin + depth * cos) / 2;
    const entry = {
      id: this.lastId++,
      kind: box.kind ?? 'prop',
      x: box.x,
      y: box.y ?? height / 2,
      z: box.z,
      halfX,
      halfZ,
      halfY: height / 2,
      width,
      height,
      depth,
      rotationY,
      district: box.district ?? null,
      landmark: box.landmark ?? null,
      climbable: box.climbable === true || height <= CITY.kerbHeight + 0.2,
    };
    this.boxes.push(entry);
    this.kinds.set(entry.kind, (this.kinds.get(entry.kind) ?? 0) + 1);
    const minX = Math.floor((entry.x - halfX) / CELL);
    const maxX = Math.floor((entry.x + halfX) / CELL);
    const minZ = Math.floor((entry.z - halfZ) / CELL);
    const maxZ = Math.floor((entry.z + halfZ) / CELL);
    for (let cx = minX; cx <= maxX; cx += 1) {
      for (let cz = minZ; cz <= maxZ; cz += 1) {
        const key = `${cx}:${cz}`;
        let bucket = this.buckets.get(key);
        if (!bucket) {
          bucket = [];
          this.buckets.set(key, bucket);
        }
        bucket.push(entry);
      }
    }
    return entry.id;
  }

  /** Every box whose grid cell overlaps a disc around a point. */
  query(x, z, radius = 4) {
    const out = [];
    const seen = new Set();
    const minX = Math.floor((x - radius) / CELL);
    const maxX = Math.floor((x + radius) / CELL);
    const minZ = Math.floor((z - radius) / CELL);
    const maxZ = Math.floor((z + radius) / CELL);
    for (let cx = minX; cx <= maxX; cx += 1) {
      for (let cz = minZ; cz <= maxZ; cz += 1) {
        const bucket = this.buckets.get(`${cx}:${cz}`);
        if (!bucket) continue;
        for (const entry of bucket) {
          if (seen.has(entry.id)) continue;
          seen.add(entry.id);
          out.push(entry);
        }
      }
    }
    return out;
  }

  /** True when a point is inside a box's footprint, with an optional margin. */
  occupied(x, z, margin = 0) {
    for (const entry of this.query(x, z, margin + 1)) {
      if (entry.climbable) continue;
      if (Math.abs(x - entry.x) <= entry.halfX + margin && Math.abs(z - entry.z) <= entry.halfZ + margin) return entry;
    }
    return null;
  }

  /**
   * The walkable height at a point: terrain, or a block pavement, or a bridge deck
   * or the runway pad, whichever is highest.
   */
  groundAt(x, z) {
    let height = this.heightField ? this.heightField(x, z) : CITY.landHeight;
    for (const deck of this.decks) {
      if (x >= deck.x0 && x <= deck.x1 && z >= deck.z0 && z <= deck.z1 && deck.y > height) height = deck.y;
    }
    const block = blockAt(this.plan, x, z);
    if (block) {
      const inside = Math.abs(x - block.cx) <= block.size / 2 - 0.5 && Math.abs(z - block.cz) <= block.size / 2 - 0.5;
      if (inside) {
        const top = block.surfaceHeight ?? CITY.sidewalkHeight;
        if (top > height) height = top;
      }
    }
    return height;
  }

  /** Which surface a point stands on, for the debug readout and later footsteps. */
  surfaceAt(x, z) {
    if (this.heightField && this.heightField(x, z) < CITY.seaLevel) return 'water';
    for (const deck of this.decks) {
      if (x >= deck.x0 && x <= deck.x1 && z >= deck.z0 && z <= deck.z1) return deck.kind;
    }
    const block = blockAt(this.plan, x, z);
    if (block) return block.surface ?? 'pavement';
    return 'ground';
  }

  /** Boxes the ray from (x, y, z) along `dir` would meet, nearest first, ignoring
   * everything closer than `skip`. Used by shooting and car impacts later. */
  raycast(x, y, z, dir, distance = 120, skip = 0.5) {
    const hits = [];
    const steps = Math.max(2, Math.round(distance / 6));
    for (let i = 1; i <= steps; i += 1) {
      const t = (i / steps) * distance;
      if (t < skip) continue;
      const px = x + dir.x * t;
      const py = y + dir.y * t;
      const pz = z + dir.z * t;
      for (const entry of this.query(px, pz, 6)) {
        if (Math.abs(px - entry.x) > entry.halfX) continue;
        if (Math.abs(pz - entry.z) > entry.halfZ) continue;
        if (py < entry.y - entry.halfY || py > entry.y + entry.halfY) continue;
        hits.push({ distance: t, entry, x: px, y: py, z: pz });
        break;
      }
      if (hits.length) break;
    }
    return hits[0] ?? null;
  }

  /** Nearest point outside every collider, for spawning things that must not clip. */
  findFreeSpot(x, z, radius = 1.2, tries = 12, rng = null) {
    if (!this.occupied(x, z, radius)) return { x, z, moved: false };
    for (let i = 1; i <= tries; i += 1) {
      const angle = rng ? rng.float(0, Math.PI * 2) : (i / tries) * Math.PI * 2;
      const distance = 2 + i * 1.8;
      const nx = x + Math.cos(angle) * distance;
      const nz = z + Math.sin(angle) * distance;
      if (!this.occupied(nx, nz, radius)) return { x: nx, z: nz, moved: true };
    }
    return { x, z, moved: false };
  }

  /** A breakdown by kind, for the boot log and the report. */
  summary() {
    const rows = [...this.kinds.entries()].sort((a, b) => b[1] - a[1]);
    return {
      total: this.boxes.length,
      cells: this.buckets.size,
      kinds: rows,
      text: rows.map(([kind, count]) => `${kind}:${count}`).join(' '),
    };
  }

  /** Clamps a position to the world, so nothing can fall off the map edge. */
  clampToWorld(position) {
    const half = CITY.terrainExtent / 2 - 40;
    position.x = clamp(position.x, -half, half);
    position.z = clamp(position.z, -half, half);
    return position;
  }
}

export function createColliders(options) {
  return new ColliderRegistry(options);
}
