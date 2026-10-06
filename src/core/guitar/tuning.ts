import { Midi, toPc } from '../theory/pitch';
import { NATURAL_PC, noteName, parseNote, pcToNote } from '../theory/spelling';

/** Strings ordered low → high. Index 0 is the lowest-pitched string. */
export interface Tuning {
  id: string;
  name: string;
  strings: Midi[];
}

/** 'E2' → 40, 'C4' → 60, 'Bb3' → 58. */
export function parseMidi(s: string): Midi {
  const m = /^([A-Ga-g](?:##|#|bb|b)?)(-?\d+)$/.exec(s.trim());
  if (!m) throw new Error(`Not a pitch: "${s}"`);
  const note = parseNote(m[1]);
  // Octave numbering follows the letter (B#3 = C4), so offset by the natural, then add acc.
  return 12 * (Number(m[2]) + 1) + NATURAL_PC[note.letter] + note.acc;
}

export function midiName(m: Midi, prefer: 'sharp' | 'flat' = 'sharp'): string {
  return noteName(pcToNote(toPc(m), prefer)) + (Math.floor(m / 12) - 1);
}

export const tuning = (id: string, name: string, pitches: string[]): Tuning => ({
  id,
  name,
  strings: pitches.map(parseMidi),
});

export const STANDARD: Tuning = tuning('standard', 'Standard (E A D G B E)', ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);

/** Conventional guitarist label: low E = 6, high E = 1. */
export const stringLabel = (t: Tuning, string: number): string =>
  `${t.strings.length - string} (${noteName(pcToNote(toPc(t.strings[string])))})`;

