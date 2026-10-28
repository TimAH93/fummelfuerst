import { describe, expect, it } from './expect';
import { PadBank, chordFromHeld, emptyBank, padChord, padFor, padSteps, parseProgression, suggestVoicing } from '../src/core';

describe('pad bank', () => {
  const bank: PadBank = emptyBank();
  bank[0] = { midis: [49, 53, 56, 60, 63] };
  bank[4] = { midis: [44, 54, 60, 65] };
  it('names pads and recognises one from its keys', () => {
    expect(padChord(bank[0])).toEqual({ rootPc: 1, typeId: 'maj9' });
    expect(padChord(bank[4])).toEqual({ rootPc: 8, typeId: 'dom13' });
    expect(padChord(null)).toBe(null);
    expect(padFor(bank, [63, 60, 56, 53, 49])).toBe(0);
    expect(padFor(bank, [49, 53, 56, 60])).toBe(null);
    expect(bank.length).toBe(16);
  });
  it('spells out how to store a pad, with octave shifts for keys off the 37', () => {
    expect(padSteps(bank[4]!)).toEqual([
      { midi: 44, octave: -1, key: 56 },
      { midi: 54, octave: 0, key: 54 },
      { midi: 60, octave: 0, key: 60 },
      { midi: 65, octave: 0, key: 65 },
    ]);
    expect(padSteps({ midis: [36, 88] })).toEqual([{ midi: 36, octave: -1, key: 48 }, { midi: 88, octave: 1, key: 76 }]);
  });
  it('suggests a voicing inside the 37 keys that the app recognises as the chord', () => {
    for (const sym of ['Dbmaj9', 'C7#9', 'Fm9', 'Ebm9', 'Ab13', 'Am', 'G7', 'Bdim', 'F#m7b5']) {
      const c = parseProgression(sym)[0];
      const v = suggestVoicing(c);
      expect(v[0] >= 48 && v[0] <= 59).toBe(true);
      expect(v.slice(1).every((m, i) => m >= 60 && m > v[i])).toBe(true);
      expect(Math.max(...v) <= 84).toBe(true);
      expect(chordFromHeld(v)).toEqual(c);
    }
    expect(suggestVoicing(parseProgression('Fm9')[0])).toEqual([53, 68, 72, 75, 79]); // F | Ab C Eb G
    expect(suggestVoicing(parseProgression('Ab13')[0])).toEqual([56, 66, 70, 72, 77]); // Ab | Gb Bb C F
  });
});
