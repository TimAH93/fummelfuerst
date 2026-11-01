import { generateExercise, getFamily, listFamilies } from '../exercises/registry';
import { Rng } from '../exercises/rng';
import { DEFAULT_CONTEXT, Exercise, ExerciseContext } from '../exercises/types';
import { HelpLevel } from '../exercises/attempt';
import { belief, forgetPressure, knowledge, priorFor } from './belief';
import { DEFAULT_MODEL, ModelConfig } from './config';
import { difficulty } from './difficulty';
import { LearnerState, SkillStats, helpLevelFor } from './model';
import { Edge, buildEdges } from './relations';

/*
 * Which skill to ask next. The catalog lists every trainable leaf skill with its transfer
 * edges and a priori difficulty; selection draws one by weight – weakness (time-free belief
 * with the transfer prior), forgetting pressure (time only), novelty – damped for skills just
 * asked and raised for confusables a diagnosis boosted. Inside a drill the ladder admits
 * unseen skills two at a time, easiest first. Never argmax: every admitted skill keeps a
 * chance, and all randomness comes from the supplied Rng in a stable order (one `rng.pick`
 * over families, one `rng.next()` for the skill, one `rng.uint32()` for the exercise seed).
 */

// ── Catalog ──

export interface CatalogEntry {
  family: string;
  skill: string;
  /** Generator focus that produces exactly this skill. */
  focus: unknown;
  /** Transfer edges into the same catalog (relations.ts). */
  edges: Edge[];
  /** A priori difficulty 0..1, for the ladder order only. */
  difficulty: number;
}

/** All trainable leaf skills for a context, with edges and difficulty. Build once per session; it does not change. */
export function buildCatalog(ctx: ExerciseContext = DEFAULT_CONTEXT, families = listFamilies().map((f) => f.id)): CatalogEntry[] {
  const targets = families.flatMap((family) => getFamily(family).skillSpace(ctx).map((t) => ({ family, skill: t.skill, focus: t.focus })));
  const edges = buildEdges(targets.map((t) => t.skill), ctx);
  return targets.map((t) => ({ ...t, edges: edges[t.skill] ?? [], difficulty: difficulty(t.skill, ctx) }));
}

// ── Weights ──

export interface SelectOptions {
  now: number;
  /** Restrict to these families (the session's choice). */
  families?: string[];
  /** Max skills "in learning" (seen, knowledge < cfg.learningDone) per family before new ones are introduced; default cfg.maxLearningFree. */
  maxLearning?: number;
  /** Rank unseen skills by difficulty (minus transfer) and admit only the two easiest. */
  ladder?: boolean;
  /** False never introduces an unseen skill (review picks). */
  allowNew?: boolean;
  weights?: Partial<ModelConfig['weights']>;
  cfg?: ModelConfig;
}

/** What `skillWeight` needs to know about the pool: may it introduce this skill, and where it sits on the ladder. */
export interface WeightOptions {
  allowNew: boolean;
  /** Ladder rank among the pool's unseen skills (0 = easiest); undefined when the ladder is off. */
  rank?: number;
  cfg?: ModelConfig;
}

/** A skill counts as seen once it has quiz evidence; play-only skills stay unseen for the ladder. */
export const seen = (s: SkillStats | undefined): s is SkillStats => s !== undefined && s.n > 0;

/** Mean of the transfer prior alone: what the neighbours say about a skill before any answer. */
export function priorMean(entry: CatalogEntry, skills: Record<string, SkillStats>, cfg: ModelConfig = DEFAULT_MODEL): number {
  const p = priorFor(entry.edges, skills, cfg);
  return p.a0 / (p.a0 + p.b0);
}

/**
 * Selection weight of one skill (§7.1). Exposed for the progress view and for tests.
 * Unseen: fresh (ladder: rank 0 fresh, rank 1 fresh × ladderSecond, else 0), or 0 when new
 * skills are not allowed. Seen: weak × (1 − effective belief) + forget × pressure + floor.
 * Then × recent when just asked, × boost while a diagnosis has it boosted.
 */
