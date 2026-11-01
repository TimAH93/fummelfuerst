import { Tuning } from '../guitar/tuning';
import { chord, chordTones } from '../theory/chord';
import { intervalInfo, parseDegree, transpose } from '../theory/interval';
import { PitchClass, toPc } from '../theory/pitch';
import { Note, enharmonics, notePc, noteName, pcName } from '../theory/spelling';
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
export function pickChordRoot(rng: Rng, pc: PitchClass, typeId: string, preferFlats = false): Note {
  const options = drillSpellings(pc).map((root) => ({
    root,
    cost: chordTones(chord(root, typeId)).reduce((a, n) => a + Math.abs(n.acc), 0),
  }));
  const best = Math.min(...options.map((o) => o.cost));
  const tied = options.filter((o) => o.cost === best);
  // Jazz charts spell with flats when it is a toss-up (Ebm7, not D#m7).
  const flats = tied.filter((o) => o.root.acc <= 0);
  return rng.pick(preferFlats && flats.length ? flats : tied).root;
}

export function pickSpelling(rng: Rng, pc: PitchClass): Note {
  return rng.pick(drillSpellings(pc));
}

/** The other spelling of a plain semitone degree where that one can name a plain key over a flat or sharp root. */
const ENHARMONIC_TWIN: Readonly<Record<string, string>> = { b2: '#1', b5: '#4', b6: '#5', '7': 'b8' };

/**
 * Degree token of a pitch class that is not in the chord, over the spelled root, chosen so the
 * note it names is the key that was pressed: the plain semitone degree (b2 … 7), or its twin
 * (#1, #4, #5, b8) when that spells the note with fewer accidentals. D over Db is ♯1 = D, not
 * ♭2 = E𝄫; C over C# is ♭8 = C, not 7 = B♯; ties keep the plain degree (F# over C stays ♭5 = G♭).
 */
export function foreignDegree(root: Note, pc: PitchClass): string {
  const plain = intervalInfo(toPc(pc - notePc(root))).degree;
  const twin = ENHARMONIC_TWIN[plain];
  if (twin === undefined) return plain;
  const accidentals = (tok: string): number => Math.abs(transpose(root, parseDegree(tok)).acc);
  return accidentals(twin) < accidentals(plain) ? twin : plain;
}

/** Key tonics in their usual spelling (one per pitch class). */
export const MAJOR_TONICS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'] as const;
export const MINOR_TONICS = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'Eb', 'Bb', 'F', 'C', 'G', 'D'] as const;

export const names = (ns: Note[]): string => ns.map((n) => noteName(n)).join(' ');

export function assertFocus(ok: boolean, family: string, what: string): void {
  if (!ok) throw new Error(`${family}: impossible focus – ${what}`);
}
