import { describe, expect, it } from './expect';
import {
  DEFAULT_MODEL,
  LearnerState,
  SkillStats,
  TRACKS,
  TrackId,
  applyAttempt,
  buildCatalog,
  buildCurriculum,
  createRng,
  drillProgress,
  emptyState,
  getFamily,
  intervalShape,
  isComfortable,
  knowledge,
  markPassed,
  nextDrillExercise,
  recommendDrill,
  recordAttempt,
} from '../src/core';

const catalog = buildCatalog();
const curriculum = buildCurriculum(catalog);
const DAY = 86_400_000;
/** Clock base for time-dependent runs: epoch 0 reads as "no exposure yet" (last/lastOk = 0). */
const T0 = 1_000_000;
/** One session: SESSION answers, STEP apart; sessions start one day apart. */
const SESSION = 25;
const STEP = 30_000;

const byId = (id: string) => curriculum.find((d) => d.id === id)!;

/** Practise the recommended drill of a track like a player would, in daily sessions; returns the drills finished in order. */
function train(p: number, sessions: number, track: TrackId, seed = 1) {
  let state: LearnerState = emptyState();
  const rng = createRng(seed);
  const player = createRng(seed + 99);
  const finished: string[] = [];
  let answers = 0;
  for (let session = 0; session < sessions; session++) {
    for (let i = 0; i < SESSION; i++) {
      const now = T0 + session * DAY + i * STEP;
      const drill = recommendDrill(state, curriculum, track);
      if (!drill) return { state, finished, answers };
      const { exercise, helpLevel } = nextDrillExercise(state, drill, catalog, rng, now);
      if (!drill.skills.includes(exercise.skills[0])) throw new Error(`left the drill: ${exercise.skills[0]}`);
      const ok = player.next() < p;
      const a = recordAttempt(exercise, { kind: 'self', rating: ok ? 'instant' : 'miss' }, { mode: 'play', latencyMs: 2000, helpLevel, at: now });
      state = markPassed(applyAttempt(state, a, getFamily(exercise.family).tempo), curriculum, now);
      answers++;
      if (state.passed[drill.id] !== undefined && !finished.includes(drill.id)) finished.push(drill.id);
    }
  }
  return { state, finished, answers };
}

/** A comfortable skill as a strong player leaves it: 19/1, held, recalled at `lastOk` with half-life `hl`. */
const comfortable = (hl: number, lastOk: number): SkillStats => ({ a: 19, b: 1, n: 20, flu: 0.8, hl, last: lastOk, lastOk, held: 3, lapses: 0 });

describe('curriculum', () => {
  it('has one path per track, small drills, unique ids, only catalog skills', () => {
    const ids = curriculum.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    const known = new Set(catalog.map((c) => c.skill));
    for (const d of curriculum) {
      expect(d.skills.length).toBeGreaterThan(0);
      expect(d.skills.length <= 12).toBe(true);
      expect(d.skills.every((s) => known.has(s))).toBe(true);
    }
    expect(TRACKS.map((t) => curriculum.filter((d) => d.track === t.id).length)).toEqual([12, 42, 32, 14, 8, 9]);
  });
  it('carries the catalog entries of its skills, with edges and difficulty', () => {
    for (const d of curriculum) {
      expect(d.entries.map((e) => e.skill)).toEqual(d.skills);
      expect(d.entries.every((e) => e.family === d.family && Array.isArray(e.edges) && e.difficulty >= 0 && e.difficulty <= 1)).toBe(true);
    }
    // 'Saite 6: Stammtöne' climbs the neck: E(0) F(1) G(3) A(5) B(7) C(8) D(10)
    const naturals = [...byId('fretboard/6/naturals').entries].sort((p, q) => p.difficulty - q.difficulty).map((e) => e.skill);
    expect(naturals).toEqual(['E', 'F', 'G', 'A', 'B', 'C', 'D'].map((n) => `note:${n}/string:6`));
    // a transfer edge only ever points inside the catalog
    const known = new Set(catalog.map((c) => c.skill));
    expect(catalog.every((c) => c.edges.every((e) => known.has(e.to)))).toBe(true);
  });
  it('starts each track with the most basic drill', () => {
    expect(recommendDrill(emptyState(), curriculum, 'fretboard')!.title).toBe('Saite 6: Stammtöne');
    expect(recommendDrill(emptyState(), curriculum, 'intervals')!.title).toBe('Quinte aufwärts – Nachbarsaite');
    expect(recommendDrill(emptyState(), curriculum, 'triads')!.title).toBe('Dur, Grundstellung – Saiten 3-2-1');
  });
  it('classifies interval shapes by string distance and the G/B pair', () => {
    expect(intervalShape(5, 4)).toBe('adjacent');
    expect(intervalShape(3, 2)).toBe('adjacent-gb');
    expect(intervalShape(2, 3)).toBe('adjacent-gb');
    expect(intervalShape(4, 2)).toBe('skip');
    expect(intervalShape(6, 3)).toBe(null);
  });
  it('the fifth on adjacent strings is the four regular pairs, G/B is its own drill', () => {
    const d = byId('intervals/5/up/adjacent');
    expect(d.skills).toEqual(['interval:5/up/strings:6-5', 'interval:5/up/strings:5-4', 'interval:5/up/strings:4-3', 'interval:5/up/strings:2-1']);
    expect(byId('intervals/5/up/adjacent-gb').skills).toEqual(['interval:5/up/strings:3-2']);
  });
});

