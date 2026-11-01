import { describe, expect, it } from './expect';
import {
  AutoResponse,
  DEFAULT_CONTEXT,
  Diagnosis,
  ErrorKind,
  Exercise,
  ExerciseContext,
  IntervalHuntParams,
  IntervalHuntSolution,
  KeysChordParams,
  KeysChordSolution,
  KeysVoicingParams,
  KeysVoicingSolution,
  MelodyChordParams,
  MelodyChordSolution,
  NoteFindParams,
  NoteFindSolution,
  Response,
  TriadBuildFocus,
  TriadBuildParams,
  TriadBuildSolution,
  evaluate,
  generateExercise,
  getFamily,
  listFamilies,
  notePc,
  pitchAt,
  solve,
  stringNo,
  voicingComplete,
} from '../src/core';
import { isLeafId } from '../src/core/mastery/skillId';

const ctx = DEFAULT_CONTEXT;
const seeds = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

// ── Helpers ──

const positions = (...ps: [number, number][]): AutoResponse => ({ kind: 'positions', positions: ps.map(([string, fret]) => ({ string, fret })) });
const notes = (...midis: number[]): AutoResponse => ({ kind: 'notes', midis });
const chips = (...ids: string[]): AutoResponse => ({ kind: 'choices', ids });
const NEAR: Response = { kind: 'self', rating: 'near' };

/** The diagnosis of an answer that must be wrong. */
function errorOf(ex: Exercise, r: AutoResponse): Diagnosis {
  const ev = evaluate(ex, r);
  if (ev.correct) throw new Error(`expected a wrong answer: ${JSON.stringify(r)}`);
  if (!ev.error) throw new Error(`expected a diagnosis: ${JSON.stringify(r)}`);
  return ev.error;
}

/** Confusables the registry attaches to a self-rated "≈ Fast". */
const nearNudge = (ex: Exercise): string[] => evaluate(ex, NEAR).error?.nudge ?? [];

/** The first exercise over 1,000 seeds that satisfies a predicate (pins a fixture without hand-building it). */
function exerciseWhere<P, S>(family: string, focus: unknown, pred: (ex: Exercise<P, S>) => boolean, context: ExerciseContext = ctx): Exercise<P, S> {
  for (const seed of seeds(1000)) {
    const ex = generateExercise<P, S>(family, seed, context, focus);
    if (pred(ex)) return ex;
  }
  throw new Error(`no ${family} exercise matches ${JSON.stringify(focus)}`);
}

/** Catalog ids of one family in the default context. */
const catalogOf = (family: string): Set<string> => new Set(getFamily(family).skillSpace(ctx).map((s) => s.skill));

// ── note-find ──

describe('note-find diagnosis', () => {
  // C on the A string (guitarist's string 5, internal index 1): fret 3 only.
  const ex = generateExercise<NoteFindParams, NoteFindSolution>('note-find', 1, ctx, { pc: 0, string: 1 });

  it('names the string when the right note sits on another one, boosting both', () => {
    expect(errorOf(ex, positions([2, 10]))).toEqual({
      kind: 'wrong-string', credit: 0.5, nudge: ['note:C/string:5', 'note:C/string:4'], detail: { string: 4 },
    });
  });
  it('counts one fret off on the right string, up and down', () => {
    expect(errorOf(ex, positions([1, 4]))).toEqual({ kind: 'off-by-one', credit: 0.25, nudge: ['note:C#/string:5'], detail: { frets: 1 } });
    expect(errorOf(ex, positions([1, 2]))).toEqual({ kind: 'off-by-one', credit: 0.25, nudge: ['note:B/string:5'], detail: { frets: -1 } });
  });
  it('calls the right note outside the fret range an octave', () => {
    const narrow: ExerciseContext = { ...ctx, range: { minFret: 0, maxFret: 11 } };
    const lowE = generateExercise<NoteFindParams, NoteFindSolution>('note-find', 1, narrow, { pc: 4, string: 0 });
    expect(lowE.solution.positions).toEqual([{ string: 0, fret: 0 }]);
    expect(errorOf(lowE, positions([0, 12]))).toEqual({ kind: 'octave', credit: 0.5 });
  });
  it('has no opinion on an unrelated note and lets the wrong position decide next to a hit', () => {
    expect(errorOf(ex, positions([1, 5]))).toEqual({ kind: 'other', credit: 0 });
    expect(errorOf(ex, positions([1, 3], [2, 10])).kind).toBe('wrong-string');
  });
  it('nears the two semitone neighbours on the string', () => {
    expect(evaluate(ex, NEAR)).toEqual({
      correct: false, rating: 'near', error: { kind: 'near', credit: 0.25, nudge: ['note:B/string:5', 'note:C#/string:5'] },
    });
  });
});

