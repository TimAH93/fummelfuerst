import { MAJOR_TONICS, MINOR_TONICS } from '../exercises/common';
import { KeyMode } from '../exercises/families/melodyChord';
import { identifyHeld } from '../keys/heldChord';
import { chordType, parseChord } from '../theory/chord';
import { degreeSemitones } from '../theory/interval';
import { Midi, PitchClass, toPc } from '../theory/pitch';
import { Scale, scale, scaleNotes, scalePcs } from '../theory/scale';
import { Letter, Note, noteName, notePc, parseNote } from '../theory/spelling';

/** A chord of a progression, spelling-free until a key is known. */
export interface ProgChord {
  rootPc: PitchClass;
  typeId: string;
}

export interface Numeral {
  /** Chord symbol spelled for the key: Bb in F major, not A#. */
  symbol: string;
  /** Roman numeral relative to the key: 'vi', '♭VII', 'V7', 'ii°'. */
  roman: string;
  diatonic: boolean;
  /** Major V/V7 in a minor key: borrowed from harmonic minor, counts as at home. */
  harmonicMinorDominant?: boolean;
}

export interface KeyFit {
  tonic: Note;
  mode: KeyMode;
  score: number;
  numerals: Numeral[];
}

/** "Am F C G", "Am, F | C G", "Dm7 G7 Cmaj7". Throws with the offending token. */
export function parseProgression(text: string): ProgChord[] {
  return text
    .split(/[\s,|]+/)
    .filter(Boolean)
    .map((tok) => {
      const c = parseChord(tok);
      return { rootPc: notePc(c.root), typeId: c.type.id };
    });
}

/** The chord currently held on a keyboard, if it is one the app knows. */
export function chordFromHeld(midis: Midi[]): ProgChord | null {
  const h = identifyHeld(midis);
  return h ? { rootPc: h.rootPc, typeId: h.type.id } : null;
}

const pcsOf = (c: ProgChord): PitchClass[] => chordType(c.typeId).formula.map((d) => toPc(c.rootPc + degreeSemitones(d)));
/** Root, third, fifth, seventh: what decides whether a chord is at home. Extensions (9, 13) are colour. */
const corePcs = (c: ProgChord): PitchClass[] =>
  chordType(c.typeId).formula.filter((d) => d.number <= 7).map((d) => toPc(c.rootPc + degreeSemitones(d)));

/** A key as the app talks about it: tonic plus major / natural minor. */
export interface Key {
  tonic: Note;
  mode: KeyMode;
}

export const keyScale = (k: Key): Scale => scale(k.tonic, k.mode);

/**
 * Spell a root inside a key: the scale's own letter when it is a scale tone, otherwise the
 * neighbouring scale tone lowered or raised – whichever needs the fewer accidentals (G in
 * Db major is ♯IV, not a double-flat ♭V).
 */
