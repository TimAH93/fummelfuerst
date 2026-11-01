import { describe, expect, it } from './expect';
import {
  Attempt,
  DEFAULT_CONTEXT,
  DEFAULT_MODEL,
  Edge,
  Evidence,
  HelpLevel,
  HelpOutcome,
  LearnerState,
  SkillStats,
  applyAttempt,
  applyEvidence,
  belief,
  buildCatalog,
  createRng,
  emptyState,
  evidenceOf,
  forgetPressure,
  generateExercise,
  getFamily,
  groupMastery,
  helpLevelFor,
  knowledge,
  listFamilies,
  nextExercise,
  parseState,
  priorFor,
  recall,
  recordAttempt,
  skillPath,
  skillWeight,
  updateHelp,
  updateSkill,
  warmupLeft,
} from '../src/core';

const catalog = buildCatalog(DEFAULT_CONTEXT);
const TEMPO = { fastMs: 2000, slowMs: 8000 };
const MIN = 60_000;
const DAY = 86_400_000;
/** Clock base for time-dependent tests: epoch 0 reads as "no exposure yet" (last/lastOk = 0). */
const T0 = 1_000_000;
const C5 = 'note:C/string:5';

type Outcome = boolean | 'found' | 'near';
interface AttemptOpts { latencyMs?: number; helpLevel?: HelpLevel; nudge?: string[] }

/** Hand-made self-rated attempt for unit tests. */
function attempt(skill: string, ok: Outcome, at = 0, opts: AttemptOpts = {}): Attempt {
  const rating = ok === 'found' ? 'found' : ok === 'near' ? 'near' : ok ? 'instant' : 'miss';
  const evaluation: Attempt['evaluation'] = { correct: ok === true || ok === 'found', rating };
  if (rating === 'near') evaluation.error = { kind: 'near', credit: 0.25, nudge: opts.nudge ?? [] };
  return {
    exerciseId: 'x#0', family: 'note-find', seed: 0, skills: [skill], mode: 'play',
    response: { kind: 'self', rating }, evaluation,
    latencyMs: opts.latencyMs ?? 1500, helpLevel: opts.helpLevel ?? 0, at,
  };
}

/** Auto-checked (tap) attempt: correct and scored by latency, or wrong with a diagnosis. */
function timed(skill: string, latencyMs: number, error?: Attempt['evaluation']['error'], at = 0, helpLevel: HelpLevel = 0): Attempt {
  return {
    exerciseId: 'x#0', family: 'note-find', seed: 0, skills: [skill], mode: 'tap',
    response: { kind: 'positions', positions: [] }, evaluation: error ? { correct: false, error } : { correct: true },
    latencyMs, helpLevel, at,
  };
}

/** One quiz evidence item for updateSkill. */
const quiz = (x: number, at: number, w = 1, f = 1): Evidence => ({ skill: C5, at, x, w, f, kind: 'quiz', missWeight: x === 1 ? 0 : 1 });

/** Stored stats with given weighted counts (the rest neutral). */
const stats = (a: number, b: number, extra: Partial<SkillStats> = {}): SkillStats =>
  ({ a, b, n: Math.round(a + b), flu: 0.5, hl: 10 * MIN, last: 0, lastOk: 0, held: 0, lapses: 0, ...extra });

/** Simulated player: answers each skill correctly with probability p(skill). */
function simulate(p: (skill: string) => number, steps: number, families: string[], seed = 1) {
  let state: LearnerState = emptyState();
  const rng = createRng(seed);
  const player = createRng(seed ^ 0x9e3779b9);
  const picks: string[] = [];
  let now = 0;
  for (let i = 0; i < steps; i++) {
    const { exercise, target, helpLevel } = nextExercise(state, catalog, rng, { now, families });
    const ok = player.next() < p(target.skill);
    const a = recordAttempt(exercise, { kind: 'self', rating: ok ? 'instant' : 'miss' }, { mode: 'play', latencyMs: 2000, helpLevel, at: now });
    state = applyAttempt(state, a, getFamily(exercise.family).tempo);
    picks.push(target.skill);
    now += 30_000;
  }
  return { state, picks };
}