// ── interval-hunt ──

describe('interval-hunt diagnosis', () => {
  // Major 3rd up from the open G string (G3 = 55) onto the B string: the open B (59).
  const focus = { semitones: 4, direction: 'up', fromString: 3, targetString: 4 };
  const ex = exerciseWhere<IntervalHuntParams, IntervalHuntSolution>('interval-hunt', focus, (e) => e.params.from.fret === 0);
  const asked = 'interval:3/up/strings:3-2';

  it('is pinned on the open G string', () => {
    expect(ex.skills).toEqual([asked]);
    expect(pitchAt(ctx.tuning, ex.params.from)).toBe(55);
  });
  it('spots the interval taken the other way, on any string', () => {
    // Eb (51): D string fret 1, low E fret 11.
    expect(errorOf(ex, positions([2, 1]))).toEqual({ kind: 'direction', credit: 0.25, nudge: ['interval:3/down/strings:3-2'] });
    expect(errorOf(ex, positions([0, 11])).kind).toBe('direction');
  });
  it('spots the octave on the target string', () => {
    expect(errorOf(ex, positions([4, 12]))).toEqual({ kind: 'octave', credit: 0.5 });
  });
  it('names the interval actually played when one semitone off on the target string', () => {
    expect(errorOf(ex, positions([4, 1]))).toEqual({ kind: 'off-by-one', credit: 0.25, nudge: ['interval:4/up/strings:3-2'], detail: { degree: '4' } });
    // From A (G string fret 2) the C natural one fret under the C# is a minor third.
    const fromA = exerciseWhere<IntervalHuntParams, IntervalHuntSolution>('interval-hunt', focus, (e) => e.params.from.fret === 2);
    expect(errorOf(fromA, positions([4, 1]))).toEqual({ kind: 'off-by-one', credit: 0.25, nudge: ['interval:b3/up/strings:3-2'], detail: { degree: 'b3' } });
  });
  it('names the string when the exact pitch is on another one', () => {
    expect(errorOf(ex, positions([2, 9]))).toEqual({ kind: 'wrong-string', credit: 0.5, detail: { string: 4 } });
  });
  it('has no opinion on an unrelated pitch', () => {
    expect(errorOf(ex, positions([4, 5]))).toEqual({ kind: 'other', credit: 0 });
  });
  it('works downwards too', () => {
    // Fifth down from the B string fret 4 (Eb4 = 63) onto the G string: Ab3 (56) = fret 1.
    const down = exerciseWhere<IntervalHuntParams, IntervalHuntSolution>(
      'interval-hunt', { semitones: 7, direction: 'down', fromString: 4, targetString: 3 }, (e) => e.params.from.fret === 4,
    );
    expect(down.skills).toEqual(['interval:5/down/strings:2-3']);
    expect(errorOf(down, positions([5, 6]))).toEqual({ kind: 'direction', credit: 0.25, nudge: ['interval:5/up/strings:2-3'] }); // Bb4 = a fifth up
    expect(errorOf(down, positions([2, 6]))).toEqual({ kind: 'wrong-string', credit: 0.5, detail: { string: 4 } });
    expect(errorOf(down, positions([3, 2]))).toEqual({ kind: 'off-by-one', credit: 0.25, nudge: ['interval:b5/down/strings:2-3'], detail: { degree: 'b5' } });
  });
  it('nears the intervals a semitone smaller and larger on the pair', () => {
    expect(nearNudge(ex)).toEqual(['interval:b3/up/strings:3-2', 'interval:4/up/strings:3-2']);
    const octave = generateExercise<IntervalHuntParams, IntervalHuntSolution>('interval-hunt', 0, ctx, { semitones: 12, direction: 'up' });
    const nudge = nearNudge(octave);
    expect(nudge.length).toBe(1);
    expect(nudge[0].startsWith('interval:7/up/')).toBe(true);
  });
});

// ── triad-build ──

