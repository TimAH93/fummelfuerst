import { describe, expect, it } from './expect';
import {
  DEFAULT_MODEL,
  Drill,
  Exercise,
  HelpLevel,
  LearnerState,
  Rng,
  SkillStats,
  TrackId,
  applyAttempt,
  buildCatalog,
  buildCurriculum,
  createRng,
  emptyState,
  getFamily,
  markPassed,
  meanRecall,
  nextDrillExercise,
  nextSessionExercise,
  planSession,
  recommendDrill,
  recordAttempt,
  reviewDrills,
  warmupLeft,
} from '../src/core';

const catalog = buildCatalog();
const curriculum = buildCurriculum(catalog);
const DAY = 86_400_000;
/** Clock base: epoch 0 reads as "no exposure yet" (last/lastOk = 0). */
const T0 = 1_000_000;
const STEP = 30_000;

const byId = (id: string): Drill => curriculum.find((d) => d.id === id)!;

/** Answer one exercise, self-rated, and record passes. */
function answer(state: LearnerState, ex: Exercise, helpLevel: HelpLevel, ok: boolean, now: number): LearnerState {
  const a = recordAttempt(ex, { kind: 'self', rating: ok ? 'instant' : 'miss' }, { mode: 'play', latencyMs: 2000, helpLevel, at: now });
  return markPassed(applyAttempt(state, a, getFamily(ex.family).tempo), curriculum, now);
}

/** A strong player's daily sessions of 25 answers on a track until `drills` of it are passed; returns the state and the clock after the last answer. */
function learn(track: TrackId, drills: number, seed = 1): { state: LearnerState; now: number } {
  let state: LearnerState = emptyState();
  const rng = createRng(seed);
  let now = T0;
  for (let session = 0; session < 80; session++) {
    for (let i = 0; i < 25; i++) {
      now = T0 + session * DAY + i * STEP;
      if (Object.keys(state.passed).filter((id) => id.startsWith(`${track}/`)).length >= drills) return { state, now };
      const drill = recommendDrill(state, curriculum, track)!;
      const { exercise, helpLevel } = nextDrillExercise(state, drill, catalog, rng, now);
      state = answer(state, exercise, helpLevel, true, now);
    }
  }
  throw new Error(`${track}: ${drills} drills not passed in 80 sessions`);
}

/** An Rng that counts its draws (every method draws once; shuffle n − 1 times). */
function countingRng(seed: number): { rng: Rng; draws: () => number } {
  const base = createRng(seed);
  let n = 0;
  const rng: Rng = {
    next: () => { n++; return base.next(); },
    uint32: () => { n++; return base.uint32(); },
    int: (lo, hi) => { n++; return base.int(lo, hi); },
    pick: (items) => { n++; return base.pick(items); },
    shuffle: (items) => { n += Math.max(0, items.length - 1); return base.shuffle(items); },
    bool: (p) => { n++; return base.bool(p); },
  };
  return { rng, draws: () => n };
}

/** A comfortable skill as a strong player leaves it: 19/1, held, recalled at `lastOk` with half-life `hl`. */
const comfortable = (hl: number, lastOk: number): SkillStats => ({ a: 19, b: 1, n: 20, flu: 0.8, hl, last: lastOk, lastOk, lastQ: lastOk, held: 3, lapses: 0 });

/** A state with `drill` passed and every one of its skills at recall R when read at `now`. */
function passedAt(drill: Drill, R: number, now: number): LearnerState {
  const hl = DAY;
  const lastOk = now + Math.log2(R) * hl; // 2^(−(now − lastOk)/hl) = R
  const skills = Object.fromEntries(drill.skills.map((id) => [id, comfortable(hl, lastOk)]));
  return { ...emptyState(), skills, passed: { [drill.id]: lastOk }, lastActive: lastOk };
}

