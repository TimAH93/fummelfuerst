import { describe, expect, it } from './expect';
import { DEFAULT_MODEL, LearnerState, SkillStats, emptyState, freshSkill, knowledge, parseProgression } from '../src/core';
import { PlayEvent, applyPlay, jamEvent, playEvidence, skillsForChord, skillsForHeld, timingEvent, trainerEvent, trainerQuality } from '../src/core/mastery/play';

const MIN = 60_000;
const DAY = 86_400_000;
const T0 = 1_700_000_000_000;

const ids = (midis: number[]) => skillsForHeld(midis).map((s) => s.skill);
const withSkill = (skill: string, s: Partial<SkillStats>): LearnerState => ({ ...emptyState(), skills: { [skill]: { ...freshSkill(), ...s } } });
const loop = parseProgression('Dbmaj9 C7#9 Fm9 Ebm9');

describe('skills for a held chord', () => {
  it('maps triads to keys skills in the inversion the bass gives, doublings allowed', () => {
    expect(skillsForHeld([60, 64, 67])).toEqual([{ skill: 'keys:maj/inv:0', factor: 1 }]); // C
    expect(ids([64, 67, 72])).toEqual(['keys:maj/inv:1']); // C/E
    expect(ids([55, 60, 64])).toEqual(['keys:maj/inv:2']); // C/G
    expect(ids([57, 60, 64, 69])).toEqual(['keys:min/inv:0']); // Am with doubled root
    expect(ids([62, 65, 68])).toEqual(['keys:dim/inv:0']);
  });
  it('credits an augmented triad as root position at cfg.augWeight – the bass is only a guess at the root', () => {
    expect(skillsForHeld([60, 64, 68])).toEqual([{ skill: 'keys:aug/inv:0', factor: DEFAULT_MODEL.augWeight }]);
    expect(skillsForHeld([64, 68, 72])).toEqual([{ skill: 'keys:aug/inv:0', factor: 0.5 }]); // E aug = C aug/E
    expect(skillsForHeld([60, 64, 68], { ...DEFAULT_MODEL, augWeight: 0.25 })[0].factor).toBe(0.25);
  });
  it('maps complete voicings to their voicing skill', () => {
    expect(ids([60, 64, 67, 70])).toEqual(['voicing:dom7']); // C7
    expect(ids([48, 52, 58, 63])).toEqual(['voicing:dom7s9']); // C E Bb D#
    expect(ids([51, 61, 65, 67, 72])).toEqual(['voicing:dom13']); // Eb | Db F G C
    expect(ids([41, 56, 63, 67])).toEqual(['voicing:m9']); // F | Ab Eb G
    expect(ids([48, 52, 58, 62])).toEqual(['voicing:dom9']); // C E Bb D
    expect(ids([48, 52, 59])).toEqual(['voicing:maj7']); // the shell voicing (1 3 7) of Cmaj7
    expect(ids([62, 65, 68, 72])).toEqual(['voicing:m7b5']); // D F Ab C
  });
  it('falls back to the simpler type a shell still proves, and to nothing beyond that', () => {
    expect(ids([44, 54, 60, 65])).toEqual(['voicing:dom7']); // Ab13 without fifth and ninth proves Ab7
    expect(ids([52, 55, 59, 60])).toEqual([]); // Cmaj7/E: root not in the bass, no simpler voicing either
    expect(ids([65, 68, 72, 74])).toEqual([]); // Dm7b5/F: the simpler type (dim) is no voicing skill
  });
  it('maps sus, sixth, clusters and fewer than three pitch classes to nothing', () => {
    expect(ids([60, 62, 67])).toEqual([]); // sus2
    expect(ids([60, 64, 67, 69])).toEqual([]); // C6
    expect(ids([60, 61, 62])).toEqual([]); // a cluster is no chord
    expect(ids([60, 72, 64])).toEqual([]);
    expect(ids([])).toEqual([]);
  });
  it('names the root-position skill of a trainer target', () => {
    expect(skillsForChord({ rootPc: 0, typeId: 'maj' })).toEqual([{ skill: 'keys:maj/inv:0', factor: 1 }]);
    expect(skillsForChord({ rootPc: 0, typeId: 'aug' })).toEqual([{ skill: 'keys:aug/inv:0', factor: 1 }]);
    expect(skillsForChord(loop[0])).toEqual([{ skill: 'voicing:maj9', factor: 1 }]);
    expect(skillsForChord({ rootPc: 0, typeId: 'sus4' })).toEqual([]);
  });
});

