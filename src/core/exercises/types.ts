import { FretPos, FretRange } from '../guitar/fretboard';
import { STANDARD, Tuning } from '../guitar/tuning';
import { Rng } from './rng';

/**
 * 'tap'  – answered on screen and checked automatically (fretboard taps, chord chips).
 * 'play' – played on the guitar, then revealed and self-rated.
 */
export type AnswerMode = 'tap' | 'play';

/** Self-rating after the reveal: missed it / found it / knew it instantly. */
export type SelfRating = 'miss' | 'found' | 'instant';

/** Answers a family can check on its own. */
export type AutoResponse =
  | { kind: 'positions'; positions: FretPos[] }
  | { kind: 'choices'; ids: string[] };

export type Response = AutoResponse | { kind: 'self'; rating: SelfRating };

export interface Evaluation {
  correct: boolean;
  /** Present only for self-rated answers. */
  rating?: SelfRating;
  /** Correct items given, wrong items given, correct items left out (auto-checked only). */
  hits?: number;
  wrong?: number;
  missed?: number;
}

/** Everything a generator may depend on besides the seed. Plain data, serialisable. */
export interface ExerciseContext {
  tuning: Tuning;
  /** Frets that answers may use. */
  range: FretRange;
  /** Largest fret stretch for "in position" answers (spec: ≤ 4). */
  maxSpan: number;
}

export const DEFAULT_CONTEXT: ExerciseContext = {
  tuning: STANDARD,
  range: { minFret: 0, maxFret: 12 },
  maxSpan: 4,
};

/**
 * A generated exercise. `params` is the question, `solution` is what the reveal shows.
 * Both are plain data so an exercise can be logged, stored, or regenerated from its seed.
 */
export interface Exercise<P = unknown, S = unknown> {
  /** `${family}#${seed}` – unique for a given context and focus. */
  id: string;
  family: string;
  seed: number;
  modes: AnswerMode[];
  /** Most specific skill ids this exercise trains, e.g. 'interval:b3/up/strings:5-4'. */
  skills: string[];
  context: ExerciseContext;
  params: P;
  solution: S;
}

export interface Generated<P, S> {
  params: P;
  solution: S;
  skills: string[];
}

/**
 * One exercise family. `focus` pins any subset of the question so the learner model
 * can target a weak skill; everything left open is drawn from the rng.
 */
export interface ExerciseFamily<P, S, F = Partial<P>> {
  id: string;
  name: string;
  modes: AnswerMode[];
  /** Answer times that count as fast / slow; the learner model scores tempo between them. */
  tempo: { fastMs: number; slowMs: number };
  generate(rng: Rng, ctx: ExerciseContext, focus?: F): Generated<P, S>;
  /** Independent check of an answer – must not trust `ex.solution`. */
  check(ex: Exercise<P, S>, response: AutoResponse): Evaluation;
  /** The canonical correct answer, as the reveal would show it. */
  solve(ex: Exercise<P, S>): AutoResponse;
  /** One-line English summary for logs and debugging, not UI copy. */
  describe(ex: Exercise<P, S>): string;
}

/** Shared rule for position answers: each given position is right or wrong. */
export function checkPositions(
  given: FretPos[],
  isRight: (p: FretPos) => boolean,
  expectedCount: number,
  requireAll: boolean,
): Evaluation {
  const unique = given.filter((p, i) => given.findIndex((q) => q.string === p.string && q.fret === p.fret) === i);
  const hits = unique.filter(isRight).length;
  const wrong = unique.length - hits;
  const missed = Math.max(0, expectedCount - hits);
  const correct = hits > 0 && wrong === 0 && (!requireAll || missed === 0);
  return { correct, hits, wrong, missed };
}
