import { Attempt, HelpLevel } from '../exercises/attempt';

/**
 * Learner state: plain JSON, persisted as-is (IndexedDB later). Bump SCHEMA_VERSION
 * and add a migration whenever the shape changes.
 */
export const SCHEMA_VERSION = 1;

export interface SkillStats {
  /** Moving accuracy, 0..1 (EMA, α = ALPHA). */
  acc: number;
  /** Moving tempo score, 0..1 (1 = at or under the family's fast time). */
  tempo: number;
  /** Attempts seen. */
  n: number;
  /** Leitner box 0..5. */
  box: number;
  /** Epoch ms when the skill is due again. */
  due: number;
  lastSeen: number;
}

export interface HelpState {
  level: HelpLevel;
  /** Consecutive good answers at this level. */
  good: number;
  /** Consecutive misses. */
  misses: number;
}

export interface LearnerState {
  schemaVersion: typeof SCHEMA_VERSION;
  /** Leaf skills and every ancestor ('interval', 'interval:b3', 'interval:b3/up', …). */
  skills: Record<string, SkillStats>;
  /** Help level per skill group (first segment, e.g. 'interval:b3', 'triad:maj'). */
  help: Record<string, HelpState>;
  /** Most recent leaf skills, newest first. */
  recent: string[];
}

export const ALPHA = 0.3;
const MIN = 60_000;
const DAY = 86_400_000;
/** Review interval per Leitner box: 0, 10 min, 1 d, 3 d, 7 d, 21 d. */
export const LEITNER_MS = [0, 10 * MIN, DAY, 3 * DAY, 7 * DAY, 21 * DAY] as const;
export const RECENT_LENGTH = 5;
/** A new skill starts undecided rather than at zero. */
const PRIOR = 0.5;

export const emptyState = (): LearnerState => ({ schemaVersion: SCHEMA_VERSION, skills: {}, help: {}, recent: [] });

/** 'interval:b3/up/strings:5-4' → ['interval', 'interval:b3', 'interval:b3/up', 'interval:b3/up/strings:5-4']. */
export function skillPath(id: string): string[] {
  const parts = id.split('/');
  const out = [parts[0].split(':')[0]];
  for (let i = 0; i < parts.length; i++) out.push(parts.slice(0, i + 1).join('/'));
  return [...new Set(out)];
}

/** The skill group that carries a help level: the first segment ('interval:b3'). */
export const helpGroup = (id: string): string => id.split('/')[0];

/** Grows with evidence: 2 attempts → 0.5, 6 → 0.88, 10 → 0.97. */
export const confidence = (n: number): number => 1 - 0.5 ** (n / 2);

/** Mastery = accuracy × confidence × tempo, 0..1. Unseen skills have 0. */
export const mastery = (s: SkillStats | undefined): number => (s ? s.acc * confidence(s.n) * s.tempo : 0);

/** Tempo score of one answer: self-ratings map directly, timed answers interpolate fast → slow. */
export function tempoScore(a: Attempt, tempo: { fastMs: number; slowMs: number }): number {
  if (!a.evaluation.correct) return 0;
  if (a.evaluation.rating === 'instant') return 1;
  if (a.evaluation.rating === 'found') return 0.5;
  const t = (tempo.slowMs - a.latencyMs) / (tempo.slowMs - tempo.fastMs);
  return Math.max(0, Math.min(1, t));
}

const ema = (old: number, x: number): number => ALPHA * x + (1 - ALPHA) * old;

/** Good = right and reasonably quick. Only good answers move a skill up a box. */
const isGood = (a: Attempt, tempo: number): boolean => a.evaluation.correct && tempo >= 0.5;

function updateStats(s: SkillStats | undefined, a: Attempt, tempo: number, leaf: boolean): SkillStats {
  const prev = s ?? { acc: PRIOR, tempo: PRIOR, n: 0, box: 0, due: a.at, lastSeen: a.at };
  const next: SkillStats = {
    ...prev,
    acc: ema(prev.acc, a.evaluation.correct ? 1 : 0),
    tempo: ema(prev.tempo, tempo),
    n: prev.n + 1,
    lastSeen: a.at,
  };
  if (leaf) {
    if (!a.evaluation.correct) next.box = 0;
    else if (isGood(a, tempo)) next.box = Math.min(5, prev.box + 1);
    else next.box = Math.max(1, prev.box);
    next.due = a.at + LEITNER_MS[next.box];
  }
  return next;
}

/** Help thresholds: mastery of the group needed to drop to level 1, 2, 3. */
export const HELP_UP: readonly number[] = [0.5, 0.65, 0.8];
/** Consecutive good answers needed before help is reduced. */
export const HELP_UP_STREAK = 4;
/** Consecutive misses that bring help back. */
export const HELP_DOWN_MISSES = 2;

/**
 * Hysteresis: help fades only after a streak *and* enough mastery, and returns only after
 * repeated misses – so one slip or one lucky answer never flips the level.
 */
export function updateHelp(h: HelpState | undefined, a: Attempt, tempo: number, groupMastery: number): HelpState {
  const prev = h ?? { level: 0 as HelpLevel, good: 0, misses: 0 };
  if (!a.evaluation.correct) {
    const misses = prev.misses + 1;
    if (misses >= HELP_DOWN_MISSES && prev.level > 0) return { level: (prev.level - 1) as HelpLevel, good: 0, misses: 0 };
    return { ...prev, good: 0, misses };
  }
  if (!isGood(a, tempo)) return { ...prev, misses: 0 };
  const good = prev.good + 1;
  if (prev.level < 3 && good >= HELP_UP_STREAK && groupMastery >= HELP_UP[prev.level]) {
    return { level: (prev.level + 1) as HelpLevel, good: 0, misses: 0 };
  }
  return { ...prev, good, misses: 0 };
}

/** Pure update: returns a new state; the old one is untouched. */
export function applyAttempt(state: LearnerState, a: Attempt, tempo: { fastMs: number; slowMs: number }): LearnerState {
  const t = tempoScore(a, tempo);
  const skills = { ...state.skills };
  const help = { ...state.help };
  const recent = [...state.recent];
  for (const leafId of a.skills) {
    const path = skillPath(leafId);
    path.forEach((id, i) => (skills[id] = updateStats(skills[id], a, t, i === path.length - 1)));
    const group = helpGroup(leafId);
    help[group] = updateHelp(help[group], a, t, mastery(skills[group]));
    recent.unshift(leafId);
  }
  return { ...state, skills, help, recent: [...new Set(recent)].slice(0, RECENT_LENGTH) };
}

export const helpLevelFor = (state: LearnerState, skill: string): HelpLevel => state.help[helpGroup(skill)]?.level ?? 0;

export function parseState(json: string): LearnerState {
  const s = JSON.parse(json) as LearnerState;
  if (s.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported learner state version ${String(s.schemaVersion)}`);
  return s;
}
