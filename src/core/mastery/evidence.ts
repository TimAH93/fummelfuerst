import { Attempt } from '../exercises/attempt';
import { ErrorKind, SelfRating } from '../exercises/types';
import { DEFAULT_MODEL, ModelConfig } from './config';
import type { SkillStats } from './model';
import { isLeafId } from './skillId';

/*
 * One evidence shape for everything the model learns from: a quiz answer, the skill a wrong
 * answer demonstrated instead (aside), and chords played on the keys (play, mapped in
 * play.ts). `x` is what happened, `w` how much it is worth relative to one unaided quiz
 * answer, `f` how fluent a correct answer was. Weight changes how fast a belief converges,
 * never where. `updateSkill` is the single reducer for a skill's stats.
 */

export type EvidenceKind = 'quiz' | 'aside' | 'play';

export interface Evidence {
  skill: string;
  /** Epoch ms. */
  at: number;
  /** 1 right, 0 wrong, 0.25 / 0.5 partial credit. Only x === 1 is a recall. */
  x: number;
  /** Worth relative to one unaided quiz answer, 0..1. */
  w: number;
  /** Fluency of a correct answer 0..1; ignored unless x === 1. */
  f: number;
  kind: EvidenceKind;
  /** Help-hysteresis weight of a miss (quiz only): 1, or cfg.nearMissWeight for near-miss kinds; 0 on a success. */
  missWeight: number;
}

/** Error kinds that count as half a miss for the help hysteresis. */
export const NEAR_KINDS: ReadonlySet<ErrorKind> = new Set<ErrorKind>([
  'near', 'off-by-one', 'octave', 'wrong-string', 'inversion', 'span', 'extra-tone', 'bass', 'missing-colour', 'missed-chord',
]);

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Fluency of a timed correct answer: 1 at or under fastMs, 0 at or over slowMs. */
const timedFluency = (latencyMs: number, tempo: { fastMs: number; slowMs: number }): number =>
  clamp01((tempo.slowMs - latencyMs) / (tempo.slowMs - tempo.fastMs));

/** The rating of a self-rated answer, from the evaluation or the response. */
const ratingOf = (a: Attempt): SelfRating | undefined =>
  a.evaluation.rating ?? (a.response.kind === 'self' ? a.response.rating : undefined);

// ── Attempt → evidence ──

/**
 * Evidence of one answered exercise: one 'quiz' item per asked skill, plus one 'aside' item
 * when the diagnosis names the skill the answer demonstrated instead. The help level sets
 * the weight: an answer with the board and chord tones on screen is weaker evidence of
 * unaided recall. "found" is a success – correctness and fluency are separate.
 */
export function evidenceOf(a: Attempt, tempo: { fastMs: number; slowMs: number }, cfg: ModelConfig = DEFAULT_MODEL): Evidence[] {
  const W = cfg.helpW[Math.min(a.helpLevel, cfg.helpW.length - 1)];
  const rating = ratingOf(a);
  const error = a.evaluation.error;
  let x: number, f: number, missWeight: number;
  if (rating !== undefined) {
    if (rating === 'instant') [x, f, missWeight] = [1, 1, 0];
    else if (rating === 'found') [x, f, missWeight] = [1, 0.5, 0];
    else if (rating === 'near') [x, f, missWeight] = [cfg.nearCredit, 0, cfg.nearMissWeight];
    else [x, f, missWeight] = [0, 0, 1];
  } else if (a.evaluation.correct) {
    [x, f, missWeight] = [1, timedFluency(a.latencyMs, tempo), 0];
  } else {
    x = error?.credit ?? 0;
    f = 0;
    missWeight = error && NEAR_KINDS.has(error.kind) ? cfg.nearMissWeight : 1;
  }
  const out: Evidence[] = a.skills.map((skill) => ({ skill, at: a.at, x, w: W, f, kind: 'quiz', missWeight }));
  if (error?.aside && isLeafId(error.aside)) {
    out.push({ skill: error.aside, at: a.at, x: 1, w: cfg.asideW * W, f: 0.5, kind: 'aside', missWeight: 0 });
  }
  return out;
}

// ── Skill update ──

/** A skill before any evidence. */
export const freshSkill = (): SkillStats => ({ a: 0, b: 0, n: 0, flu: 0.5, hl: 0, last: 0, lastOk: 0, lastQ: 0, held: 0, lapses: 0 });

/**
 * Fold one piece of evidence into a skill's stats (§3.3): shrink the counts to the window and
 * add the weighted observation; grow the half-life with spacing on a recall, shrink it by
 * surprise on a miss; EMA the fluency over successes; count held / lapses on quiz items only.
 * `held` measures its break from the previous quiz answer (`lastQ`): a jam or an aside between
 * two answers is no break, so play can never supply the "held over a break" of the comfort gate.
 */
export function updateSkill(s: SkillStats | undefined, ev: Evidence, cfg: ModelConfig = DEFAULT_MODEL): SkillStats {
  const prev = s ?? freshSkill();
  const success = ev.x === 1;
  const gap = prev.last ? Math.max(0, ev.at - prev.last) : 0; // since the last exposure of any kind
  const R = prev.lastOk && prev.hl ? 2 ** (-Math.max(0, ev.at - prev.lastOk) / prev.hl) : 0; // predicted recall before this event
  // 1. belief: shrink to the window, then add the weighted observation
  const n = prev.a + prev.b, cap = success ? cfg.nMax : cfg.nLapse, k = n > cap ? cap / n : 1;
  const a = prev.a * k + ev.w * ev.x, b = prev.b * k + ev.w * (1 - ev.x);
  // 2. memory: spacing-aware growth, surprise-weighted shrink
  let hl: number;
  if (prev.hl === 0) hl = success ? cfg.hl0 : cfg.hlMin;
  else if (success) {
    const fq = 0.5 + 0.5 * ev.f, spaced = Math.min(cfg.hlGainCap, gap / prev.hl);
    hl = Math.min(cfg.hlMax, Math.max(prev.hl * (1 + cfg.hlGain * ev.w * fq * spaced), ev.w * fq * gap * cfg.hlDemo));
  } else hl = Math.max(cfg.hlMin, prev.hl * cfg.missShrink ** (ev.w * (cfg.missFloor + (1 - cfg.missFloor) * R)));
  // 3. fluency: EMA over successes only, unweighted
  const flu = success ? prev.flu + cfg.fluAlpha * (ev.f - prev.flu) : prev.flu;
  // 4. quiz-only counters
  const quiz = ev.kind === 'quiz';
  const held = !quiz ? prev.held
    : success ? (prev.lastQ > 0 && ev.at - prev.lastQ >= cfg.heldGap ? Math.min(cfg.heldMax, prev.held + 1) : prev.held)
    : Math.max(0, prev.held - 1);
  const lapses = !quiz ? prev.lapses : success ? 0 : Math.min(cfg.lapseMax, prev.lapses + 1);
  return {
    a, b, n: prev.n + (quiz ? 1 : 0), flu, hl, last: ev.at, lastOk: success ? ev.at : prev.lastOk, lastQ: quiz ? ev.at : prev.lastQ, held, lapses,
  };
}
