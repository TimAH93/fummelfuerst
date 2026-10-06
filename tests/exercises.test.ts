import { describe, expect, it } from './expect';
import {
  DEFAULT_CONTEXT,
  Exercise,
  ExerciseContext,
  FretPos,
  IntervalHuntParams,
  IntervalHuntSolution,
  MelodyChordParams,
  MelodyChordSolution,
  NoteFindParams,
  NoteFindSolution,
  TriadBuildParams,
  TriadBuildSolution,
  createRng,
  degreeBetween,
  degreeToString,
  describeExercise,
  evaluate,
  fretSpan,
  generateExercise,
  listFamilies,
  noteName,
  notePc,
  pcAt,
  recordAttempt,
  solve,
  tuning,
} from '../src/core';

const SEEDS = 1000;
// Consecutive seeds on purpose: sessions will hand out seeds like this.
const seeds = Array.from({ length: SEEDS }, (_, i) => i);

const DROP_D_HIGH: ExerciseContext = {
  tuning: tuning('dropD', 'Drop D', ['D2', 'A2', 'D3', 'G3', 'B3', 'E4']),
  range: { minFret: 5, maxFret: 9 },
  maxSpan: 4,
};
const CONTEXTS: [string, ExerciseContext][] = [['standard 0–12', DEFAULT_CONTEXT], ['drop D, frets 5–9', DROP_D_HIGH]];

function allPositions(ctx: ExerciseContext): FretPos[] {
  const out: FretPos[] = [];
  for (let string = 0; string < ctx.tuning.strings.length; string++)
    for (let fret = ctx.range.minFret; fret <= ctx.range.maxFret; fret++) out.push({ string, fret });
  return out;
}
const key = (p: FretPos) => `${p.string}/${p.fret}`;

