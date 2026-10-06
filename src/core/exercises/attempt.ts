import { evaluate } from './registry';
import { AnswerMode, Evaluation, Exercise, Response } from './types';

/** Help level at answer time: 0 everything visible … 3 sound only. */
export type HelpLevel = 0 | 1 | 2 | 3;

/**
 * One answered exercise – the unit the learner model consumes and persistence stores.
 * The exercise itself is not stored; family + seed (+ context) regenerate it.
 */
export interface Attempt {
  exerciseId: string;
  family: string;
  seed: number;
  skills: string[];
  mode: AnswerMode;
  response: Response;
  evaluation: Evaluation;
  /** Prompt shown → answer given (for 'play': → rating tapped). */
  latencyMs: number;
  helpLevel: HelpLevel;
  /** Epoch ms when the answer was given. */
  at: number;
}

export interface AttemptMeta {
  mode: AnswerMode;
  latencyMs: number;
  helpLevel: HelpLevel;
  at: number;
}

export function recordAttempt(ex: Exercise, response: Response, meta: AttemptMeta): Attempt {
  if (!ex.modes.includes(meta.mode)) throw new Error(`${ex.family} has no '${meta.mode}' mode`);
  if (meta.mode === 'play' && response.kind !== 'self') throw new Error("'play' answers are self-rated");
  return {
    exerciseId: ex.id,
    family: ex.family,
    seed: ex.seed,
    skills: ex.skills,
    mode: meta.mode,
    response,
    evaluation: evaluate(ex, response),
    latencyMs: meta.latencyMs,
    helpLevel: meta.helpLevel,
    at: meta.at,
  };
}