describe('triad-build diagnosis', () => {
  // F major, 1st inversion, on strings 4-3-2: A C F = xx756x.
  const ex = generateExercise<TriadBuildParams, TriadBuildSolution>('triad-build', 1, ctx, { typeId: 'maj', inversion: 1, lowString: 2, pc: 5 });
  const asked = 'triad:maj/inv:1/strings:4-3-2';

  it('is pinned on F/A', () => {
    expect(ex.skills).toEqual([asked]);
    expect(ex.solution.shapes.map((s) => s.tab)).toEqual(['xx756x']);
  });
  it('credits the inversion actually built as an aside', () => {
    // Root position F A C = xx321x; 2nd inversion C F A = xx-10-10-10-x.
    expect(errorOf(ex, positions([2, 3], [3, 2], [4, 1]))).toEqual({
      kind: 'inversion', credit: 0.5, aside: 'triad:maj/inv:0/strings:4-3-2', nudge: [asked, 'triad:maj/inv:0/strings:4-3-2'], detail: { inversion: 0, note: 'F' },
    });
    expect(errorOf(ex, positions([2, 10], [3, 10], [4, 10]))).toEqual({
      kind: 'inversion', credit: 0.5, aside: 'triad:maj/inv:2/strings:4-3-2', nudge: [asked, 'triad:maj/inv:2/strings:4-3-2'], detail: { inversion: 2, note: 'C' },
    });
  });
  it('credits the same shape on another adjacent set as an aside, a scattered one not', () => {
    // A C F on 3-2-1 = xxx211.
    expect(errorOf(ex, positions([3, 2], [4, 1], [5, 1]))).toEqual({ kind: 'wrong-set', credit: 0.5, aside: 'triad:maj/inv:1/strings:3-2-1' });
    // A (open A string), C (G string fret 5), F (high E fret 1): right tones, no string set.
    expect(errorOf(ex, positions([1, 0], [3, 5], [5, 1]))).toEqual({ kind: 'wrong-set', credit: 0.5 });
  });
  it('calls right tones and bass that do not form a hand shape a span error', () => {
    // A (D string 7), F (G string 10), C (B string 1): pitches do not rise string by string.
    expect(errorOf(ex, positions([2, 7], [3, 10], [4, 1]))).toEqual({ kind: 'span', credit: 0.5 });
  });
  it('names the missing tone by its function', () => {
    // A C A: the root is missing.
    expect(errorOf(ex, positions([2, 7], [3, 5], [4, 10]))).toEqual({ kind: 'missing-tone', credit: 0.25, detail: { fn: '1' } });
  });
  it('recognises another triad type over the same root, with an aside only on the asked set', () => {
    // F minor 1st inversion on 4-3-2: Ab C F = xx656x.
    expect(errorOf(ex, positions([2, 6], [3, 5], [4, 6]))).toEqual({
      kind: 'wrong-type', credit: 0, aside: 'triad:min/inv:1/strings:4-3-2', nudge: [asked, 'triad:min/inv:1/strings:4-3-2'], detail: { type: 'min', note: 'Ab' },
    });
    // The same F minor on 3-2-1 = xxx111: wrong type and wrong set, nothing demonstrated for 4-3-2.
    expect(errorOf(ex, positions([3, 1], [4, 1], [5, 1]))).toEqual({ kind: 'wrong-type', credit: 0, nudge: [asked], detail: { type: 'min', note: 'Ab' } });
  });
  it('calls fewer than three positions incomplete', () => {
    expect(errorOf(ex, positions([2, 7], [3, 5]))).toEqual({ kind: 'incomplete', credit: 0 });
    expect(errorOf(ex, positions())).toEqual({ kind: 'incomplete', credit: 0 });
  });
  it('nears the other two inversions on the set', () => {
    expect(nearNudge(ex)).toEqual(['triad:maj/inv:0/strings:4-3-2', 'triad:maj/inv:2/strings:4-3-2']);
  });
});

// ── keys-chord ──

