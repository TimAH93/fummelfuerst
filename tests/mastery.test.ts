import { describe, expect, it } from './expect';
import {
  Attempt,
  DEFAULT_CONTEXT,
  LEITNER_MS,
  LearnerState,
  applyAttempt,
  buildCatalog,
  createRng,
  emptyState,
  generateExercise,
  getFamily,
  helpLevelFor,
  listFamilies,
  nextExercise,
  parseState,
  recordAttempt,
  skillPath,
  skillWeight,
  updateHelp,
} from '../src/core';

const catalog = buildCatalog(DEFAULT_CONTEXT);
const TEMPO = { fastMs: 2000, slowMs: 8000 };

/** Hand-made attempt for unit tests. */
function attempt(skill: string, ok: boolean | 'found', at = 0, latencyMs = 1500): Attempt {
  const rating = ok === 'found' ? 'found' : ok ? 'instant' : 'miss';
  return {
    exerciseId: 'x#0', family: 'note-find', seed: 0, skills: [skill], mode: 'play',
    response: { kind: 'self', rating }, evaluation: { correct: ok !== false, rating },
    latencyMs, helpLevel: 0, at,
  };
}

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
    expect(catalog.filter((c) => c.family === 'triad-build').length).toBe(48);
  });
});

describe('skill stats', () => {
  it('builds the hierarchy path', () => {
    expect(skillPath('interval:b3/up/strings:5-4')).toEqual(['interval', 'interval:b3', 'interval:b3/up', 'interval:b3/up/strings:5-4']);
    expect(skillPath('melody:minor/deg:3')).toEqual(['melody', 'melody:minor', 'melody:minor/deg:3']);
  });
  it('moves accuracy by α = 0.3 from a neutral prior and updates every ancestor', () => {
    const s = applyAttempt(emptyState(), attempt('note:C/string:5', true), TEMPO);
    expect(s.skills['note:C/string:5'].acc).toBeCloseTo(0.65);
    expect(s.skills['note:C'].n).toBe(1);
    expect(s.skills['note'].n).toBe(1);
  });
  it('walks the Leitner boxes: 0, 10 min, 1 d, 3 d, 7 d, 21 d', () => {
    let s = emptyState();
    const boxes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const due = s.skills['note:C/string:5']?.due ?? 0;
      s = applyAttempt(s, attempt('note:C/string:5', true, due), TEMPO);
      boxes.push(s.skills['note:C/string:5'].box);
    }
    expect(boxes).toEqual([1, 2, 3, 4, 5, 5]);
    const at = s.skills['note:C/string:5'].lastSeen;
    expect(s.skills['note:C/string:5'].due).toBe(at + LEITNER_MS[5]);
    s = applyAttempt(s, attempt('note:C/string:5', 'found', at + LEITNER_MS[5]), TEMPO);
    expect(s.skills['note:C/string:5'].box).toBe(5); // right but slow: stays
    s = applyAttempt(s, attempt('note:C/string:5', false, at + LEITNER_MS[5] + 1), TEMPO);
    expect(s.skills['note:C/string:5'].box).toBe(0);
  });
  it('earns a box only when the skill was due', () => {
    let s = emptyState();
    for (let i = 0; i < 10; i++) s = applyAttempt(s, attempt('note:C/string:5', true, i * 1000), TEMPO);
    expect(s.skills['note:C/string:5'].box).toBe(1); // ten in a row within 10 s
    s = applyAttempt(s, attempt('note:C/string:5', true, LEITNER_MS[1]), TEMPO);
    expect(s.skills['note:C/string:5'].box).toBe(2); // after the 10-minute gap
  });
  it('scores tempo from latency for timed answers', () => {
    const timed = (ms: number): Attempt => ({ ...attempt('note:C/string:5', true, 0, ms), response: { kind: 'positions', positions: [] }, evaluation: { correct: true }, mode: 'tap' });
    const fast = applyAttempt(emptyState(), timed(1000), TEMPO).skills['note:C/string:5'];
    const slow = applyAttempt(emptyState(), timed(9000), TEMPO).skills['note:C/string:5'];
    expect(fast.tempo).toBeCloseTo(0.65);
    expect(slow.tempo).toBeCloseTo(0.35);
    expect(slow.box).toBe(1); // correct, too slow to advance
  });
  it('is pure and round-trips through JSON', () => {
    const before = emptyState();
    const after = applyAttempt(before, attempt('note:C/string:5', true), TEMPO);
    expect(before.skills).toEqual({});
    expect(parseState(JSON.stringify(after))).toEqual(after);
    expect(() => parseState('{"schemaVersion":99}')).toThrow(/Unsupported/);
  });
});

describe('help levels with hysteresis', () => {
  const good = attempt('interval:3/up/strings:5-4', true);
  const miss = attempt('interval:3/up/strings:5-4', false);
  it('needs a streak and enough mastery to fade', () => {
    let h = updateHelp(undefined, good, 1, 0.9);
    for (let i = 0; i < 2; i++) h = updateHelp(h, good, 1, 0.9);
    expect(h.level).toBe(0);
    h = updateHelp(h, good, 1, 0.9);
    expect(h.level).toBe(1);
    let low = updateHelp(undefined, good, 1, 0.3);
    for (let i = 0; i < 10; i++) low = updateHelp(low, good, 1, 0.3);
    expect(low.level).toBe(0);
  });
  it('does not flip on alternating right/wrong', () => {
    let h = { level: 2 as const, good: 0, misses: 0 } as ReturnType<typeof updateHelp>;
    for (let i = 0; i < 20; i++) h = updateHelp(h, i % 2 ? good : miss, 1, 0.9);
    expect(h.level).toBe(2);
  });
  it('comes back after two misses in a row', () => {
    let h = { level: 3 as const, good: 0, misses: 0 } as ReturnType<typeof updateHelp>;
    h = updateHelp(h, miss, 0, 0.9);
    expect(h.level).toBe(3);
    h = updateHelp(h, miss, 0, 0.9);
    expect(h.level).toBe(2);
  });
});

describe('selection', () => {
  it('is reproducible from the session seed', () => {
    expect(simulate(() => 0.7, 50, ['interval-hunt'], 5).picks).toEqual(simulate(() => 0.7, 50, ['interval-hunt'], 5).picks);
  });
  it('damps a skill just practised', () => {
    const s = applyAttempt(emptyState(), attempt('note:C/string:5', false), TEMPO);
    const w = skillWeight(s, 'note:C/string:5', 0, true);
    const other = skillWeight(applyAttempt(emptyState(), attempt('note:D/string:5', false), TEMPO), 'note:C/string:5', 0, true);
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
