import { Degree, degreeBetween, degreeSemitones, degreeToString, parseFormula, transpose } from './interval';
import { PitchClass, mod } from './pitch';
import { Note, asNote, notePc, noteName, parseNote } from './spelling';

export interface ChordType {
  id: string;
  name: string;
  /** Canonical suffix, e.g. '' for major, 'm7b5' for half-diminished. */
  symbol: string;
  aliases: string[];
  formula: Degree[];
}

const def = (id: string, name: string, symbol: string, aliases: string[], formula: string): ChordType => ({
  id,
  name,
  symbol,
  aliases,
  formula: parseFormula(formula),
});

/** Extensions (9, 11, 13, altered) are added the same way: '1 3 5 b7 9' etc. */
export const CHORD_TYPES: readonly ChordType[] = [
  def('maj', 'major triad', '', ['M', 'maj'], '1 3 5'),
  def('min', 'minor triad', 'm', ['min', '-'], '1 b3 5'),
  def('dim', 'diminished triad', 'dim', ['°', 'o'], '1 b3 b5'),
  def('aug', 'augmented triad', 'aug', ['+'], '1 3 #5'),
  def('maj7', 'major 7', 'maj7', ['M7', 'Δ7', 'Δ', 'ma7'], '1 3 5 7'),
  def('m7', 'minor 7', 'm7', ['min7', '-7'], '1 b3 5 b7'),
  def('dom7', 'dominant 7', '7', ['dom7'], '1 3 5 b7'),
  def('dim7', 'diminished 7', 'dim7', ['°7', 'o7'], '1 b3 b5 bb7'),
  def('m7b5', 'half-diminished 7', 'm7b5', ['ø', 'ø7', '-7b5', 'min7b5'], '1 b3 b5 b7'),
];

export const chordType = (id: string): ChordType => {
  const t = CHORD_TYPES.find((c) => c.id === id);
  if (!t) throw new Error(`Unknown chord type: ${id}`);
  return t;
};

export interface Chord {
  root: Note;
  type: ChordType;
}

export const chord = (root: Note | string, typeId: string): Chord => ({ root: asNote(root), type: chordType(typeId) });

export const chordTones = (c: Chord): Note[] => c.type.formula.map((d) => transpose(c.root, d));
export const chordPcs = (c: Chord): PitchClass[] => chordTones(c).map(notePc);
export const chordToneNames = (c: Chord): string[] => chordTones(c).map((n) => noteName(n));
export const chordSymbol = (c: Chord): string => noteName(c.root) + c.type.symbol;
export const chordFormulaString = (t: ChordType): string => t.formula.map((d) => degreeToString(d)).join(' ');

/** Parse 'Am', 'F', 'G7', 'Bbmaj7', 'F#m7b5', 'Bdim', 'C+'. Longest suffix wins. */
export function parseChord(sym: string): Chord {
  const m = /^([A-Ga-g])(##|#|bb|b|♯|♭)?(.*)$/u.exec(sym.trim());
  if (!m) throw new Error(`Not a chord symbol: "${sym}"`);
  const root = parseNote(m[1] + (m[2] ?? ''));
  const suffix = m[3];
  const candidates: [string, ChordType][] = [];
  for (const t of CHORD_TYPES) for (const s of [t.symbol, ...t.aliases]) candidates.push([s, t]);
  const hit = candidates.filter(([s]) => s === suffix);
  if (hit.length === 0) throw new Error(`Unknown chord suffix "${suffix}" in "${sym}"`);
  return { root, type: hit[0][1] };
}

/** The chord-function of a pitch inside a chord ('b3', '5'…), or null for a non-chord tone. */
export function functionInChord(c: Chord, note: Note | PitchClass): Degree | null {
  const pc = typeof note === 'number' ? mod(note, 12) : notePc(note);
  const i = chordPcs(c).indexOf(pc);
  return i < 0 ? null : c.type.formula[i];
}

/** Degree of any note relative to the chord root, chord tone or not (C over G = '4'). */
export const degreeOverRoot = (c: Chord, note: Note | string): Degree => degreeBetween(c.root, asNote(note));

export const chordContains = (c: Chord, pc: PitchClass): boolean => chordPcs(c).includes(mod(pc, 12));

/** Identify a chord type from spelled tones stacked above a root (exact spelling match). */
export function identifyChord(root: Note, tones: Note[]): ChordType | undefined {
  const tokens = tones.map((t) => degreeToString(degreeBetween(root, t)));
  return CHORD_TYPES.find(
    (t) => t.formula.length === tokens.length && t.formula.every((d, i) => degreeToString(d) === tokens[i]),
  );
}

/** Identify a chord type from pitch classes over a root pitch class (spelling-free, set match). */
export function identifyChordPcs(rootPc: PitchClass, pcs: PitchClass[]): ChordType | undefined {
  const set = [...new Set(pcs.map((p) => mod(p - rootPc, 12)))].sort((a, b) => a - b).join(',');
  return CHORD_TYPES.find(
    (t) => [...new Set(t.formula.map((d) => mod(degreeSemitones(d), 12)))].sort((a, b) => a - b).join(',') === set,
  );
}