describe('keys-chord diagnosis', () => {
  // C major root position: C4 E4 G4.
  const ex = generateExercise<KeysChordParams, KeysChordSolution>('keys-chord', 1, ctx, { typeId: 'maj', inversion: 0, pc: 0 });
  const asked = 'keys:maj/inv:0';

  it('is pinned on C E G', () => {
    expect(ex.skills).toEqual([asked]);
    expect(ex.solution.notes).toEqual([60, 64, 67]);
  });
  it('credits the inversion actually played as an aside', () => {
    expect(errorOf(ex, notes(64, 67, 72))).toEqual({
      kind: 'inversion', credit: 0.5, aside: 'keys:maj/inv:1', nudge: [asked, 'keys:maj/inv:1'], detail: { inversion: 1, note: 'E' },
    });
    expect(errorOf(ex, notes(55, 60, 64))).toEqual({
      kind: 'inversion', credit: 0.5, aside: 'keys:maj/inv:2', nudge: [asked, 'keys:maj/inv:2'], detail: { inversion: 2, note: 'G' },
    });
  });
  it('names the degree of a foreign tone over the root', () => {
    expect(errorOf(ex, notes(60, 64, 67, 70))).toEqual({ kind: 'extra-tone', credit: 0.5, detail: { degree: 'b7' } });
  });
  it('names the missing tone by its function', () => {
    expect(errorOf(ex, notes(60, 67, 72))).toEqual({ kind: 'missing-tone', credit: 0.25, detail: { fn: '3' } });
  });
  it('recognises another triad type over the same root', () => {
    expect(errorOf(ex, notes(60, 63, 67))).toEqual({ kind: 'wrong-type', credit: 0, aside: 'keys:min/inv:0', nudge: [asked, 'keys:min/inv:0'], detail: { type: 'min' } });
    expect(errorOf(ex, notes(63, 67, 72))).toEqual({ kind: 'wrong-type', credit: 0, aside: 'keys:min/inv:1', nudge: [asked, 'keys:min/inv:1'], detail: { type: 'min' } });
    expect(errorOf(ex, notes(60, 64, 68))).toEqual({ kind: 'wrong-type', credit: 0, aside: 'keys:aug/inv:0', nudge: [asked, 'keys:aug/inv:0'], detail: { type: 'aug' } });
    // A sus chord is no triad skill: nothing to credit, the asked skill is still boosted.
    expect(errorOf(ex, notes(60, 65, 67))).toEqual({ kind: 'wrong-type', credit: 0, nudge: [asked], detail: { type: 'sus4' } });
  });
  it('calls fewer than three notes incomplete and a cluster other', () => {
    expect(errorOf(ex, notes(60, 64))).toEqual({ kind: 'incomplete', credit: 0 });
    expect(errorOf(ex, notes(60, 61, 62))).toEqual({ kind: 'other', credit: 0 });
  });
});

// ── keys-voicing ──

describe('keys-voicing diagnosis', () => {
  const gen = (typeId: string, pc: number) => generateExercise<KeysVoicingParams, KeysVoicingSolution>('keys-voicing', 1, ctx, { typeId, pc });
  // Fm9: F3 | Ab4 C5 Eb5 G5.
  const fm9 = gen('m9', 5);

  it('is pinned on Fm9', () => {
    expect(fm9.skills).toEqual(['voicing:m9']);
    expect(fm9.solution.notes).toEqual([53, 68, 72, 75, 79]);
  });
  it('names the degree of a wrong bass', () => {
    expect(errorOf(fm9, notes(56, 65, 72, 75, 79))).toEqual({ kind: 'bass', credit: 0.5, detail: { degree: 'b3' } });
    expect(errorOf(fm9, notes(54, 68, 72, 75, 79))).toEqual({ kind: 'bass', credit: 0.5, detail: { degree: 'b2' } });
  });
  it('gives nothing for a missing guide tone', () => {
    expect(errorOf(fm9, notes(53, 72, 75, 79))).toEqual({ kind: 'missing-guide', credit: 0, detail: { degree: 'b3' } });
    expect(errorOf(fm9, notes(53, 68, 72, 79))).toEqual({ kind: 'missing-guide', credit: 0, detail: { degree: 'b7' } });
  });
  it('credits the simpler voicing when only the colour is missing', () => {
    expect(errorOf(fm9, notes(53, 68, 72, 75))).toEqual({ kind: 'missing-colour', credit: 0.5, aside: 'voicing:m7', nudge: ['voicing:m7'], detail: { degree: '9' } });
    // With a foreign tone the m7 is not demonstrated either.
    expect(errorOf(fm9, notes(53, 68, 72, 75, 78))).toEqual({ kind: 'missing-colour', credit: 0.5, nudge: [], detail: { degree: '9' } });
    // C13: Bb D E A over C; 13 or 9 missing still proves the C7.
    const c13 = gen('dom13', 0);
    expect(c13.solution.notes).toEqual([48, 70, 74, 76, 81]);
    expect(errorOf(c13, notes(48, 70, 74, 76))).toEqual({ kind: 'missing-colour', credit: 0.5, aside: 'voicing:dom7', nudge: ['voicing:dom7'], detail: { degree: '13' } });
    expect(errorOf(c13, notes(48, 70, 76, 81))).toEqual({ kind: 'missing-colour', credit: 0.5, aside: 'voicing:dom7', nudge: ['voicing:dom7'], detail: { degree: '9' } });
    // Dm7b5 without its b5: the simpler type (dim) is no voicing skill.
    const dm7b5 = gen('m7b5', 2);
    expect(dm7b5.solution.notes).toEqual([50, 65, 68, 72]);
    expect(errorOf(dm7b5, notes(50, 65, 72))).toEqual({ kind: 'missing-colour', credit: 0.5, nudge: [], detail: { degree: 'b5' } });
  });
  it('names the degree of a foreign tone above a complete voicing', () => {
    expect(errorOf(fm9, notes(53, 68, 75, 78, 79))).toEqual({ kind: 'wrong-tone', credit: 0.25, detail: { degree: 'b2' } });
  });
  it('calls fewer than three notes incomplete', () => {
    expect(errorOf(fm9, notes(53, 68))).toEqual({ kind: 'incomplete', credit: 0 });
  });
});

