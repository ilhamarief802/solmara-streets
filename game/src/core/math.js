// Small maths helpers shared by the whole game. No dependencies, no state: every function here
// is a pure transform, which is what keeps the world layout and the camera work reproducible.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value) {
  return clamp(value, 0, 1);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function invLerp(a, b, value) {
  return a === b ? 0 : clamp01((value - a) / (b - a));
}

/** Hermite ease between two edges: 0 below e0, 1 above e1. */
export function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function easeInOutCubic(t) {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Frame-rate independent approach: a toward b, lambda per second. */
export function damp(a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

/** The angle equivalent to `angle` in [0, TAU). */
export function wrapAngle(angle) {
  return ((angle % TAU) + TAU) % TAU;
}

/** Signed shortest turn from a to b, in [-PI, PI]. */
export function angleDelta(a, b) {
  return ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

/** Approaches an angle the short way round. */
export function dampAngle(a, b, lambda, dt) {
  return a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));
}

/** Wraps a number into [0, mod). */
export function wrap(value, mod) {
  return ((value % mod) + mod) % mod;
}

/** Signed shortest difference between two wrapped values, in [-mod/2, mod/2]. */
export function wrappedDelta(a, b, mod) {
  const half = mod / 2;
  return wrap(b - a + half, mod) - half;
}

export function distance2D(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

/** A yaw angle that looks from (x, z) toward (tx, tz), for an object whose forward is -Z. */
export function yawToward(x, z, tx, tz) {
  return Math.atan2(tx - x, tz - z) + Math.PI;
}

/** A smooth 2D value noise in [0, 1], deterministic and cheap: used for dunes and water swell. */
export function valueNoise2D(x, z, seed = 0) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const hash = (ix, iz) => {
    let h = (ix * 374761393 + iz * 668265263 + seed * 144665) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

/** Fractional octaves of valueNoise2D, in [0, 1]. */
export function fbm2D(x, z, octaves = 3, seed = 0) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(x * freq, z * freq, seed + i * 91) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Samples a keyframed gradient: stops are { at, ...values } sorted by `at`, values lerped. */
export function sampleStops(stops, at, keys) {
  if (at <= stops[0].at) return stops[0];
  const last = stops[stops.length - 1];
  if (at >= last.at) return last;
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i];
    if (at > b.at) continue;
    const a = stops[i - 1];
    const t = (at - a.at) / (b.at - a.at);
    const out = { at };
    for (const key of keys) out[key] = lerp(a[key], b[key], t);
    return out;
  }
  return last;
}