describe('ladder inside a drill', () => {
  it('opens a fretboard drill with the two lowest-fret skills and introduces a new one only while fewer than two are in learning', () => {
    const drill = byId('fretboard/6/naturals');
    let state: LearnerState = emptyState();
    const rng = createRng(5);
    const order: string[] = [];
    for (let i = 0; i < 120; i++) {
      const now = T0 + i * STEP;
      const { exercise, helpLevel, target } = nextDrillExercise(state, drill, catalog, rng, now);
      if (!state.skills[target.skill]) {
        const learning = drill.skills.filter((s) => state.skills[s] && knowledge(state.skills[s]) < DEFAULT_MODEL.learningDone).length;
        expect(learning < DEFAULT_MODEL.maxLearningDrill).toBe(true);
        order.push(target.skill);
      }
      state = applyAttempt(state, recordAttempt(exercise, { kind: 'self', rating: 'instant' }, { mode: 'play', latencyMs: 1500, helpLevel, at: now }), getFamily(exercise.family).tempo);
    }
    expect(order.length).toBe(drill.skills.length);
    expect(new Set(order.slice(0, 2))).toEqual(new Set(['note:E/string:6', 'note:F/string:6']));
    // first appearances climb the neck, at most one rung out of order (rank 1 is admitted beside rank 0)
    const rungs = ['E', 'F', 'G', 'A', 'B', 'C', 'D'].map((n) => `note:${n}/string:6`);
    for (const [i, skill] of rungs.entries()) expect(Math.abs(order.indexOf(skill) - i) <= 1).toBe(true);
  });
  it('a one-skill drill always asks its skill', () => {
    const drill = byId('melody/major/1');
    const rng = createRng(2);
    for (let i = 0; i < 10; i++) expect(nextDrillExercise(emptyState(), drill, catalog, rng, T0).target.skill).toBe(drill.skills[0]);
  });
});

