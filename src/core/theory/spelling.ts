import { PitchClass, toPc } from './pitch';

export type Letter = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const LETTER_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
/** Pitch class of each natural letter. The only "table" the speller needs. */
export const NATURAL_PC: readonly PitchClass[] = [0, 2, 4, 5, 7, 9, 11];

/** A spelled note: letter plus accidental (-2 = double flat … +2 = double sharp). */
export interface Note {
  letter: Letter;
  acc: number;
}

export const notePc = (n: Note): PitchClass => toPc(NATURAL_PC[n.letter] + n.acc);

export type AccidentalStyle = 'ascii' | 'unicode';

export function accidentalString(acc: number, style: AccidentalStyle = 'ascii'): string {
  if (acc === 0) return '';
  if (style === 'unicode') {
    if (acc === 2) return '𝄪';
    if (acc === -2) return '𝄫';
    return acc > 0 ? '♯'.repeat(acc) : '♭'.repeat(-acc);
  }
  return acc > 0 ? '#'.repeat(acc) : 'b'.repeat(-acc);
}

export const noteName = (n: Note, style: AccidentalStyle = 'ascii'): string =>
  LETTER_NAMES[n.letter] + accidentalString(n.acc, style);

const ACC_RE = '(##|#|bb|b|♯♯|♯|♭♭|♭|𝄪|𝄫)?';

export function parseAccidental(s: string | undefined): number {
  if (!s) return 0;
  if (s === '𝄪') return 2;
  if (s === '𝄫') return -2;
  let acc = 0;
  for (const ch of s) acc += ch === '#' || ch === '♯' ? 1 : -1;
  return acc;
}

/** Parse "C", "Bb", "F#", "Ebb", "C♯". Throws on anything else. */
export function parseNote(s: string): Note {
  const m = new RegExp(`^([A-Ga-g])${ACC_RE}$`, 'u').exec(s.trim());
  if (!m) throw new Error(`Not a note name: "${s}"`);
  const letter = LETTER_NAMES.indexOf(m[1].toUpperCase() as (typeof LETTER_NAMES)[number]) as Letter;
  return { letter, acc: parseAccidental(m[2]) };
}

export const asNote = (n: Note | string): Note => (typeof n === 'string' ? parseNote(n) : n);

export const sameSpelling = (a: Note, b: Note): boolean => a.letter === b.letter && a.acc === b.acc;

/** All spellings of a pitch class using at most `maxAcc` accidentals (default: up to doubles). */
export function enharmonics(pc: PitchClass, maxAcc = 2): Note[] {
  const out: Note[] = [];
  for (let l = 0; l < 7; l++) {
    const acc = ((toPc(pc - NATURAL_PC[l]) + 6) % 12) - 6; // into -6..5
    if (Math.abs(acc) <= maxAcc) out.push({ letter: l as Letter, acc });
  }
  // Prefer fewest accidentals, then sharps before flats.
  return out.sort((a, b) => Math.abs(a.acc) - Math.abs(b.acc) || b.acc - a.acc);
}

/** Default spelling for a bare pitch class, when no key context exists. */
export function pcToNote(pc: PitchClass, prefer: 'sharp' | 'flat' = 'sharp'): Note {
  const opts = enharmonics(pc, 1);
  const natural = opts.find((n) => n.acc === 0);
  if (natural) return natural;
  return opts.find((n) => (prefer === 'sharp' ? n.acc > 0 : n.acc < 0))!;
}

export const pcName = (pc: PitchClass, prefer: 'sharp' | 'flat' = 'sharp'): string =>
  noteName(pcToNote(pc, prefer));
