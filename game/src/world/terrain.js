// Terrain: one continuous height field covering the whole map, built as quads whose
// material bucket follows the land kind, so the city ground, the sand, the marsh and
// the shallow sea bed each get their own surface without any seams. The same field is
// handed to the collider registry as a ground sampler.

import { fbm2, lerp, smoothstep, clamp01 } from '../core/math.js';
import { CITY, LAND_RECTS, LAND_KINDS, insideRect, landKindAt } from './cityplan.js';

const WATER_FLOOR = -3.6;
const CITY_TOP = -0.06;
const DEEP_CUTOFF = CITY.seaLevel - 1.2;

/** Signed "how far inside the land" field, with a noisy coastline. */
function landnessAt(x, z) {
  let best = -Infinity;
  for (const rect of LAND_RECTS) {
    const inside = Math.min(x - rect.x0, rect.x1 - x, z - rect.z0, rect.z1 - z);
    if (inside > best) best = inside;
  }
  const wobble = (fbm2(x * 0.0075, z * 0.0075, 3) - 0.5) * 0.34;
  const raw = clamp01((best + CITY.shoreFalloff) / CITY.shoreFalloff + wobble);
  return smoothstep(0, 1, raw);
}

function landTopAt(x, z) {
  const relief = (fbm2(x * 0.0026, z * 0.0026, 4) - 0.5) * 1.5;
  // The city itself has to stay dry but sit just under its own roads and pavements:
  // if the ground here dipped below sea level the water plane would swallow downtown.
  const kind = landKindAt(x, z);
  if (kind === 'city') return -0.12 + relief * 0.12;
  let top = CITY_TOP + relief;
  for (const overlay of LAND_KINDS) {
    if (overlay.kind !== 'sand' || !insideRect(overlay, x, z)) continue;
    const edge = Math.min(x - overlay.x0, overlay.x1 - x, z - overlay.z0, overlay.z1 - z);
    top += smoothstep(0, 26, edge) * 0.9;
  }
  return top;
}

/**
 * A sampler for the ground: returns the terrain height at a world point. Handed to
 * the collider registry so later phases can walk on it.
 */
