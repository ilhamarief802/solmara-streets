// Small, dependency free maths. Deliberately free of three.js so layout code can
// run before any renderer exists, which keeps the world generator testable.

export const TAU = Math.PI * 2;
export const HALF_PI = Math.PI / 2;
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Where `value` sits between `a` and `b`, clamped to [0, 1]. */
export function invLerp(a, b, value) {
  if (a === b) return 0;
  return clamp01((value - a) / (b - a));
}

/** Classic Hermite ease between two edges. */
export function smoothstep(edge0, edge1, value) {
  const t = invLerp(edge0, edge1, value);
  return t * t * (3 - 2 * t);
}

/** Quintic ease, zero first and second derivative at both edges. */
export function smootherstep(edge0, edge1, value) {
  const t = invLerp(edge0, edge1, value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Linear map of a value from one range to another, unclamped. */
export function remap(value, inMin, inMax, outMin, outMax) {
  const t = inMax === inMin ? 0 : (value - inMin) / (inMax - inMin);
  return outMin + (outMax - outMin) * t;
}

/**
 * Frame rate independent exponential approach: moves `current` towards `target`
 * so that roughly 1 - 1/e of the gap is closed per `lambda` seconds.
 */
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Wraps into [min, max). */
export function wrap(value, min, max) {
  const span = max - min;
  if (span <= 0) return min;
  let out = (value - min) % span;
  if (out < 0) out += span;
  return out + min;
}

/** Triangle wave with period 2 * span, peaking at `span`. */
export function pingpong(value, span) {
  const doubled = wrap(value, 0, span * 2);
  return doubled <= span ? doubled : span * 2 - doubled;
}

/** Steps a value towards a target without overshooting. */
export function approach(current, target, maxDelta) {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

export function roundTo(value, step) {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function dist2(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

export function distSq2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/** Squared distance from a point to a 2D segment, with the clamped parameter. */
export function pointSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  let t = lengthSq === 0 ? 0 : ((px - ax) * abx + (pz - az) * abz) / lengthSq;
  t = clamp01(t);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return { t, x: cx, z: cz, distSq: dx * dx + dz * dz, dist: Math.hypot(dx, dz) };
}

/** Deterministic 2D hash in [0, 1): the base cell of the value noise below. */
export function hash2(x, y) {
  let h = Math.imul(Math.floor(x) ^ 0x2545f491, 0x27d4eb2d) ^ Math.imul(Math.floor(y) ^ 0x9e3779b9, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1] on the integer lattice. */
export function valueNoise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = x - xi;
  const ty = y - yi;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const n00 = hash2(xi, yi);
  const n10 = hash2(xi + 1, yi);
  const n01 = hash2(xi, yi + 1);
  const n11 = hash2(xi + 1, yi + 1);
  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

/** Fractal sum of value noise; returns roughly [0, 1]. */
export function fbm2(x, y, octaves = 4, gain = 0.5, lacunarity = 2) {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let norm = 0;
  const count = Math.max(1, Math.floor(octaves));
  for (let i = 0; i < count; i += 1) {
    total += valueNoise2(x * frequency, y * frequency) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return norm > 0 ? total / norm : 0;
}
