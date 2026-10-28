import { drillSpellings } from '../exercises/common';
import { Key, ProgChord } from '../song/analysis';
import { Chord, chord, chordPcs, chordTones } from '../theory/chord';
import { degreeSemitones, degreeToString } from '../theory/interval';
import { PitchClass, toPc } from '../theory/pitch';
import { notePc } from '../theory/spelling';
import { scalePcs, scale } from '../theory/scale';
import { Frets, Voicing, findVoicings, tab } from '../voicing/voicing';
import { FretPos, pcAt } from './fretboard';
import { Tuning } from './tuning';

/*
 * Guitar grips for the chords on the pads, and the capo that makes them easy: with a capo on
 * fret c, a shape that is chord X at the nut sounds as X + c. So Dbmaj9 · C7#9 · Fm9 · Ebm9 · Ab13
 * with the capo on 1 is played as Cmaj9 · B7#9 · Em9 · Dm9 · G13 – open-position shapes.
 */

/** Root spelling with the fewest accidentals in the chord tones; flats on a tie (Ebm7, not D#m7). */
export function simplestChord(pc: PitchClass, typeId: string): Chord {
  const options = drillSpellings(pc).map((root) => ({ root, cost: chordTones(chord(root, typeId)).reduce((a, n) => a + Math.abs(n.acc), 0) }));
  const best = Math.min(...options.map((o) => o.cost));
  const tied = options.filter((o) => o.cost === best);
  return chord((tied.find((o) => o.root.acc <= 0) ?? tied[0]).root, typeId);
}

export const transposeChord = (c: Chord, semitones: number): Chord => simplestChord(toPc(notePc(c.root) + semitones), c.type.id);

/** When the full chord has no easy grip, this is the next simpler sound with the same colour. */
const SIMPLER: Record<string, string> = { maj9: 'maj7', m9: 'm7', dom9: 'dom7', dom13: 'dom7', dom7s9: 'dom7', m7b5: 'dim', dim7: 'dim' };

export interface Grip {
  /** What the shape is at the nut (Cmaj9 when the capo makes it sound as Dbmaj9). */
  shape: Chord;
  /** The chord actually asked for, before any simplification. */
  wanted: Chord;
  /** The chord the grip plays (equal to `wanted` unless simplified). */
  plays: Chord;
  simplified: boolean;
  frets: Frets;
  tab: string;
  fingers: number;
  /** Degree label per string ('1', 'b7', null for a muted string). */
  labels: (string | null)[];
  cost: number;
}

/**
 * Lower is easier: fingers, position and stretch cost; open strings and more strings help;
 * a bass that is not the root costs, because that is not the chord a strummer means.
 */
export function gripCost(v: Voicing): number {
  const fretted = v.frets.filter((f): f is number => f !== null && f > 0);
  const open = v.frets.filter((f) => f === 0).length;
  const strings = v.frets.filter((f) => f !== null).length;
  const low = fretted.length ? Math.min(...fretted) : 0;
  // Muted strings above the played ones are in the way of a strum; muted bass strings are just skipped.
  const highMuted = v.frets.length - 1 - v.frets.map((f) => f !== null).lastIndexOf(true);
  return v.fingers * 1.5 + low * 0.8 + (v.span > 3 ? 2 : 0) - open * 0.5 - Math.max(0, strings - 4) * 0.7 + (strings < 4 ? 1.5 : 0) + highMuted + (v.inversion !== 0 ? 3 : 0);
}

function describe(t: Tuning, v: Voicing, shape: Chord, wanted: Chord, plays: Chord, simplified: boolean): Grip {
  const pcs = chordPcs(shape);
  const labels = v.frets.map((f, s) => (f === null ? null : degreeToString(shape.type.formula[pcs.indexOf(pcAt(t, { string: s, fret: f }))])));
  return { shape, wanted, plays, simplified, frets: v.frets, tab: tab(v.frets), fingers: v.fingers, labels, cost: gripCost(v) };
}