/** Interval skills whose two strings sit on opposite sides of the G/B pair. */
const crossesGB = (skill: string): boolean => {
  const m = /strings:(\d)-(\d)/.exec(skill);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return Math.min(a, b) <= 2 && Math.max(a, b) >= 3;
};

describe('skill catalog', () => {
  it('every entry generates an exercise for exactly that skill', () => {
    for (const [i, c] of catalog.entries()) {
      const ex = generateExercise(c.family, i, DEFAULT_CONTEXT, c.focus);
      if (ex.skills[0] !== c.skill) throw new Error(`${c.skill} produced ${ex.skills[0]}`);
    }
  });
  it('lists each skill once and covers all families', () => {
    expect(new Set(catalog.map((c) => c.skill)).size).toBe(catalog.length);
    expect([...new Set(catalog.map((c) => c.family))]).toEqual(listFamilies().map((f) => f.id));
    expect(catalog.filter((c) => c.family === 'note-find').length).toBe(72);
    expect(catalog.filter((c) => c.family === 'melody-chord').length).toBe(14);
    expect(catalog.filter((c) => c.family === 'triad-build').length).toBe(46);
  });
});

describe('skill stats', () => {
  it('builds the hierarchy path', () => {
    expect(skillPath('interval:b3/up/strings:5-4')).toEqual(['interval', 'interval:b3', 'interval:b3/up', 'interval:b3/up/strings:5-4']);
    expect(skillPath('melody:minor/deg:3')).toEqual(['melody', 'melody:minor', 'melody:minor/deg:3']);
  });
  it('one right answer at help 2: mean 2/3, knowledge 0.431, n 1, no ancestor key', () => {
    const s = applyAttempt(emptyState(), attempt(C5, true, 0, { helpLevel: 2 }), TEMPO);
    expect(belief(s.skills[C5]).mean).toBeCloseTo(2 / 3);
    expect(knowledge(s.skills[C5])).toBeCloseTo(0.431, 1e-3);
    expect(s.skills[C5].n).toBe(1);
    expect(Object.keys(s.skills)).toEqual([C5]);
    // the same answer with the board on screen (level 0) is weaker evidence: 0.379
    expect(knowledge(applyAttempt(emptyState(), attempt(C5, true), TEMPO).skills[C5])).toBeCloseTo(0.379, 1e-3);
  });
  it('half-life triples per on-time recall, 10 min → 5.1 d in six; found grows it ×2.5; a miss at R = 1 divides it by five, never to zero', () => {
    let now = T0;
    let s = applyAttempt(emptyState(), attempt(C5, true, now, { helpLevel: 2 }), TEMPO);
    expect(s.skills[C5].hl).toBe(10 * MIN);
    const walk: number[] = [];
    for (let i = 0; i < 6; i++) {
      now += s.skills[C5].hl;
      s = applyAttempt(s, attempt(C5, true, now, { helpLevel: 2 }), TEMPO);
      walk.push(s.skills[C5].hl);
    }
    expect(walk.map((hl) => Math.round(hl / MIN))).toEqual([30, 90, 270, 810, 2430, 7290]);
    expect(walk[5] / DAY).toBeCloseTo(5.0625);
    // found one half-life later: right but slow grows it less (fq = 0.75 → ×2.5 instead of ×3)
    now += s.skills[C5].hl;
    s = applyAttempt(s, attempt(C5, 'found', now, { helpLevel: 2 }), TEMPO);
    expect(s.skills[C5].hl / walk[5]).toBeCloseTo(2.5);
    // a miss right after a recall (R = 1) is the most surprising: ×0.2
    const before = s.skills[C5].hl;
    s = applyAttempt(s, attempt(C5, false, now, { helpLevel: 2 }), TEMPO);
    expect(s.skills[C5].hl / before).toBeCloseTo(0.2);
    for (let i = 0; i < 20; i++) s = applyAttempt(s, attempt(C5, false, now, { helpLevel: 2 }), TEMPO);
    expect(s.skills[C5].hl).toBe(DEFAULT_MODEL.hlMin);
    expect(s.skills[C5].lastOk).toBe(now); // recall is measured from the last success, so it stays due
  });
  it('an expected miss shrinks the half-life less than a surprising one', () => {
    const fresh = stats(10, 0, { hl: 21 * DAY, lastOk: T0, last: T0 });
    const surprised = updateSkill(fresh, quiz(0, T0 + 1)).hl / DAY;
    const expected = updateSkill(fresh, quiz(0, T0 + 365 * DAY)).hl / DAY;
    expect(surprised).toBeCloseTo(4.2, 0.01);
    expect(expected).toBeCloseTo(21 * 0.2 ** 0.5, 1e-3); // R ≈ 6e-6 after a year: as good as expected
    expect(surprised < expected).toBe(true);
  });
  it('ten answers within 10 s keep held 0 and hl ≈ 10 min; one after 10 min sets held 1', () => {
    let s = emptyState();
    for (let i = 0; i < 10; i++) s = applyAttempt(s, attempt(C5, true, T0 + i * 1000), TEMPO);
    expect(s.skills[C5].held).toBe(0);
    expect(s.skills[C5].n).toBe(10);
    expect(s.skills[C5].hl).toBeCloseTo(10 * MIN, 0.5 * MIN); // cramming proves short-term memory only
    s = applyAttempt(s, attempt(C5, true, T0 + 9_000 + 10 * MIN), TEMPO);
    expect(s.skills[C5].held).toBe(1);
    s = applyAttempt(s, attempt(C5, false, T0 + 9_000 + 10 * MIN + 1), TEMPO);
    expect(s.skills[C5].held).toBe(0); // a miss takes one back
    expect(s.skills[C5].lapses).toBe(1);
  });
  it('scores tempo from latency for timed answers', () => {
    const fast = applyAttempt(emptyState(), timed(C5, 1000), TEMPO).skills[C5];
    const slow = applyAttempt(emptyState(), timed(C5, 9000), TEMPO).skills[C5];
    expect(fast.flu).toBeCloseTo(0.65);
    expect(slow.flu).toBeCloseTo(0.35);
    expect(slow.held).toBe(0);
    expect(knowledge(slow)).toBeCloseTo(knowledge(fast)); // fluency never gates passing
  });
  it('clean successes reach the comfort bar at the 6th answer unaided, the 7th at level 1, the 8th at level 0', () => {
    const firstAbove = (w: number): number => {
      let s: SkillStats | undefined;
      for (let k = 1; k <= 20; k++) {
        s = updateSkill(s, quiz(1, k * 1000, w));
        if (knowledge(s) >= DEFAULT_MODEL.comfortMastery) return k;
      }
      return Infinity;
    };
    expect([firstAbove(1), firstAbove(0.85), firstAbove(0.7)]).toEqual([6, 7, 8]);
    let three: SkillStats | undefined;
    for (let k = 1; k <= 3; k++) three = updateSkill(three, quiz(1, k * 1000));
    expect(knowledge(three)).toBeCloseTo(0.637, 1e-3);
    expect(knowledge(three) >= DEFAULT_MODEL.learningDone).toBe(true);
    // the Beta read of a steady player: 18/2 → 0.79, 17/3 → 0.74, 16/4 → 0.685
    expect(knowledge(stats(18, 2))).toBeCloseTo(0.79, 5e-3);
    expect(knowledge(stats(17, 3))).toBeCloseTo(0.74, 5e-3);
    expect(knowledge(stats(16, 4))).toBeCloseTo(0.685, 5e-3);
  });
  it('a found-only player has exactly the instant player\'s knowledge', () => {
    let instant = emptyState(), found = emptyState();
    for (let i = 0; i < 8; i++) {
      instant = applyAttempt(instant, attempt(C5, true, T0 + i * 11 * MIN), TEMPO);
      found = applyAttempt(found, attempt(C5, 'found', T0 + i * 11 * MIN), TEMPO);
    }
    expect(knowledge(found.skills[C5])).toBe(knowledge(instant.skills[C5]));
    expect(found.skills[C5].held).toBe(instant.skills[C5].held);
    expect(found.skills[C5].flu < instant.skills[C5].flu).toBe(true);
  });
  it('windows the counts: old successes count less once you miss', () => {
    let s: SkillStats | undefined;
    for (let k = 1; k <= 30; k++) s = updateSkill(s, quiz(1, k * 1000));
    expect(s!.a + s!.b).toBeCloseTo(DEFAULT_MODEL.nMax + 1); // shrunk to 20 before the 21st success
    const missed = updateSkill(s, quiz(0, 31_000));
    expect(missed.a + missed.b).toBeCloseTo(DEFAULT_MODEL.nLapse + 1);
    expect(knowledge(missed) < knowledge(s)).toBe(true);
  });
  it('is pure and round-trips through JSON', () => {
    const before = emptyState();
    const after = applyAttempt(before, attempt(C5, true), TEMPO);
    expect(before.skills).toEqual({});
    expect(parseState(JSON.stringify(after))).toEqual(after);
    expect(() => parseState('{"schemaVersion":99}')).toThrow(/Unsupported/);
  });
});

