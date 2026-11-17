// Seedable pseudo random numbers. The whole city is generated from one seed, so
// every stream in the game has to be reproducible: mulberry32 is small, fast and
// statistically good enough for layout noise, prop scatter and facade variants.

/** FNV-1a over the UTF-16 code units of a string: turns names into stable seeds. */
export function hashString(text) {
  let hash = 0x811c9dc5;
  const value = String(text);
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mixes a seed and a salt string into a new 32 bit seed, for derived streams. */
export function mixSeed(seed, salt) {
  return (Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ hashString(salt)) >>> 0;
}

export class Rng {
  constructor(seed = 1) {
    this.seed = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
    if (this.seed === 0) this.seed = 0x1a2b3c4d;
    this.state = this.seed;
  }

  /** Raw draw in [0, 1). */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  float(min = 0, max = 1) {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max], both ends included. */
  int(min, max) {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    if (hi <= lo) return lo;
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /** True with probability p. */
  chance(p) {
    return this.next() < p;
  }

  /** -1 or 1. */
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }

  pick(list) {
    if (!list || list.length === 0) return undefined;
    return list[Math.floor(this.next() * list.length)];
  }

  /** entries: array of [value, weight] pairs. Weights need not be normalised. */
  pickWeighted(entries) {
    let total = 0;
    for (const entry of entries) total += Math.max(0, entry[1]);
    if (total <= 0) return entries.length ? entries[0][0] : undefined;
    let roll = this.next() * total;
    for (const entry of entries) {
      roll -= Math.max(0, entry[1]);
      if (roll <= 0) return entry[0];
    }
    return entries[entries.length - 1][0];
  }

  /** A new independent array holding `count` distinct members of `list`. */
  sample(list, count) {
    const pool = list.slice();
    const out = [];
    const wanted = Math.min(count, pool.length);
    for (let i = 0; i < wanted; i += 1) {
      out.push(pool.splice(Math.floor(this.next() * pool.length), 1)[0]);
    }
    return out;
  }

  /** Fisher-Yates on a copy. */
  shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      const swap = out[i];
      out[i] = out[j];
      out[j] = swap;
    }
    return out;
  }

  /** Box-Muller, one half of the pair. */
  gaussian(mean = 0, deviation = 1) {
    let u = 0;
    while (u === 0) u = this.next();
    return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next()) * deviation;
  }

  /** A derived generator, so one subsystem's draws never shift another's. */
  fork(salt) {
    return new Rng(mixSeed(this.seed, salt));
  }
}

export function createRng(seed = 1) {
  return new Rng(seed);
}
