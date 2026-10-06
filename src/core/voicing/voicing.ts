import { FretPos, fretSpan, pitchAt } from '../guitar/fretboard';
import { Tuning } from '../guitar/tuning';
import { Chord, chordPcs, chordTones } from '../theory/chord';
import { Degree } from '../theory/interval';
import { Midi, toPc } from '../theory/pitch';
import { Note } from '../theory/spelling';

/** One fret per string, low → high; null = string not played. */
export type Frets = (number | null)[];

export interface VoicedNote {
  pos: FretPos;
  midi: Midi;
  /** Spelled as the chord spells it (F major has Bb, not A#). */
  note: Note;
  /** Function in the chord: '1', 'b3', '5', … */
  fn: Degree;
}

export interface Voicing {
  frets: Frets;
  notes: VoicedNote[];
  /** Formula index of the bass note: 0 = root position, 1 = first inversion, … */
  inversion: number;
  span: number;
  fingers: number;
}

export interface VoicingSearch {
  minFret?: number;
  maxFret?: number;
  /** Largest fretted span (see fretSpan). Spec default: 4. */
  maxSpan?: number;
  /** Play exactly these strings, nothing else (e.g. [2, 3, 4] for a triad on D-G-B). */
  strings?: number[];
  /** Otherwise: at least this many strings. */
  minStrings?: number;
  /** Allow muted strings between played ones (fingerstyle yes, strumming no). */
  innerMutes?: boolean;
  /** Each chord tone at most once (triads on a string set). */
  noDoubling?: boolean;
  /** Only this inversion (formula index of the bass). */
  inversion?: number;
  maxFingers?: number;
}

/**
 * Fingers needed, with a simple barre rule: if the lowest fretted fret occurs on two or more
 * strings and no open string sits between them, one finger covers them all.
 */
export function fingersNeeded(frets: Frets): number {
  const fretted = frets.map((f, s) => ({ f, s })).filter((x): x is { f: number; s: number } => x.f !== null && x.f > 0);
  if (fretted.length === 0) return 0;
  const low = Math.min(...fretted.map((x) => x.f));
  const atLow = fretted.filter((x) => x.f === low).map((x) => x.s);
  const above = fretted.filter((x) => x.f > low).length;
  if (atLow.length < 2) return fretted.length;
  const from = Math.min(...atLow);
  const to = Math.max(...atLow);
  const openInside = frets.slice(from, to + 1).some((f) => f === 0);
  return openInside ? fretted.length : 1 + above;
}

export function describeVoicing(t: Tuning, chord: Chord, frets: Frets): Voicing | null {
  const tones = chordTones(chord);
  const pcs = chordPcs(chord); // index-aligned with tones and formula
  const notes: VoicedNote[] = [];
  frets.forEach((fret, string) => {
    if (fret === null) return;
    const pos = { string, fret };
    const midi = pitchAt(t, pos);
    const i = pcs.indexOf(toPc(midi));
    if (i < 0) return;
    notes.push({ pos, midi, note: tones[i], fn: chord.type.formula[i] });
  });
  if (notes.length !== frets.filter((f) => f !== null).length || notes.length === 0) return null;
  const bass = notes.reduce((a, b) => (b.midi < a.midi ? b : a));
  const inversion = chord.type.formula.findIndex((d) => d.number === bass.fn.number && d.acc === bass.fn.acc);
  return { frets, notes, inversion, span: fretSpan(notes.map((n) => n.pos.fret)), fingers: fingersNeeded(frets) };
}

/**
 * Every playable voicing of a chord: one note per string, all chord tones present,
 * span and finger limits respected. Exhaustive – a 6-string search is ~10⁴ combinations.
 */
export function findVoicings(t: Tuning, chord: Chord, opts: VoicingSearch = {}): Voicing[] {
  const {
    minFret = 0, maxFret = 15, maxSpan = 4, strings, minStrings = 3,
    innerMutes = false, noDoubling = false, inversion, maxFingers = 4,
  } = opts;
  const pcs = new Set(chordPcs(chord));
  const n = t.strings.length;
  const options: (number | null)[][] = [];
  for (let s = 0; s < n; s++) {
    const frets: (number | null)[] = [];
    if (!strings || strings.includes(s)) {
      for (let f = minFret; f <= maxFret; f++) if (pcs.has(toPc(t.strings[s] + f))) frets.push(f);
    }
    if (!strings || !strings.includes(s)) frets.push(null);
    options.push(frets);
  }

  const out: Voicing[] = [];
  const current: Frets = new Array(n).fill(null);
  const walk = (s: number): void => {
    if (s === n) return consider();
    for (const f of options[s]) {
      current[s] = f;
      // Prune early on span: fretted frets so far must already fit.
      const sofar = current.slice(0, s + 1).filter((x): x is number => x !== null);
      if (fretSpan(sofar) <= maxSpan) walk(s + 1);
    }
    current[s] = null;
  };
  const consider = (): void => {
    const played = current.map((f, s) => (f === null ? -1 : s)).filter((s) => s >= 0);
    if (played.length < (strings ? strings.length : minStrings)) return;
    if (!innerMutes && played[played.length - 1] - played[0] + 1 !== played.length) return;
    const v = describeVoicing(t, chord, [...current]);
    if (!v) return;
    const present = new Set(v.notes.map((x) => toPc(x.midi)));
    if (present.size !== pcs.size) return;
    if (noDoubling && v.notes.length !== pcs.size) return;
    if (inversion !== undefined && v.inversion !== inversion) return;
    if (v.fingers > maxFingers) return;
    out.push(v);
  };
  walk(0);
  return out.sort((a, b) => lowestFret(a) - lowestFret(b) || tab(a.frets).localeCompare(tab(b.frets)));
}

const lowestFret = (v: Voicing): number => Math.min(...v.notes.map((n) => n.pos.fret));

/** 'x32010'; with a two-digit fret anywhere: 'x-10-12-12-x-x'. */
export function tab(frets: Frets): string {
  const parts = frets.map((f) => (f === null ? 'x' : String(f)));
  return parts.some((p) => p.length > 1) ? parts.join('-') : parts.join('');
}

export function parseTab(s: string): Frets {
  const parts = s.includes('-') ? s.split('-') : [...s];
  return parts.map((p) => (p === 'x' || p === 'X' ? null : Number(p)));
}

export const INVERSION_NAMES = ['root position', '1st inversion', '2nd inversion', '3rd inversion'] as const;

/** Sets of `size` adjacent strings, low to high: [[0,1,2],[1,2,3],…]. */
export function adjacentStringSets(t: Tuning, size: number): number[][] {
  const out: number[][] = [];
  for (let lo = 0; lo + size <= t.strings.length; lo++) out.push(Array.from({ length: size }, (_, i) => lo + i));
  return out;
}
