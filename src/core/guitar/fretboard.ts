import { Midi, PitchClass, toPc } from '../theory/pitch';
import { Tuning } from './tuning';

/** string 0 = lowest string. */
export interface FretPos {
  string: number;
  fret: number;
}

export interface FretRange {
  minFret: number;
  maxFret: number;
  /** Restrict to these string indices; all strings when omitted. */
  strings?: number[];
}

export const DEFAULT_RANGE: FretRange = { minFret: 0, maxFret: 15 };

export const pitchAt = (t: Tuning, p: FretPos): Midi => t.strings[p.string] + p.fret;
export const pcAt = (t: Tuning, p: FretPos): PitchClass => toPc(pitchAt(t, p));
export const samePos = (a: FretPos, b: FretPos): boolean => a.string === b.string && a.fret === b.fret;

function* allPositions(t: Tuning, r: FretRange): Generator<FretPos> {
  const strings = r.strings ?? t.strings.map((_, i) => i);
  for (const string of strings) for (let fret = r.minFret; fret <= r.maxFret; fret++) yield { string, fret };
}

/** Every location of a pitch class in the range, ordered by string then fret. */
export const positionsOf = (t: Tuning, pc: PitchClass, r: FretRange = DEFAULT_RANGE): FretPos[] =>
  [...allPositions(t, r)].filter((p) => pcAt(t, p) === toPc(pc));

/** Every location of an exact pitch (unison positions). */
export const positionsOfMidi = (t: Tuning, midi: Midi, r: FretRange = DEFAULT_RANGE): FretPos[] =>
  [...allPositions(t, r)].filter((p) => pitchAt(t, p) === midi);

/** Semitones between string s and the next-higher string (5 everywhere in standard, 4 for G→B). */
export const stringGap = (t: Tuning, s: number): number => t.strings[s + 1] - t.strings[s];

/**
 * True when moving between two strings crosses a pair that is not a perfect fourth
 * (in standard tuning: the G/B major third). Generalises to any tuning.
 */
export function crossesIrregularPair(t: Tuning, a: number, b: number): boolean {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  for (let s = lo; s < hi; s++) if (stringGap(t, s) !== 5) return true;
  return false;
}

/** Hand-movement distance between two positions. */
export const handDistance = (a: FretPos, b: FretPos): number =>
  Math.abs(a.fret - b.fret) + Math.abs(a.string - b.string);

export interface IntervalSearch {
  direction?: 'up' | 'down' | 'either';
  /** Allow the interval plus whole octaves (a 10th counts as a 3rd). */
  compound?: boolean;
  range?: FretRange;
}

/**
 * Interval Hunt core: positions a given interval away from `from`.
 * Direction applies to the interval: down a major 3rd from C is Ab.
 */
export function findInterval(t: Tuning, from: FretPos, semitones: number, opts: IntervalSearch = {}): FretPos[] {
  const { direction = 'up', compound = false, range = DEFAULT_RANGE } = opts;
  const base = pitchAt(t, from);
  const wanted = (d: number): boolean => {
    const ok = (signed: number): boolean => {
      if (signed < 0) return false;
      if (compound) return signed % 12 === semitones % 12 && signed >= semitones;
      return signed === semitones;
    };
    if (direction === 'up') return ok(d);
    if (direction === 'down') return ok(-d);
    return ok(d) || ok(-d);
  };
  return [...allPositions(t, range)].filter((p) => !samePos(p, from) && wanted(pitchAt(t, p) - base));
}

/** Nearest results first (hand distance, then pitch distance). */
export function nearestInterval(t: Tuning, from: FretPos, semitones: number, opts: IntervalSearch = {}): FretPos[] {
  const base = pitchAt(t, from);
  return findInterval(t, from, semitones, opts).sort(
    (a, b) =>
      handDistance(from, a) - handDistance(from, b) ||
      Math.abs(pitchAt(t, a) - base) - Math.abs(pitchAt(t, b) - base),
  );
}
