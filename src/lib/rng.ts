/**
 * Seeded PRNG.
 *
 * The prototype used `Math.random()`. That cannot survive server rendering:
 * the server and the client would generate different numbers and every figure
 * on the page would flash to a new value on hydration. Simulated data is
 * therefore drawn from a seeded stream so a given seed always produces the
 * same day.
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  between(min: number, max: number): number;
  /** Integer in [min, max]. */
  int(min: number, max: number): number;
  /** Fires with probability p. */
  chance(p: number): boolean;
  /** Uniformly picks one element. Throws on an empty list. */
  pick<T>(items: readonly T[]): T;
}

/** mulberry32 — small, fast, good enough for presentation data. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    between: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: <T,>(items: readonly T[]): T => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error("createRng: pick() from an empty list");
      return item;
    },
  };
}

/** Stable 32-bit hash, for deriving a per-section seed from a string. */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
