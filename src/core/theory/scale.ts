import { Degree, degreeToString, parseFormula, transpose } from './interval';
import { PitchClass } from './pitch';
import { Note, asNote, notePc, noteName } from './spelling';

export interface ScaleType {
  id: string;
  name: string;
  formula: Degree[];
}

const def = (id: string, name: string, formula: string): ScaleType => ({
  id,
  name,
  formula: parseFormula(formula),
});

/** Adding a scale or mode = adding one line here. Nothing else changes. */
export const SCALE_TYPES: Record<string, ScaleType> = {
  major: def('major', 'Major', '1 2 3 4 5 6 7'),
  naturalMinor: def('naturalMinor', 'Natural minor', '1 2 b3 4 5 b6 b7'),
  majorPentatonic: def('majorPentatonic', 'Major pentatonic', '1 2 3 5 6'),
  minorPentatonic: def('minorPentatonic', 'Minor pentatonic', '1 b3 4 5 b7'),
};

export interface Scale {
  tonic: Note;
  type: ScaleType;
}

export function scale(tonic: Note | string, typeId: string): Scale {
  const type = SCALE_TYPES[typeId];
  if (!type) throw new Error(`Unknown scale type: ${typeId}`);
  return { tonic: asNote(tonic), type };
}

export const scaleNotes = (s: Scale): Note[] => s.type.formula.map((d) => transpose(s.tonic, d));
export const scalePcs = (s: Scale): PitchClass[] => scaleNotes(s).map(notePc);
export const scaleNoteNames = (s: Scale): string[] => scaleNotes(s).map((n) => noteName(n));
export const scaleContains = (s: Scale, pc: PitchClass): boolean => scalePcs(s).includes(pc);

/** 1-based scale degree of a pitch class, or null when it is outside the scale. */
export function scaleDegreeOf(s: Scale, pc: PitchClass): { index: number; degree: string } | null {
  const i = scalePcs(s).indexOf(pc);
  return i < 0 ? null : { index: i + 1, degree: degreeToString(s.type.formula[i]) };
}

export const scaleName = (s: Scale): string => `${noteName(s.tonic)} ${s.type.name.toLowerCase()}`;
