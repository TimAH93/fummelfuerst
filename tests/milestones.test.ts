import { describe, expect, it } from './expect';
import { MILESTONES, RANKS, crossed, exportOnly, nextLabel, nextRank, progressToNext, rankFor, suggestTopic, totalSongs } from '../src/core';

describe('song milestones and ranks', () => {
  it('lists the milestones in order with a rank each', () => {
    expect(MILESTONES).toEqual([10, 20, 25, 50, 100, 150, 200, 250, 500]);
    expect(RANKS.map((r) => r.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(rankFor(0).name).toBe('Lehrling');
    expect(rankFor(9).name).toBe('Lehrling');
    expect(rankFor(10).name).toBe('Geselle');
    expect(rankFor(24).name).toBe('Loop-Ritter');
    expect(rankFor(100).name).toBe('Fummelfürst');
    expect(rankFor(999).name).toBe('Kaiser');
  });
  it('knows what comes next and how far it is', () => {
    expect(nextRank(3)?.at).toBe(10);
    expect(nextRank(500)).toBe(null);
    expect(nextLabel(3)).toBe('7 bis Geselle');
    expect(nextLabel(500)).toBe('ganz oben');
    expect(progressToNext(0)).toBe(0);
    expect(progressToNext(5)).toBe(0.5);
    expect(progressToNext(22)).toBeCloseTo(0.4);
    expect(progressToNext(500)).toBe(1);
  });
  it('finds the milestones a step crosses', () => {
    expect(crossed(9, 10)).toEqual([10]);
    expect(crossed(18, 26)).toEqual([20, 25]);
    expect(crossed(10, 10)).toEqual([]);
    expect(crossed(3, 4)).toEqual([]);
  });
  it('counts songs from a base plus logged exports; a bare +1 does not touch the topic rotation', () => {
    const log = [exportOnly(1000), { at: 2000, planId: 'quick', topic: 'Mix' as const, blocksDone: 2, blocks: 2, exported: 2 }];
    expect(totalSongs(log, 3)).toBe(6);
    expect(totalSongs([])).toBe(0);
    expect(suggestTopic([exportOnly(5000)])).toBe('Drums');
    expect(suggestTopic([exportOnly(5000), { at: 1, planId: 'quick', topic: 'Drums', blocksDone: 1, blocks: 1, exported: 0 }])).toBe('Bass');
  });
});
