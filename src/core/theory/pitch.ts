/** Pitch class 0..11, C = 0. */
export type PitchClass = number;
/** MIDI note number, E2 = 40, C4 = 60. */
export type Midi = number;

/** Mathematical modulo (always non-negative). */
export const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** Reduce any integer (e.g. a MIDI number) to its pitch class. */
export const toPc = (n: number): PitchClass => mod(n, 12);

/** Signed modulo into the range [-6, 5]; used to pick the nearest accidental. */
export const signedMod12 = (n: number): number => {
  const r = mod(n, 12);
  return r > 5 ? r - 12 : r;
};
