import { DEFAULT_MODEL, ModelConfig } from './config';
import type { HelpState, LearnerState, SkillStats } from './model';
import { isLeafId } from './skillId';

/*
 * Pure migration of persisted learner states. v1 stored an EMA accuracy, a tempo score and a
 * Leitner box per skill – for leaves and every ancestor. v2 keeps leaves only and reads the
 * old numbers as weighted counts, a half-life and a `held` counter, so upgrade day changes
 * nothing on the home screen: passed drills stay passed, comfortable skills stay comfortable.
 * The app keeps the untouched v1 JSON under a backup key (store.ts).
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

/** v1 → v2. Ancestor keys ('note', 'note:C', 'interval:b3/up', …) are dropped; the input is not modified. */
export function migrateV1(v1: LearnerStateV1, cfg: ModelConfig = DEFAULT_MODEL): LearnerState {
  const skills: Record<string, SkillStats> = {};
  for (const [id, s] of Object.entries(v1.skills)) {
    if (!isLeafId(id)) continue;
    // acc · n̂: the v1 EMA already blends the 0.5 prior. A comfortable skill has been answered many
    // times at a high rate; seeding its window keeps it above the v2 bar.
    const nHat = comfortableV1(s) ? Math.min(cfg.nMax, Math.max(s.n, N_SEED_COMFORT)) : Math.min(s.n, cfg.nMax);
    skills[id] = {
      a: s.acc * nHat,
      b: (1 - s.acc) * nHat,
      n: s.n,
      flu: s.tempo,
      hl: s.box === 0 ? cfg.hl0 : LEITNER_MS_V1[Math.min(s.box, LEITNER_MS_V1.length - 1)],
      last: s.lastSeen,
      lastOk: s.acc >= 0.5 ? s.lastSeen : 0,
      // box ≥ 2 meant "a good answer ≥ 10 min after the first"
      held: Math.min(cfg.heldMax, Math.max(0, s.box - 1)),
      lapses: 0,
    };
  }
  const lastActive = Math.max(0, ...Object.values(skills).map((s) => s.last));
  return { schemaVersion: 2, skills, help: { ...v1.help }, recent: [...v1.recent], passed: { ...v1.passed }, boost: {}, lastActive, warmup: 0 };
}

/** Parse a persisted state of any supported version into the current shape. */
export function parseState(json: string): LearnerState {
  const raw = JSON.parse(json) as { schemaVersion?: number };
  if (raw.schemaVersion === 2) return raw as LearnerState;
  if (raw.schemaVersion === 1) return migrateV1(raw as LearnerStateV1);
  throw new Error(`Unsupported learner state version ${String(raw.schemaVersion)}`);
}
