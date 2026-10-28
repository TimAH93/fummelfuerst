import { describe, expect, it } from './expect';
import {
  GENRES, PLANS, SessionEntry, TEMPLATES, barsBetween, blockLeftMs, fmtCountdown, genreById, pickGenre, planById, planMinutes,
  sectionsFromTaps, suggestTopic, tapTempo, weekExports,
} from '../src/core';

const DAY = 24 * 3600 * 1000;

describe('session plans and genres', () => {
  it('plans add up and end with an export', () => {
    for (const p of PLANS) {
      expect(planMinutes(p) >= 15 && planMinutes(p) <= 60).toBe(true);
      expect(p.blocks[p.blocks.length - 1].kind).toBe('export');
    }
    expect(planMinutes(planById('three-beats'))).toBe(50);
    expect(planById('nope').id).toBe(PLANS[0].id);
  });
  it('every genre points at an arrangement template and a sane tempo', () => {
    for (const g of GENRES) {
      expect(TEMPLATES.some((t) => t.id === g.templateId)).toBe(true);
      expect(g.bpm[0] < g.bpm[1] && g.elements.length >= 3).toBe(true);
    }
    expect(genreById('lofi')?.templateId).toBe('lofi');
    expect(pickGenre(0).id).toBe(GENRES[0].id);
    expect(pickGenre(GENRES.length + 2).id).toBe(GENRES[2].id);
  });
});

describe('topic rotation and the week', () => {
  const entry = (topic: SessionEntry['topic'], daysAgo: number, exported = 0): SessionEntry =>
    ({ at: Date.now() - daysAgo * DAY, planId: 'quick', topic, blocksDone: 2, blocks: 2, exported });
  it('suggests the topic that waited longest, unused ones first', () => {
    expect(suggestTopic([])).toBe('Drums');
    expect(suggestTopic([entry('Drums', 1)])).toBe('Bass');
    expect(suggestTopic([entry('Drums', 1), entry('Bass', 2), entry('Arrangement', 3), entry('Mix', 4), entry('Melodie', 5)])).toBe('Melodie');
    expect(suggestTopic([entry('Drums', 9), entry('Bass', 1), entry('Arrangement', 2), entry('Mix', 3), entry('Melodie', 4)])).toBe('Drums');
  });
  it('counts exports in the last seven days', () => {
    const now = Date.now();
    expect(weekExports([entry('Drums', 1, 2), entry('Bass', 6, 1), entry('Mix', 8, 5)], now)).toBe(3);
  });
  it('counts down a block', () => {
    const block = PLANS[0].blocks[0]; // 15 min
    expect(blockLeftMs(block, 0, 5 * 60000)).toBe(10 * 60000);
    expect(blockLeftMs(block, 0, 16 * 60000, 5 * 60000)).toBe(4 * 60000);
    expect(fmtCountdown(10 * 60000)).toBe('10:00');
    expect(fmtCountdown(-30500)).toBe('−0:31');
    expect(fmtCountdown(5000)).toBe('0:05');
  });
});

describe('reference map', () => {
  it('reads the tempo from taps, ignoring one late tap', () => {
    const at120 = [0, 500, 1000, 1500, 2000, 2500];
    expect(tapTempo(at120)).toBe(120);
    expect(tapTempo([0, 500, 1000, 1700, 2000, 2500])).toBe(120);
    expect(tapTempo([0, 500])).toBe(null);
    expect(tapTempo([0, 0, 0])).toBe(null);
  });
  it('turns section taps into bars, snapping near multiples of four', () => {
    const bar = 2000; // 120 BPM
    expect(barsBetween(0, 8 * bar, 120)).toBe(8);
    expect(barsBetween(0, 8.4 * bar, 120)).toBe(8);
    expect(barsBetween(0, 7 * bar, 120)).toBe(8); // within a bar of 8
    expect(barsBetween(0, 6 * bar, 120)).toBe(6);
    expect(barsBetween(0, 2 * bar, 120)).toBe(2);
    expect(barsBetween(0, 0.2 * bar, 120)).toBe(1);
    const taps = [0, 4 * bar, 12 * bar, 20 * bar, 28 * bar];
    const s = sectionsFromTaps(taps, 32 * bar, 120);
    expect(s.map((x) => `${x.name}:${x.bars}:${x.kind}`)).toEqual(['Intro:4:intro', 'Strophe:8:verse', 'Refrain:8:chorus', 'Strophe:8:verse', 'Outro:4:outro']);
    expect(sectionsFromTaps([0], 16 * bar, 120)).toEqual([{ name: 'Teil', bars: 16, kind: 'chorus' }]);
    expect(sectionsFromTaps([], 1000, 120)).toEqual([]);
  });
});