describe('evidence', () => {
  it('maps ratings, timed answers, near misses and asides to one shape', () => {
    const ev = (a: Attempt) => evidenceOf(a, TEMPO);
    expect(ev(attempt(C5, true))).toEqual([{ skill: C5, at: 0, x: 1, w: 0.7, f: 1, kind: 'quiz', missWeight: 0 }]);
    expect(ev(attempt(C5, 'found', 0, { helpLevel: 3 }))).toEqual([{ skill: C5, at: 0, x: 1, w: 1, f: 0.5, kind: 'quiz', missWeight: 0 }]);
    expect(ev(attempt(C5, 'near'))).toEqual([{ skill: C5, at: 0, x: 0.25, w: 0.7, f: 0, kind: 'quiz', missWeight: 0.5 }]);
    expect(ev(attempt(C5, false))).toEqual([{ skill: C5, at: 0, x: 0, w: 0.7, f: 0, kind: 'quiz', missWeight: 1 }]);
    expect(ev(timed(C5, 5000))[0].f).toBeCloseTo(0.5);
    expect(ev(timed(C5, 100))[0].f).toBe(1);
    expect(ev(timed(C5, 20_000))[0].f).toBe(0);
    const wrong = ev(timed(C5, 3000, { kind: 'other', credit: 0 }));
    expect(wrong).toEqual([{ skill: C5, at: 0, x: 0, w: 0.7, f: 0, kind: 'quiz', missWeight: 1 }]);
    const inversion = ev(timed('keys:maj/inv:1', 3000, { kind: 'inversion', credit: 0.5, aside: 'keys:maj/inv:0' }, 7, 1));
    expect(inversion).toEqual([
      { skill: 'keys:maj/inv:1', at: 7, x: 0.5, w: 0.85, f: 0, kind: 'quiz', missWeight: 0.5 },
      { skill: 'keys:maj/inv:0', at: 7, x: 1, w: 0.5 * 0.85, f: 0.5, kind: 'aside', missWeight: 0 },
    ]);
  });
  it('aside and play evidence move the belief but never n, held or lapses', () => {
    let s = updateSkill(undefined, quiz(1, T0));
    s = updateSkill(s, quiz(1, T0 + 11 * MIN));
    expect([s.n, s.held, s.lapses]).toEqual([2, 1, 0]);
    const aside = updateSkill(s, { ...quiz(1, T0 + 22 * MIN, 0.5), kind: 'aside' });
    expect([aside.n, aside.held, aside.lapses]).toEqual([2, 1, 0]);
    expect(aside.a > s.a && aside.lastOk === T0 + 22 * MIN && aside.hl > s.hl).toBe(true);
    const playMiss = updateSkill(s, { ...quiz(0, T0 + 22 * MIN, 0.15), kind: 'play' });
    expect([playMiss.n, playMiss.held, playMiss.lapses]).toEqual([2, 1, 0]);
    expect(playMiss.b > s.b && playMiss.lastOk === s.lastOk).toBe(true);
    let missed = s;
    for (let i = 1; i <= 5; i++) missed = updateSkill(missed, quiz(0, T0 + 22 * MIN + i));
    expect([missed.n, missed.held, missed.lapses]).toEqual([7, 0, DEFAULT_MODEL.lapseMax]);
    expect(updateSkill(missed, quiz(1, T0 + 23 * MIN)).lapses).toBe(0);
  });
  it('evidence worth nothing changes nothing', () => {
    const s = applyEvidence(emptyState(), [{ ...quiz(1, 0), w: 0 }]);
    expect(s.skills).toEqual({});
  });
});

