import { Attempt, HelpLevel } from '../exercises/attempt';
import { knowledge } from './belief';
import { DEFAULT_MODEL, ModelConfig, RECENT_LENGTH } from './config';
import { Evidence, evidenceOf, updateSkill } from './evidence';
import { isLeafId } from './skillId';

/**
 * Learner state: plain JSON, persisted as-is (IndexedDB in the app). Bump SCHEMA_VERSION and
 * add a migration (migrate.ts) whenever the shape changes. Only leaf skills are stored;
 * group values (help fading) are computed on read.
 */
export const SCHEMA_VERSION = 2;

export interface SkillStats {
  /** Weighted successes (direct evidence only), windowed by cfg.nMax / cfg.nLapse. */
  a: number;
  /** Weighted failures (direct evidence only), windowed by cfg.nMax / cfg.nLapse. */
  b: number;
  /** Quiz attempts. Aside and play evidence never count. */
  n: number;
  /** Fluency 0..1: EMA over correct answers (instant 1, found 0.5, timed by latency). Starts at 0.5. */
  flu: number;
  /** Memory half-life in ms; cfg.hl0 after the first success. */
  hl: number;
  /** Epoch ms of the last evidence of any kind (0 = none). */
  last: number;
  /** Epoch ms of the last full success (x = 1), any kind. Recall is measured from here. */
  lastOk: number;
  /** Quiz successes after a gap ≥ cfg.heldGap, capped at cfg.heldMax; −1 per quiz miss, never below 0. */
  held: number;
  /** Consecutive quiz misses since the last quiz success, capped at cfg.lapseMax. */
  lapses: number;
}

export interface HelpState {
  level: HelpLevel;
  /** Consecutive good answers at this level. */
  good: number;
  /** Weighted misses in a row (a near miss counts cfg.nearMissWeight). */
  misses: number;
}

export interface LearnerState {
  schemaVersion: 2;
  /** Leaf skills only – ancestors are no longer stored; group values are computed on read. */
  skills: Record<string, SkillStats>;
  /** Help level per skill group (first segment, e.g. 'interval:b3', 'triad:maj'). */
  help: Record<string, HelpState>;
  /** Most recent leaf skills, newest first, ≤ RECENT_LENGTH. */
  recent: string[];
  /** Drill id → epoch ms when it first became comfortable. */
  passed: Record<string, number>;
  /** Confusable skills to bring forward: skill id → epoch ms until which it is boosted. ≤ cfg.boostMax entries. */
  boost: Record<string, number>;
  /** Epoch ms of the last quiz attempt; drives the welcome-back warm-up. */
  lastActive: number;
  /** Review picks still owed in the current comeback session. */
  warmup: number;
}

export const emptyState = (): LearnerState =>
  ({ schemaVersion: 2, skills: {}, help: {}, recent: [], passed: {}, boost: {}, lastActive: 0, warmup: 0 });

// ── Skill ids and groups ──

/** 'interval:b3/up/strings:5-4' → ['interval', 'interval:b3', 'interval:b3/up', 'interval:b3/up/strings:5-4']. */
export function skillPath(id: string): string[] {
  const parts = id.split('/');
  const out = [parts[0].split(':')[0]];
  for (let i = 0; i < parts.length; i++) out.push(parts.slice(0, i + 1).join('/'));
  return [...new Set(out)];
}

/** The skill group that carries a help level: the first segment ('interval:b3'). */
export const helpGroup = (id: string): string => id.split('/')[0];

/** Compat aliases of the belief reads (select.ts and curriculum.ts import `mastery` from here). */
export { knowledge, mastery } from './belief';

// ── Help levels ──

/** Help thresholds: group knowledge needed to drop to level 1, 2, 3 (alias of DEFAULT_MODEL.helpUp). */
export const HELP_UP: readonly number[] = DEFAULT_MODEL.helpUp;
/** Consecutive good answers needed before help is reduced (alias of DEFAULT_MODEL.helpUpStreak). */
export const HELP_UP_STREAK = DEFAULT_MODEL.helpUpStreak;
/** Weighted misses that bring help back (alias of DEFAULT_MODEL.helpDownMisses). */
export const HELP_DOWN_MISSES = DEFAULT_MODEL.helpDownMisses;

/** What the help hysteresis sees of one quiz answer. */
export interface HelpOutcome {
  /** x === 1. */
  correct: boolean;
  /** Correct and reasonably fluent (f ≥ 0.5): found counts, a slow timed answer does not. */
  good: boolean;
  /** 1 for a plain miss, cfg.nearMissWeight for a near miss. */
  missWeight: number;
}