describe('voicingComplete', () => {
  it('wants the root in the bass and every essential degree above it', () => {
    expect(voicingComplete(0, 'dom7', [48, 52, 58])).toBe(true); // shell: 3 and b7
    expect(voicingComplete(0, 'dom9', [48, 52, 58])).toBe(false); // the 9th itself is essential
    expect(voicingComplete(0, 'dom9', [48, 52, 58, 62])).toBe(true);
    expect(voicingComplete(0, 'maj7', [52, 59, 60])).toBe(false); // E in the bass
    expect(voicingComplete(0, 'maj7', [48, 60, 64, 71])).toBe(true); // root doubled above
    expect(voicingComplete(0, 'maj7', [48, 48, 52, 59])).toBe(true); // bass doubled
    expect(voicingComplete(12, 'maj7', [48, 52, 59])).toBe(true); // any pitch class representation
    expect(voicingComplete(0, 'maj7', [])).toBe(false);
  });
  it('ignores foreign tones, which check() still rejects', () => {
    expect(voicingComplete(0, 'maj7', [48, 52, 59, 61])).toBe(true);
    const cmaj7 = generateExercise<KeysVoicingParams, KeysVoicingSolution>('keys-voicing', 1, ctx, { typeId: 'maj7', pc: 0 });
    expect(evaluate(cmaj7, notes(48, 52, 59)).correct).toBe(true); // fifth left out
    expect(evaluate(cmaj7, notes(48, 52, 59, 61)).correct).toBe(false);
    expect(evaluate(cmaj7, notes(48, 52, 59, 61)).error?.kind).toBe('wrong-tone');
  });
});

// ── melody-chord ──

describe('melody-chord diagnosis', () => {
  // C in A minor fits Am (b3), C (1), F (5); chips are deg:1 … deg:7.
  const ex = generateExercise<MelodyChordParams, MelodyChordSolution>('melody-chord', 9, ctx, { mode: 'naturalMinor', tonic: 'A', scaleDegree: 3 });

  it('credits the share of fitting chords found and names the first one missing', () => {
    const d = errorOf(ex, chips('deg:1', 'deg:3'));
    expect(d.kind).toBe('missed-chord');
    expect(d.credit).toBeCloseTo(0.5 * (2 / 3));
    expect(d.detail).toEqual({ symbol: 'F', fn: '5' });
    const one = errorOf(ex, chips('deg:3'));
    expect(one.credit).toBeCloseTo(0.5 / 3);
    expect(one.detail).toEqual({ symbol: 'Am', fn: 'b3' });
    expect(errorOf(ex, chips())).toEqual({ kind: 'missed-chord', credit: 0, detail: { symbol: 'Am', fn: 'b3' } });
  });
  it('lets a non-fitting chip win and names the degree of the note over its root', () => {
    expect(errorOf(ex, chips('deg:1', 'deg:3', 'deg:6', 'deg:5'))).toEqual({ kind: 'extra-chord', credit: 0.25, detail: { symbol: 'Em', degree: 'b6' } });
    expect(errorOf(ex, chips('deg:1', 'deg:5'))).toEqual({ kind: 'extra-chord', credit: 0.25, detail: { symbol: 'Em', degree: 'b6' } });
    expect(errorOf(ex, chips('deg:2'))).toEqual({ kind: 'extra-chord', credit: 0.25, detail: { symbol: 'Bdim', degree: 'b2' } });
  });
  it('has no opinion on an unknown chip', () => {
    expect(errorOf(ex, chips('deg:9'))).toEqual({ kind: 'other', credit: 0 });
  });
  it('has no confusables for "≈ Fast"', () => {
    expect(evaluate(ex, NEAR)).toEqual({ correct: false, rating: 'near', error: { kind: 'near', credit: 0.25, nudge: [] } });
  });
});

