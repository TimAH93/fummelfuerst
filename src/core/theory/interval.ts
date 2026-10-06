import { PitchClass, mod, signedMod12, toPc } from './pitch';
import { Letter, NATURAL_PC, Note, accidentalString, notePc, parseAccidental } from './spelling';

/**
 * A degree token relative to a root, measured against the major scale:
 * '1' = {1,0}, 'b3' = {3,-1}, '#5' = {5,+1}, 'bb7' = {7,-2}, '9' = {9,0}.
 * Compound degrees (9, 11, 13) are supported for future extensions.
 */
export interface Degree {
  number: number;
  acc: number;
}

/** Semitone offsets of the major scale; every degree is measured against this. */
export const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;

export function parseDegree(tok: string): Degree {
  const m = /^(##|#|bb|b|♯|♭)?(\d+)$/u.exec(tok.trim());
  if (!m) throw new Error(`Not a degree token: "${tok}"`);
  const number = Number(m[2]);
  if (number < 1) throw new Error(`Degree must be >= 1: "${tok}"`);
  return { number, acc: parseAccidental(m[1]) };
}

export const parseFormula = (formula: string): Degree[] =>
  formula.trim().split(/\s+/).map(parseDegree);

export const degreeToString = (d: Degree, style: 'ascii' | 'unicode' = 'ascii'): string =>
  accidentalString(d.acc, style) + d.number;

/** Semitones above the root (may exceed 11 for compound degrees). */
export function degreeSemitones(d: Degree): number {
  const idx = (d.number - 1) % 7;
  const octave = Math.floor((d.number - 1) / 7);
  return MAJOR_STEPS[idx] + 12 * octave + d.acc;
}

/** Spell the note a degree above a root: letters step, accidentals follow. */
export function transpose(root: Note, d: Degree): Note {
  const letter = ((root.letter + d.number - 1) % 7) as Letter;
  const targetPc = notePc(root) + degreeSemitones(d);
  return { letter, acc: signedMod12(targetPc - NATURAL_PC[letter]) };
}

/** The (simple) degree of `note` above `root`, from letters and pitch: G→C = '4', A→C = 'b3'. */
export function degreeBetween(root: Note, note: Note): Degree {
  const steps = mod(note.letter - root.letter, 7);
  const semis = mod(notePc(note) - notePc(root), 12);
  return { number: steps + 1, acc: signedMod12(semis - MAJOR_STEPS[steps]) };
}

/** Ascending semitone distance between two pitch classes, 0..11. */
export const semitonesBetween = (from: PitchClass, to: PitchClass): number => toPc(to - from);

export interface IntervalInfo {
  semitones: number;
  name: string;
  short: string;
  degree: string;
}

/** The 13 simple intervals from the spec. Names are display data, not musical logic. */
export const INTERVALS: readonly IntervalInfo[] = [
  { semitones: 0, name: 'root', short: 'R', degree: '1' },
  { semitones: 1, name: 'minor 2nd', short: 'm2', degree: 'b2' },
  { semitones: 2, name: 'major 2nd', short: 'M2', degree: '2' },
  { semitones: 3, name: 'minor 3rd', short: 'm3', degree: 'b3' },
  { semitones: 4, name: 'major 3rd', short: 'M3', degree: '3' },
  { semitones: 5, name: 'perfect 4th', short: 'P4', degree: '4' },
  { semitones: 6, name: 'tritone', short: 'TT', degree: 'b5' },
  { semitones: 7, name: 'perfect 5th', short: 'P5', degree: '5' },
  { semitones: 8, name: 'minor 6th', short: 'm6', degree: 'b6' },
  { semitones: 9, name: 'major 6th', short: 'M6', degree: '6' },
  { semitones: 10, name: 'minor 7th', short: 'm7', degree: 'b7' },
  { semitones: 11, name: 'major 7th', short: 'M7', degree: '7' },
  { semitones: 12, name: 'octave', short: 'P8', degree: '8' },
];

export function intervalInfo(semitones: number): IntervalInfo {
  if (semitones === 12) return INTERVALS[12];
  return INTERVALS[mod(semitones, 12)];
}

/** Default degree for a bare semitone count (no letter context). */
export const defaultDegree = (semitones: number): Degree => parseDegree(intervalInfo(semitones).degree);