describe('belief reads', () => {
  it('recall decays from the last success and turns into forgetting pressure', () => {
    const s = stats(5, 0, { hl: 10 * MIN, lastOk: T0, last: T0 });
    expect(recall(s, T0)).toBe(1);
    expect(recall(s, T0 + 10 * MIN)).toBe(0.5);
    expect(recall(s, 0)).toBe(1); // a clock that jumped back never counts as forgetting
    expect(recall(undefined, T0)).toBe(0);
    expect(recall(stats(3, 1), T0)).toBe(0); // never recalled: nothing to forget yet
    expect(forgetPressure(s, T0)).toBe(0);
    expect(forgetPressure(s, T0 - Math.log2(0.8) * 10 * MIN)).toBeCloseTo(0.5, 1e-6);
    expect(forgetPressure(s, T0 - Math.log2(0.6) * 10 * MIN)).toBeCloseTo(1, 1e-6);
    expect(forgetPressure(s, T0 + DAY)).toBe(1);
    expect(forgetPressure(undefined, T0)).toBe(1);
  });
  it('a transfer prior is worth at most four answers and never enters knowledge', () => {
    const edges: Edge[] = [{ to: 'note:E/string:6', kind: 'octave-string', s: 0.8 }];
    const skills = { 'note:E/string:6': stats(19, 1) };
    const prior = priorFor(edges, skills);
    expect(prior.a0).toBeCloseTo(4.636, 1e-3);
    expect(prior.b0).toBeCloseTo(1.364, 1e-3);
    const cold = belief(undefined, prior);
    expect(cold.mean).toBeCloseTo(0.773, 1e-3);
    expect(cold.low).toBeCloseTo(0.614, 1e-3);
    expect(knowledge(undefined)).toBeCloseTo(0.211, 1e-3);
    expect(belief(stats(2, 0), prior).low).toBeCloseTo(0.704, 1e-3);
    expect(knowledge(stats(2, 0))).toBeCloseTo(belief(stats(2, 0)).low);
    expect(priorFor([], skills)).toEqual({ a0: 1, b0: 1 });
    expect(priorFor([{ to: 'note:B/string:6', kind: 'fret-neighbour', s: 0.3 }], skills)).toEqual({ a0: 1, b0: 1 });
    // a weak neighbour pulls the prior below the flat one
    expect(belief(undefined, priorFor(edges, { 'note:E/string:6': stats(1, 9) })).mean < 0.5).toBe(true);
  });
  it('group knowledge averages the leaves with quiz evidence, ids sorted, 0 if none', () => {
    const skills = {
      'note:C/string:5': stats(6, 0),
      'note:C/string:6': stats(2, 2),
      'note:C/string:4': stats(3, 0, { n: 0 }), // play only: not seen
      'note:C#/string:5': stats(0, 5),
    };
    expect(groupMastery(skills, 'note:C')).toBeCloseTo((knowledge(skills['note:C/string:5']) + knowledge(skills['note:C/string:6'])) / 2);
    expect(groupMastery(skills, 'note:C#')).toBeCloseTo(knowledge(skills['note:C#/string:5']));
    expect(groupMastery(skills, 'note:D')).toBe(0);
    expect(groupMastery({}, 'note:C')).toBe(0);
  });
});

