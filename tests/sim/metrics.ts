import { HelpLevel } from '../../src/core/exercises';
import { TrueSkill, WorldEvent, recallOf } from './world';

/**
 * Metrics of one simulated run (spec §9.3). run.ts records a plain trace – every pick with
 * the true k and R at that moment, session boundaries, passes with a snapshot of the hidden
 * state, the hidden-state history – and buildReport() turns it into a SimReport of plain
 * JSON numbers, so reports can be diffed, written to baseline-v1.json and compared across
 * drivers. `null` marks a metric the run gave no data for (no pass, no break, no samples).
 */

export const DAY = 86_400_000;
/** True knowledge or recall below this counts as weak / forgotten. */
export const WEAK = 0.6;

export interface PickRecord {
  /** Answer index in the run, session index (1-based) and calendar day of the pick. */
  i: number;
  session: number;
  day: number;
  at: number;
  drill: string;
  /** A labelled review pick (v2 only). */
  review: boolean;
  skill: string;
  help: HelpLevel;
  /** The skill had been exposed before this pick. */
  seen: boolean;
  /** True knowledge and recall at the moment of the question. */
  k: number;
  R: number;
  correct: boolean;
}

export interface SessionRecord {
  index: number;
  day: number;
  start: number;
  end: number;
}

export interface PassRecord {
  drill: string;
  at: number;
  session: number;
  day: number;
  /** Non-review answers on the drill before it passed, distinct sessions among them, first pick day. */
  answers: number;
  sessions: number;
  firstDay: number;
  /** Hidden state of the drill's skills at the pass (for the counterfactual retention). */
  skills: Record<string, TrueSkill>;
}

export interface SimTrace {
  driver: string;
  persona: string;
  track: string;
  days: number;
  seed: number;
  t0: number;
  picks: PickRecord[];
  sessions: SessionRecord[];
  passes: PassRecord[];
  history: Record<string, WorldEvent[]>;
  /** |knowledge − k| and |recall − R| per seen skill at session ends after session 5. */
  calib: { dk: number; dr: number }[];
  /** Mean help level of the first drill's groups at the end of each day with a session. */
  helpByDay: (number | null)[];
  /** Jam chords emitted (noodler). */
  jamChords: number;
  /** Break bookkeeping: epoch ms the comeback session started, slipped drills at its first pick, reviews among its first five picks. */
  breakAt: number | null;
  returnSlips: number | null;
  warmupPicks: number | null;
  /** Drills that slipped after the comeback: session they slipped in and session they were current again. */
  slipAfterBreak: Record<string, { slipped: number; rePassed: number | null }>;
  /** Final true knowledge of every exposed skill. */
  finalK: Record<string, number>;
}

export interface TimeToPass {
  answers: number;
  sessions: number;
  days: number;
}

