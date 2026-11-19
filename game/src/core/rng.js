// Deterministic randomness. Every district, block, window and palm in Solmara comes out
// of these streams, so the same seed always produces the same city. Nothing here touches
// Math.random: a shot has to be reproducible frame for frame.

/** Turns a short label into a 32-bit seed, FNV-1a style. */
export function hashLabel(label) {
  let hash = 0x811c9dc5;
  const text = String(label);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: small, fast, and plenty for city planning. */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A named random stream. `fork(label)` gives an independent child stream, which is how
 * the plan, each district's props and each shot keep out of each other's way.
 */
export class Random {
  constructor(seed = 'solmara') {
    this.seed = typeof seed === 'number' ? seed >>> 0 : hashLabel(seed);
    this.next = mulberry32(this.seed);
    this.calls = 0;
  }

  /** [0, 1). */
  float() {
    this.calls += 1;
    return this.next();
  }

  /** A float in [min, max). */
  range(min, max) {
    return min + (max - min) * this.float();
  }

  /** An integer in [min, max], both ends included. */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p. */
  chance(p) {
    return this.float() < p;
  }

  /** A random element; throws on an empty list rather than returning undefined. */
  pick(list) {
    if (!list.length) throw new Error('Random.pick called with an empty list');
    return list[this.int(0, list.length - 1)];
  }

  /** -1 or 1. */
  sign() {
    return this.float() < 0.5 ? -1 : 1;
  }

  /** Uniform in [-1, 1]. */
  signed() {
    return this.float() * 2 - 1;
  }

  /** Fisher-Yates, in place; returns the same array. */
  shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      const swap = list[i];
      list[i] = list[j];
      list[j] = swap;
    }
    return list;
  }

  /** Approximately normal, via the sum of four uniforms. */
  gaussian(mean = 0, deviation = 1) {
    const sum = this.float() + this.float() + this.float() + this.float();
    return mean + ((sum - 2) / 0.577) * deviation;
  }

  /** A child stream whose name keeps it independent of how often this one is read. */
  fork(label) {
    return new Random((this.seed ^ hashLabel(label)) >>> 0);
  }
}

/** Picks from [{ weight, ...anything }] by weight. */
export function weightedPick(random, entries) {
  if (!entries.length) throw new Error('weightedPick called with an empty list');
  let total = 0;
  for (const entry of entries) total += Math.max(0, entry.weight ?? 1);
  let roll = random.float() * total;
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight ?? 1);
    if (roll <= 0) return entry;
  }
  // Only reachable through floating-point drift at the very end of the range.
  return entries[entries.length - 1];
}