describe('attempt reducer', () => {
  it('credits the skill a wrong answer demonstrated instead, without counting it as an attempt', () => {
    const asked = 'keys:maj/inv:1', shown = 'keys:maj/inv:0';
    const s = applyAttempt(emptyState(), timed(asked, 3000, { kind: 'inversion', credit: 0.5, aside: shown }, 1000), TEMPO);
    expect(s.skills[asked].n).toBe(1);
    expect(s.skills[asked].a).toBeCloseTo(0.35);
    expect(s.skills[asked].b).toBeCloseTo(0.35);
    expect([s.skills[asked].lapses, s.skills[asked].lastOk]).toEqual([1, 0]); // a wrong answer is a full lapse
    expect(s.skills[shown].n).toBe(0);
    expect(s.skills[shown].a).toBeCloseTo(0.35);
    expect([s.skills[shown].lastOk, s.skills[shown].hl, s.skills[shown].held]).toEqual([1000, DEFAULT_MODEL.hl0, 0]);
    expect(s.help['keys:maj']).toEqual({ level: 0, good: 0, misses: 0.5 }); // an inversion error is half a miss
    expect(s.recent).toEqual([asked]);
    expect(s.lastActive).toBe(1000);
  });
  it('boosts the confusables a diagnosis names for 20 minutes and keeps the newest eight', () => {
    const nudged = applyAttempt(emptyState(), attempt(C5, 'near', 0, { nudge: ['note:C#/string:5', 'note:B/string:5', 'note:C'] }), TEMPO);
    expect(nudged.boost).toEqual({ 'note:C#/string:5': 20 * MIN, 'note:B/string:5': 20 * MIN }); // 'note:C' is no leaf
    expect(nudged.skills[C5].a).toBeCloseTo(0.7 * 0.25); // partial credit…
    expect([nudged.skills[C5].lastOk, nudged.skills[C5].lapses]).toEqual([0, 1]); // …but no recall and a full lapse
    const still = applyAttempt(nudged, attempt(C5, true, 20 * MIN - 1), TEMPO);
    expect(Object.keys(still.boost).length).toBe(2);
    const expired = applyAttempt(nudged, attempt(C5, true, 20 * MIN), TEMPO);
    expect(expired.boost).toEqual({});
    const many = catalog.filter((c) => c.family === 'note-find').slice(0, 10).map((c) => c.skill);
    const capped = applyAttempt(emptyState(), attempt(C5, 'near', 0, { nudge: many }), TEMPO);
    expect(Object.keys(capped.boost).length).toBe(DEFAULT_MODEL.boostMax);
  });
  it('owes five review picks after a week away, counted down by the attempts that follow', () => {
    const t0 = 1_000_000;
    const s1 = applyAttempt(emptyState(), attempt(C5, true, t0), TEMPO);
    expect([s1.lastActive, s1.warmup]).toEqual([t0, 0]);
    expect(warmupLeft(emptyState(), t0 + 30 * DAY)).toBe(0); // a brand-new learner has nothing to warm up
    expect(warmupLeft(s1, t0 + DAY)).toBe(0);
    expect(warmupLeft(s1, t0 + 7 * DAY)).toBe(DEFAULT_MODEL.warmupN);
    let s = applyAttempt(s1, attempt(C5, true, t0 + 7 * DAY), TEMPO);
    const left = [warmupLeft(s, t0 + 7 * DAY)];
    for (let i = 1; i <= 5; i++) {
      s = applyAttempt(s, attempt(C5, true, t0 + 7 * DAY + i * 1000), TEMPO);
      left.push(warmupLeft(s, t0 + 7 * DAY + i * 1000));
    }
    expect(left).toEqual([4, 3, 2, 1, 0, 0]);
  });
  it('remembers the last five leaves, newest first', () => {
    let s = emptyState();
    const ids = catalog.filter((c) => c.family === 'note-find').slice(0, 6).map((c) => c.skill);
    for (const id of ids) s = applyAttempt(s, attempt(id, true), TEMPO);
    expect(s.recent).toEqual([...ids].reverse().slice(0, 5));
    s = applyAttempt(s, attempt(ids[3], true), TEMPO);
    expect(s.recent[0]).toBe(ids[3]);
    expect(new Set(s.recent).size).toBe(5);
  });
});