describe('play event constructors', () => {
  it('builds jam events: free 0.7, picked 0.8', () => {
    const free = jamEvent([60, 64, 67], T0, false, false);
    expect(free).toEqual({ source: 'jamFree', at: T0, skills: [{ skill: 'keys:maj/inv:0', factor: 1 }], correct: true, quality: 0.7, pad: false });
    const picked = jamEvent([48, 52, 59], T0, true, true);
    expect(picked.source).toBe('jamPick');
    expect(picked.quality).toBe(0.8);
    expect(picked.pad).toBe(true);
    expect(picked.skills).toEqual([{ skill: 'voicing:maj7', factor: 1 }]);
  });
  it('builds trainer hits by tempo and credits what was actually played', () => {
    expect(trainerQuality(30)).toBe(0.4);
    expect(trainerQuality(50)).toBe(0.4);
    expect(trainerQuality(70)).toBeCloseTo(0.7);
    expect(trainerQuality(90)).toBe(1);
    expect(trainerQuality(120)).toBe(1);
    const hit = trainerEvent(loop[0], [49, 53, 56], 70, T0, false); // the plain triad for a Dbmaj9 slot
    expect(hit.source).toBe('trainerHit');
    expect(hit.correct).toBe(true);
    expect(hit.quality).toBeCloseTo(0.7);
    expect(hit.skills).toEqual([{ skill: 'keys:maj/inv:0', factor: 1 }]);
    expect(trainerEvent(loop[0], [49, 53, 56, 60, 63], 90, T0, false).skills).toEqual([{ skill: 'voicing:maj9', factor: 1 }]);
  });
  it('builds trainer misses as the only play failure, on the target skill', () => {
    const miss = trainerEvent(loop[2], null, 80, T0, false);
    expect(miss).toEqual({ source: 'trainerMiss', at: T0, skills: [{ skill: 'voicing:m9', factor: 1 }], correct: false, quality: 0, pad: false });
  });
  it('builds timing events by verdict', () => {
    expect(timingEvent([60, 64, 67], 'genau', T0, false).quality).toBe(1);
    expect(timingEvent([60, 64, 67], 'früh', T0, false).quality).toBe(0.6);
    expect(timingEvent([60, 64, 67], 'spät', T0, false).quality).toBe(0.6);
    const off = timingEvent([60, 64, 67], 'daneben', T0, true);
    expect(off.quality).toBe(0.3);
    expect(off.source).toBe('timing');
    expect(off.pad).toBe(true);
  });
});

describe('play evidence weights', () => {
  it('weighs a fresh skill by source and factor', () => {
    const empty = emptyState();
    const ev = playEvidence(empty, jamEvent([60, 64, 67], T0, false, false));
    expect(ev).toEqual([{ skill: 'keys:maj/inv:0', at: T0, x: 1, w: 0.1, f: 0.7, kind: 'play', missWeight: 0 }]);
    expect(playEvidence(empty, jamEvent([60, 64, 67], T0, true, false))[0].w).toBeCloseTo(0.25);
    expect(playEvidence(empty, trainerEvent(loop[0], [49, 53, 56], 90, T0, false))[0].w).toBeCloseTo(0.3);
    expect(playEvidence(empty, timingEvent([60, 64, 67], 'genau', T0, false))[0].w).toBeCloseTo(0.15);
    expect(playEvidence(empty, jamEvent([60, 64, 68], T0, false, false))[0].w).toBeCloseTo(0.05); // aug: × 0.5
  });
  it('discounts a success by (1 − R): a chord recalled a half-life later is worth half, a fresh one nothing below playMin', () => {
    const atHalf = withSkill('keys:maj/inv:0', { a: 1, hl: DAY, last: T0, lastOk: T0 });
    expect(playEvidence(atHalf, jamEvent([60, 64, 67], T0 + DAY, false, false))[0].w).toBeCloseTo(0.1 * 0.5);
    const justNow = withSkill('keys:maj/inv:0', { a: 1, hl: DAY, last: T0, lastOk: T0 });
    expect(playEvidence(justNow, jamEvent([60, 64, 67], T0 + 1000, false, false))[0].w).toBeCloseTo(0.1 * DEFAULT_MODEL.playMin);
    const forgotten = withSkill('keys:maj/inv:0', { a: 1, hl: 10 * MIN, last: T0, lastOk: T0 });
    expect(playEvidence(forgotten, jamEvent([60, 64, 67], T0 + DAY, false, false))[0].w).toBeCloseTo(0.1, 1e-6);
  });
  it('does not discount a miss', () => {
    const fresh = withSkill('voicing:m9', { a: 1, hl: DAY, last: T0, lastOk: T0 });
    const ev = playEvidence(fresh, trainerEvent(loop[2], null, 80, T0 + 1000, false));
    expect(ev).toEqual([{ skill: 'voicing:m9', at: T0 + 1000, x: 0, w: 0.15, f: 0, kind: 'play', missWeight: 0 }]);
  });
  it('weighs a chord equal to a stored pad by cfg.playPadWeight – zero by default', () => {
    expect(playEvidence(emptyState(), jamEvent([60, 64, 67], T0, true, true))[0].w).toBe(0);
    const cfg = { ...DEFAULT_MODEL, playPadWeight: 0.5 };
    expect(playEvidence(emptyState(), jamEvent([60, 64, 67], T0, true, true), cfg)[0].w).toBeCloseTo(0.125);
  });
});

