import { Chord, functionInChord, identifyChord } from './chord';
import { Degree } from './interval';
import { PitchClass } from './pitch';
import { Scale, scaleNotes } from './scale';
import { Note } from './spelling';

export interface DiatonicChord {
  /** 1-based scale degree the chord is built on. */
  degree: number;
  roman: string;
  chord: Chord;
  tones: Note[];
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

function roman(degree: number, c: Chord): string {
  const base = NUMERALS[degree - 1];
  const minorish = c.type.formula.some((d) => d.number === 3 && d.acc === -1);
  const numeral = minorish ? base.toLowerCase() : base;
  switch (c.type.id) {
    case 'dim': return `${numeral}°`;
    case 'aug': return `${numeral}+`;
    case 'maj7': return `${numeral}maj7`;
    case 'm7':
    case 'dom7': return `${numeral}7`;
    case 'm7b5': return `${numeral}ø7`;
    case 'dim7': return `${numeral}°7`;
    default: return numeral;
  }
}

/**
 * Stack thirds on every degree of a 7-note scale (every other scale note).
 * Chord qualities are *identified* from the result, never looked up.
 */
export function harmonize(s: Scale, size: 3 | 4 = 3): DiatonicChord[] {
  const notes = scaleNotes(s);
  if (notes.length !== 7) {
    throw new Error(`Tertian harmonisation needs a 7-note scale; ${s.type.name} has ${notes.length}`);
  }
  const offsets = size === 3 ? [0, 2, 4] : [0, 2, 4, 6];
  return notes.map((root, i) => {
    const tones = offsets.map((k) => notes[(i + k) % 7]);
    const type = identifyChord(root, tones);
    if (!type) throw new Error(`Unrecognised stacked chord on degree ${i + 1}`);
    const chord: Chord = { root, type };
    return { degree: i + 1, roman: roman(i + 1, chord), chord, tones };
  });
}

/** The diatonic chord built on a given scale degree (1-based). */
export const diatonicChordOn = (s: Scale, degree: number, size: 3 | 4 = 3): DiatonicChord =>
  harmonize(s, size)[degree - 1];

export interface Containing {
  chord: DiatonicChord;
  fn: Degree;
}

/** Melody note → chord: every diatonic chord containing the pitch, and the pitch's function in it. */
export function diatonicChordsContaining(s: Scale, pc: PitchClass, size: 3 | 4 = 3): Containing[] {
  return harmonize(s, size).flatMap((dc) => {
    const fn = functionInChord(dc.chord, pc);
    return fn ? [{ chord: dc, fn }] : [];
  });
}

