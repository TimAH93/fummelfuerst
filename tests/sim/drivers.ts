import {
  Drill,
  TrackId,
  buildCurriculum,
  hasSlipped,
  markPassed,
  nextSessionExercise,
  planSession,
  recommendDrill,
} from '../../src/core/curriculum/curriculum';
import { Attempt, DEFAULT_CONTEXT, Exercise, ExerciseContext, HelpLevel, Rng } from '../../src/core/exercises';
import { knowledge as knowledgeOf, recall as recallOf } from '../../src/core/mastery/belief';
import { DEFAULT_MODEL, ModelConfig } from '../../src/core/mastery/config';
import { LearnerState, applyAttempt, emptyState, helpLevelFor } from '../../src/core/mastery/model';
import { applyPlay, jamEvent } from '../../src/core/mastery/play';
import { TRANSFER_S, TransferStrengths, buildEdges } from '../../src/core/mastery/relations';
import { buildCatalog } from '../../src/core/mastery/select';
import { SimPlay } from './world';
import * as v1 from './v1/curriculum';
import * as v1model from './v1/model';
import * as v1select from './v1/select';

/**
 * What the runner needs from a learner model (spec §9.2): one Driver per model version, each
 * wrapping its own state type behind `unknown`. The v1 driver wraps the frozen copy under
 * tests/sim/v1/ so `npm run baseline` reproduces the "before" numbers after v2 lands; the v2
 * driver wraps the real model (planSession / nextSessionExercise, applyAttempt + markPassed,
 * applyPlay) and takes a ModelConfig and a transfer-strength table, so `npm run calibrate`
 * can sweep both.
 */

/** The part of a Drill both curriculum versions share. */
export interface SimDrill {
  id: string;
  track: string;
  title: string;
  family: string;
  skills: string[];
}

export interface Tempo {
  fastMs: number;
  slowMs: number;
}

export interface NextPick {
  exercise: Exercise;
  helpLevel: HelpLevel;
  /** The review drill this pick came from (v2 mixed sessions). */
  review?: SimDrill;
}

export interface Driver {
  name: 'v1' | 'v2';
  /** Built once per driver from the context. */
  catalogIds: string[];
  curriculum: SimDrill[];
  empty(): unknown;
  /** The one drill the home card recommends for a track; undefined when the track is done. */
  recommend(state: unknown, curriculum: SimDrill[], track: string): SimDrill | undefined;
  next(state: unknown, drill: SimDrill, curriculum: SimDrill[], rng: Rng, now: number): NextPick;
  /** applyAttempt + markPassed. */
  apply(state: unknown, attempt: Attempt, tempo: Tempo, curriculum: SimDrill[], now: number): unknown;
  /** Play evidence from a jam chord; absent for models without play evidence (v1). */
  play?(state: unknown, jam: SimPlay): unknown;
  /** Time-free knowledge 0..1 of a skill as the model believes it. */
  knowledge(state: unknown, skill: string): number;
  /** Predicted recall 0..1 at `now`. */
  recall(state: unknown, skill: string, now: number): number;
  passed(state: unknown): Record<string, number>;
  /** A passed drill that would be recommended again. */
  slipped(state: unknown, drill: SimDrill): boolean;
  helpLevel(state: unknown, skill: string): HelpLevel;
}

export type DriverName = Driver['name'];

// ── v1: the frozen EMA / Leitner model ──

export function v1Driver(ctx: ExerciseContext = DEFAULT_CONTEXT): Driver {
  const catalog = v1select.buildCatalog(ctx);
  const curriculum = v1.buildCurriculum(catalog);
  const S = (s: unknown) => s as v1model.LearnerState;
  const D = (d: SimDrill) => d as v1.Drill;
  return {
    name: 'v1',
    catalogIds: catalog.map((c) => c.skill),
    curriculum,
    empty: () => v1model.emptyState(),
    recommend: (s, cur, track) => v1.recommendDrill(S(s), cur as v1.Drill[], track as v1.TrackId),
    next: (s, drill, _cur, rng, now) => {
      const { exercise, helpLevel } = v1.nextDrillExercise(S(s), D(drill), catalog, rng, now, ctx);
      return { exercise, helpLevel };
    },
    apply: (s, a, tempo, cur, now) => v1.markPassed(v1model.applyAttempt(S(s), a, tempo), cur as v1.Drill[], now),
    knowledge: (s, skill) => v1model.mastery(S(s).skills[skill]),
    // v1 has no forgetting curve: a seen skill is simply assumed to be there.
    recall: (s, skill) => (S(s).skills[skill] ? 1 : 0),
    passed: (s) => S(s).passed,
    slipped: (s, drill) => v1.hasSlipped(S(s), D(drill)),
    helpLevel: (s, skill) => v1model.helpLevelFor(S(s), skill),
  };
}

// ── v2: belief, half-life, mixed sessions, play evidence ──

/** What a v2 driver is built from; everything defaults to what the app runs with. */
export interface V2Options {
  cfg?: ModelConfig;
  /** Transfer strengths for the catalog edges (relations.ts TRANSFER_S by default). */
  strengths?: Readonly<TransferStrengths>;
}

/**
 * The v2 driver: the home card is `recommendDrill`, a pick is `planSession` +
 * `nextSessionExercise` (labelled review picks report their drill), an answer is
 * `applyAttempt` + `markPassed`, a jam chord is `applyPlay(jamEvent(…))`. The drills are the
 * real `buildCurriculum` objects, so they carry their catalog entries (edges, difficulty).
 */
export function v2Driver(ctx: ExerciseContext = DEFAULT_CONTEXT, opts: V2Options = {}): Driver {
  const cfg = opts.cfg ?? DEFAULT_MODEL;
  let catalog = buildCatalog(ctx);
  if (opts.strengths && opts.strengths !== TRANSFER_S) {
    const edges = buildEdges(catalog.map((c) => c.skill), ctx, opts.strengths);
    catalog = catalog.map((c) => ({ ...c, edges: edges[c.skill] ?? [] }));
  }
  const curriculum = buildCurriculum(catalog);
  const S = (s: unknown) => s as LearnerState;
  const D = (d: SimDrill) => d as Drill;
  return {
    name: 'v2',
    catalogIds: catalog.map((c) => c.skill),
    curriculum,
    empty: () => emptyState(),
    recommend: (s, cur, track) => recommendDrill(S(s), cur as Drill[], track as TrackId, cfg),
    next: (s, drill, cur, rng, now) => {
      const plan = planSession(S(s), cur as Drill[], D(drill), now, cfg);
      const { exercise, helpLevel, review } = nextSessionExercise(S(s), plan, rng, now, ctx, cfg);
      return review ? { exercise, helpLevel, review } : { exercise, helpLevel };
    },
    apply: (s, a, tempo, cur, now) => markPassed(applyAttempt(S(s), a, tempo, cfg), cur as Drill[], now, cfg),
    play: (s, jam) => applyPlay(S(s), jamEvent(jam.midis, jam.at, jam.picked, jam.pad), cfg),
    knowledge: (s, skill) => knowledgeOf(S(s).skills[skill]),
    recall: (s, skill, now) => recallOf(S(s).skills[skill], now),
    passed: (s) => S(s).passed,
    slipped: (s, drill) => hasSlipped(S(s), D(drill), cfg),
    helpLevel: (s, skill) => helpLevelFor(S(s), skill),
  };
}

export const DRIVERS: Record<DriverName, (ctx?: ExerciseContext) => Driver> = { v1: v1Driver, v2: (ctx) => v2Driver(ctx) };