export interface SimReport {
  driver: string;
  persona: string;
  track: string;
  days: number;
  seed: number;
  answers: number;
  sessions: number;
  passed: string[];
  /** 1. Answers on the drill, distinct sessions and calendar days (first pick → pass) it took. */
  timeToPass: Record<string, TimeToPass>;
  /** 2. Mean true k·R of a passed drill's skills 7 / 21 days after the pass with no further practice. */
  retention7: number | null;
  retention21: number | null;
  retentionByDrill: Record<string, { kAtPass: number; r7: number; r21: number }>;
  /** 3. Passed drills with mean true k < 0.6 at the pass or retention7 < 0.6. */
  falsePasses: string[];
  falsePassRate: number;
  /** 4. Share of picks spent on seen skills with k > 0.9 and R > 0.95; share of forgotten passed skill-days not asked within 7 days although ≥ 2 sessions ran. */
  overScheduled: number;
  underScheduled: number | null;
  /** 5. Lift of weak skills (k·R < 0.6) among second-half picks over their share of the seen set. */
  weakShare: number | null;
  /** 6. Mean |knowledge − k| and |recall − R| over seen skills at session ends after session 5. */
  calibration: { knowledge: number; recall: number } | null;
  /** 7. Mean help level of the first drill's groups per calendar day (null on days without a session). */
  helpByDay: (number | null)[];
  /** 8. Break metrics: slipped drills at the first pick back, re-pass sessions, review share, reviews among the first five picks back. */
  returnSlips: number | null;
  rePass: { slipped: number; rePassed: number; sessions: number | null } | null;
  reviewShare: number;
  warmupPicks: number | null;
  /** True state at the end: exposed skills and their mean knowledge. */
  trueSkills: { seen: number; meanK: number };
  jamChords: number;
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Hidden state of a skill at time t: its last recorded change at or before t (undefined before its first exposure). */
function stateAt(history: WorldEvent[] | undefined, t: number): TrueSkill | undefined {
  if (!history) return undefined;
  let found: TrueSkill | undefined;
  for (const e of history) {
    if (e.at > t) break;
    found = e;
  }
  return found;
}

export function buildReport(trace: SimTrace): SimReport {
  const { picks, sessions, passes, history, t0, days } = trace;
  const dayEnd = (d: number): number => t0 + (d + 1) * DAY;

  // 1. time to pass
  const timeToPass: Record<string, TimeToPass> = {};
  for (const p of passes) timeToPass[p.drill] = { answers: p.answers, sessions: p.sessions, days: p.day - p.firstDay + 1 };

  // 2. + 3. counterfactual retention and false passes
  const retentionByDrill: SimReport['retentionByDrill'] = {};
  const falsePasses: string[] = [];
  for (const p of passes) {
    const ts = Object.values(p.skills);
    const kAtPass = mean(ts.map((t) => t.k)) ?? 0;
    const r7 = mean(ts.map((t) => t.k * recallOf(t, p.at + 7 * DAY))) ?? 0;
    const r21 = mean(ts.map((t) => t.k * recallOf(t, p.at + 21 * DAY))) ?? 0;
    retentionByDrill[p.drill] = { kAtPass, r7, r21 };
    if (kAtPass < WEAK || r7 < WEAK) falsePasses.push(p.drill);
  }
  const rows = Object.values(retentionByDrill);

  // 4. over- and under-scheduling
  const overScheduled = picks.length ? picks.filter((p) => p.seen && p.k > 0.9 && p.R > 0.95).length / picks.length : 0;
  let cells = 0, missed = 0;
  const sessionsByDay = new Map<number, number>();
  for (const s of sessions) sessionsByDay.set(s.day, (sessionsByDay.get(s.day) ?? 0) + 1);
  const askedDays = new Map<string, Set<number>>();
  for (const p of picks) (askedDays.get(p.skill) ?? askedDays.set(p.skill, new Set()).get(p.skill)!).add(p.day);
  for (const p of passes) {
    for (const skill of Object.keys(p.skills)) {
      for (let d = p.day + 1; d + 7 < days; d++) {
        const t = stateAt(history[skill], dayEnd(d));
        if (!t || recallOf(t, dayEnd(d)) >= 0.5) continue;
        let ran = 0, asked = false;
        for (let w = d + 1; w <= d + 7; w++) {
          ran += sessionsByDay.get(w) ?? 0;
          if (askedDays.get(skill)?.has(w)) asked = true;
        }
        if (ran < 2) continue;
        cells++;
        if (!asked) missed++;
      }
    }
  }
  const underScheduled = cells ? missed / cells : null;

  // 5. weak share (second half of the run)
  const half = picks.slice(Math.floor(picks.length / 2));
  const seenSoFar = new Set<string>();
  for (const p of picks.slice(0, Math.floor(picks.length / 2))) seenSoFar.add(p.skill);
  let weakPicks = 0;
  const expected: number[] = [];
  for (const p of half) {
    seenSoFar.add(p.skill);
    if (p.k * p.R < WEAK) weakPicks++;
    let weak = 0;
    for (const s of seenSoFar) {
      const t = s === p.skill ? undefined : stateAt(history[s], p.at);
      const kR = s === p.skill ? p.k * p.R : t ? t.k * recallOf(t, p.at) : 1;
      if (kR < WEAK) weak++;
    }
    expected.push(weak / seenSoFar.size);
  }
  const expectedShare = mean(expected);
  const weakShare = half.length && expectedShare ? weakPicks / half.length / expectedShare : null;

  // 6. calibration
  const calibration = trace.calib.length
    ? { knowledge: mean(trace.calib.map((c) => c.dk))!, recall: mean(trace.calib.map((c) => c.dr))! }
    : null;

  // 8. breaks and reviews
  const slips = Object.values(trace.slipAfterBreak);
  const rePassed = slips.filter((s) => s.rePassed !== null);
  const rePass = trace.breakAt === null ? null : {
    slipped: slips.length,
    rePassed: rePassed.length,
    sessions: rePassed.length ? Math.max(...rePassed.map((s) => s.rePassed! - s.slipped)) : null,
  };
  const finalKs = Object.values(trace.finalK);

  return {
    driver: trace.driver,
    persona: trace.persona,
    track: trace.track,
    days,
    seed: trace.seed,
    answers: picks.length,
    sessions: sessions.length,
    passed: passes.map((p) => p.drill),
    timeToPass,
    retention7: mean(rows.map((r) => r.r7)),
    retention21: mean(rows.map((r) => r.r21)),
    retentionByDrill,
    falsePasses,
    falsePassRate: passes.length ? falsePasses.length / passes.length : 0,
    overScheduled,
    underScheduled,
    weakShare,
    calibration,
    helpByDay: trace.helpByDay,
    returnSlips: trace.returnSlips,
    rePass,
    reviewShare: picks.length ? picks.filter((p) => p.review).length / picks.length : 0,
    warmupPicks: trace.warmupPicks,
    trueSkills: { seen: finalKs.length, meanK: mean(finalKs) ?? 0 },
    jamChords: trace.jamChords,
  };
}