/** Mean knowledge over the stored leaves of a group that have quiz evidence (ids sorted); 0 if none. */
export function groupMastery(skills: Record<string, SkillStats>, group: string): number {
  const ids = Object.keys(skills).filter((id) => (id === group || id.startsWith(`${group}/`)) && skills[id].n > 0).sort();
  if (ids.length === 0) return 0;
  return ids.reduce((sum, id) => sum + knowledge(skills[id]), 0) / ids.length;
}

/**
 * Hysteresis: help fades only after a streak *and* enough group knowledge, and returns only
 * after repeated misses – so one slip or one lucky answer never flips the level.
 */
export function updateHelp(h: HelpState | undefined, o: HelpOutcome, groupMastery: number, cfg: ModelConfig = DEFAULT_MODEL): HelpState {
  const prev = h ?? { level: 0 as HelpLevel, good: 0, misses: 0 };
  if (!o.correct) {
    const misses = prev.misses + o.missWeight;
    if (misses >= cfg.helpDownMisses && prev.level > 0) return { level: (prev.level - 1) as HelpLevel, good: 0, misses: 0 };
    return { ...prev, good: 0, misses };
  }
  if (!o.good) return { ...prev, misses: 0 };
  const good = prev.good + 1;
  if (prev.level < 3 && good >= cfg.helpUpStreak && groupMastery >= cfg.helpUp[prev.level]) {
    return { level: (prev.level + 1) as HelpLevel, good: 0, misses: 0 };
  }
  return { ...prev, good, misses: 0 };
}

export const helpLevelFor = (state: LearnerState, skill: string): HelpLevel => state.help[helpGroup(skill)]?.level ?? 0;

// ── Reducers ──

/** Fold evidence into the skills only; evidence worth nothing (w ≤ 0) carries no information and is skipped. */
export function applyEvidence(state: LearnerState, evs: Evidence[], cfg: ModelConfig = DEFAULT_MODEL): LearnerState {
  const skills = { ...state.skills };
  for (const ev of evs) if (ev.w > 0) skills[ev.skill] = updateSkill(skills[ev.skill], ev, cfg);
  return { ...state, skills };
}

/** Boost record after one attempt: expired entries dropped, nudged skills added, the cfg.boostMax latest kept. */
function nextBoost(boost: Record<string, number>, nudge: string[] | undefined, at: number, cfg: ModelConfig): Record<string, number> {
  const live = Object.entries(boost).filter(([, until]) => until > at);
  const added = (nudge ?? []).filter(isLeafId).map((id): [string, number] => [id, at + cfg.boostMs]);
  const merged = new Map<string, number>([...live, ...added]);
  const kept = [...merged.entries()].sort((p, q) => q[1] - p[1]).slice(0, cfg.boostMax);
  return Object.fromEntries(kept);
}

/** Pure update for one answered exercise: returns a new state; the old one is untouched. */
export function applyAttempt(state: LearnerState, a: Attempt, tempo: { fastMs: number; slowMs: number }, cfg: ModelConfig = DEFAULT_MODEL): LearnerState {
  // 1. evidence → skills
  const evs = evidenceOf(a, tempo, cfg);
  const { skills } = applyEvidence(state, evs, cfg);
  // 2. help per asked leaf, from its quiz evidence and the updated group
  const help = { ...state.help };
  for (const leaf of a.skills) {
    const ev = evs.find((e) => e.kind === 'quiz' && e.skill === leaf);
    if (!ev) continue;
    const group = helpGroup(leaf);
    const outcome: HelpOutcome = { correct: ev.x === 1, good: ev.x === 1 && ev.f >= 0.5, missWeight: ev.missWeight };
    help[group] = updateHelp(help[group], outcome, groupMastery(skills, group), cfg);
  }
  // 3. recent
  const recent = [...new Set([...a.skills, ...state.recent])].slice(0, RECENT_LENGTH);
  // 4. boost
  const boost = nextBoost(state.boost, a.evaluation.error?.nudge, a.at, cfg);
  // 5. warm-up bookkeeping
  const warmup = state.lastActive > 0 && a.at - state.lastActive >= cfg.warmupGap ? cfg.warmupN - 1 : Math.max(0, state.warmup - 1);
  return { ...state, skills, help, recent, boost, lastActive: a.at, warmup };
}

/** Review picks still owed: the first pick after a break counts, so a long gap means the full warm-up. */
export const warmupLeft = (state: LearnerState, now: number, cfg: ModelConfig = DEFAULT_MODEL): number =>
  state.lastActive > 0 && now - state.lastActive >= cfg.warmupGap ? cfg.warmupN : state.warmup;
