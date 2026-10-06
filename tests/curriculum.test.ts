import { describe, expect, it } from './expect';
import {
  LearnerState,
  TRACKS,
  applyAttempt,
  buildCatalog,
  buildCurriculum,
  createRng,
  drillProgress,
  emptyState,
  getFamily,
  intervalShape,
  markPassed,
  nextDrillExercise,
  recommendDrill,
  recordAttempt,
} from '../src/core';

const catalog = buildCatalog();
const curriculum = buildCurriculum(catalog);

/** Practise the recommended drill of a track like a player would; returns the drills finished in order. */
function train(p: number, answers: number, track: (typeof TRACKS)[number]['id'], seed = 1) {
  let state: LearnerState = emptyState();
  const rng = createRng(seed);
  const player = createRng(seed + 99);
  const finished: string[] = [];
  let now = 0;
  for (let i = 0; i < answers; i++) {
    const drill = recommendDrill(state, curriculum, track);
    if (!drill) break;
    const { exercise, helpLevel } = nextDrillExercise(state, drill, catalog, rng, now);
    if (!drill.skills.includes(exercise.skills[0])) throw new Error(`left the drill: ${exercise.skills[0]}`);
    const ok = player.next() < p;
    const a = recordAttempt(exercise, { kind: 'self', rating: ok ? 'instant' : 'miss' }, { mode: 'play', latencyMs: 2000, helpLevel, at: now });
    state = markPassed(applyAttempt(state, a, getFamily(exercise.family).tempo), curriculum, now);
    if (state.passed[drill.id] !== undefined && !finished.includes(drill.id)) finished.push(drill.id);
    now += 30_000;
  }
  return { state, finished };
}

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
    expect(TRACKS.map((t) => curriculum.filter((d) => d.track === t.id).length)).toEqual([12, 42, 32, 14]);
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
    const d = curriculum.find((x) => x.id === 'intervals/5/up/adjacent')!;
    expect(d.skills).toEqual(['interval:5/up/strings:6-5', 'interval:5/up/strings:5-4', 'interval:5/up/strings:4-3', 'interval:5/up/strings:2-1']);
    expect(curriculum.find((x) => x.id === 'intervals/5/up/adjacent-gb')!.skills).toEqual(['interval:5/up/strings:3-2']);
  });
});

describe('drill progression', () => {
  it('a strong player finishes drills strictly in order, never skipping', () => {
    const { finished } = train(0.97, 1500, 'fretboard');
    const path = curriculum.filter((d) => d.track === 'fretboard').map((d) => d.id);
    expect(finished.length >= 3).toBe(true);
    expect(finished).toEqual(path.slice(0, finished.length));
  });
  it('a struggling player stays on the first drill', () => {
    const { state } = train(0.5, 600, 'intervals');
    expect(recommendDrill(state, curriculum, 'intervals')!.id).toBe('intervals/5/up/adjacent');
  });
  it('a strong player finishes the whole fretboard track', () => {
    const { state } = train(0.97, 1500, 'fretboard');
    expect(recommendDrill(state, curriculum, 'fretboard')).toBe(undefined);
  });
  it('one slip does not send you back, a clear slump does', () => {
    const { state } = train(0.97, 300, 'fretboard');
    const first = curriculum[0];
    expect(state.passed[first.id] !== undefined).toBe(true);
    const current = recommendDrill(state, curriculum, 'fretboard')!;
    // One miss on a passed skill: still on the current drill.
    const one: LearnerState = { ...state, skills: { ...state.skills, [first.skills[0]]: { ...state.skills[first.skills[0]], box: 0 } } };
    expect(recommendDrill(one, curriculum, 'fretboard')!.id).toBe(current.id);
    // Most of it forgotten: the passed drill is the one recommendation again.
    const slump: LearnerState = { ...state, skills: { ...state.skills } };
    for (const s of first.skills) slump.skills[s] = { ...state.skills[s], acc: 0.2, box: 0 };
    expect(recommendDrill(slump, curriculum, 'fretboard')!.id).toBe(first.id);
  });
  it('a later drill being comfortable does not let you skip an earlier one', () => {
    const { state } = train(0.97, 300, 'fretboard');
    const current = recommendDrill(state, curriculum, 'fretboard')!;
    const later = curriculum.filter((d) => d.track === 'fretboard').at(-1)!;
    const tampered: LearnerState = { ...state, passed: { ...state.passed, [later.id]: 0 } };
    expect(recommendDrill(tampered, curriculum, 'fretboard')!.id).toBe(current.id);
  });
  it('comfortable needs the skill to hold after a break, not just a streak', () => {
    // 30 instant answers 1 s apart: everything right, but no break → not comfortable.
    let state: LearnerState = emptyState();
    const drill = curriculum.find((d) => d.id === 'triads/3-2-1/maj/0')!;
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
