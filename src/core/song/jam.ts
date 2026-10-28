import { Chord, chord, chordType } from '../theory/chord';
import { harmonize } from '../theory/harmony';
import { Degree, degreeSemitones, degreeToString } from '../theory/interval';
import { Midi, PitchClass, toPc } from '../theory/pitch';
import { scaleNotes, scalePcs } from '../theory/scale';
import { Letter, Note, noteName, notePc } from '../theory/spelling';
import { Key, Numeral, ProgChord, analyzeProgression, chordFromHeld, keyScale, numeralIn, spellInKey } from './analysis';

/*
 * Jamming over FLkey pad chords: what the held chord does in the key, what tends to come
 * next, and which melody tones sit well on top. Pure; the screen only renders it.
 */

const DOMINANT_TYPES = ['maj', 'dom7', 'dom9', 'dom7s9', 'dom13'];

export interface ChordFunction extends Numeral {
  /** Root spelled for the key (Ebm9 in Db major, D#m9 in E major). */
  root: Note;
  /** One line on what the chord does here, e.g. "Spannung, will zur I". */
  role: string;
  /** For a secondary dominant: numeral of the chord it pulls to ('iii'). */
  pullsTo?: string;
}

const MAJOR_ROLES = ['zu Hause', 'bereitet die V vor', 'weich, zwischen I und vi', 'öffnet, will zur V oder zurück zur I', 'Spannung, will zur I', 'die traurige Seite der I', 'Spannung, löst zur I'];
const MINOR_ROLES = ['zu Hause', 'bereitet die V vor', 'die helle Seite der i (relative major)', 'öffnet, will zur V oder zurück zur i', 'weich, wenig Zug', 'warm und dramatisch', 'rockig, führt zur i oder III'];
const BORROWED_MAJOR: Record<string, string> = {
  '6:-1': 'borrowed aus Moll – rockig, führt zur I',
  '5:-1': 'borrowed aus Moll – dramatisch, dann ♭VII oder V',
  '2:-1': 'borrowed aus Moll – überraschend hell',
  '3:0': 'borrowed aus Moll – wehmütig',
};

/** Diatonic numeral of a scale step, in the quality the key gives it (ii, iii, vi lowercase; vii°). */
function stepNumeral(key: Key, step: number): string {
  return harmonize(keyScale(key), 3)[step].roman;
}

/**
 * A major or dominant chord whose root sits a fifth above a diatonic degree pulls to that
 * degree: C7 in Db major is V7/iii, not "VII7". Not for the tonic (that is just V) and not
 * for the diminished degree.
 */
function secondaryDominant(key: Key, c: ProgChord): { step: number; roman: string } | null {
  if (!DOMINANT_TYPES.includes(c.typeId)) return null;
  const pcs = scalePcs(keyScale(key));
  const targetStep = pcs.indexOf(toPc(c.rootPc + 5));
  if (targetStep <= 0) return null;
  const target = harmonize(keyScale(key), 3)[targetStep];
  if (target.chord.type.id === 'dim') return null;
  const seventh = c.typeId === 'maj' ? '' : '7';
  return { step: targetStep, roman: `V${seventh}/${target.roman}` };
}

/** What a chord does in a key: numeral, spelling, and a one-line role. */
export function chordFunction(key: Key, c: ProgChord): ChordFunction {
  const scale = keyScale(key);
  const numeral = numeralIn(scale, key.mode, c);
  const { note, step, acc } = spellInKey(scale, c.rootPc);
  const major = key.mode === 'major';
  let role: string;
  let pullsTo: string | undefined;
  let roman = numeral.roman;
  if (numeral.diatonic) role = (major ? MAJOR_ROLES : MINOR_ROLES)[step];
  else if (numeral.harmonicMinorDominant) role = 'Spannung, will zur i (harmonic minor)';
  else {
    const sec = step === 4 && acc === 0 ? null : secondaryDominant(key, c);
    const borrowed = major ? BORROWED_MAJOR[`${step}:${acc}`] : undefined;
    if (sec) {
      role = `zieht zur ${stepNumeral(key, sec.step)}`;
      pullsTo = stepNumeral(key, sec.step);
      roman = sec.roman;
    } else if (borrowed && chordType(c.typeId).formula.some((d) => d.number === 3 && d.acc === (step === 3 ? -1 : 0))) role = borrowed;
    else role = `nicht in ${noteName(key.tonic)} ${major ? 'major' : 'minor'} – Farbwechsel`;
  }
  return { ...numeral, roman, root: note, role, pullsTo };
}

export interface Suggestion {
  chord: ProgChord;
  root: Note;
  typeId: string;
  symbol: string;
  roman: string;
  why: string;
}

