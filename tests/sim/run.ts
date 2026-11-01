import { TrackId } from '../../src/core/curriculum/curriculum';
import { DEFAULT_CONTEXT, ExerciseContext, Rng, createRng, getFamily, recordAttempt } from '../../src/core/exercises';
import { Driver, SimDrill } from './drivers';
import { DAY, PassRecord, SimReport, SimTrace, buildReport } from './metrics';
import { Persona } from './persona';
import { World, modeFor } from './world';

/**
 * The simulation loop (spec §9.2): sessions of a persona on one track against a Driver, with
 * gaps, one optional long break and daily jamming drawn from a seeded rng; 20 s per answer.
 * Everything – the clock, the hidden learner, the exercise seeds – derives from `seed`, so
 * runSim(...) deep-equals itself for the same arguments.
 */

const HOUR = 3_600_000;
const MIN = 60_000;
/** The clock starts a week in, so no epoch-ms field of either model collides with "0 = none". */
export const T0 = 7 * DAY;
/** Wall time per answer. */
export const ANSWER_MS = 20_000;
const SESSION_HOUR = 10 * HOUR;
const JAM_HOUR = 20 * HOUR;
const SAME_DAY_GAP = 3 * HOUR;
/** Warm-up window: review picks among the first five after a break. */
const WARMUP_WINDOW = 5;
/** Calibration samples start after this many sessions. */
const CALIB_AFTER = 5;

/** Gap to the next session in days with its probability; the mean (1.9 d) is rescaled to the persona's sessions per week. */
const GAP_DAYS: readonly [number, number][] = [[0, 0.1], [1, 0.5], [2, 0.25], [4, 0.1], [10, 0.05]];
const GAP_MEAN = GAP_DAYS.reduce((a, [d, p]) => a + d * p, 0);

function drawGap(rng: Rng, persona: Persona): number {
  let r = rng.next();
  let d = GAP_DAYS[GAP_DAYS.length - 1][0];
  for (const [days, p] of GAP_DAYS) if ((r -= p) < 0) { d = days; break; }
  if (d === 0) return SAME_DAY_GAP;
  return Math.round(d * DAY * (7 / persona.sessionsPerWeek / GAP_MEAN));
}

const group = (skill: string): string => skill.split('/')[0];

export const runSim = (persona: Persona, track: TrackId, days: number, seed: number, driver: Driver, ctx: ExerciseContext = DEFAULT_CONTEXT): SimReport =>
  buildReport(runTrace(persona, track, days, seed, driver, ctx));

