import { FretPos, pcAt, positionsOf } from '../../guitar/fretboard';
import { PitchClass, toPc } from '../../theory/pitch';
import { Note, noteName, notePc } from '../../theory/spelling';
import { assertFocus, pcSkill, pickSpelling, stringNo } from '../common';
import { Diagnosis, ExerciseFamily, checkPositions } from '../types';

/** "Find F# on the A string." One correct location is enough. */
export interface NoteFindParams {
  note: Note;
  /** Internal string index (0 = lowest). */
  string: number;
}

export interface NoteFindSolution {
  /** Every location on that string within the context's fret range. */
  positions: FretPos[];
}

export interface NoteFindFocus {
  pc?: PitchClass;
  string?: number;
}

/** Skill id of a pitch class on a string (guitarist's string number); nudges use the same template. */
const noteSkill = (pc: PitchClass, string: number): string => `note:${pcSkill(pc)}/string:${string}`;

const other = (): Diagnosis => ({ kind: 'other', credit: 0 });

export const noteFind: ExerciseFamily<NoteFindParams, NoteFindSolution, NoteFindFocus> = {
  id: 'note-find',
  name: 'Find the note',
  modes: ['play', 'tap'],
  tempo: { fastMs: 2000, slowMs: 8000 },

  generate(rng, ctx, focus = {}) {
    const { tuning, range } = ctx;
    const strings = range.strings ?? tuning.strings.map((_, i) => i);
    assertFocus(focus.string === undefined || strings.includes(focus.string), 'note-find', `string ${focus.string}`);
    const string = focus.string ?? rng.pick(strings);
    const onString = { ...range, strings: [string] };
    // Only pitch classes that actually occur on this string in range (all 12 for a 12-fret range).
    const reachable = Array.from({ length: 12 }, (_, pc) => pc).filter((pc) => positionsOf(tuning, pc, onString).length > 0);
    assertFocus(focus.pc === undefined || reachable.includes(focus.pc), 'note-find', `pc ${focus.pc} on string ${string}`);
    const pc = focus.pc ?? rng.pick(reachable);
    const note = pickSpelling(rng, pc);
    return {
      params: { note, string },
      solution: { positions: positionsOf(tuning, pc, onString) },
      skills: [noteSkill(pc, stringNo(tuning, string))],
    };
  },

  skillSpace({ tuning, range }) {
    const strings = range.strings ?? tuning.strings.map((_, i) => i);
    return strings.flatMap((string) =>
      Array.from({ length: 12 }, (_, pc) => pc)
        .filter((pc) => positionsOf(tuning, pc, { ...range, strings: [string] }).length > 0)
        .map((pc) => ({ skill: noteSkill(pc, stringNo(tuning, string)), focus: { pc, string } })),
    );
  },

  check(ex, r) {
    if (r.kind !== 'positions') return { correct: false };
    const { tuning, range } = ex.context;
    const { note, string } = ex.params;
    const pc = notePc(note);
    const expected = positionsOf(tuning, pc, { ...range, strings: [string] }).length;
    return checkPositions(
      r.positions,
      (p) => p.string === string && p.fret >= range.minFret && p.fret <= range.maxFret && pcAt(tuning, p) === pc,
      expected,
      false,
    );
  },

  solve: (ex) => ({ kind: 'positions', positions: ex.solution.positions }),

  // ── Diagnosis ──

  /**
   * The first wrong position decides (a hit next to it does not make the answer right):
   * right pitch class on another string, one fret off on the right string, or the right note
   * outside the fret range. Anything else is 'other'.
   */
  diagnose(ex, r) {
    if (r.kind !== 'positions') return other();
    const { tuning, range } = ex.context;
    const { string } = ex.params;
    const pc = notePc(ex.params.note);
    const isRight = (p: FretPos): boolean =>
      p.string === string && p.fret >= range.minFret && p.fret <= range.maxFret && pcAt(tuning, p) === pc;
    const wrong = r.positions.find((p) => !isRight(p));
    if (!wrong) return other();
    const played = pcAt(tuning, wrong);
    const asked = stringNo(tuning, string);
    if (wrong.string === string && played === pc) return { kind: 'octave', credit: 0.5 };
    if (wrong.string === string && (played === toPc(pc + 1) || played === toPc(pc - 1))) {
      const frets = played === toPc(pc + 1) ? 1 : -1;
      return { kind: 'off-by-one', credit: 0.25, nudge: [noteSkill(played, asked)], detail: { frets } };
    }
    if (played === pc) {
      const playedNo = stringNo(tuning, wrong.string);
      return { kind: 'wrong-string', credit: 0.5, nudge: [noteSkill(pc, asked), noteSkill(pc, playedNo)], detail: { string: playedNo } };
    }
    return other();
  },

  /** "≈ Fast": the two semitone neighbours on the same string. */
  nearNeighbours(ex) {
    const pc = notePc(ex.params.note);
    const string = stringNo(ex.context.tuning, ex.params.string);
    return [noteSkill(toPc(pc - 1), string), noteSkill(toPc(pc + 1), string)];
  },

  describe: (ex) => `find ${noteName(ex.params.note)} on string ${stringNo(ex.context.tuning, ex.params.string)}`,
};
