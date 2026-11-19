// Small maths helpers shared by the city generator, the camera rigs, the player and the
// traffic. Dependency-free on purpose: importing this can never drag in a system.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function invLerp(a, b, value) {
  return b === a ? 0 : (value - a) / (b - a);
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp01(invLerp(edge0, edge1, x));
  return t * t * (3 - 2 * t);
}

export function easeInOutCubic(t) {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Frame-rate independent exponential approach: `a` is pulled towards `b`. */
export function damp(a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

/** Wraps an angle into (-PI, PI]. */
export function wrapAngle(angle) {
  let value = angle % TAU;
  if (value > Math.PI) value -= TAU;
  if (value <= -Math.PI) value += TAU;
  return value;
}

/** The shortest signed rotation from `a` to `b`. */
export function angleDelta(a, b) {
  return wrapAngle(b - a);
}

export function dampAngle(a, b, lambda, dt) {
  return wrapAngle(a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt)));
}

/** Wraps a value into [0, mod). */
export function wrap(value, mod) {
  const result = value % mod;
  return result < 0 ? result + mod : result;
}

/** The shortest signed distance from `a` to `b` on a circle of circumference `mod`. */
export function wrappedDelta(a, b, mod) {
  let delta = wrap(b - a, mod);
  if (delta > mod / 2) delta -= mod;
  return delta;
}

export function distance2D(ax, az, bx, bz) {
  return Math.hypot(bx - ax, bz - az);
}

/** Heading (a three.js Y rotation) that points local -Z towards (tx, tz). */
export function yawToward(x, z, tx, tz) {
  return Math.atan2(tx - x, tz - z);
}

// Integer hash in [0, 1): the lattice corners of the value noise below.
function hash2D(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Cheap deterministic 2D value noise in [-1, 1]. */
export function valueNoise2D(x, z, seed = 0) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  // Smooth the lattice fractions so the field is continuous across cell borders.
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const top = lerp(hash2D(xi, zi, seed), hash2D(xi + 1, zi, seed), u);
  const bottom = lerp(hash2D(xi, zi + 1, seed), hash2D(xi + 1, zi + 1, seed), u);
  return lerp(top, bottom, v) * 2 - 1;
}

/** Three octaves of value noise, still in [-1, 1]. */
export function fbm2D(x, z, octaves = 3, seed = 0) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise2D(x * frequency, z * frequency, seed + i * 97) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    // Non-integer step keeps the octaves from lining up into visible grids.
    frequency *= 2.03;
  }
  return sum / norm;
}

/**
 * Samples keyframes sorted by `at`, interpolating every numeric or array-valued field.
 * Used by the clock palette and the shot camera paths.
 */
export function sampleStops(stops, at, keys = null) {
  if (!stops.length) throw new Error('sampleStops called with no stops');
  if (at <= stops[0].at) return stops[0];
  if (at >= stops[stops.length - 1].at) return stops[stops.length - 1];
  let index = 0;
  while (index < stops.length - 2 && stops[index + 1].at < at) index += 1;
  const a = stops[index];
  const b = stops[index + 1];
  const t = clamp01(invLerp(a.at, b.at, at));
  const out = { at };
  for (const key of keys ?? Object.keys(a)) {
    if (key === 'at') continue;
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'number') out[key] = lerp(av, bv, t);
    else if (Array.isArray(av)) out[key] = av.map((value, i) => lerp(value, bv[i], t));
    // Flags and labels switch at the midpoint rather than interpolating.
    else out[key] = t < 0.5 ? av : bv;
  }
  return out;
}