// ── Registry ──

describe('evaluate with diagnoses', () => {
  it('never attaches an error to a correct answer', () => {
    for (const fam of listFamilies()) {
      const ex = generateExercise(fam.id, 3);
      const ev = evaluate(ex, solve(ex));
      expect(ev.correct).toBe(true);
      expect(ev.error).toBe(undefined);
    }
  });
  it('keeps the check() counts and merges the diagnosis on a wrong answer', () => {
    const ex = generateExercise<NoteFindParams, NoteFindSolution>('note-find', 1, ctx, { pc: 0, string: 1 });
    const ev = evaluate(ex, positions([1, 3], [2, 10]));
    expect(ev.correct).toBe(false);
    expect([ev.hits, ev.wrong, ev.missed]).toEqual([1, 1, 0]);
    expect(ev.error?.kind).toBe('wrong-string');
  });
  it('takes self-ratings at face value and carries an error only for "≈ Fast"', () => {
    const ex = generateExercise('triad-build', 5);
    expect(evaluate(ex, { kind: 'self', rating: 'miss' })).toEqual({ correct: false, rating: 'miss' });
    expect(evaluate(ex, { kind: 'self', rating: 'found' })).toEqual({ correct: true, rating: 'found' });
    expect(evaluate(ex, { kind: 'self', rating: 'instant' })).toEqual({ correct: true, rating: 'instant' });
    const near = evaluate(ex, NEAR);
    expect(near.correct).toBe(false);
    expect(near.error).toEqual({ kind: 'near', credit: 0.25, nudge: getFamily('triad-build').nearNeighbours!(ex) });
  });
  it('diagnoses from params and response alone, never from the solution', () => {
    const blind = <P, S>(ex: Exercise<P, S>): Exercise<P, S> => ({ ...ex, solution: null as unknown as S });
    const nf = generateExercise<NoteFindParams, NoteFindSolution>('note-find', 1, ctx, { pc: 0, string: 1 });
    expect(evaluate(blind(nf), positions([2, 10])).error).toEqual(errorOf(nf, positions([2, 10])));
    const ih = generateExercise('interval-hunt', 2, ctx, { semitones: 4, direction: 'up', fromString: 3, targetString: 4 });
    expect(evaluate(blind(ih), positions([4, 12])).error).toEqual(errorOf(ih, positions([4, 12])));
    const tb = generateExercise('triad-build', 1, ctx, { typeId: 'maj', inversion: 1, lowString: 2, pc: 5 });
    expect(evaluate(blind(tb), positions([2, 3], [3, 2], [4, 1])).error).toEqual(errorOf(tb, positions([2, 3], [3, 2], [4, 1])));
    const kc = generateExercise('keys-chord', 1, ctx, { typeId: 'maj', inversion: 0, pc: 0 });
    expect(evaluate(blind(kc), notes(64, 67, 72)).error).toEqual(errorOf(kc, notes(64, 67, 72)));
    const kv = generateExercise('keys-voicing', 1, ctx, { typeId: 'm9', pc: 5 });
    expect(evaluate(blind(kv), notes(53, 68, 72, 75)).error).toEqual(errorOf(kv, notes(53, 68, 72, 75)));
    const mc = generateExercise('melody-chord', 9, ctx, { mode: 'naturalMinor', tonic: 'A', scaleDegree: 3 });
    expect(evaluate(blind(mc), chips('deg:1', 'deg:5')).error).toEqual(errorOf(mc, chips('deg:1', 'deg:5')));
  });
});

// ── Sweep ──