export function createHeightField(plan) {
  const cache = new Map();
  const sample = (x, z) => {
    const key = `${Math.round(x)}:${Math.round(z)}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const land = landnessAt(x, z);
    const shaped = Math.pow(land, 0.72);
    const height = lerp(WATER_FLOOR, landTopAt(x, z), shaped);
    if (cache.size < 40000) cache.set(key, height);
    return height;
  };
  sample.landness = landnessAt;
  sample.isWater = (x, z) => sample(x, z) < CITY.seaLevel;
  return sample;
}

function bucketFor(kind, height) {
  if (height < CITY.seaLevel) return 'seafloor';
  switch (kind) {
    case 'beach':
      return 'sand';
    case 'marsh':
      return 'marsh';
    case 'sand':
      return 'sand';
    case 'city':
      return 'cityGround';
    default:
      return 'grass';
  }
}

function tintFor(bucket, kind, height, rng) {
  const jitter = 0.92 + rng.float(0, 0.16);
  switch (bucket) {
    case 'seafloor':
      return [0.06, 0.2, 0.3];
    case 'sand':
      return [0.95 * jitter, 0.86 * jitter, 0.68 * jitter];
    case 'marsh':
      return [0.72 * jitter, 0.74 * jitter, 0.54 * jitter];
    case 'grass':
      return [0.78 * jitter, 0.82 * jitter, 0.62 * jitter];
    default:
      return [0.86 * jitter, 0.85 * jitter, 0.82 * jitter];
  }
}

/**
 * Emits the terrain into the geometry buckets. Cells that sit well under the water
 * plane are skipped: the sea covers them, so they would be triangles nobody sees.
 */
export function buildTerrain({ plan, groups, rng, heightField, segments = 120 }) {
  const extent = CITY.terrainExtent;
  const step = extent / segments;
  const origin = -extent / 2;
  const cornerCount = segments + 1;
  const heights = new Float32Array(cornerCount * cornerCount);

  for (let iz = 0; iz < cornerCount; iz += 1) {
    for (let ix = 0; ix < cornerCount; ix += 1) {
      const x = origin + ix * step;
      const z = origin + iz * step;
      heights[iz * cornerCount + ix] = heightField(x, z);
    }
  }

  let quads = 0;
  let skipped = 0;
  for (let iz = 0; iz < segments; iz += 1) {
    for (let ix = 0; ix < segments; ix += 1) {
      const h00 = heights[iz * cornerCount + ix];
      const h10 = heights[iz * cornerCount + ix + 1];
      const h01 = heights[(iz + 1) * cornerCount + ix];
      const h11 = heights[(iz + 1) * cornerCount + ix + 1];
      const highest = Math.max(h00, h10, h01, h11);
      if (highest < DEEP_CUTOFF) {
        skipped += 1;
        continue;
      }
      const x0 = origin + ix * step;
      const z0 = origin + iz * step;
      const x1 = x0 + step;
      const z1 = z0 + step;
      const cx = x0 + step / 2;
      const cz = z0 + step / 2;
      const kind = landKindAt(cx, cz);
      const bucket = bucketFor(kind, highest);
      const colour = tintFor(bucket, kind, highest, rng);
      const uv = 1 / 26;
      const builder = groups.builder(bucket);
      // Wound so both triangles face up, and sharing corner heights so neighbouring
      // cells never crack apart.
      const p00 = [x0, h00, z0];
      const p10 = [x1, h10, z0];
      const p11 = [x1, h11, z1];
      const p01 = [x0, h01, z1];
      builder.triangle(p01, p11, p10, [0, 1, 0], [x0 * uv, z1 * uv], [x1 * uv, z1 * uv], [x1 * uv, z0 * uv], colour);
      builder.triangle(p01, p10, p00, [0, 1, 0], [x0 * uv, z1 * uv], [x1 * uv, z0 * uv], [x0 * uv, z0 * uv], colour);
      quads += 2;
    }
  }

  return {
    triangles: quads,
    skipped,
    extent,
    segments,
    cells: segments * segments,
  };
}

/** Dune ridges and marsh humps that break up the flat ground, as low boxes. */
export function buildTerrainDetail({ plan, groups, rng, heightField }) {
  let count = 0;
  // Marsh humps and dune ridges, placed on the open ground away from streets.
  for (let i = 0; i < 90; i += 1) {
    const x = rng.float(-CITY.terrainExtent / 2 + 120, CITY.terrainExtent / 2 - 120);
    const z = rng.float(-CITY.terrainExtent / 2 + 120, CITY.terrainExtent / 2 - 120);
    const kind = landKindAt(x, z);
    if (kind !== 'marsh' && kind !== 'beach' && kind !== 'sand') continue;
    const height = heightField(x, z);
    if (height < CITY.seaLevel + 0.15) continue;
    const width = rng.float(20, 54);
    const depth = rng.float(14, 40);
    const lift = rng.float(0.4, 1.5) * (kind === 'beach' ? 0.7 : 1);
    groups.builder(kind === 'marsh' ? 'marsh' : 'sand').addBox({
      x,
      y: height + lift / 2 - 0.2,
      z,
      width,
      height: lift,
      depth,
      rotation: { x: 0, y: rng.float(0, Math.PI), z: 0 },
      color: kind === 'marsh' ? 0x8d9166 : 0xd8c49a,
      tint: rng.float(0.9, 1.08),
      uScale: 1 / 22,
      vScale: 1 / 22,
      faces: ['px', 'nx', 'py', 'pz', 'nz'],
    });
    count += 1;
  }
  return { humps: count };
}

/** Where a point sits vertically: used by spawn placement and the debug overlay. */
export function groundLevelAt(heightField, x, z) {
  return heightField(x, z);
}
