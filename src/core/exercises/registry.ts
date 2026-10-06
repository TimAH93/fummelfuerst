import { createRng } from './rng';
import {
  AutoResponse,
  DEFAULT_CONTEXT,
  Evaluation,
  Exercise,
  ExerciseContext,
  ExerciseFamily,
  Response,
  SelfRating,
} from './types';

// The registry is heterogeneous by nature; each family is typed at its own definition.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFamily = ExerciseFamily<any, any, any>;

const families = new Map<string, AnyFamily>();

export function registerFamily(f: AnyFamily): void {
  if (families.has(f.id)) throw new Error(`Exercise family already registered: ${f.id}`);
  families.set(f.id, f);
}

export function getFamily(id: string): AnyFamily {
  const f = families.get(id);
  if (!f) throw new Error(`Unknown exercise family: ${id}`);
  return f;
}

export const listFamilies = (): AnyFamily[] => [...families.values()];

/** Same family + seed + context + focus → the identical exercise, every time. */
export function generateExercise<P = unknown, S = unknown>(
  familyId: string,
  seed: number,
  context: ExerciseContext = DEFAULT_CONTEXT,
  focus?: unknown,
): Exercise<P, S> {
  const family = getFamily(familyId);
  const s = seed >>> 0;
  const { params, solution, skills } = family.generate(createRng(s), context, focus);
  return { id: `${family.id}#${s}`, family: family.id, seed: s, modes: family.modes, skills, context, params, solution };
}

const RATING_CORRECT: Record<SelfRating, boolean> = { miss: false, found: true, instant: true };

/** Self-ratings are taken at face value; everything else goes through the family's own check. */
export function evaluate(ex: Exercise, response: Response): Evaluation {
  if (response.kind === 'self') return { correct: RATING_CORRECT[response.rating], rating: response.rating };
  return getFamily(ex.family).check(ex, response);
}

export const solve = (ex: Exercise): AutoResponse => getFamily(ex.family).solve(ex);
export const describeExercise = (ex: Exercise): string => getFamily(ex.family).describe(ex);
