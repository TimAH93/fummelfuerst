import { describe, expect, it } from './expect';
import { DEFAULT_CONTEXT, capoPlans, chordSymbol, chordsOf, gripFor, parseProgression, planCapo, simplestChord, soloBoard, transposeChord, parseNote } from '../src/core';

const T = DEFAULT_CONTEXT.tuning;
const sym = (c: { root: { letter: number; acc: number }; type: { symbol: string } }) => chordSymbol(c as never);

describe('chord spelling and transposition', () => {
  it('spells the simplest root, flats on a tie', () => {
    expect(sym(simplestChord(3, 'm7'))).toBe('Ebm7');
    expect(sym(simplestChord(1, 'maj9'))).toBe('Dbmaj9');
    expect(sym(simplestChord(6, 'maj'))).toBe('Gb');
    expect(sym(transposeChord(simplestChord(1, 'maj9'), -1))).toBe('Cmaj9');
    expect(sym(transposeChord(simplestChord(8, 'dom13'), -1))).toBe('G13');
  });
});

describe('grips', () => {
  const grip = (s: string) => gripFor(T, chordsOf(parseProgression(s))[0]);
  it('finds the open-position grips every guitarist knows', () => {
    expect(grip('C')?.tab).toBe('x32010');
    expect(grip('G')?.tab).toBe('320003');
    expect(grip('Am')?.tab).toBe('x02210');
    expect(grip('E')?.tab).toBe('022100');
    expect(grip('D')?.tab).toBe('xx0232');
    expect(['xx3210', '102210'].includes(grip('Fmaj7')?.tab ?? '')).toBe(true);
    expect(['020000', '022030'].includes(grip('Em7')?.tab ?? '')).toBe(true);
  });
  it('finds grips for the neo-soul colours at the nut and labels the degrees', () => {
    const c = grip('Cmaj9');
    expect(c?.simplified).toBe(false);
    expect(c?.labels.filter(Boolean).includes('9')).toBe(true);
    const g13 = grip('G13');
    expect(g13?.simplified).toBe(false);
    expect(g13?.labels.filter(Boolean).includes('13')).toBe(true);
    expect(grip('Em9')?.simplified).toBe(false);
  });
  it('falls back to a simpler chord type when the full colour has no grip', () => {
    for (const s of ['Dbmaj9', 'Ebm9', 'Ab13', 'C7#9', 'Fm9']) {
      const g = grip(s);
      if (!g) throw new Error(`${s}: no grip at all`);
      expect(g.fingers <= 4).toBe(true);
      expect(sym(g.wanted)).toBe(s);
    }
  });
});

describe('capo', () => {
  const loop = chordsOf(parseProgression('Dbmaj9 C7#9 Fm9 Ebm9 Ab13'));
  it('puts the capo on 1 for the Db loop, so the hand plays C shapes', () => {
    const plans = capoPlans(T, loop);
    expect(plans[0].capo).toBe(1);
    expect(plans[0].grips.map((g) => sym(g!.shape))).toEqual(['Cmaj9', 'B7#9', 'Em9', 'Dm9', 'G13']);
    expect(plans[0].grips.every((g) => g && g.frets.findIndex((f) => f !== null) >= 0)).toBe(true);
    for (const g of plans[0].grips) expect(g!.labels[g!.frets.findIndex((f) => f !== null)]).toBe('1'); // root in the bass
    expect(planCapo(T, loop, 0).cost > plans[0].cost).toBe(true);
  });
  it('leaves the capo off for an open-chord loop', () => {
    expect(capoPlans(T, chordsOf(parseProgression('C G Am F')))[0].capo).toBe(0);
    expect([1, 3].includes(capoPlans(T, chordsOf(parseProgression('Eb Bb Cm Ab')))[0].capo)).toBe(true); // D-A-Bm-G or C-G-Am-F shapes
  });
});

describe('solo board', () => {
  it('marks scale tones, the root and the chord tones relative to the capo', () => {
    const key = { tonic: parseNote('Db'), mode: 'major' as const };
    const dots = soloBoard(T, key, 1, true, null, 5);
    // C major pentatonic shapes at the nut: C D E G A
    expect(dots.some((d) => d.string === 1 && d.fret === 3 && d.label === 'R')).toBe(true); // C on the A string
    expect(dots.some((d) => d.string === 0 && d.fret === 1)).toBe(false); // F is not in the pentatonic
    const over = soloBoard(T, key, 1, false, chordsOf(parseProgression('Fm9'))[0], 5);
    const g = over.find((d) => d.string === 0 && d.fret === 3); // G on the low E = b3 of Em9
    expect(g?.label).toBe('b3');
    expect(g?.kind).toBe('answer');
  });
});
