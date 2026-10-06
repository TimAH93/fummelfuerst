import { FretPos, pitchAt } from '../../guitar/fretboard';
import { Degree, defaultDegree, degreeToString, intervalInfo, parseDegree, transpose, transposeDown } from '../../theory/interval';
import { toPc } from '../../theory/pitch';
import { Note, noteName } from '../../theory/spelling';
import { assertFocus, drillSpellings, stringNo } from '../common';
import { ExerciseFamily, checkPositions } from '../types';

export type Direction = 'up' | 'down';

/** "From C (string 5, fret 3) a major 3rd up – on string 4." In position, exact octave. */
export interface IntervalHuntParams {
  from: FretPos;
  fromNote: Note;
  /** 1–12, simple intervals only. */
  semitones: number;
  direction: Direction;
  targetString: number;
  /** Spelled degree used for naming the target (tritone may be b5 or #4). */
  degree: Degree;
}

export interface IntervalHuntSolution {
  position: FretPos;
  note: Note;
}

export interface IntervalHuntFocus {
  semitones?: number;
  direction?: Direction;
  fromString?: number;
  targetString?: number;
}

const MAX_TRIES = 500;

/**
 * Interval shapes are about the hand's grid, so the open string counts as fret 0 here:
 * open A → low E fret 12 is playable, but it is not the fifth shape we want to drill.
 */
export const intervalInPosition = (fromFret: number, toFret: number, maxSpan: number): boolean =>
  Math.abs(fromFret - toFret) + 1 <= maxSpan;

/** Spelling of start note + interval with the fewest accidentals overall; ties broken by rng. */
function spell(pc: number, semitones: number, direction: Direction, pick: <T>(xs: readonly T[]) => T) {
  const degrees = semitones === 6 ? [parseDegree('b5'), parseDegree('#4')] : [defaultDegree(semitones)];
  const options = drillSpellings(pc).flatMap((fromNote) =>
    degrees.map((degree) => {
      const target = direction === 'up' ? transpose(fromNote, degree) : transposeDown(fromNote, degree);
      return { fromNote, degree, target, cost: Math.abs(fromNote.acc) + Math.abs(target.acc) };
    }),
  );
  const best = Math.min(...options.map((o) => o.cost));
  return pick(options.filter((o) => o.cost === best));
}

export const intervalHunt: ExerciseFamily<IntervalHuntParams, IntervalHuntSolution, IntervalHuntFocus> = {
  id: 'interval-hunt',
  name: 'Interval hunt',
  modes: ['play', 'tap'],
  tempo: { fastMs: 2500, slowMs: 10000 },

  generate(rng, ctx, focus = {}) {
    const { tuning, range, maxSpan } = ctx;
    const strings = range.strings ?? tuning.strings.map((_, i) => i);
    assertFocus(focus.semitones === undefined || (focus.semitones >= 1 && focus.semitones <= 12), 'interval-hunt', `semitones ${focus.semitones}`);
    const semitones = focus.semitones ?? rng.int(1, 12);
    const direction = focus.direction ?? rng.pick<Direction>(['up', 'down']);

    for (let i = 0; i < MAX_TRIES; i++) {
      const fromString = focus.fromString ?? rng.pick(strings);
      const from = { string: fromString, fret: rng.int(range.minFret, range.maxFret) };
      const wanted = pitchAt(tuning, from) + (direction === 'up' ? semitones : -semitones);
      const targets = strings
        .filter((s) => s !== fromString && (focus.targetString === undefined || s === focus.targetString))
        .map((s) => ({ string: s, fret: wanted - tuning.strings[s] }))
        .filter((p) => p.fret >= range.minFret && p.fret <= range.maxFret && intervalInPosition(from.fret, p.fret, maxSpan));
      if (targets.length === 0) continue;

      const position = rng.pick(targets);
      const { fromNote, degree, target } = spell(toPc(pitchAt(tuning, from)), semitones, direction, rng.pick);
      return {
        params: { from, fromNote, semitones, direction, targetString: position.string, degree },
        solution: { position, note: target },
        skills: [
          `interval:${intervalInfo(semitones).degree}/${direction}/strings:${stringNo(tuning, fromString)}-${stringNo(tuning, position.string)}`,
        ],
      };
    }
    throw new Error(`interval-hunt: no in-position answer for focus ${JSON.stringify(focus)}`);
  },

  skillSpace({ tuning, range, maxSpan }) {
    const strings = range.strings ?? tuning.strings.map((_, i) => i);
    const out: { skill: string; focus: IntervalHuntFocus }[] = [];
    for (let semitones = 1; semitones <= 12; semitones++)
      for (const direction of ['up', 'down'] as Direction[])
        for (const fromString of strings)
          for (const targetString of strings) {
            if (fromString === targetString) continue;
            const step = direction === 'up' ? semitones : -semitones;
            let feasible = false;
            for (let f = range.minFret; f <= range.maxFret && !feasible; f++) {
              const g = tuning.strings[fromString] + f + step - tuning.strings[targetString];
              feasible = g >= range.minFret && g <= range.maxFret && intervalInPosition(f, g, maxSpan);
            }
            if (!feasible) continue;
            out.push({
              skill: `interval:${intervalInfo(semitones).degree}/${direction}/strings:${stringNo(tuning, fromString)}-${stringNo(tuning, targetString)}`,
              focus: { semitones, direction, fromString, targetString },
            });
          }
    return out;
  },

  check(ex, r) {
    if (r.kind !== 'positions') return { correct: false };
    const { tuning, range } = ex.context;
    const { from, semitones, direction, targetString } = ex.params;
    const wanted = pitchAt(tuning, from) + (direction === 'up' ? semitones : -semitones);
    return checkPositions(
      r.positions,
      (p) => p.string === targetString && p.fret >= range.minFret && p.fret <= range.maxFret && pitchAt(tuning, p) === wanted,
      1,
      true,
    );
  },

  solve: (ex) => ({ kind: 'positions', positions: [ex.solution.position] }),

  describe: (ex) => {
    const { from, fromNote, semitones, direction, targetString, degree } = ex.params;
    const t = ex.context.tuning;
    return `${intervalInfo(semitones).name} (${degreeToString(degree)}) ${direction} from ${noteName(fromNote)} ` +
      `[string ${stringNo(t, from.string)}, fret ${from.fret}] on string ${stringNo(t, targetString)} → ${noteName(ex.solution.note)}`;
  },
};
