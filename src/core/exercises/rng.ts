/**
 * Seeded randomness. Every exercise is generated from a 32-bit seed through this,
 * never through Math.random, so a stored seed reproduces the exact exercise.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Raw unsigned 32-bit value; use it to derive child seeds. */
  uint32(): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** New array, Fisher–Yates shuffled. */
  shuffle<T>(items: readonly T[]): T[];
  bool(p?: number): boolean;
}

/** mulberry32: tiny, fast, good enough for drills. Same seed → same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Murmur3 finaliser. mulberry32's first outputs correlate for neighbouring seeds
 * (seed 1 and 3 drew the same melody-chord exercise), so seeds are scrambled first.
 */
export function mixSeed(seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createRng(seed: number): Rng {
  const next = mulberry32(mixSeed(seed));
  const int = (min: number, max: number): number => {
    if (max < min) throw new Error(`Empty range [${min}, ${max}]`);
    return min + Math.floor(next() * (max - min + 1));
  };
  return {
    next,
    uint32: () => Math.floor(next() * 4294967296) >>> 0,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('pick() from an empty list');
      return items[int(0, items.length - 1)];
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    bool: (p = 0.5) => next() < p,
  };
}
