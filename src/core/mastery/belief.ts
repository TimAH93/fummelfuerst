import { DEFAULT_MODEL, ModelConfig } from './config';
import type { SkillStats } from './model';
import type { Edge } from './relations';

/*
 * Reading a skill's belief. The stored counts (a, b) are windowed weighted successes and
 * failures from direct evidence; what the curriculum gates read is one standard deviation
 * below the Beta mean – evidence, not luck. A transfer prior from related skills is added
 * only at read time (selection, ladder, progress hint), never into the stored counts, so it
 * re-evaluates as neighbours learn and is washed out by direct evidence.
 */

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

// ── Beta belief ──

export interface Prior {
  /** Pseudo-successes added to the stored counts. */
  a0: number;
  /** Pseudo-failures added to the stored counts. */
  b0: number;
}

/** The flat prior: a cold skill sits at mean 0.5 and knows nothing. */
export const NO_PRIOR: Prior = { a0: 1, b0: 1 };

export interface Belief {
  mean: number;
  /** One standard deviation below the mean. */
  low: number;
}

/** One standard deviation below the Beta mean: needs evidence, not luck. Replaces confidence(n). */
export const lowerBound = (a: number, b: number): number => {
  const n = a + b, m = a / n;
  return m - Math.sqrt((a * b) / (n * n * (n + 1)));
};

/** Belief about a skill: prior plus direct evidence. */
export function belief(s: SkillStats | undefined, prior: Prior = NO_PRIOR): Belief {
  const a = prior.a0 + (s?.a ?? 0), b = prior.b0 + (s?.b ?? 0);
  return { mean: a / (a + b), low: lowerBound(a, b) };
}

/** Time-free knowledge, direct evidence only: what every curriculum gate reads. */
export const knowledge = (s: SkillStats | undefined): number => belief(s, NO_PRIOR).low;

/** Compat alias for the v1 name. */
export const mastery = knowledge;

// ── Memory ──

/** Expected recall at `now`: 2^(−Δt/hl) measured from the last full success; 0 before one. */
export const recall = (s: SkillStats | undefined, now: number): number =>
  s?.lastOk && s.hl > 0 ? 2 ** (-Math.max(0, now - s.lastOk) / s.hl) : 0;

/** Selection pressure from forgetting: 0 just after a recall, 1 once R ≤ cfg.rTarget. */
export const forgetPressure = (s: SkillStats | undefined, now: number, cfg: ModelConfig = DEFAULT_MODEL): number =>
  clamp((1 - recall(s, now)) / (1 - cfg.rTarget), 0, 1);

// ── Transfer prior ──

/**
 * Prior from a skill's neighbours: each contributes its own smoothed mean, weighted by edge
 * strength × its evidence mass; one hop, no recursion. Worth at most cfg.priorMax answers.
 */
export function priorFor(edges: Edge[], skills: Record<string, SkillStats>, cfg: ModelConfig = DEFAULT_MODEL): Prior {
  let mass = 0, sum = 0;
  for (const e of edges) {
    const m = skills[e.to];
    if (!m) continue;
    const n = m.a + m.b, mean = (m.a + 1) / (n + 2);
    mass += e.s * n;
    sum += e.s * n * mean;
  }
  if (mass === 0) return NO_PRIOR;
  const used = Math.min(cfg.priorMax, mass), xbar = sum / mass;
  return { a0: 1 + used * xbar, b0: 1 + used * (1 - xbar) };
}
