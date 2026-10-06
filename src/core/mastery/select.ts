import { generateExercise, getFamily, listFamilies } from '../exercises/registry';
import { Rng } from '../exercises/rng';
import { DEFAULT_CONTEXT, Exercise, ExerciseContext } from '../exercises/types';
import { HelpLevel } from '../exercises/attempt';
import { LearnerState, helpLevelFor, mastery } from './model';

export interface CatalogEntry {
  family: string;
  skill: string;
  focus: unknown;
}

/** All trainable leaf skills for a context. Build once per session; it does not change. */
export function buildCatalog(ctx: ExerciseContext = DEFAULT_CONTEXT, families = listFamilies().map((f) => f.id)): CatalogEntry[] {
  return families.flatMap((family) => getFamily(family).skillSpace(ctx).map((t) => ({ family, skill: t.skill, focus: t.focus })));
}

export interface SelectOptions {
  now: number;
  /** Restrict to these families (the session's choice). */
  families?: string[];
  /** Max skills "in learning" (seen, box < 2) per family before new ones are introduced. */
  maxLearning?: number;
  weights?: Partial<typeof DEFAULT_WEIGHTS>;
}

export const DEFAULT_WEIGHTS = {
  weak: 1,
  due: 0.8,
  fresh: 0.6,
  /** Every seen skill keeps a little chance, so nothing disappears entirely. */
  floor: 0.03,
  /** Multiplier for a skill among the last few. */
  recent: 0.1,
};

/** Selection weight of one skill. Exposed for the progress view and for tests. */
export function skillWeight(state: LearnerState, skill: string, now: number, allowNew: boolean, w = DEFAULT_WEIGHTS): number {
  const s = state.skills[skill];
  let weight: number;
  if (!s) weight = allowNew ? w.fresh : 0;
  else weight = w.weak * (1 - mastery(s)) + (now >= s.due ? w.due : 0) + w.floor;
  return state.recent.includes(skill) ? weight * w.recent : weight;
}

function weightedPick<T>(rng: Rng, items: T[], weights: number[]): T | undefined {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return undefined;
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) if ((r -= weights[i]) < 0) return items[i];
  return items[items.length - 1];
}

/**
 * Pick the next skill: a family uniformly (among those offered), then a skill inside it
 * with probability proportional to weakness + due + novelty − recency. Never argmax.
 */
export function selectSkill(state: LearnerState, catalog: CatalogEntry[], rng: Rng, opts: SelectOptions): CatalogEntry {
  const w = { ...DEFAULT_WEIGHTS, ...opts.weights };
  const maxLearning = opts.maxLearning ?? 8;
  const pool = opts.families ? catalog.filter((c) => opts.families!.includes(c.family)) : catalog;
  const byFamily = new Map<string, CatalogEntry[]>();
  for (const c of pool) byFamily.set(c.family, [...(byFamily.get(c.family) ?? []), c]);

  const scored = [...byFamily.entries()].map(([family, entries]) => {
    const learning = entries.filter((e) => state.skills[e.skill] && state.skills[e.skill].box < 2).length;
    const allowNew = learning < maxLearning;
    return { family, entries, weights: entries.map((e) => skillWeight(state, e.skill, opts.now, allowNew, w)) };
  }).filter((f) => f.weights.some((x) => x > 0));
  if (scored.length === 0) throw new Error('Nothing to practise in the selected families');

  const fam = rng.pick(scored);
  return weightedPick(rng, fam.entries, fam.weights)!;
}

export interface NextExercise {
  exercise: Exercise;
  helpLevel: HelpLevel;
  target: CatalogEntry;
}

/** Selection + generation in one step; the exercise seed comes from the session rng. */
export function nextExercise(
  state: LearnerState, catalog: CatalogEntry[], rng: Rng, opts: SelectOptions, ctx: ExerciseContext = DEFAULT_CONTEXT,
): NextExercise {
  const target = selectSkill(state, catalog, rng, opts);
  const exercise = generateExercise(target.family, rng.uint32(), ctx, target.focus);
  return { exercise, helpLevel: helpLevelFor(state, target.skill), target };
}
