import { describe, expect, it } from './expect';
import { KeysChordParams, KeysChordSolution, DEFAULT_CONTEXT, evaluate, generateExercise, identifyHeld, pcAt, toPc, chord, chordPcs } from '../src/core';

const seeds = Array.from({ length: 1000 }, (_, i) => i);

describe('identify held chords', () => {
  it('names triads and their inversion from the bass', () => {
    const name = (m: number[]) => {
      const h = identifyHeld(m);
      return h ? `${h.rootPc}${h.type.symbol}/${h.inversion}` : null;
    };
    expect(name([60, 64, 67])).toBe('0/0'); // C
    expect(name([64, 67, 72])).toBe('0/1'); // C/E
    expect(name([55, 60, 64])).toBe('0/2'); // C/G
    expect(name([57, 60, 64, 69])).toBe('9m/0'); // Am with doubled root
    expect(name([62, 65, 68])).toBe('2dim/0');
    expect(name([60, 64, 68])).toBe('0aug/0'); // symmetric: bass wins
    expect(name([60, 64, 67, 70])).toBe('07/0'); // C7
  });
  it('returns null for fewer than three pitch classes or unknown sets', () => {
    expect(identifyHeld([60, 72, 64])).toBe(null);
    expect(identifyHeld([60, 62, 67])).toBe(null); // sus2 is not in the chord table
  });
});

describe('keys-chord exercise', () => {
  it('stacks a close voicing from the bass and finds the same inversion on the guitar', () => {
    for (const seed of seeds) {
      const ex = generateExercise<KeysChordParams, KeysChordSolution>('keys-chord', seed);
      const { notes, guitar } = ex.solution;
      const pcs = chordPcs(chord(ex.params.root, ex.params.typeId));
      expect(notes[0] >= 57 && notes[0] <= 68).toBe(true);
      expect(notes[1] > notes[0] && notes[2] > notes[1] && notes[2] - notes[0] < 12).toBe(true);
      expect(toPc(notes[0])).toBe(pcs[ex.params.inversion]);
      if (!guitar) throw new Error(`seed ${seed}: no guitar bridge`);
      const lowest = guitar.positions.reduce((a, b) => (DEFAULT_CONTEXT.tuning.strings[b.string] + b.fret < DEFAULT_CONTEXT.tuning.strings[a.string] + a.fret ? b : a));
      expect(pcAt(DEFAULT_CONTEXT.tuning, lowest)).toBe(pcs[ex.params.inversion]);
    }
  });
  it('accepts doublings and other octaves, rejects wrong bass and wrong notes', () => {
    for (const seed of seeds.slice(0, 300)) {
      const ex = generateExercise<KeysChordParams, KeysChordSolution>('keys-chord', seed);
      const n = ex.solution.notes;
      const ok = (midis: number[]) => evaluate(ex, { kind: 'notes', midis }).correct;
      expect(ok(n)).toBe(true);
      expect(ok(n.map((m) => m + 12))).toBe(true); // an octave up
      expect(ok([...n, n[0] + 12])).toBe(true); // bass doubled on top
      expect(ok([n[1] - 12, ...n.slice(1)].concat(n[0] + 12))).toBe(false); // other inversion
      for (let i = 0; i < 3; i++) for (const d of [-1, 1]) expect(ok(n.map((m, j) => (j === i ? m + d : m)))).toBe(false);
      expect(ok(n.slice(0, 2))).toBe(false);
    }
  });
});