/** Chord tones a strummed grip may leave out: the fifth, and the ninth of a 13th chord. */
function optionalTones(c: Chord): PitchClass[] {
  const root = notePc(c.root);
  return c.type.formula
    .filter((d) => (d.number === 5 && d.acc === 0) || (d.number === 9 && c.type.id === 'dom13'))
    .map((d) => toPc(root + degreeSemitones(d)));
}

/**
 * The easiest strummable grip for a chord shape at the nut: root in the bass, open position
 * first (frets 0–4), then anywhere up to the 9th fret; at least four strings, no muted string
 * inside. Falls back to the next simpler chord type when the full colour has no grip.
 */
export function gripFor(t: Tuning, c: Chord, wanted: Chord = c, simplified = false): Grip | null {
  const search = (maxFret: number, minStrings: number) =>
    findVoicings(t, c, { maxFret, minStrings, maxSpan: 4, innerMutes: false, inversion: 0, optional: optionalTones(c) })
      .map((v) => ({ v, cost: gripCost(v) + (maxFret > 4 ? 1 : 0) }))
      .sort((a, b) => a.cost - b.cost)[0];
  const found = search(4, 4) ?? search(9, 4) ?? search(9, 3);
  if (found) return describe(t, found.v, c, wanted, c, simplified);
  const simpler = SIMPLER[c.type.id];
  return simpler ? gripFor(t, chord(c.root, simpler), wanted, true) : null;
}

export interface CapoPlan {
  capo: number;
  grips: (Grip | null)[];
  cost: number;
}

/** Grips for every chord with the capo on `capo`; shapes are the chords transposed down. */
export function planCapo(t: Tuning, chords: Chord[], capo: number): CapoPlan {
  const grips = chords.map((c) => gripFor(t, transposeChord(c, -capo), c));
  // A capo costs a little per fret: it only wins when it clearly saves barres.
  const cost = grips.reduce((a, g) => a + (g ? g.cost + (g.simplified ? 4 : 0) : 30), 0) + capo * 1.2;
  return { capo, grips, cost };
}

/** Every capo position 0–`maxCapo`, easiest first. */
export function capoPlans(t: Tuning, chords: Chord[], maxCapo = 7): CapoPlan[] {
  return Array.from({ length: maxCapo + 1 }, (_, c) => planCapo(t, chords, c)).sort((a, b) => a.cost - b.cost || a.capo - b.capo);
}

export const chordsOf = (progs: ProgChord[]): Chord[] => progs.map((p) => simplestChord(p.rootPc, p.typeId));

export interface SoloDot extends FretPos {
  label?: string;
  kind: 'answer' | 'given' | 'alt';
}

/**
 * Scale dots for playing over the loop, frets counted from the capo: scale tones as small dots,
 * the chord's tones labelled by degree (3rd and 7th are the targets), the root marked.
 */
export function soloBoard(t: Tuning, key: Key, capo: number, pentatonic: boolean, over: Chord | null, maxFret = 12): SoloDot[] {
  const tonicPc = toPc(notePc(key.tonic) - capo);
  const typeId = pentatonic ? (key.mode === 'major' ? 'majorPentatonic' : 'minorPentatonic') : key.mode;
  const scalePcSet = new Set(scalePcs(scale(simplestChord(tonicPc, 'maj').root, typeId)));
  const shape = over ? transposeChord(over, -capo) : null;
  const chordPcList = shape ? chordPcs(shape) : [];
  const dots: SoloDot[] = [];
  for (let string = 0; string < t.strings.length; string++) {
    for (let fret = 0; fret <= maxFret; fret++) {
      const pc = pcAt(t, { string, fret });
      const i = chordPcList.indexOf(pc);
      if (i >= 0 && shape) {
        const d = shape.type.formula[i];
        dots.push({ string, fret, label: degreeToString(d), kind: d.number === 3 || d.number === 7 ? 'answer' : 'given' });
      } else if (scalePcSet.has(pc)) dots.push({ string, fret, kind: pc === tonicPc ? 'given' : 'alt', label: pc === tonicPc ? 'R' : undefined });
    }
  }
  return dots;
}