describe('mixed session', () => {
  it('draws the single-drill stream byte-identically when there are no reviews', () => {
    const drill = curriculum[0];
    let a: LearnerState = emptyState(), b: LearnerState = emptyState();
    const ra = countingRng(7), rb = createRng(7);
    for (let i = 0; i < 40; i++) {
      const now = T0 + i * STEP;
      const plan = planSession(a, curriculum, drill, now);
      expect(plan).toEqual({ drill, reviews: [], pMix: 0, warm: false });
      const before = ra.draws();
      const x = nextSessionExercise(a, plan, ra.rng, now);
      expect(ra.draws() - before).toBe(3); // family, skill, exercise seed – nothing more
      const y = nextDrillExercise(b, drill, catalog, rb, now);
      expect(Object.keys(x)).toEqual(['exercise', 'helpLevel', 'target']);
      expect(x.exercise.id).toBe(y.exercise.id);
      expect(x.target.skill).toBe(y.target.skill);
      a = answer(a, x.exercise, x.helpLevel, i % 5 !== 0, now);
      b = answer(b, y.exercise, y.helpLevel, i % 5 !== 0, now);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('reviews only passed drills of the same track that are fading, most forgotten first, never one inside the main drill', () => {
    const { state, now } = learn('fretboard', 3); // 6/naturals, 6/all, 5/naturals
    const drill = recommendDrill(state, curriculum, 'fretboard')!;
    expect(drill.id).toBe('fretboard/5/all');
    const later = now + 3 * DAY;
    const reviews = reviewDrills(state, curriculum, drill, later);
    expect(reviews.map((d) => d.id).sort()).toEqual(['fretboard/6/all', 'fretboard/6/naturals']);
    expect(reviews.length <= DEFAULT_MODEL.reviewDrills).toBe(true);
    for (const d of reviews) {
      expect(state.passed[d.id] !== undefined).toBe(true);
      expect(d.track).toBe('fretboard');
      expect(d.id !== drill.id).toBe(true);
      expect(meanRecall(state, d, later) < DEFAULT_MODEL.reviewBelow).toBe(true);
    }
    const recalls = reviews.map((d) => meanRecall(state, d, later));
    expect([...recalls].sort((p, q) => p - q)).toEqual(recalls);
    // 5/naturals is passed but sits inside 5/all: practising the main drill already covers it
    expect(reviews.some((d) => d.id === 'fretboard/5/naturals')).toBe(false);
    // a passed drill of another track never shows up
    const foreign: LearnerState = { ...state, passed: { ...state.passed, 'keys/maj/0': now } };
    expect(reviewDrills(foreign, curriculum, drill, later).map((d) => d.id)).toEqual(reviews.map((d) => d.id));
    // an unpassed drill never does, however faded
    expect(reviewDrills({ ...state, passed: {} }, curriculum, drill, later)).toEqual([]);
    expect(reviewDrills(emptyState(), curriculum, drill, later)).toEqual([]);
    // the cap: with 6/naturals, 6/all and 5/naturals passed and 4/naturals the main drill, only the two most forgotten come up
    const fourth = byId('fretboard/4/naturals');
    expect(reviewDrills(state, curriculum, fourth, later).length).toBe(DEFAULT_MODEL.reviewDrills);
    expect(reviewDrills(state, curriculum, fourth, later, { ...DEFAULT_MODEL, reviewDrills: 3 }).length).toBe(3);
  });
  it('labels review picks, never draws an unseen skill for them, and keeps the main drill the only unpassed drill drawn', () => {
    let { state, now } = learn('fretboard', 2);
    now += 2 * DAY;
    const { rng, draws } = countingRng(11);
    let reviewsSeen = 0, mainSeen = 0;
    for (let i = 0; i < 150; i++) {
      const t = now + i * STEP;
      const drill = recommendDrill(state, curriculum, 'fretboard')!;
      const plan = planSession(state, curriculum, drill, t);
      const before = draws();
      const pick = nextSessionExercise(state, plan, rng, t);
      const used = draws() - before;
      if (pick.review) {
        reviewsSeen++;
        expect(plan.reviews.includes(pick.review)).toBe(true);
        expect(state.passed[pick.review.id] !== undefined).toBe(true);
        expect(pick.review.skills.includes(pick.target.skill)).toBe(true);
        expect(state.skills[pick.target.skill].n > 0).toBe(true);
        expect(used).toBe(plan.reviews.length > 1 ? 5 : 4); // mix draw, (review draw), family, skill, seed
      } else {
        mainSeen++;
        expect(drill.skills.includes(pick.target.skill)).toBe(true);
        expect(pick.target.skill).toBe(pick.exercise.skills[0]);
        expect(used).toBe(plan.reviews.length > 0 ? 4 : 3);
      }
      state = answer(state, pick.exercise, pick.helpLevel, true, t);
    }
    expect(reviewsSeen > 0 && mainSeen > 0).toBe(true);
  });
  it('opens a comeback session with five review picks, then mixes as usual; the home card does not change', () => {
    let { state, now } = learn('fretboard', 2);
    now += 10 * DAY;
    expect(warmupLeft(state, now)).toBe(DEFAULT_MODEL.warmupN);
    const drill = recommendDrill(state, curriculum, 'fretboard')!;
    const rng = createRng(3);
    const kinds: boolean[] = [];
    const plans: { pMix: number; warm: boolean }[] = [];
    for (let i = 0; i < 8; i++) {
      const t = now + i * STEP;
      const plan = planSession(state, curriculum, drill, t);
      plans.push({ pMix: plan.pMix, warm: plan.warm });
      const pick = nextSessionExercise(state, plan, rng, t);
      kinds.push(pick.review !== undefined);
      state = answer(state, pick.exercise, pick.helpLevel, true, t);
    }
    expect(kinds.slice(0, DEFAULT_MODEL.warmupN)).toEqual([true, true, true, true, true]);
    expect(plans.slice(0, DEFAULT_MODEL.warmupN).every((p) => p.warm && p.pMix === 1)).toBe(true);
    expect(plans.slice(DEFAULT_MODEL.warmupN).every((p) => !p.warm && p.pMix <= DEFAULT_MODEL.mixMax)).toBe(true);
    expect(recommendDrill(state, curriculum, 'fretboard')!.id).toBe(drill.id);
    expect(Object.keys(state.passed).length).toBe(2);
  });
  it('mixes between 25 % and 50 % by how far the reviews have faded, 0 without reviews, 1 in the warm-up', () => {
    const first = byId('fretboard/6/naturals');
    const main = byId('fretboard/5/naturals');
    const now = T0 + 30 * DAY;
    const plan = (R: number, cfg = DEFAULT_MODEL) => planSession(passedAt(first, R, now), curriculum, main, now, cfg);
    expect(plan(0.95)).toEqual({ drill: main, reviews: [], pMix: 0, warm: false }); // still fresh: nothing to review
    expect(plan(0.8).reviews.map((d) => d.id)).toEqual([first.id]);
    expect(plan(0.8).pMix).toBeCloseTo(0.25 + 0.25 * 0.2, 1e-9);
    expect(plan(0.8).warm).toBe(false);
    expect(plan(0.1).pMix).toBeCloseTo(0.25 + 0.25 * 0.9, 1e-9);
    expect(plan(0.1, { ...DEFAULT_MODEL, mixBase: 0.4 }).pMix).toBe(DEFAULT_MODEL.mixMax);
    expect(plan(0.1, { ...DEFAULT_MODEL, mixMax: 0.3 }).pMix).toBe(0.3);
    expect(plan(0.89).pMix >= DEFAULT_MODEL.mixBase).toBe(true);
    // the same reviews after a week away: the warm-up takes every pick
    const away = { ...passedAt(first, 0.1, now), lastActive: now - 8 * DAY };
    expect(planSession(away, curriculum, main, now)).toEqual({ drill: main, reviews: [first], pMix: 1, warm: true });
    // the drill that contains the passed one is never mixed with it
    expect(planSession(passedAt(first, 0.1, now), curriculum, byId('fretboard/6/all'), now).reviews).toEqual([]);
  });
  it('picks among two review drills by how much they have faded, with one extra draw', () => {
    const a = byId('fretboard/6/naturals'), b = byId('fretboard/5/naturals'), main = byId('fretboard/4/naturals');
    const now = T0 + 30 * DAY;
    const state: LearnerState = {
      ...emptyState(),
      skills: { ...passedAt(a, 0.05, now).skills, ...passedAt(b, 0.8, now).skills },
      passed: { [a.id]: T0, [b.id]: T0 },
      lastActive: now - DAY,
    };
    const plan = planSession(state, curriculum, main, now);
    expect(plan.reviews.map((d) => d.id)).toEqual([a.id, b.id]);
    const { rng, draws } = countingRng(9);
    const counts = { [a.id]: 0, [b.id]: 0, main: 0 };
    for (let i = 0; i < 400; i++) {
      const before = draws();
      const pick = nextSessionExercise(state, plan, rng, now);
      expect(draws() - before).toBe(pick.review ? 5 : 4);
      counts[pick.review?.id ?? 'main']++;
    }
    // weights 0.95 : 0.2 – the forgotten drill comes up far more often, the fresher one still comes up
    expect(counts[a.id] > 3 * counts[b.id]).toBe(true);
    expect(counts[b.id] > 0).toBe(true);
    // pMix ≈ 0.25 + 0.25 × (1 − 0.425) ≈ 0.39 of the picks are reviews
    const share = (counts[a.id] + counts[b.id]) / 400;
    expect(Math.abs(share - plan.pMix) < 0.08).toBe(true);
  });
});
