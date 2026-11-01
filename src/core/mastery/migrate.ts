import type { HelpLevel } from '../exercises/attempt';
import { DEFAULT_MODEL, ModelConfig } from './config';
import type { HelpState, LearnerState, SkillStats } from './model';
import { isLeafId } from './skillId';

/*
 * Pure migration of persisted learner states. v1 stored an EMA accuracy, a tempo score and a
 * Leitner box per skill – for leaves and every ancestor. v2 keeps leaves only and reads the
 * old numbers as weighted counts, a half-life and a `held` counter, so upgrade day changes
 * nothing on the home screen: passed drills stay passed, comfortable skills stay comfortable.
 * Help restarts its fade at level 1 at most (v1 showed levels 1–3 alike). The app keeps the
 * untouched v1 JSON under a backup key (store.ts).
 */

const MIN = 60_000;
const DAY = 86_400_000;

export interface SkillStatsV1 {
  acc: number;
  tempo: number;
  n: number;
  box: number;
  due: number;
  lastSeen: number;
}

export interface LearnerStateV1 {
  schemaVersion: 1;
  skills: Record<string, SkillStatsV1>;
  help: Record<string, HelpState>;
  recent: string[];
  passed: Record<string, number>;
}

/** v1 review interval per Leitner box: 0, 10 min, 1 d, 3 d, 7 d, 21 d. */
const LEITNER_MS_V1 = [0, 10 * MIN, DAY, 3 * DAY, 7 * DAY, 21 * DAY];

/** v1 comfort = acc × (1 − 0.5^(n/2)) × tempo ≥ 0.75 && box ≥ 2. */
const comfortableV1 = (s: SkillStatsV1): boolean => s.acc * (1 - 0.5 ** (s.n / 2)) * s.tempo >= 0.75 && s.box >= 2;

/** Smallest window that keeps a v1-comfortable skill above the v2 bar: acc 0.9 · 14 → low 0.763. */
export const N_SEED_COMFORT = 14;
/**
 * Accuracy a v1-comfortable skill is seeded with at least. v1's gate only needs acc ≈ 0.76 once
 * n ≥ 10 (acc 0.887 at tempo 0.869 and n 11 passes it), and acc · n̂ alone would put such a skill
 * below the v2 bar; at ≥ 0.9 over a window of 14…20 its knowledge is 0.763…0.79.
 */
export const ACC_SEED_COMFORT = 0.9;

/**
 * v1 rendered help levels 1, 2 and 3 identically (only level 0 differed) and earned them under
 * lower thresholds; v2's 2 and 3 play the sound and hide the name. So a group keeps at most
 * level 1 – what it saw in v1 – and walks name → sound + name → sound only under v2's
 * hysteresis; the v1 streak and miss counts are reset.
 */
const helpFromV1 = (h: HelpState): HelpState => ({ level: Math.min(h.level, 1) as HelpLevel, good: 0, misses: 0 });

/** v1 → v2. Ancestor keys ('note', 'note:C', 'interval:b3/up', …) are dropped; the input is not modified. */
export function migrateV1(v1: LearnerStateV1, cfg: ModelConfig = DEFAULT_MODEL): LearnerState {
  const skills: Record<string, SkillStats> = {};
  for (const [id, s] of Object.entries(v1.skills)) {
    if (!isLeafId(id)) continue;
    // acc · n̂: the v1 EMA already blends the 0.5 prior. A comfortable skill has been answered many
    // times at a high rate; seeding its window (and its accuracy) keeps it above the v2 bar.
    const comfortable = comfortableV1(s);
    const nHat = comfortable ? Math.min(cfg.nMax, Math.max(s.n, N_SEED_COMFORT)) : Math.min(s.n, cfg.nMax);
    const acc = comfortable ? Math.max(s.acc, ACC_SEED_COMFORT) : s.acc;
    skills[id] = {
      a: acc * nHat,
      b: (1 - acc) * nHat,
      n: s.n,
      flu: s.tempo,
      hl: s.box === 0 ? cfg.hl0 : LEITNER_MS_V1[Math.min(s.box, LEITNER_MS_V1.length - 1)],
      last: s.lastSeen,
      lastOk: s.acc >= 0.5 ? s.lastSeen : 0,
      // v1 saw quiz answers only, so its last exposure is the last quiz answer
      lastQ: s.lastSeen,
      // box ≥ 2 meant "a good answer ≥ 10 min after the first"
      held: Math.min(cfg.heldMax, Math.max(0, s.box - 1)),
      lapses: 0,
    };
  }
  const lastActive = Math.max(0, ...Object.values(skills).map((s) => s.last));
  const help = Object.fromEntries(Object.entries(v1.help ?? {}).map(([group, h]) => [group, helpFromV1(h)]));
  return { schemaVersion: 2, skills, help, recent: [...v1.recent], passed: { ...v1.passed }, boost: {}, lastActive, warmup: 0 };
}

/** A v2 state written before `lastQ` existed reads it as `last`, the reference `held` used then. */
function withLastQ(state: LearnerState): LearnerState {
  if (Object.values(state.skills).every((s) => typeof s.lastQ === 'number')) return state;
  const skills = Object.fromEntries(Object.entries(state.skills).map(([id, s]) => [id, typeof s.lastQ === 'number' ? s : { ...s, lastQ: s.last }]));
  return { ...state, skills };
}

/** Parse a persisted state of any supported version into the current shape. */
export function parseState(json: string): LearnerState {
  const raw = JSON.parse(json) as { schemaVersion?: number };
  if (raw.schemaVersion === 2) return withLastQ(raw as LearnerState);
  if (raw.schemaVersion === 1) return migrateV1(raw as LearnerStateV1);
  throw new Error(`Unsupported learner state version ${String(raw.schemaVersion)}`);
}
