import { useRef } from 'preact/hooks';

/** The FLkey's 37 keys at its default octave. */
export const DEFAULT_LOW = 48;
export const DEFAULT_HIGH = 84;

/**
 * Keyboard range that grows to show every note that turned up, in whole octaves, and stays grown
 * while the screen is open – so playing an octave down (Octave –) shows up, and nothing jumps.
 */
export function useKeyRange(notes: number[], low = DEFAULT_LOW, high = DEFAULT_HIGH): [number, number] {
  const range = useRef<[number, number]>([low, high]);
  let [lo, hi] = range.current;
  for (const n of notes) {
    if (n < lo) lo = Math.max(0, Math.floor(n / 12) * 12);
    if (n > hi) hi = Math.min(127, Math.ceil(n / 12) * 12);
  }
  range.current = [lo, hi];
  return [lo, hi];
}
