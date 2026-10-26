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

/** Spell a root inside a key: the scale's own letter when it is a scale tone, otherwise a lowered degree (♭VII, ♭VI …). */
function spellRoot(key: Scale, pc: PitchClass): { note: Note; step: number; acc: number } {
  const notes = scaleNotes(key);
  const exact = notes.findIndex((n) => notePc(n) === pc);
  if (exact >= 0) return { note: notes[exact], step: exact, acc: 0 };
  // Chromatic: name it as the scale tone above, lowered (♭VII in major, ♭II …).
  const above = notes.findIndex((n) => notePc(n) === toPc(pc + 1));
  if (above >= 0) {
    const n = notes[above];
    return { note: { letter: n.letter as Letter, acc: n.acc - 1 }, step: above, acc: -1 };
  }
  const below = notes.findIndex((n) => notePc(n) === toPc(pc - 1));
  const n = notes[below];
  return { note: { letter: n.letter as Letter, acc: n.acc + 1 }, step: below, acc: 1 };
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const SUFFIX: Record<string, string> = {
  maj: '', min: '', dim: '°', aug: '+', maj7: 'maj7', m7: '7', dom7: '7', dim7: '°7', m7b5: 'ø7',
  maj9: 'maj9', m9: '9', dom9: '9', dom7s9: '7#9', dom13: '13',
};

function numeralIn(key: Scale, mode: KeyMode, c: ProgChord): Numeral {
  const { note, step, acc } = spellRoot(key, c.rootPc);
  const type = chordType(c.typeId);
  const minorish = type.formula.some((d) => d.number === 3 && d.acc === -1);
  const base = NUMERALS[step];
  const roman = (acc < 0 ? '♭' : acc > 0 ? '♯' : '') + (minorish ? base.toLowerCase() : base) + SUFFIX[c.typeId];
  const inScale = pcsOf(c).every((p) => scalePcs(key).includes(p));
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

export function keyLabel(f: KeyFit): string {
  const t = noteName(f.tonic);
  return f.mode === 'major' ? `${t}-Dur` : `${t.toLowerCase()}-Moll`;
}

