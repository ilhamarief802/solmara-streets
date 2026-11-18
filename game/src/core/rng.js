// Seeded randomness for Solmara. Every procedural decision in the city walks through a Random
// stream derived from one seed, so the same seed always builds the same city. Streams fork by
// name: the district generator and the prop scatterer never consume each other's numbers, which
// keeps a later edit in one subsystem from reshuffling every other one.

/** A 32-bit FNV-style hash of a string, mixed, so two nearby labels give unrelated seeds. */
export function hashLabel(label) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Mulberry32: small, fast, and good enough for city layout. Returns a function in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A named random stream: the unit every world subsystem is handed instead of a bare function. */
export class Random {
  /** @param {number|string} seed a seed number, or a label to hash into one */
  constructor(seed = 0) {
    this.seed = typeof seed === 'number' ? seed >>> 0 : hashLabel(String(seed));
    this._next = mulberry32(this.seed);
    this.calls = 0;
  }

  /** The next number in [0, 1). */
  float() {
    this.calls++;
    return this._next();
  }

  /** A number in [min, max). */
  range(min, max) {
    return min + (max - min) * this.float();
  }

  /** A whole number in [min, max], both ends included. */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p. */
  chance(p) {
    return this.float() < p;
  }

  /** One element of a non-empty array. */
  pick(list) {
    return list[Math.min(list.length - 1, Math.floor(this.float() * list.length))];
  }

  /** A copy of the array in a random order (Fisher-Yates on the given stream). */
  shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      const swap = out[i];
      out[i] = out[j];
      out[j] = swap;
    }
    return out;
  }

  /** -1 or 1. */
  sign() {
    return this.float() < 0.5 ? -1 : 1;
  }

  /** A vec-like [x, z] point on a disc of the given radius, evenly spread. */
  onDisc(radius) {
    const angle = this.float() * Math.PI * 2;
    const r = Math.sqrt(this.float()) * radius;
    return [Math.cos(angle) * r, Math.sin(angle) * r];
  }

  /** A child stream, seeded from this one's seed and a label, without disturbing this stream. */
  fork(label) {
    return new Random((this.seed ^ hashLabel(String(label))) >>> 0);
  }
}

/** A weighted table: entries of { weight, value }, picked proportionally. */
export function weightedPick(random, entries) {
  let total = 0;
  for (const entry of entries) total += entry.weight;
  let roll = random.float() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
}