describe('seeded rng', () => {
  it('is reproducible and stays in range', () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = Array.from({ length: 100 }, () => a.int(-3, 7));
    expect(Array.from({ length: 100 }, () => b.int(-3, 7))).toEqual(xs);
    expect(xs.every((x) => x >= -3 && x <= 7)).toBe(true);
    expect(new Set(xs).size).toBe(11);
  });
  it('decorrelates neighbouring seeds', () => {
    // 168 possible questions; 200 consecutive seeds should spread over most of them.
    const firsts = seeds.slice(0, 200).map((s) => describeExercise(generateExercise('melody-chord', s)));
    expect(new Set(firsts).size).toBeGreaterThan(100);
  });
  it('differs between seeds and shuffles into a permutation', () => {
    expect(createRng(1).next() === createRng(2).next()).toBe(false);
    const s = createRng(7).shuffle([1, 2, 3, 4, 5, 6]);
    expect([...s].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('fret span', () => {
  it('counts covered frets and ignores open strings', () => {
    expect(fretSpan([5, 8])).toBe(4);
    expect(fretSpan([0, 3])).toBe(1);
    expect(fretSpan([0, 0])).toBe(0);
    expect(fretSpan([2, 2, 4])).toBe(3);
  });
});

describe('exercise registry', () => {
  it('has the four v0.1 families', () => {
    expect(listFamilies().map((f) => f.id)).toEqual(['note-find', 'interval-hunt', 'melody-chord', 'triad-build']);
  });
  it('rejects unknown families', () => {
    expect(() => generateExercise('nope', 1)).toThrow(/Unknown exercise family/);
  });
});

// The stage-2 acceptance criterion: every generated answer passes its own check, over 1,000 seeds.
for (const [ctxName, ctx] of CONTEXTS) {
  describe(`1,000 seeds × every family (${ctxName})`, () => {
    for (const fam of listFamilies()) {
      it(`${fam.id}: solution passes check, same seed → same exercise`, () => {
        for (const seed of seeds) {
          const ex = generateExercise(fam.id, seed, ctx);
          const ev = evaluate(ex, solve(ex));
          if (!ev.correct) throw new Error(`seed ${seed}: own solution rejected – ${describeExercise(ex)}`);
          expect(ex.skills.length).toBeGreaterThan(0);
          expect(generateExercise(fam.id, seed, ctx)).toEqual(ex);
        }
      });
    }

    it('note-find: every wrong position is rejected', () => {
      for (const seed of seeds) {
        const ex = generateExercise<NoteFindParams, NoteFindSolution>('note-find', seed, ctx);
        const right = new Set(ex.solution.positions.map(key));
        expect(right.size).toBeGreaterThan(0);
        for (const p of allPositions(ctx)) {
          const ok = evaluate(ex, { kind: 'positions', positions: [p] }).correct;
          if (ok !== right.has(key(p))) throw new Error(`seed ${seed}: ${key(p)} judged ${ok}`);
        }
      }
    });

    it('interval-hunt: exactly one right position, in position, spelled correctly', () => {
      for (const seed of seeds) {
        const ex = generateExercise<IntervalHuntParams, IntervalHuntSolution>('interval-hunt', seed, ctx);
        const { from, fromNote, degree, direction } = ex.params;
        const { position, note } = ex.solution;
        const t = ctx.tuning;
        const accepted = allPositions(ctx).filter((p) => evaluate(ex, { kind: 'positions', positions: [p] }).correct);
        expect(accepted.map(key)).toEqual([key(position)]);
        expect(fretSpan([from.fret, position.fret]) <= ctx.maxSpan).toBe(true);
        expect(pcAt(t, from)).toBe(notePc(fromNote));
        expect(pcAt(t, position)).toBe(notePc(note));
        // The letter distance must match the named interval (octave folds to unison).
        const [lo, hi] = direction === 'up' ? [fromNote, note] : [note, fromNote];
        const named = degree.number === 8 ? '1' : degreeToString(degree);
        expect(degreeToString(degreeBetween(lo, hi))).toBe(named);
        expect(Math.abs(fromNote.acc) <= 1 && Math.abs(note.acc) <= 1).toBe(true);
      }
    });

    it('triad-build: every shape passes, every one-note slip fails', () => {
      for (const seed of seeds) {
        const ex = generateExercise<TriadBuildParams, TriadBuildSolution>('triad-build', seed, ctx);
        for (const shape of ex.solution.shapes) {
          expect(evaluate(ex, { kind: 'positions', positions: shape.positions }).correct).toBe(true);
          for (let i = 0; i < 3; i++)
            for (const d of [-2, -1, 1, 2]) {
              const slipped = shape.positions.map((p, j) => (j === i ? { ...p, fret: p.fret + d } : p));
              if (evaluate(ex, { kind: 'positions', positions: slipped }).correct) throw new Error(`seed ${seed}: slip accepted ${shape.tab}`);
            }
          // Same notes, but only two of them: not a triad.
          expect(evaluate(ex, { kind: 'positions', positions: shape.positions.slice(0, 2) }).correct).toBe(false);
        }
      }
    });

    it('melody-chord: three fitting triads, every other chip combination is wrong', () => {
      for (const seed of seeds) {
        const ex = generateExercise<MelodyChordParams, MelodyChordSolution>('melody-chord', seed, ctx);
        const ids = ex.solution.chords.map((c) => c.id);
        expect(ids.length).toBe(3); // a scale tone is root, 3rd and 5th of one diatonic triad each
        expect([...ex.solution.chords.map((c) => c.fn[c.fn.length - 1])].sort()).toEqual(['1', '3', '5']);
        expect(ex.params.midi % 12).toBe(notePc(ex.params.note));
        for (const c of ex.params.choices) {
          const toggled = ids.includes(c.id) ? ids.filter((i) => i !== c.id) : [...ids, c.id];
          if (evaluate(ex, { kind: 'choices', ids: toggled }).correct) throw new Error(`seed ${seed}: toggling ${c.id} still correct`);
        }
      }
    });
  });
}

describe('coverage over 1,000 seeds', () => {
  it('note-find reaches every note on every string', () => {
    const skills = new Set(seeds.flatMap((s) => generateExercise('note-find', s).skills));
    expect(skills.size).toBe(72);
  });
  it('interval-hunt reaches all 12 intervals in both directions', () => {
    const seen = new Set(seeds.map((s) => generateExercise('interval-hunt', s).skills[0].split('/').slice(0, 2).join('/')));
    expect(seen.size).toBe(24);
  });
  it('triad-build reaches 4 types × 3 inversions × 4 string sets', () => {
    expect(new Set(seeds.flatMap((s) => generateExercise('triad-build', s).skills)).size).toBe(48);
  });
  it('melody-chord reaches every degree in major and minor', () => {
    expect(new Set(seeds.flatMap((s) => generateExercise('melody-chord', s).skills)).size).toBe(14);
  });
});

describe('musical spot checks via focus', () => {
  it('note-find: C on the A string is fret 3 (fret 15 is out of range)', () => {
    const ex = generateExercise<NoteFindParams, NoteFindSolution>('note-find', 1, DEFAULT_CONTEXT, { pc: 0, string: 1 });
    expect(ex.solution.positions).toEqual([{ string: 1, fret: 3 }]);
    expect(ex.skills).toEqual(['note:C/string:5']);
  });
  it('note-find: E on the low string is fret 0 and 12', () => {
    const ex = generateExercise<NoteFindParams, NoteFindSolution>('note-find', 1, DEFAULT_CONTEXT, { pc: 4, string: 0 });
    expect(ex.solution.positions.map((p) => p.fret)).toEqual([0, 12]);
  });
  it('interval-hunt across G/B: major 3rd up from G string to B string', () => {
    for (const seed of seeds.slice(0, 50)) {
      const ex = generateExercise<IntervalHuntParams, IntervalHuntSolution>('interval-hunt', seed, DEFAULT_CONTEXT, {
        semitones: 4, direction: 'up', fromString: 3, targetString: 4,
      });
      // G→B is a major third, so the answer sits on the same fret.
      expect(ex.solution.position.fret).toBe(ex.params.from.fret);
      expect(ex.skills).toEqual(['interval:3/up/strings:3-2']);
    }
  });
  it('interval-hunt spells black-key starts sensibly (Db up M3 = F, not C# → E#)', () => {
    for (const seed of seeds.slice(0, 200)) {
      const ex = generateExercise<IntervalHuntParams, IntervalHuntSolution>('interval-hunt', seed, DEFAULT_CONTEXT, { semitones: 4, direction: 'up' });
      if (notePc(ex.params.fromNote) === 1) expect(noteName(ex.params.fromNote) + '→' + noteName(ex.solution.note)).toBe('Db→F');
    }
  });
  it('melody-chord: C in A minor fits Am (b3), C (1), F (5)', () => {
    const ex = generateExercise<MelodyChordParams, MelodyChordSolution>('melody-chord', 9, DEFAULT_CONTEXT, {
      mode: 'naturalMinor', tonic: 'A', scaleDegree: 3,
    });
    expect(ex.solution.chords.map((c) => `${c.symbol}:${c.fn}`)).toEqual(['Am:b3', 'C:1', 'F:5']);
    expect(ex.params.choices.map((c) => c.symbol)).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
  });
  it('melody-chord: Bb in F major fits Bb (1), Gm (b3), Edim (b5)', () => {
    const ex = generateExercise<MelodyChordParams, MelodyChordSolution>('melody-chord', 3, DEFAULT_CONTEXT, {
      mode: 'major', tonic: 'F', scaleDegree: 4,
    });
    expect(ex.solution.chords.map((c) => `${c.symbol}:${c.fn}`)).toEqual(['Gm:b3', 'Bb:1', 'Edim:b5']);
  });
  it('triad-build: F major 1st inversion on strings 4-3-2 is A-C-F (7-5-6)', () => {
    const ex = generateExercise<TriadBuildParams, TriadBuildSolution>('triad-build', 1, DEFAULT_CONTEXT, { typeId: 'maj', inversion: 1, lowString: 2, pc: 5 });
    expect(ex.solution.shapes.map((s) => s.tab)).toEqual(['xx756x']);
    expect(ex.solution.shapes[0].tones).toEqual(['A', 'C', 'F']);
  });
  it('triad-build: wrong inversion of the right chord is rejected', () => {
    const ex = generateExercise<TriadBuildParams, TriadBuildSolution>('triad-build', 1, DEFAULT_CONTEXT, { typeId: 'maj', inversion: 1, lowString: 2, pc: 5 });
    // F major root position on 4-3-2: F A C = 3-2-1
    expect(evaluate(ex, { kind: 'positions', positions: [{ string: 2, fret: 3 }, { string: 3, fret: 2 }, { string: 4, fret: 1 }] }).correct).toBe(false);
  });
  it('impossible focus throws instead of looping', () => {
    expect(() => generateExercise('note-find', 1, DEFAULT_CONTEXT, { string: 9 })).toThrow(/impossible focus/);
    expect(() => generateExercise('interval-hunt', 1, DEFAULT_CONTEXT, { fromString: 2, targetString: 2 })).toThrow(/no in-position answer/);
  });
});

describe('answers and attempts', () => {
  const ex = generateExercise('note-find', 5) as Exercise<NoteFindParams, NoteFindSolution>;
  it('takes self-ratings at face value', () => {
    expect(evaluate(ex, { kind: 'self', rating: 'miss' }).correct).toBe(false);
    expect(evaluate(ex, { kind: 'self', rating: 'instant' })).toEqual({ correct: true, rating: 'instant' });
  });
  it('counts hits, wrong and missed', () => {
    const wrong = { string: (ex.params.string + 1) % 6, fret: 0 };
    const ev = evaluate(ex, { kind: 'positions', positions: [ex.solution.positions[0], wrong] });
    expect(ev.correct).toBe(false);
    expect(ev.hits).toBe(1);
    expect(ev.wrong).toBe(1);
  });
  it('records attempts and enforces mode rules', () => {
    const a = recordAttempt(ex, { kind: 'self', rating: 'found' }, { mode: 'play', latencyMs: 2300, helpLevel: 1, at: 0 });
    expect(a.evaluation.correct).toBe(true);
    expect(a.exerciseId).toBe(`note-find#${ex.seed}`);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(() => recordAttempt(ex, { kind: 'positions', positions: [] }, { mode: 'play', latencyMs: 1, helpLevel: 0, at: 0 })).toThrow(/self-rated/);
  });
});