const KINDS: Record<string, ErrorKind[]> = {
  'note-find': ['wrong-string', 'off-by-one', 'octave', 'other'],
  'interval-hunt': ['direction', 'octave', 'off-by-one', 'wrong-string', 'other'],
  'triad-build': ['wrong-set', 'span', 'inversion', 'missing-tone', 'wrong-type', 'incomplete', 'other'],
  'keys-chord': ['inversion', 'extra-tone', 'missing-tone', 'wrong-type', 'incomplete', 'other'],
  'keys-voicing': ['bass', 'missing-guide', 'missing-colour', 'wrong-tone', 'incomplete', 'other'],
  'melody-chord': ['missed-chord', 'extra-chord', 'other'],
};

/** Every wrong answer gets a diagnosis of a kind the family owns, a legal credit, and leaf ids only. */
function assertWellFormed(ex: Exercise, r: AutoResponse, catalog?: Set<string>): ErrorKind {
  const ev = evaluate(ex, r);
  if (ev.correct) throw new Error(`${ex.id}: expected a wrong answer`);
  const d = ev.error;
  if (!d) throw new Error(`${ex.id}: no diagnosis for ${JSON.stringify(r)}`);
  if (!KINDS[ex.family].includes(d.kind)) throw new Error(`${ex.id}: kind ${d.kind} is not a ${ex.family} kind`);
  const legal = d.kind === 'missed-chord' ? d.credit >= 0 && d.credit <= 0.5 : [0, 0.25, 0.5].includes(d.credit);
  if (!legal) throw new Error(`${ex.id}: credit ${d.credit} for ${d.kind}`);
  if ((d.kind === 'other' || d.kind === 'incomplete') && (d.credit !== 0 || d.nudge || d.aside)) throw new Error(`${ex.id}: ${d.kind} carries credit or ids`);
  for (const id of [...(d.nudge ?? []), ...(d.aside ? [d.aside] : [])]) {
    if (!isLeafId(id)) throw new Error(`${ex.id}: ${d.kind} names a malformed id ${id}`);
    if (catalog && !catalog.has(id)) throw new Error(`${ex.id}: ${d.kind} names ${id}, not a catalog id`);
  }
  if (d.aside && !catalog && !isLeafId(d.aside)) throw new Error(`${ex.id}: aside ${d.aside}`);
  return d.kind;
}