describe('drill progression', () => {
  it('a strong player finishes at least six fretboard drills in 40 sessions, strictly in path order', () => {
    const { finished } = train(0.97, 40, 'fretboard');
    const path = curriculum.filter((d) => d.track === 'fretboard').map((d) => d.id);
    expect(finished.length >= 6).toBe(true);
    expect(finished).toEqual(path.slice(0, finished.length));
  });
  it('a struggling player (p = 0.5) stays on the first drill', () => {
    const { state } = train(0.5, 24, 'intervals');
    expect(recommendDrill(state, curriculum, 'intervals')!.id).toBe('intervals/5/up/adjacent');
    expect(Object.keys(state.passed)).toEqual([]);
  });
  it('a strong player finishes the whole fretboard track', () => {
    const { state, finished } = train(0.97, 120, 'fretboard');
    expect(recommendDrill(state, curriculum, 'fretboard')).toBe(undefined);
    expect(finished).toEqual(curriculum.filter((d) => d.track === 'fretboard').map((d) => d.id));
  });
  it('one slip does not send you back, a clear slump does', () => {
    const { state } = train(0.97, 12, 'fretboard');
    const first = curriculum[0];
    expect(state.passed[first.id] !== undefined).toBe(true);
    const current = recommendDrill(state, curriculum, 'fretboard')!;
    expect(current.id !== first.id).toBe(true);
    // What consecutive misses leave behind: held counted down, lapses counted up (the counts stay).
    const missed = (s: SkillStats, lapses: number): SkillStats => ({ ...s, held: 0, lapses });
    // One miss on a passed skill: still on the current drill.
    const one: LearnerState = { ...state, skills: { ...state.skills, [first.skills[0]]: missed(state.skills[first.skills[0]], 1) } };
    expect(recommendDrill(one, curriculum, 'fretboard')!.id).toBe(current.id);
    expect(drillProgress(one, first).progress > DEFAULT_MODEL.slipProgress).toBe(true);
    // Three misses in a row on every skill: the passed drill is the one recommendation again.
    const slump: LearnerState = { ...state, skills: { ...state.skills } };
    for (const s of first.skills) slump.skills[s] = missed(state.skills[s], 3);
    expect(drillProgress(slump, first).progress < DEFAULT_MODEL.slipProgress).toBe(true);
    expect(recommendDrill(slump, curriculum, 'fretboard')!.id).toBe(first.id);
    // It is the lapses that do it, not the lost break: the same skills with lapses 0 are merely not comfortable.
    const shaken: LearnerState = { ...state, skills: { ...state.skills } };
    for (const s of first.skills) shaken.skills[s] = missed(state.skills[s], 0);
    expect(drillProgress(shaken, first).progress).toBeCloseTo(0.9);
    expect(recommendDrill(shaken, curriculum, 'fretboard')!.id).toBe(current.id);
  });
  it('a later drill being comfortable does not let you skip an earlier one', () => {
    const { state } = train(0.97, 12, 'fretboard');
    const current = recommendDrill(state, curriculum, 'fretboard')!;
    const later = curriculum.filter((d) => d.track === 'fretboard').at(-1)!;
    const tampered: LearnerState = { ...state, passed: { ...state.passed, [later.id]: 0 } };
    expect(recommendDrill(tampered, curriculum, 'fretboard')!.id).toBe(current.id);
  });
  it('comfortable needs the skill to hold after a break, not just a streak', () => {
    // 30 instant answers 1 s apart: everything right, but no break → not comfortable.
    let state: LearnerState = emptyState();
    const drill = byId('triads/3-2-1/maj/0');
    const rng = createRng(3);
    for (let i = 0; i < 30; i++) {
      const { exercise, helpLevel } = nextDrillExercise(state, drill, catalog, rng, i * 1000);
      state = applyAttempt(state, recordAttempt(exercise, { kind: 'self', rating: 'instant' }, { mode: 'play', latencyMs: 1500, helpLevel, at: i * 1000 }), getFamily(exercise.family).tempo);
    }
    expect(drillProgress(state, drill).status).toBe('learning');
    const later = 11 * 60_000;
    const { exercise, helpLevel } = nextDrillExercise(state, drill, catalog, rng, later);
    state = applyAttempt(state, recordAttempt(exercise, { kind: 'self', rating: 'instant' }, { mode: 'play', latencyMs: 1500, helpLevel, at: later }), getFamily(exercise.family).tempo);
    expect(drillProgress(state, drill).status).toBe('comfortable');
  });
});

describe('time-free gates', () => {
  it('nothing un-passes by the calendar: the same card a year later, recall reported only on request', () => {
    const first = curriculum[0];
    const skills = Object.fromEntries(first.skills.map((id) => [id, comfortable(DAY, T0)]));
    const state: LearnerState = { ...emptyState(), skills, passed: { [first.id]: T0 }, lastActive: T0 };
    const now = drillProgress(state, first, T0);
    const later = drillProgress(state, first, T0 + 365 * DAY);
    expect(now).toEqual({ status: 'comfortable', progress: 1, comfortable: first.skills.length, total: first.skills.length, recall: 1 });
    expect({ ...later, recall: undefined }).toEqual({ ...now, recall: undefined });
    expect(later.recall! < 1e-9).toBe(true);
    expect('recall' in drillProgress(state, first)).toBe(false);
    expect(recommendDrill(state, curriculum, 'fretboard')!.id).toBe(curriculum[1].id);
    expect(isComfortable(comfortable(DAY, T0))).toBe(true);
    expect(isComfortable({ ...comfortable(DAY, T0), held: 0 })).toBe(false);
    expect(isComfortable({ ...comfortable(DAY, T0), n: 2 })).toBe(false);
    expect(isComfortable({ ...comfortable(DAY, T0), a: 14, b: 6 })).toBe(false);
  });
  it('shows transferred knowledge of an unseen skill as a little progress, never as comfortable', () => {
    // E on string 6 known well: its octave string (1) inherits a prior worth four answers.
    const state: LearnerState = { ...emptyState(), skills: { 'note:E/string:6': comfortable(DAY, T0) } };
    const drill = byId('fretboard/1/naturals');
    const p = drillProgress(state, drill);
    expect(p.status).toBe('new');
    expect(p.comfortable).toBe(0);
    expect(p.progress).toBeCloseTo(0.25 / drill.skills.length, 1e-9);
    expect(drillProgress(emptyState(), drill).progress).toBe(0);
  });
});
