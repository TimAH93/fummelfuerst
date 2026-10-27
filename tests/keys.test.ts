import { describe, expect, it } from './expect';
import { KeysChordParams, KeysChordSolution, KeysVoicingParams, KeysVoicingSolution, DEFAULT_CONTEXT, evaluate, generateExercise, identifyHeld, pcAt, toPc, chord, chordPcs } from '../src/core';

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
  it('names voicings that leave out the perfect fifth, as players do', () => {
    const name = (m: number[]) => {
      const h = identifyHeld(m);
      return h ? `${h.rootPc}${h.type.symbol}` : null;
    };
    expect(name([48, 52, 58, 63])).toBe('07#9'); // C E Bb D#
    expect(name([51, 61, 65, 67, 72])).toBe('313'); // Eb | Db F G C
    expect(name([41, 56, 63, 67])).toBe('5m9'); // F | Ab Eb G
    expect(name([48, 52, 59])).toBe('0maj7'); // C E B: the shell voicing (1 3 7) of Cmaj7
    expect(name([48, 52, 58])).toBe('07'); // C E Bb: shell voicing of C7
    expect(name([48, 52, 55, 58])).toBe('07'); // exact match still wins over a fifth-less 9th
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

describe('neo-soul voicing exercise', () => {
  const gen = (typeId: string, pc: number) =>
    generateExercise<KeysVoicingParams, KeysVoicingSolution>('keys-voicing', 1, DEFAULT_CONTEXT, { typeId, pc });
  const ok = (ex: ReturnType<typeof gen>, midis: number[]) => evaluate(ex, { kind: 'notes', midis }).correct;

  it('builds rootless right-hand voicings over the bass', () => {
    const fm9 = gen('m9', 5);
    expect(fm9.solution.rightHand).toEqual(['Ab:b3', 'C:5', 'Eb:b7', 'G:9']);
    expect(fm9.solution.required).toEqual(['Ab:b3', 'Eb:b7', 'G:9']);
    expect(gen('dom7s9', 0).solution.rightHand).toEqual(['E:3', 'Bb:b7', 'D#:#9']);
    expect(gen('dom13', 8).solution.rightHand).toEqual(['Gb:b7', 'Bb:9', 'C:3', 'F:13']);
  });
  it('accepts what a player would play, rejects what changes the chord', () => {
    const ex = gen('m9', 5); // Fm9: F | Ab C Eb G
    expect(ok(ex, [41, 56, 60, 63, 67])).toBe(true); // the voicing
    expect(ok(ex, [41, 56, 63, 67])).toBe(true); // fifth left out
    expect(ok(ex, [29, 56, 63, 67, 72])).toBe(true); // other octaves, extra chord tone on top
    expect(ok(ex, [41, 56, 60, 63])).toBe(false); // no 9th: that is Fm7
    expect(ok(ex, [44, 53, 60, 63, 67])).toBe(false); // Ab in the bass
    expect(ok(ex, [41, 56, 60, 63, 66])).toBe(false); // Gb is not in Fm9
  });
  it('spells with flats on a tie (Ebm7, not D#m7)', () => {
    for (const seed of seeds.slice(0, 50)) {
      const ex = generateExercise<KeysVoicingParams, KeysVoicingSolution>('keys-voicing', seed, DEFAULT_CONTEXT, { typeId: 'm7', pc: 3 });
      expect(ex.params.root.acc <= 0).toBe(true);
    }
  });
  it('finds a guitar shape with the root in the bass for every type and root', () => {
    for (const typeId of ['maj7', 'm7', 'dom7', 'm7b5', 'maj9', 'm9', 'dom9', 'dom13', 'dom7s9'])
      for (let pc = 0; pc < 12; pc++) {
        const ex = gen(typeId, pc);
        const g = ex.solution.guitar;
        if (!g) throw new Error(`${typeId} on ${pc}: no guitar shape`);
        const low = g.positions[0];
        expect(pcAt(DEFAULT_CONTEXT.tuning, low)).toBe(pc);
      }
  });
});

describe('neo-soul voicings fit a 37-key board', () => {
  it('bass and right hand stay within C3–C6, bass lowest', () => {
    for (const seed of seeds) {
      const ex = generateExercise<KeysVoicingParams, KeysVoicingSolution>('keys-voicing', seed);
      const [bass, ...rh] = ex.solution.notes;
      expect(bass >= 48 && bass <= 59 && rh.every((n) => n > bass && n <= 84)).toBe(true);
    }
  });
});

describe('jazz guitar shapes', () => {
  it('prefers the classic grips over shapes with muted inner strings', () => {
    const shape = (typeId: string, pc: number) =>
      generateExercise<KeysVoicingParams, KeysVoicingSolution>('keys-voicing', 1, DEFAULT_CONTEXT, { typeId, pc }).solution.guitar!.tab;
    expect(shape('maj7', 9) === '542xx4').toBe(false); // Amaj7: a real grip, not two muted inner strings
    expect(shape('dom7s9', 0)).toBe('x3234x'); // the "Hendrix chord"
    for (const typeId of ['maj7', 'm7', 'dom7', 'm7b5', 'maj9', 'm9', 'dom9', 'dom13', 'dom7s9'])
      for (let pc = 0; pc < 12; pc++) {
        const t = shape(typeId, pc);
        const frets = t.includes('-') ? t.split('-') : [...t];
        const played = frets.map((f, i) => (f === 'x' ? -1 : i)).filter((i) => i >= 0);
        const inner = frets.slice(played[0] + 2, played[played.length - 1]).filter((f) => f === 'x').length;
        if (inner > 0) throw new Error(`${typeId} on ${pc}: ${t} mutes an inner string`);
      }
  });
});