/** Diatonic seventh chord on a 0-based step; in minor the V is the harmonic-minor dominant. */
function diatonicOn(key: Key, step: number): Chord {
  if (key.mode === 'naturalMinor' && step === 4) return chord(scaleNotes(keyScale(key))[4], 'dom7');
  return harmonize(keyScale(key), 4)[step].chord;
}

/** A major triad on a lowered step (♭VII, ♭VI). */
function loweredOn(key: Key, step: number): Chord {
  const n = scaleNotes(keyScale(key))[step];
  return chord({ letter: n.letter as Letter, acc: n.acc - 1 }, 'maj');
}

type Move = [target: Chord, why: string];

/** Where a chord tends to go. Rules of thumb, not laws – the ear decides. */
function moves(key: Key, c: ProgChord, fn: ChordFunction): Move[] {
  const d = (step: number) => diatonicOn(key, step);
  const scale = keyScale(key);
  const { step, acc } = spellInKey(scale, c.rootPc);
  const home = key.mode === 'major' ? 'I' : 'i';
  const sec = fn.pullsTo ? secondaryDominant(key, c) : null;
  if (sec) return [[d(sec.step), 'löst auf'], [d(0), 'nach Hause']];
  if (key.mode === 'major') {
    if (acc === -1 && step === 6) return [[d(0), 'zurück nach Hause'], [d(3), 'bleibt rockig']];
    if (acc === -1 && step === 5) return [[loweredOn(key, 6), 'dann I: die Mario-Kadenz'], [d(4), 'Spannung'], [d(0), 'nach Hause']];
    if (!fn.diatonic) return [[d(0), 'zurück nach Hause'], [d(4), 'Spannung aufbauen']];
    const table: Move[][] = [
      [[d(3), 'öffnet'], [d(5), 'wird traurig'], [d(1), 'startet ii – V – I']],
      [[d(4), 'der klassische Zug, dann I'], [d(3), 'bleibt offen'], [d(0), 'direkt nach Hause']],
      [[d(5), 'Quintfall'], [d(3), 'hell'], [d(1), 'weiter Richtung V']],
      [[d(4), 'Spannung aufbauen'], [d(0), 'zurück nach Hause'], [d(1), 'bleibt vor der V']],
      [[d(0), 'löst auf'], [d(5), 'Trugschluss – überrascht'], [d(3), 'zieht zurück']],
      [[d(3), 'der Pop-Zug'], [d(1), 'Quintfall'], [d(4), 'Spannung']],
      [[d(0), 'löst auf'], [d(2), 'weicher']],
    ];
    return table[step];
  }
  if (!fn.diatonic && !fn.harmonicMinorDominant) return [[d(0), `zurück nach Hause (${home})`], [d(4), 'Spannung aufbauen']];
  const table: Move[][] = [
    [[d(3), 'öffnet'], [d(5), 'warm'], [d(4), 'Spannung']],
    [[d(4), 'ii – V – i'], [d(0), 'nach Hause']],
    [[d(5), 'Quintfall'], [d(3), 'dunkler'], [d(6), 'rockig']],
    [[d(4), 'Spannung aufbauen'], [d(0), 'zurück nach Hause'], [d(5), 'bleibt offen']],
    [[d(0), 'löst auf'], [d(5), 'Trugschluss – überrascht']],
    [[d(6), 'dann i'], [d(3), 'Quintfall'], [d(2), 'hell']],
    [[d(0), 'zurück nach Hause'], [d(2), 'relative major'], [d(5), 'warm']],
  ];
  return table[step];
}

/** Two or three chords that tend to follow, with the reason in a few words. */
export function nextChords(key: Key, c: ProgChord): Suggestion[] {
  const fn = chordFunction(key, c);
  return moves(key, c, fn).map(([t, why]) => {
    const pc: ProgChord = { rootPc: notePc(t.root), typeId: t.type.id };
    return { chord: pc, root: t.root, typeId: t.type.id, symbol: noteName(t.root) + t.type.symbol, roman: numeralIn(keyScale(key), key.mode, pc).roman, why };
  });
}

export type ToneWeight = 'target' | 'colour' | 'stable';

export interface GuideTone {
  pc: PitchClass;
  degree: string;
  weight: ToneWeight;
}

export interface MelodyGuide {
  /** Chord tones: 3rd and 7th are targets, extensions colour, root and fifth stable. */
  tones: GuideTone[];
  /** Scale tones of the key, safe passing notes. */
  scalePcs: PitchClass[];
  /** The 4th over a major third: fine in passing, sour when held. */
  avoid: PitchClass[];
}

const weightOf = (d: Degree): ToneWeight => (d.number === 3 || d.number === 7 ? 'target' : d.number >= 9 ? 'colour' : 'stable');

