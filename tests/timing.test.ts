import { describe, expect, it } from './expect';
import { EMPTY_STATS, Grid, addJudgement, beatAt, judgeChange, loopsInRow, periodMs } from '../src/core';

const g: Grid = { bpm: 120, beatsPerChord: 4, startMs: 1000 }; // a bar = 2000 ms

describe('judging chord changes against the grid', () => {
  it('finds the nearest expected change and the offset', () => {
    expect(periodMs(g)).toBe(2000);
    expect(judgeChange(g, 1000)).toEqual({ slot: 0, expectedMs: 1000, offsetMs: 0, verdict: 'genau' });
    expect(judgeChange(g, 3050)).toEqual({ slot: 1, expectedMs: 3000, offsetMs: 50, verdict: 'genau' });
    expect(judgeChange(g, 4800).verdict).toBe('früh'); // 200 ms before bar 3
    expect(judgeChange(g, 5300).verdict).toBe('spät');
    expect(judgeChange(g, 5900).verdict).toBe('daneben'); // 900 ms late: nowhere near a bar line
    expect(judgeChange(g, 5900).slot).toBe(2);
    expect(judgeChange(g, 3081, 80).verdict).toBe('spät');
    expect(judgeChange(g, 3081, 100).verdict).toBe('genau');
  });
  it('counts hits, streaks and the mean offset, ignoring re-hits inside a slot', () => {
    let s = EMPTY_STATS;
    s = addJudgement(s, judgeChange(g, 1010));
    s = addJudgement(s, judgeChange(g, 1300)); // same slot: the pad re-pressed
    s = addJudgement(s, judgeChange(g, 3040));
    s = addJudgement(s, judgeChange(g, 5200)); // late
    s = addJudgement(s, judgeChange(g, 7000));
    expect(s.changes).toBe(4);
    expect(s.hits).toBe(3);
    expect(s.streak).toBe(1);
    expect(s.bestStreak).toBe(2);
    expect(s.meanAbsMs).toBeCloseTo((10 + 40 + 200 + 0) / 4);
    expect(loopsInRow(9, 4)).toBe(2);
    expect(loopsInRow(3, 4)).toBe(0);
  });
  it('tells bar and beat for the display, with the count-in below bar 1', () => {
    expect(beatAt(g, 1000)).toEqual({ bar: 1, beat: 1, phase: 0 });
    expect(beatAt(g, 2750)).toEqual({ bar: 1, beat: 4, phase: 0.5 });
    expect(beatAt(g, 3000)).toEqual({ bar: 2, beat: 1, phase: 0 });
    expect(beatAt(g, 0).bar).toBe(0);
    expect(beatAt(g, 0).beat).toBe(3);
  });
});
