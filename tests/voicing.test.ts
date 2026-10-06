import { describe, expect, it } from './expect';
import { STANDARD, chordPcs, findVoicings, fingersNeeded, noteName, parseChord, parseTab, tab, toPc } from '../src/core';

const shapes = (sym: string, minFret: number, maxFret: number) =>
  findVoicings(STANDARD, parseChord(sym), { minFret, maxFret, minStrings: 4 }).map((v) => tab(v.frets));

describe('voicing search', () => {
  it('finds the classic open and barre shapes', () => {
    expect(shapes('C', 0, 3)).toContain('x32010');
    expect(shapes('G', 0, 3)).toContain('320003');
    expect(shapes('G', 0, 3)).toContain('320033');
    expect(shapes('E', 0, 2)).toContain('022100');
    expect(shapes('Am', 0, 2)).toContain('x02210');
    expect(shapes('D', 0, 3)).toContain('xx0232');
    expect(shapes('F', 1, 3)).toContain('133211');
    expect(shapes('Bm', 2, 4)).toContain('x24432');
    expect(shapes('G7', 0, 3)).toContain('320001');
  });
  it('every result is playable and complete', () => {
    for (const sym of ['C', 'Am', 'F#m', 'Bb', 'Ebmaj7', 'G7', 'Bm7b5', 'Cdim7', 'Caug']) {
      const c = parseChord(sym);
      const pcs = chordPcs(c);
      const vs = findVoicings(STANDARD, c, { minFret: 0, maxFret: 12 });
      expect(vs.length).toBeGreaterThan(0);
      for (const v of vs) {
        expect(v.span <= 4 && v.fingers <= 4).toBe(true);
        const played = new Set(v.notes.map((n) => toPc(n.midi)));
        expect(pcs.every((p) => played.has(p)) && played.size === pcs.length).toBe(true);
        const strings = v.notes.map((n) => n.pos.string);
        expect(strings[strings.length - 1] - strings[0] + 1).toBe(strings.length); // no inner mutes
      }
    }
  });
  it('spells notes as the chord does', () => {
    const gm = findVoicings(STANDARD, parseChord('Gm'), { minFret: 3, maxFret: 6, minStrings: 6 });
    const names = new Set(gm.flatMap((v) => v.notes.map((n) => noteName(n.note))));
    expect([...names].sort()).toEqual(['Bb', 'D', 'G']);
  });
  it('labels inversions by the bass note', () => {
    const c = parseChord('C');
    const byTab = (t: string) => findVoicings(STANDARD, c, { minFret: 0, maxFret: 3, minStrings: 4 }).find((v) => tab(v.frets) === t)!;
    expect(byTab('x32010').inversion).toBe(0);
    expect(byTab('032010').inversion).toBe(1); // C/E
    expect(byTab('332010').inversion).toBe(2); // C/G
  });
  it('triads on string sets: one note per string, every inversion somewhere', () => {
    for (const sym of ['C', 'Am', 'Ebaug', 'F#', 'Bbm']) {
      for (const lo of [0, 1, 2, 3]) {
        const strings = [lo, lo + 1, lo + 2];
        const vs = findVoicings(STANDARD, parseChord(sym), { minFret: 0, maxFret: 15, strings, noDoubling: true });
        expect([...new Set(vs.map((v) => v.inversion))].sort()).toEqual([0, 1, 2]);
        for (const v of vs) expect(v.notes.map((n) => n.pos.string)).toEqual(strings);
      }
    }
  });
  it('dim root position on fourth-tuned strings needs a 5-fret stretch', () => {
    // Each minor 3rd up a string is 2 frets back: Bdim on 5-4-3 is 14-12-10.
    const strict = findVoicings(STANDARD, parseChord('Bdim'), { minFret: 0, maxFret: 15, strings: [1, 2, 3], noDoubling: true, inversion: 0 });
    expect(strict.length).toBe(0);
    const wide = findVoicings(STANDARD, parseChord('Bdim'), { minFret: 0, maxFret: 15, strings: [1, 2, 3], noDoubling: true, inversion: 0, maxSpan: 5 });
    expect(wide.map((v) => tab(v.frets))).toEqual(['x-14-12-10-x-x']);
    // Across the G/B pair it fits: Bdim on 4-3-2 = 9-7-6.
    expect(findVoicings(STANDARD, parseChord('Bdim'), { strings: [2, 3, 4], noDoubling: true, inversion: 0 }).map((v) => tab(v.frets))).toContain('xx976x');
  });
  it('drops shapes that need five fingers', () => {
    expect(fingersNeeded(parseTab('133211'))).toBe(4); // barre + 3
    expect(fingersNeeded(parseTab('x32010'))).toBe(3);
    expect(fingersNeeded(parseTab('x02220'))).toBe(1); // A major can be one-finger barred
    expect(fingersNeeded(parseTab('132211'))).toBe(4);
    expect(fingersNeeded(parseTab('x35453'))).toBe(4);
  });
  it('round-trips tabs', () => {
    expect(tab(parseTab('x32010'))).toBe('x32010');
    expect(parseTab('x-10-12-12-x-x')).toEqual([null, 10, 12, 12, null, null]);
    expect(tab([null, 10, 12, 12, null, null])).toBe('x-10-12-12-x-x');
  });
});