describe('applying play', () => {
  it('raises belief, fluency, half-life and lastOk of the played skill', () => {
    const s = applyPlay(emptyState(), jamEvent([60, 64, 67], T0, false, false)).skills['keys:maj/inv:0'];
    expect(s.a).toBeCloseTo(0.1);
    expect(s.b).toBe(0);
    expect(s.flu).toBeCloseTo(0.56); // 0.5 + 0.3 × (0.7 − 0.5)
    expect(s.hl).toBe(DEFAULT_MODEL.hl0);
    expect(s.last).toBe(T0);
    expect(s.lastOk).toBe(T0);
    expect(knowledge(s)).toBeGreaterThan(knowledge(undefined));
  });
  it('the same pad ten times in a minute is worth little after the first; the same chord after a day counts again', () => {
    let state = emptyState();
    for (let i = 0; i < 10; i++) state = applyPlay(state, jamEvent([60, 64, 67], T0 + i * 6000, false, false));
    const s = state.skills['keys:maj/inv:0'];
    expect(s.a).toBeGreaterThan(0.1);
    expect(s.a < 0.1 + 9 * 0.1 * DEFAULT_MODEL.playMin + 1e-9).toBe(true);
    const later = applyPlay(state, jamEvent([60, 64, 67], T0 + DAY, false, false)).skills['keys:maj/inv:0'];
    expect(later.a - s.a).toBeCloseTo(0.1, 1e-6);
  });
  it('a pad chord changes nothing at pad weight 0', () => {
    const before = applyPlay(emptyState(), jamEvent([60, 64, 67], T0, false, false));
    const after = applyPlay(before, jamEvent([60, 64, 67], T0 + MIN, true, true));
    expect(after.skills).toEqual(before.skills);
    expect(applyPlay(emptyState(), timingEvent([48, 52, 59], 'genau', T0, true)).skills).toEqual({});
  });
  it('a trainer miss lowers belief and the half-life but never counts as a lapse', () => {
    const before = withSkill('voicing:m9', { a: 2, hl: DAY, last: T0, lastOk: T0, held: 2 });
    const s = applyPlay(before, trainerEvent(loop[2], null, 80, T0 + MIN, false)).skills['voicing:m9'];
    expect(s.a).toBe(2);
    expect(s.b).toBeCloseTo(0.15);
    expect(s.hl < DAY).toBe(true);
    expect(s.lastOk).toBe(T0);
    expect(s.last).toBe(T0 + MIN);
    expect(s.held).toBe(2);
    expect(s.lapses).toBe(0);
    expect(s.n).toBe(0);
  });
  it('never touches n, held, lapses, help, recent, boost, passed or the session fields', () => {
    const base: LearnerState = {
      ...emptyState(),
      skills: { 'keys:maj/inv:0': { ...freshSkill(), a: 3, b: 1, n: 4, held: 1, lapses: 1, hl: 10 * MIN, last: T0, lastOk: T0 } },
      help: { 'keys:maj': { level: 1, good: 2, misses: 0.5 } },
      recent: ['keys:maj/inv:0'],
      passed: { 'keys/triads': T0 },
      boost: { 'keys:maj/inv:1': T0 + 10 * MIN },
      lastActive: T0,
      warmup: 2,
    };
    const events: PlayEvent[] = [
      jamEvent([60, 64, 67], T0 + 1 * DAY, false, false),
      jamEvent([64, 67, 72], T0 + 2 * DAY, true, false),
      trainerEvent({ rootPc: 0, typeId: 'maj' }, [60, 64, 67], 90, T0 + 3 * DAY, false),
      trainerEvent({ rootPc: 0, typeId: 'maj' }, null, 90, T0 + 4 * DAY, false),
      timingEvent([60, 64, 67], 'genau', T0 + 5 * DAY, false),
    ];
    let state = base;
    for (let round = 0; round < 20; round++) for (const ev of events) state = applyPlay(state, { ...ev, at: ev.at + round * 10 * DAY });
    const s = state.skills['keys:maj/inv:0'];
    expect(s.n).toBe(4);
    expect(s.held).toBe(1);
    expect(s.lapses).toBe(1);
    expect(state.skills['keys:maj/inv:1'].n).toBe(0);
    expect(state.skills['keys:maj/inv:1'].held).toBe(0);
    expect(state.help).toEqual(base.help);
    expect(state.recent).toEqual(base.recent);
    expect(state.boost).toEqual(base.boost);
    expect(state.passed).toEqual(base.passed);
    expect(state.lastActive).toBe(base.lastActive);
    expect(state.warmup).toBe(base.warmup);
    expect(base.skills['keys:maj/inv:0'].a).toBe(3); // the old state is untouched
  });
  it('knowledge of a keys skill grows from play alone, but the pass counters stay at zero', () => {
    let state = emptyState();
    for (let day = 0; day < 30; day++) state = applyPlay(state, jamEvent([60, 64, 67], T0 + day * DAY, false, false));
    const s = state.skills['keys:maj/inv:0'];
    expect(knowledge(s)).toBeGreaterThan(0.3);
    expect(s.n).toBe(0); // isComfortable needs n ≥ comfortN and held ≥ 1 – both written by quiz evidence only
    expect(s.held).toBe(0);
  });
  it('round-trips through JSON', () => {
    const state = applyPlay(emptyState(), trainerEvent(loop[1], [48, 52, 58, 63], 60, T0, false));
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