/** The raw trace behind a report, for debugging a driver or a persona. */
export function runTrace(persona: Persona, track: TrackId, days: number, seed: number, driver: Driver, ctx: ExerciseContext = DEFAULT_CONTEXT): SimTrace {
  const root = createRng(seed);
  const clock = createRng(root.uint32());
  const world = new World(persona, driver.catalogIds, createRng(root.uint32()), ctx);
  const picks = createRng(root.uint32());
  const { curriculum } = driver;
  const first = curriculum.find((d) => d.track === track);
  if (!first) throw new Error(`No drills on track ${track}`);
  const dayOf = (t: number): number => Math.floor((t - T0) / DAY);

  const trace: SimTrace = {
    driver: driver.name, persona: persona.id, track, days, seed, t0: T0,
    picks: [], sessions: [], passes: [], history: world.history, calib: [], helpByDay: Array.from({ length: days }, () => null),
    jamChords: 0, breakAt: null, returnSlips: null, warmupPicks: null, slipAfterBreak: {}, finalK: {},
  };
  const drillById = new Map<string, SimDrill>(curriculum.map((d) => [d.id, d]));
  const trackDrills = curriculum.filter((d) => d.track === track);

  let state = driver.empty();
  let now = T0 + SESSION_HOUR;
  let session = 0;
  let breakDone = false;
  let comeback = false;          // the next pick is the first one after the break
  let warmupLeft = 0;
  let jamDay = 0;
  let done = false;

  const jamUntil = (day: number): void => {
    for (; jamDay < Math.min(day, days); jamDay++) {
      const at = Math.max(T0 + jamDay * DAY + JAM_HOUR, now + MIN);
      for (const ev of world.jam(at)) {
        trace.jamChords++;
        if (driver.play) state = driver.play(state, ev);
      }
    }
  };

  while (dayOf(now) < days && !done) {
    session++;
    const start = now;
    const len = clock.int(persona.sessionLen[0], persona.sessionLen[1]);
    for (let i = 0; i < len; i++) {
      const drill = driver.recommend(state, curriculum, track);
      if (!drill) { done = true; break; }
      if (comeback) {
        trace.returnSlips = trackDrills.filter((d) => driver.passed(state)[d.id] !== undefined && driver.slipped(state, d)).length;
        trace.warmupPicks = 0;
        warmupLeft = WARMUP_WINDOW;
        comeback = false;
      }
      const { exercise, helpLevel, review } = driver.next(state, drill, curriculum, picks, now);
      const skill = exercise.skills[0];
      const seen = world.seen(skill);
      const ans = world.answer(exercise, helpLevel, now);
      const attempt = recordAttempt(exercise, ans.response, { mode: modeFor(exercise.family), latencyMs: ans.latencyMs, helpLevel, at: now });
      const before = driver.passed(state);
      state = driver.apply(state, attempt, getFamily(exercise.family).tempo, curriculum, now);
      world.observe(skill, attempt.evaluation.correct, helpLevel, now);

      const day = dayOf(now);
      trace.picks.push({
        i: trace.picks.length, session, day, at: now, drill: review ? review.id : drill.id, review: !!review,
        skill, help: helpLevel, seen, k: ans.k, R: ans.R, correct: attempt.evaluation.correct,
      });
      if (warmupLeft > 0) {
        if (review) trace.warmupPicks!++;
        warmupLeft--;
      }
      for (const id of Object.keys(driver.passed(state))) {
        if (before[id] !== undefined) continue;
        const d = drillById.get(id)!;
        const own = trace.picks.filter((p) => p.drill === id && !p.review);
        const pass: PassRecord = {
          drill: id, at: now, session, day,
          answers: own.length, sessions: new Set(own.map((p) => p.session)).size, firstDay: own.length ? own[0].day : day,
          skills: Object.fromEntries(d.skills.map((s) => [s, { ...world.peek(s) }])),
        };
        trace.passes.push(pass);
      }
      now += ANSWER_MS;
    }

    // ── session end ──
    const day = dayOf(start);
    trace.sessions.push({ index: session, day, start, end: now });
    if (session > CALIB_AFTER) {
      for (const [skill, t] of Object.entries(world.skills)) {
        trace.calib.push({
          dk: Math.abs(driver.knowledge(state, skill) - t.k),
          dr: Math.abs(driver.recall(state, skill, now) - world.recall(skill, now)),
        });
      }
    }
    if (day < days) {
      const levels: number[] = first.skills.filter((s, i, all) => all.findIndex((x) => group(x) === group(s)) === i).map((s) => driver.helpLevel(state, s));
      trace.helpByDay[day] = levels.reduce((a, b) => a + b, 0) / levels.length;
    }
    if (trace.breakAt !== null) {
      const passed = driver.passed(state);
      for (const d of trackDrills) {
        if (passed[d.id] === undefined) continue;
        const slipped = driver.slipped(state, d);
        const rec = trace.slipAfterBreak[d.id];
        if (slipped && !rec) trace.slipAfterBreak[d.id] = { slipped: session, rePassed: null };
        else if (!slipped && rec && rec.rePassed === null) rec.rePassed = session;
      }
    }
    if (done) break;

    // ── gap, break, jamming ──
    let gap: number;
    if (!breakDone && persona.breakEvery !== undefined && dayOf(now) >= persona.breakEvery) {
      gap = (persona.breakDays ?? 14) * DAY;
      breakDone = true;
      comeback = true;
      trace.breakAt = now + gap;
    } else gap = drawGap(clock, persona);
    jamUntil(dayOf(now + gap));
    now += gap;
  }
  jamUntil(days);
  for (const [skill, t] of Object.entries(world.skills)) trace.finalK[skill] = t.k;
  return trace;
}