describe('diagnoses stay well-formed over many seeds', () => {
  const allPositions = (): [number, number][] => {
    const out: [number, number][] = [];
    for (let string = 0; string < ctx.tuning.strings.length; string++)
      for (let fret = ctx.range.minFret; fret <= ctx.range.maxFret; fret++) out.push([string, fret]);
    return out;
  };

  it('note-find: every wrong position, nudges inside the catalog', () => {
    const catalog = catalogOf('note-find');
    const seen = new Set<ErrorKind>();
    for (const seed of seeds(100)) {
      const ex = generateExercise<NoteFindParams, NoteFindSolution>('note-find', seed);
      for (const p of allPositions()) {
        if (evaluate(ex, positions(p)).correct) continue;
        seen.add(assertWellFormed(ex, positions(p), catalog));
      }
      for (const id of nearNudge(ex)) expect(catalog.has(id)).toBe(true);
    }
    expect([...seen].sort()).toEqual(['off-by-one', 'other', 'wrong-string']);
  });

  it('interval-hunt: every wrong position, nudges are leaf ids', () => {
    const seen = new Set<ErrorKind>();
    for (const seed of seeds(100)) {
      const ex = generateExercise<IntervalHuntParams, IntervalHuntSolution>('interval-hunt', seed);
      for (const p of allPositions()) {
        if (evaluate(ex, positions(p)).correct) continue;
        seen.add(assertWellFormed(ex, positions(p)));
      }
      for (const id of nearNudge(ex)) expect(isLeafId(id)).toBe(true);
    }
    expect([...seen].sort()).toEqual(['direction', 'octave', 'off-by-one', 'other', 'wrong-string']);
  });

  it('triad-build: slips, inversions, other sets and two-note answers', () => {
    const catalog = catalogOf('triad-build');
    const seen = new Set<ErrorKind>();
    for (const seed of seeds(200)) {
      const ex = generateExercise<TriadBuildParams, TriadBuildSolution>('triad-build', seed);
      const shape = ex.solution.shapes[0].positions;
      const tries: AutoResponse[] = [{ kind: 'positions', positions: shape.slice(0, 2) }];
      for (let i = 0; i < 3; i++) for (const d of [-2, -1, 1, 2]) tries.push({ kind: 'positions', positions: shape.map((p, j) => (j === i ? { ...p, fret: p.fret + d } : p)) });
      // Whole shape one string up or down (same frets): usually the right tones on another set, or another type.
      for (const d of [-1, 1]) {
        const moved = shape.map((p) => ({ ...p, string: p.string + d }));
        if (moved.every((p) => p.string >= 0 && p.string < ctx.tuning.strings.length)) tries.push({ kind: 'positions', positions: moved });
      }
      // The same chord built as its next inversion on the set, and in the asked inversion on another set.
      const { typeId, inversion, strings } = ex.params;
      const pc = notePc(ex.params.root);
      const sibling = (focus: TriadBuildFocus): AutoResponse | null => {
        const set = [0, 1, 2].map((k) => stringNo(ctx.tuning, focus.lowString! + k)).join('-');
        if (!catalog.has(`triad:${focus.typeId}/inv:${focus.inversion}/strings:${set}`)) return null; // dim root position on fourths
        try {
          return { kind: 'positions', positions: generateExercise<TriadBuildParams, TriadBuildSolution>('triad-build', seed, ctx, focus).solution.shapes[0].positions };
        } catch (e) {
          if (e instanceof Error && /nothing playable/.test(e.message)) return null; // this root has no shape there in range
          throw e;
        }
      };
      for (const r of [sibling({ typeId, inversion: (inversion + 1) % 3, lowString: strings[0], pc }), sibling({ typeId, inversion, lowString: (strings[0] + 1) % 4, pc })]) if (r) tries.push(r);
      for (const r of tries) if (!evaluate(ex, r).correct) seen.add(assertWellFormed(ex, r, catalog));
      for (const id of nearNudge(ex)) expect(isLeafId(id)).toBe(true);
    }
    expect([...seen].sort()).toEqual(['incomplete', 'inversion', 'missing-tone', 'other', 'wrong-set', 'wrong-type']);
  });

  it('keys-chord: other inversions, semitone slips, dropped and added notes', () => {
    const catalog = catalogOf('keys-chord');
    const seen = new Set<ErrorKind>();
    for (const seed of seeds(200)) {
      const ex = generateExercise<KeysChordParams, KeysChordSolution>('keys-chord', seed);
      const n = ex.solution.notes;
      const tries: number[][] = [
        [n[1], n[2], n[0] + 12], [n[2] - 12, n[0], n[1]], n.slice(0, 2), [...n, n[0] + 13], [n[0], n[2], n[2] + 12],
      ];
      for (let i = 0; i < 3; i++) for (const d of [-1, 1]) tries.push(n.map((m, j) => (j === i ? m + d : m)));
      for (const midis of tries) if (!evaluate(ex, notes(...midis)).correct) seen.add(assertWellFormed(ex, notes(...midis), catalog));
    }
    expect([...seen].sort()).toEqual(['extra-tone', 'incomplete', 'inversion', 'missing-tone', 'other', 'wrong-type']);
  });

  it('keys-voicing: dropped right-hand notes, a moved bass, a foreign tone', () => {
    const catalog = catalogOf('keys-voicing');
    const seen = new Set<ErrorKind>();
    for (const seed of seeds(200)) {
      const ex = generateExercise<KeysVoicingParams, KeysVoicingSolution>('keys-voicing', seed);
      const [bass, ...rh] = ex.solution.notes;
      const tries: number[][] = [[bass + 1, ...rh], [rh[0] - 12, bass + 12, ...rh.slice(1)], [bass, ...rh, bass + 13], [bass, rh[0]]];
      for (let i = 0; i < rh.length; i++) tries.push([bass, ...rh.filter((_, j) => j !== i)]);
      for (const midis of tries) if (!evaluate(ex, notes(...midis)).correct) seen.add(assertWellFormed(ex, notes(...midis), catalog));
    }
    expect([...seen].sort()).toEqual(['bass', 'incomplete', 'missing-colour', 'missing-guide', 'wrong-tone']);
  });

  it('melody-chord: every single toggle', () => {
    const seen = new Set<ErrorKind>();
    for (const seed of seeds(200)) {
      const ex = generateExercise<MelodyChordParams, MelodyChordSolution>('melody-chord', seed);
      const ids = ex.solution.chords.map((c) => c.id);
      for (const c of ex.params.choices) {
        const toggled = ids.includes(c.id) ? ids.filter((i) => i !== c.id) : [...ids, c.id];
        seen.add(assertWellFormed(ex, chips(...toggled)));
      }
    }
    expect([...seen].sort()).toEqual(['extra-chord', 'missed-chord']);
  });
});