describe('help levels with hysteresis', () => {
  const GOOD: HelpOutcome = { correct: true, good: true, missWeight: 0 };
  const SLOW: HelpOutcome = { correct: true, good: false, missWeight: 0 };
  const MISS: HelpOutcome = { correct: false, good: false, missWeight: 1 };
  const NEAR: HelpOutcome = { correct: false, good: false, missWeight: 0.5 };
  it('needs a streak and enough mastery to fade', () => {
    let h = updateHelp(undefined, GOOD, 0.9);
    for (let i = 0; i < 2; i++) h = updateHelp(h, GOOD, 0.9);
    expect(h.level).toBe(0);
    h = updateHelp(h, GOOD, 0.9);
    expect(h.level).toBe(1);
    let low = updateHelp(undefined, GOOD, 0.3);
    for (let i = 0; i < 10; i++) low = updateHelp(low, GOOD, 0.3);
    expect(low.level).toBe(0);
  });
  it('does not flip on alternating right/wrong', () => {
    let h = { level: 2 as const, good: 0, misses: 0 } as ReturnType<typeof updateHelp>;
    for (let i = 0; i < 20; i++) h = updateHelp(h, i % 2 ? GOOD : MISS, 0.9);
    expect(h.level).toBe(2);
  });
  it('comes back after two misses in a row', () => {
    let h = { level: 3 as const, good: 0, misses: 0 } as ReturnType<typeof updateHelp>;
    h = updateHelp(h, MISS, 0.9);
    expect(h.level).toBe(3);
    h = updateHelp(h, MISS, 0.9);
    expect(h.level).toBe(2);
  });
  it('counts a near miss as half a miss and a slow right answer as a reset', () => {
    let h = { level: 3 as const, good: 0, misses: 0 } as ReturnType<typeof updateHelp>;
    for (let i = 0; i < 3; i++) h = updateHelp(h, NEAR, 0.9);
    expect([h.level, h.misses]).toEqual([3, 1.5]);
    h = updateHelp(h, NEAR, 0.9);
    expect(h.level).toBe(2);
    h = updateHelp(h, MISS, 0.9);
    h = updateHelp(h, SLOW, 0.9);
    h = updateHelp(h, MISS, 0.9);
    expect([h.level, h.misses]).toEqual([2, 1]);
    h = updateHelp(h, GOOD, 0.9);
    for (let i = 0; i < 3; i++) h = updateHelp(h, SLOW, 0.9); // keeps the streak, does not extend it
    expect(h.good).toBe(1);
  });
});