/** Which melody tones sit well on a chord, in a key. Jazz naming: 9/11/13 over seventh chords. */
export function melodyGuide(key: Key | null, c: ProgChord): MelodyGuide {
  const type = chordType(c.typeId);
  const tones = type.formula.map((d) => ({ pc: toPc(c.rootPc + degreeSemitones(d)), degree: degreeToString(d), weight: weightOf(d) }));
  const majorThird = type.formula.some((d) => d.number === 3 && d.acc === 0);
  const fourth = toPc(c.rootPc + 5);
  return {
    tones,
    scalePcs: key ? scalePcs(keyScale(key)) : [],
    avoid: majorThird && !tones.some((t) => t.pc === fourth) ? [fourth] : [],
  };
}

export type NoteKind = ToneWeight | 'avoid' | 'passing' | 'outside';

export interface NoteRole {
  /** Degree over the chord root: '3', 'b7', '9', '11' … */
  degree: string;
  kind: NoteKind;
  text: string;
}

const OVER_ROOT = ['1', 'b9', '9', 'b3', '3', '11', 'b5', '5', 'b13', '13', 'b7', '7'];
const KIND_TEXT: Record<NoteKind, string> = {
  target: 'Zielton – darauf kannst du liegen bleiben',
  colour: 'Farbe – klingt reich',
  stable: 'sicher, aber flach',
  avoid: 'Durchgang – nicht liegen lassen',
  passing: 'Durchgang – weiter zum nächsten Zielton',
  outside: 'außerhalb – kurz ist spannend, lang ist falsch',
};

/** What a melody note does over the chord right now. */
export function melodyNoteRole(key: Key | null, c: ProgChord, pc: PitchClass): NoteRole {
  const g = melodyGuide(key, c);
  const tone = g.tones.find((t) => t.pc === pc);
  const kind: NoteKind = tone ? tone.weight : g.avoid.includes(pc) ? 'avoid' : !key || g.scalePcs.includes(pc) ? 'passing' : 'outside';
  return { degree: tone?.degree ?? OVER_ROOT[toPc(pc - c.rootPc)], kind, text: KIND_TEXT[kind] };
}

export interface JamState {
  /** The chord the player is on – it stays after the pad is released, until a new one comes. */
  chord: ProgChord | null;
  /** The keys that made that chord, so extra keys on top read as melody. */
  chordMidis: Midi[];
  /** Chords played so far, consecutive repeats folded; the key is read from these. */
  history: ProgChord[];
}

export const EMPTY_JAM: JamState = { chord: null, chordMidis: [], history: [] };
const HISTORY = 32;
const sameChord = (a: ProgChord, b: ProgChord): boolean => a.rootPc === b.rootPc && a.typeId === b.typeId;
const size = (c: ProgChord): number => chordType(c.typeId).formula.length;

/**
 * Feed a settled set of held keys (stable for a moment, at least three). The chord changes only
 * when a new one is recognised; keys added on top of the held chord are melody – unless they
 * grow the same chord (Fm → Fm7 → Fm9 built up slowly), which upgrades it in place.
 */
export function jamStep(prev: JamState, settled: Midi[]): JamState {
  if (settled.length === 0) return prev;
  const found = chordFromHeld(settled);
  const holdsChord = prev.chord !== null && prev.chordMidis.length > 0 && prev.chordMidis.every((m) => settled.includes(m));
  if (holdsChord) {
    if (found && prev.chord && found.rootPc === prev.chord.rootPc && !sameChord(found, prev.chord) && size(found) > size(prev.chord)) {
      return { chord: found, chordMidis: settled, history: [...prev.history.slice(0, -1), found] };
    }
    return prev;
  }
  if (!found) return prev;
  if (prev.chord && sameChord(found, prev.chord)) return { ...prev, chordMidis: settled };
  return { chord: found, chordMidis: settled, history: [...prev.history, found].slice(-HISTORY) };
}

/** Keys held right now that are melody: everything above the chord while it is held, everything once it is released. */
export function melodyNotes(state: JamState, held: Midi[]): Midi[] {
  if (!state.chord) return [];
  const down = state.chordMidis.filter((m) => held.includes(m)).length;
  const padHeld = down > 0 && down >= Math.min(3, state.chordMidis.length);
  return padHeld ? held.filter((m) => !state.chordMidis.includes(m)) : held;
}

/**
 * The key the chords played so far point to. Sticky: the current reading stays unless another
 * key beats it by 1.5 points, so a loop that two keys share (Db major / F minor) does not flicker
 * halfway through its first pass.
 */
export function autoKey(history: ProgChord[], current: Key | null): Key | null {
  if (history.length === 0) return current;
  const fits = analyzeProgression(history);
  const best = fits[0];
  if (current) {
    const cur = fits.find((f) => notePc(f.tonic) === notePc(current.tonic) && f.mode === current.mode);
    if (cur && best.score - cur.score < 1.5) return current;
  }
  return { tonic: best.tonic, mode: best.mode };
}
