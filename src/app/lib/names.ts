import { Chord, Note, chordSymbol, noteName } from '../../core';
import { NoteNames } from './store';

/**
 * Display names. German convention: B natural is "H", B flat is "B".
 * Accidentals use real ♯/♭ glyphs.
 */
export function showNote(n: Note, style: NoteNames): string {
  const plain = noteName(n, 'unicode');
  if (style === 'international' || n.letter !== 6) return plain;
  if (n.acc === -1) return 'B';
  return 'H' + plain.slice(1);
}

export function showChord(c: Chord, style: NoteNames): string {
  const intl = chordSymbol(c);
  return showNote(c.root, style) + intl.slice(noteName(c.root).length);
}

export const INTERVAL_DE = [
  'Prime', 'kleine Sekunde', 'große Sekunde', 'kleine Terz', 'große Terz', 'Quarte',
  'Tritonus', 'Quinte', 'kleine Sexte', 'große Sexte', 'kleine Septime', 'große Septime', 'Oktave',
];

/** Chord-function names for reveals: '1' → 'Grundton', 'b3' → 'kleine Terz' … */
export const FUNCTION_DE: Record<string, string> = {
  '1': 'Grundton', b3: 'kleine Terz', '3': 'große Terz', b5: 'verminderte Quinte', '5': 'Quinte', '#5': 'übermäßige Quinte',
};

export const keyName = (tonic: Note, mode: 'major' | 'naturalMinor', style: NoteNames): string =>
  mode === 'major' ? `${showNote(tonic, style)}-Dur` : `${showNote(tonic, style).toLowerCase()}-Moll`;

/** Guitarist numbering with the open-string name: 'Saite 5 (A)'. */
export const stringName = (stringNo: number, openName: string): string => `Saite ${stringNo} (${openName})`;
