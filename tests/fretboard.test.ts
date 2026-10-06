import { describe, expect, it } from './expect';
import {
  STANDARD,
  crossesIrregularPair,
  findInterval,
  midiName,
  nearestInterval,
  parseMidi,
  pcAt,
  pcName,
  pitchAt,
  positionsOf,
  stringGap,
  tuning,
} from '../src/core';

const at = (string: number, fret: number) => pcName(pcAt(STANDARD, { string, fret }));
// string indices: 0 = low E, 1 = A, 2 = D, 3 = G, 4 = B, 5 = high E

describe('standard tuning', () => {
  it('is E2 A2 D3 G3 B3 E4', () => {
    expect(STANDARD.strings.map((m) => midiName(m))).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    expect(parseMidi('E2')).toBe(40);
  });
  it('spec cases', () => {
    expect(at(0, 0)).toBe('E');  // low E open
    expect(at(0, 1)).toBe('F');  // low E fret 1
    expect(at(0, 12)).toBe('E'); // low E fret 12
    expect(at(1, 3)).toBe('C');  // A string fret 3
    expect(at(3, 4)).toBe('B');  // G string fret 4
    expect(at(4, 1)).toBe('C');  // B string fret 1
  });
  it('fret 12 is exactly one octave up', () => {
    expect(pitchAt(STANDARD, { string: 0, fret: 12 }) - pitchAt(STANDARD, { string: 0, fret: 0 })).toBe(12);
  });
  it('strings are fourths apart except G→B (major third)', () => {
    expect([0, 1, 2, 3, 4].map((s) => stringGap(STANDARD, s))).toEqual([5, 5, 5, 4, 5]);
    expect(crossesIrregularPair(STANDARD, 3, 4)).toBe(true);
    expect(crossesIrregularPair(STANDARD, 1, 3)).toBe(false);
    expect(crossesIrregularPair(STANDARD, 5, 2)).toBe(true);
  });
});

describe('positions', () => {
  it('finds every C in frets 0–12', () => {
    const cs = positionsOf(STANDARD, 0, { minFret: 0, maxFret: 12 }).map((p) => `${p.string}:${p.fret}`);
    expect(cs).toEqual(['0:8', '1:3', '2:10', '3:5', '4:1', '5:8']);
  });
  it('respects string and fret restrictions', () => {
    expect(positionsOf(STANDARD, 4, { minFret: 0, maxFret: 15, strings: [0] }).map((p) => p.fret)).toEqual([0, 12]);
  });
  it('works for an alternate tuning (drop D)', () => {
    const dropD = tuning('dropD', 'Drop D', ['D2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    expect(pcName(pcAt(dropD, { string: 0, fret: 0 }))).toBe('D');
    expect(pcName(pcAt(dropD, { string: 0, fret: 2 }))).toBe('E');
  });
});

describe('interval hunt', () => {
  const C = { string: 1, fret: 3 }; // C3 on the A string
  it('C → major 3rd up (E3) at its three unison positions', () => {
    const r = findInterval(STANDARD, C, 4).map((p) => `${p.string}:${p.fret}`).sort();
    expect(r).toEqual(['0:12', '1:7', '2:2']);
  });
  it('nearest major 3rd from C is D string fret 2', () => {
    expect(nearestInterval(STANDARD, C, 4)[0]).toEqual({ string: 2, fret: 2 });
  });
  it('down a major 3rd from C is Ab', () => {
    const r = findInterval(STANDARD, C, 4, { direction: 'down' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((p) => pcName(pcAt(STANDARD, p), 'flat') === 'Ab')).toBe(true);
  });
  it('A → C and F → C are minor 3rd and perfect 5th', () => {
    const A = { string: 0, fret: 5 };
    const F = { string: 0, fret: 1 };
    expect(nearestInterval(STANDARD, A, 3).every((p) => at(p.string, p.fret) === 'C')).toBe(true);
    expect(nearestInterval(STANDARD, F, 7)[0]).toEqual({ string: 1, fret: 3 });
  });
  it('compound search includes 10ths', () => {
    const simple = findInterval(STANDARD, C, 4).length;
    expect(findInterval(STANDARD, C, 4, { compound: true }).length).toBeGreaterThan(simple);
  });
});
