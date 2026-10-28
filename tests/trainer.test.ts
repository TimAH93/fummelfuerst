import { describe, expect, it } from './expect';
import { DEFAULT_TRAINER, TrainerState, VARIATIONS, matchesChord, nextChord, nudgeBpm, onPlayed, onSlot, parseProgression, startTrainer } from '../src/core';

const loop = parseProgression('Dbmaj9 C7#9 Fm9 Ebm9');
const PAD = { Dbmaj9: [49, 53, 56, 60, 63], C7s9: [48, 52, 58, 63], Fm9: [53, 56, 60, 63, 67], Ebm9: [51, 54, 58, 61, 65] };

describe('matching a chord', () => {
  it('accepts the chord, a simpler voicing of it and other octaves; rejects other roots and wrong tones', () => {
    expect(matchesChord(loop[0], PAD.Dbmaj9)).toBe(true);
    expect(matchesChord(loop[0], [61, 65, 68, 72])).toBe(true); // Dbmaj7 counts for Dbmaj9
    expect(matchesChord(loop[0], [49, 53, 56])).toBe(true); // the plain triad too
    expect(matchesChord(loop[0], PAD.Fm9)).toBe(false);
    expect(matchesChord(loop[0], [49, 53, 56, 59])).toBe(false); // B natural is not in Dbmaj9
    expect(matchesChord(loop[2], PAD.Fm9)).toBe(true);
  });
});

describe('rounds, tempo and variations', () => {
  const cfg = { chords: loop, ...DEFAULT_TRAINER, startBpm: 80, targetBpm: 88 };
  const playRound = (s: TrainerState, hits: boolean[]): TrainerState => {
    for (let i = 0; i < loop.length; i++) {
      if (hits[i]) s = onPlayed(s, [PAD.Dbmaj9, PAD.C7s9, PAD.Fm9, PAD.Ebm9][i]);
      s = onSlot(s);
    }
    return s;
  };
  it('speeds up after a clean round, holds after a miss', () => {
    let s = startTrainer(cfg);
    expect(s.bpm).toBe(80);
    expect(nextChord(s).typeId).toBe('dom7s9');
    s = playRound(s, [true, true, true, true]);
    expect(s.round).toBe(2);
    expect(s.bpm).toBe(84);
    expect(s.lastRound).toBe('clean');
    s = playRound(s, [true, false, true, true]);
    expect(s.bpm).toBe(84);
    expect(s.lastRound).toBe('missed');
    expect(s.cleanRounds).toBe(1);
    expect(onSlot(s).lastRound).toBe(null); // mid-round the banner goes away
  });
  it('a wrong chord or the right chord in the wrong slot does not count', () => {
    let s = startTrainer(cfg);
    s = onPlayed(s, PAD.Fm9); // slot 0 wants Dbmaj9
    expect(s.hits[0]).toBe(false);
    s = onSlot(s);
    s = onPlayed(s, PAD.C7s9);
    expect(s.hits[1]).toBe(true);
  });
  it('switches to variations at the target tempo and finishes after the last one', () => {
    let s = startTrainer(cfg);
    s = playRound(s, [true, true, true, true]); // 84
    s = playRound(s, [true, true, true, true]); // 88 = target
    expect(s.bpm).toBe(88);
    expect(s.variation).toBe(0);
    for (let v = 1; v < VARIATIONS.length; v++) {
      s = playRound(s, [true, true, true, true]);
      expect(s.variation).toBe(v);
      expect(s.done).toBe(false);
    }
    s = playRound(s, [true, true, true, true]);
    expect(s.done).toBe(true);
    expect(onSlot(s)).toBe(s);
  });
  it('lets the tempo be nudged by hand within limits', () => {
    const s = startTrainer(cfg);
    expect(nudgeBpm(s, -60).bpm).toBe(30);
    expect(nudgeBpm(s, 4).bpm).toBe(84);
  });
});