export function spellInKey(key: Scale, pc: PitchClass): { note: Note; step: number; acc: number } {
  const notes = scaleNotes(key);
  const exact = notes.findIndex((n) => notePc(n) === pc);
  if (exact >= 0) return { note: notes[exact], step: exact, acc: 0 };
  const candidates: { note: Note; step: number; acc: number }[] = [];
  const above = notes.findIndex((n) => notePc(n) === toPc(pc + 1));
  if (above >= 0) candidates.push({ note: { letter: notes[above].letter as Letter, acc: notes[above].acc - 1 }, step: above, acc: -1 });
  const below = notes.findIndex((n) => notePc(n) === toPc(pc - 1));
  if (below >= 0) candidates.push({ note: { letter: notes[below].letter as Letter, acc: notes[below].acc + 1 }, step: below, acc: 1 });
  if (candidates.length === 1 || Math.abs(candidates[0].note.acc) !== Math.abs(candidates[1].note.acc)) {
    return candidates.sort((a, b) => Math.abs(a.note.acc) - Math.abs(b.note.acc))[0];
  }
  // A tie between lowered and raised: major keys lower (♭II ♭III ♭VI ♭VII) except the tritone
  // (♯IV, not ♭V); minor keys raise (♯III ♯IV ♯VI ♯VII) except the Neapolitan ♭II.
  const [lowered, raised] = candidates;
  const minor = key.type.id === 'naturalMinor';
  if (minor) return raised.step === 0 ? lowered : raised;
  return [0, 3, 4].includes(lowered.step) ? raised : lowered;
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const SUFFIX: Record<string, string> = {
  maj: '', min: '', dim: '°', aug: '+', maj7: 'maj7', m7: '7', dom7: '7', dim7: '°7', m7b5: 'ø7',
  maj9: 'maj9', m9: '9', dom9: '9', dom7s9: '7#9', dom13: '13',
  sus2: 'sus2', sus4: 'sus4', add9: 'add9', madd9: 'add9', six: '6', m6: '6', sixnine: '6/9', m11: '11', dom7sus4: '7sus4', dom7b9: '7b9', maj7s11: 'maj7#11', mMaj7: 'mMaj7',
};

export function numeralIn(key: Scale, mode: KeyMode, c: ProgChord): Numeral {
  const { note, step, acc } = spellInKey(key, c.rootPc);
  const type = chordType(c.typeId);
  const minorish = type.formula.some((d) => d.number === 3 && d.acc === -1);
  const base = NUMERALS[step];
  const roman = (acc < 0 ? '♭' : acc > 0 ? '♯' : '') + (minorish ? base.toLowerCase() : base) + SUFFIX[c.typeId];
  const inScale = corePcs(c).every((p) => scalePcs(key).includes(p));
  const harmonicMinorDominant =
    mode === 'naturalMinor' && step === 4 && acc === 0 && ['maj', 'dom7', 'dom9', 'dom7s9', 'dom13'].includes(c.typeId);
  return { symbol: noteName(note) + type.symbol, roman, diatonic: inScale, harmonicMinorDominant: harmonicMinorDominant || undefined };
}

/**
 * Rank all 24 major/minor keys for a progression: diatonic chords score 1 (a minor key's
 * major V 0.9), a tonic first chord +1, ending on the tonic +0.5 or on its V +0.25.
 * Where a loop starts and lands outweighs one borrowed chord: C Bb F C is C (I ♭VII IV I), not F.
 */
export function analyzeProgression(chords: ProgChord[]): KeyFit[] {
  if (chords.length === 0) return [];
  const keys: [string, KeyMode][] = [
    ...MAJOR_TONICS.map((t) => [t, 'major'] as [string, KeyMode]),
    ...MINOR_TONICS.map((t) => [t, 'naturalMinor'] as [string, KeyMode]),
  ];
  const fits = keys.map(([t, mode]) => {
    const key = scale(parseNote(t), mode);
    const numerals = chords.map((c) => numeralIn(key, mode, c));
    const tonicPc = notePc(key.tonic);
    const tonicType = mode === 'major' ? ['maj', 'maj7', 'maj9'] : ['min', 'm7', 'm9'];
    const isTonic = (c: ProgChord) => c.rootPc === tonicPc && tonicType.includes(c.typeId);
    const isDominant = (c: ProgChord) => c.rootPc === toPc(tonicPc + 7) && ['maj', 'dom7', 'dom9', 'dom7s9', 'dom13'].includes(c.typeId);
    let score = numerals.reduce((a, n) => a + (n.diatonic ? 1 : n.harmonicMinorDominant ? 0.9 : 0), 0);
    if (isTonic(chords[0])) score += 1;
    const last = chords[chords.length - 1];
    if (isTonic(last)) score += 0.5;
    else if (isDominant(last)) score += 0.25;
    return { tonic: key.tonic, mode, score, numerals };
  });
  return fits.sort((a, b) => b.score - a.score || (a.mode === 'major' ? -1 : 1));
}

/** True when the runner-up is close enough to mention (typically the relative key). */
export const isAmbiguous = (fits: KeyFit[]): boolean => fits.length > 1 && fits[0].score - fits[1].score < 1;

/** "Db major", "F minor" – English terms, as on the FLkey and in FL Studio. */
export const keyLabel = (k: Key): string => `${noteName(k.tonic)} ${k.mode === 'major' ? 'major' : 'minor'}`;

