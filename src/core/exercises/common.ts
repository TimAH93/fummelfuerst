import { Tuning } from '../guitar/tuning';
import { chord, chordTones } from '../theory/chord';
import { PitchClass } from '../theory/pitch';
import { Note, enharmonics, noteName, pcName } from '../theory/spelling';
import { Rng } from './rng';

/**
 * Skill ids use the guitarist's string numbers (6 = low E … 1 = high E) so they read
 * naturally in progress views; internally string 0 is still the lowest string.
 */
export const stringNo = (t: Tuning, s: number): number => t.strings.length - s;

/** Pitch-class part of a skill id. Spelling-free, so C# and Db share one skill. */
export const pcSkill = (pc: PitchClass): string => pcName(pc, 'sharp');

/** Spellings drills ask for: naturals as-is, black keys as either sharp or flat. */
export function drillSpellings(pc: PitchClass): Note[] {
  const opts = enharmonics(pc, 1);
  const natural = opts.filter((n) => n.acc === 0);
  return natural.length > 0 ? natural : opts;
}

/**
 * Root spelling for a chord drill: the one whose chord tones need the fewest accidentals
 * (Ab major, not G# major with B#). Ties are broken by the rng.
 */
export function pickChordRoot(rng: Rng, pc: PitchClass, typeId: string): Note {
  const options = drillSpellings(pc).map((root) => ({
    root,
    cost: chordTones(chord(root, typeId)).reduce((a, n) => a + Math.abs(n.acc), 0),
  }));
  const best = Math.min(...options.map((o) => o.cost));
  return rng.pick(options.filter((o) => o.cost === best)).root;
}

export function pickSpelling(rng: Rng, pc: PitchClass): Note {
  return rng.pick(drillSpellings(pc));
}

/** Key tonics in their usual spelling (one per pitch class). */
export const MAJOR_TONICS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'] as const;
export const MINOR_TONICS = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'Eb', 'Bb', 'F', 'C', 'G', 'D'] as const;

export const names = (ns: Note[]): string => ns.map((n) => noteName(n)).join(' ');

export function assertFocus(ok: boolean, family: string, what: string): void {
  if (!ok) throw new Error(`${family}: impossible focus – ${what}`);
}