describe('selection', () => {
  it('is reproducible from the session seed', () => {
    expect(simulate(() => 0.7, 50, ['interval-hunt'], 5).picks).toEqual(simulate(() => 0.7, 50, ['interval-hunt'], 5).picks);
  });
  it('damps a skill just practised', () => {
    const s = applyAttempt(emptyState(), attempt(C5, false), TEMPO);
    const entry = catalog.find((c) => c.skill === C5)!;
    const w = skillWeight(s, entry, 0, { allowNew: true });
    const other = skillWeight(applyAttempt(emptyState(), attempt('note:D/string:5', false), TEMPO), entry, 0, { allowNew: true });
    expect(w < other).toBe(true);
  });
  it('introduces new skills only while few are in learning', () => {
    const { picks } = simulate(() => 0, 60, ['note-find']);
    expect(new Set(picks).size <= 8).toBe(true);
  });
  it('spends more time on a weakness: G/B-crossing intervals', () => {
    const { picks } = simulate((s) => (crossesGB(s) ? 0.35 : 0.95), 1500, ['interval-hunt']);
    const pool = catalog.filter((c) => c.family === 'interval-hunt');
    const base = pool.filter((c) => crossesGB(c.skill)).length / pool.length;
    const late = picks.slice(500);
    const share = late.filter(crossesGB).length / late.length;
    if (share < 1.5 * base) throw new Error(`G/B share ${share.toFixed(2)} vs catalogue ${base.toFixed(2)}`);
  });
  it('fades help for a strong player, keeps it for a struggling one', () => {
    const strong = simulate(() => 0.97, 300, ['melody-chord']).state;
    const weak = simulate(() => 0.5, 300, ['melody-chord']).state;
    expect([helpLevelFor(strong, 'melody:major/deg:1'), helpLevelFor(strong, 'melody:minor/deg:1')]).toEqual([3, 3]);
    expect(helpLevelFor(weak, 'melody:major/deg:1') <= 1 && helpLevelFor(weak, 'melody:minor/deg:1') <= 1).toBe(true);
  });
});
