import { ExerciseContext } from '../exercises/types';
import { crossesIrregularPair, positionsOf } from '../guitar/fretboard';
import { Tuning } from '../guitar/tuning';
import { chordType } from '../theory/chord';
import { PitchClass } from '../theory/pitch';
import { parseSkillId } from './skillId';

/*
 * A priori difficulty of a leaf skill, 0..1, for ordering only: the ladder inside a drill
 * introduces easier skills first. Nothing here reads the learner – it is the geometry of the
 * fretboard (high frets, the G/B pair, wide string skips), the shape of the chord (inversions,
 * dim/aug, extensions) and the position of a scale degree. 'Saite 6: Stammtöne' thus orders
 * E F G A B C D – frets 0–5 before 7–12.
 */

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Internal string index (0 = lowest) of a guitarist's string number. */
const internal = (t: Tuning, no: number): number => t.strings.length - no;

const BLACK_KEYS: readonly PitchClass[] = [1, 3, 6, 8, 10];

/** Scale degrees by how naturally they sit: chord tones of the tonic 0.2, the steps between 0.5, the leading tone 0.7. */
const melodyDegree = (deg: number): number => (deg === 7 ? 0.7 : deg % 2 === 1 ? 0.2 : 0.5);

/** 0..1, higher is harder; 0.5 for an id that is not a leaf skill. */
export function difficulty(skill: string, ctx: ExerciseContext): number {
  const p = parseSkillId(skill);
  if (!p) return 0.5;
  const t = ctx.tuning;
  switch (p.family) {
    case 'note': {
      const frets = positionsOf(t, p.pc, { ...ctx.range, strings: [internal(t, p.string)] }).map((q) => q.fret);
      const minFret = frets.length ? Math.min(...frets) : ctx.range.maxFret;
      return clamp01(0.6 * (minFret / 12) + 0.4 * (BLACK_KEYS.includes(p.pc) ? 1 : 0));
    }
    case 'interval': {
      const from = internal(t, p.from), to = internal(t, p.to);
      const offset = (p.dir === 'up' ? p.semitones : -p.semitones) - (t.strings[to] - t.strings[from]);
      return clamp01(
        0.3 * (crossesIrregularPair(t, from, to) ? 1 : 0)
        + 0.3 * (Math.abs(p.from - p.to) - 1)
        + 0.2 * (p.dir === 'down' ? 1 : 0)
        + 0.2 * Math.min(1, Math.abs(offset) / 4),
      );
    }
    case 'triad': {
      const idx = p.strings.map((no) => internal(t, no));
      const lowest = Math.max(...p.strings) === t.strings.length;
      return clamp01(
        0.25 * (p.inv / 2)
        + 0.3 * (p.type === 'dim' || p.type === 'aug' ? 1 : 0)
        + 0.25 * (crossesIrregularPair(t, Math.min(...idx), Math.max(...idx)) ? 1 : 0)
        + 0.2 * (lowest ? 1 : 0),
      );
    }
    case 'keys':
      return clamp01(0.3 * (p.inv / 2) + 0.4 * (p.type === 'dim' || p.type === 'aug' ? 1 : 0));
    case 'voicing': {
      const formula = chordType(p.type).formula;
      // Altered: a flat or sharp on anything but the chord-quality thirds and sevenths (b5, #9 …).
      const altered = formula.some((d) => d.acc !== 0 && d.number !== 3 && d.number !== 7);
      const thirteenth = formula.some((d) => d.number === 13);
      return clamp01(0.15 * (formula.length - 4) + 0.3 * (altered ? 1 : 0) + 0.2 * (thirteenth ? 1 : 0));
    }
    case 'melody':
      return clamp01(melodyDegree(p.deg) + (p.mode === 'minor' ? 0.1 : 0));
  }
}
