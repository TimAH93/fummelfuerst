import { Attempt, DEFAULT_CONTEXT, Exercise, ExerciseContext, HelpLevel, Rng } from '../../src/core/exercises';
import { SimPlay } from './world';
import * as v1 from './v1/curriculum';
import * as v1model from './v1/model';
import * as v1select from './v1/select';

/**
 * What the runner needs from a learner model (spec §9.2): one Driver per model version, each
 * wrapping its own state type behind `unknown`. The v1 driver wraps the frozen copy under
 * tests/sim/v1/ so `npm run baseline` reproduces the "before" numbers after v2 lands; the v2
 * slot is filled by WP9 (planSession / nextSessionExercise, applyAttempt + markPassed,
 * applyPlay).
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

// ── v2: filled by WP9 ──

/** The v2 driver factory; `null` until WP9 wires planSession / applyAttempt / applyPlay. */
export const v2Driver: ((ctx?: ExerciseContext) => Driver) | null = null;

export const DRIVERS: Record<DriverName, ((ctx?: ExerciseContext) => Driver) | null> = { v1: v1Driver, v2: v2Driver };