export function skillWeight(state: LearnerState, e: CatalogEntry, now: number, opts: WeightOptions): number {
  const cfg = opts.cfg ?? DEFAULT_MODEL;
  const w = cfg.weights;
  const s = state.skills[e.skill];
  let weight: number;
  if (!seen(s)) {
    if (!opts.allowNew) weight = 0;
    else if (opts.rank === undefined) weight = w.fresh;
    else weight = opts.rank === 0 ? w.fresh : opts.rank === 1 ? w.fresh * w.ladderSecond : 0;
  } else {
    const eff = belief(s, priorFor(e.edges, state.skills, cfg)).low * (cfg.fluFloor + (1 - cfg.fluFloor) * s.flu);
    weight = w.weak * (1 - eff) + w.forget * forgetPressure(s, now, cfg) + w.floor;
  }
  if (state.recent.includes(e.skill)) weight *= w.recent;
  const until = state.boost[e.skill];
  if (until !== undefined && until > now) weight *= w.boost;
  return weight;
}

/**
 * Ladder ranks of a pool's unseen entries: by difficulty − cfg.ladderTransfer × (priorMean − 0.5)
 * ascending, ties by catalog order. Seen entries get no rank.
 */
export function ladderRanks(state: LearnerState, entries: CatalogEntry[], cfg: ModelConfig = DEFAULT_MODEL): (number | undefined)[] {
  const unseen = entries
    .map((e, index) => ({ e, index }))
    .filter(({ e }) => !seen(state.skills[e.skill]))
    .map(({ e, index }) => ({ index, key: e.difficulty - cfg.ladderTransfer * (priorMean(e, state.skills, cfg) - 0.5) }))
    .sort((p, q) => p.key - q.key || p.index - q.index);
  const ranks: (number | undefined)[] = entries.map(() => undefined);
  unseen.forEach(({ index }, rank) => { ranks[index] = rank; });
  return ranks;
}

function weightedPick<T>(rng: Rng, items: T[], weights: number[]): T | undefined {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return undefined;
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) if ((r -= weights[i]) < 0) return items[i];
  return items[items.length - 1];
}

/** The config a selection call runs with: per-call weight overrides merged in. */
const configOf = (opts: SelectOptions): ModelConfig => {
  const base = opts.cfg ?? DEFAULT_MODEL;
  return opts.weights ? { ...base, weights: { ...base.weights, ...opts.weights } } : base;
};

// ── Selection ──

/**
 * Pick the next skill: a family uniformly (among those offered), then a skill inside it
 * with probability proportional to its weight. Never argmax. New skills enter only while
 * fewer than `maxLearning` of the family's skills are in learning.
 */
export function selectSkill(state: LearnerState, catalog: CatalogEntry[], rng: Rng, opts: SelectOptions): CatalogEntry {
  const cfg = configOf(opts);
  const maxLearning = opts.maxLearning ?? cfg.maxLearningFree;
  const pool = opts.families ? catalog.filter((c) => opts.families!.includes(c.family)) : catalog;
  const byFamily = new Map<string, CatalogEntry[]>();
  for (const c of pool) byFamily.set(c.family, [...(byFamily.get(c.family) ?? []), c]);

  const scored = [...byFamily.entries()].map(([family, entries]) => {
    const learning = entries.filter((e) => seen(state.skills[e.skill]) && knowledge(state.skills[e.skill]) < cfg.learningDone).length;
    const allowNew = (opts.allowNew ?? true) && learning < maxLearning;
    const ranks = opts.ladder ? ladderRanks(state, entries, cfg) : undefined;
    return { family, entries, weights: entries.map((e, i) => skillWeight(state, e, opts.now, { allowNew, rank: ranks?.[i], cfg })) };
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

/** Selection + generation in one step; the exercise seed comes from the session rng. Free mode: no ladder, cfg.maxLearningFree. */
export function nextExercise(
  state: LearnerState, catalog: CatalogEntry[], rng: Rng, opts: SelectOptions, ctx: ExerciseContext = DEFAULT_CONTEXT,
): NextExercise {
  const target = selectSkill(state, catalog, rng, opts);
  const exercise = generateExercise(target.family, rng.uint32(), ctx, target.focus);
  return { exercise, helpLevel: helpLevelFor(state, target.skill), target };
}
