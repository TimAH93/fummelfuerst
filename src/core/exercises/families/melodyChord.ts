import { chord, chordContains, chordSymbol } from '../../theory/chord';
import { diatonicChordsContaining, harmonize } from '../../theory/harmony';
import { degreeToString } from '../../theory/interval';
import { Midi, toPc } from '../../theory/pitch';
import { scale, scaleNotes } from '../../theory/scale';
import { Note, noteName, notePc, parseNote } from '../../theory/spelling';
import { MAJOR_TONICS, MINOR_TONICS, assertFocus } from '../common';
import { ExerciseFamily } from '../types';

export type KeyMode = 'major' | 'naturalMinor';

/** A chord chip the learner can tap: one diatonic chord of the key. */
export interface ChordChoice {
  id: string;
  /** 1-based scale degree the chord is built on. */
  degree: number;
  roman: string;
  root: Note;
  typeId: string;
  symbol: string;
}

/** "In A minor the melody plays C – which chords fit?" Answer: all diatonic triads containing it. */
export interface MelodyChordParams {
  tonic: Note;
  mode: KeyMode;
  note: Note;
  /** 1-based scale degree of the melody note. */
  scaleDegree: number;
  /** A playable pitch for that note (for audio later). */
  midi: Midi;
  choices: ChordChoice[];
}

export interface MelodyChordSolution {
  /** Each fitting chord with the melody note's function in it ('1', 'b3', '5'…). */
  chords: { id: string; symbol: string; roman: string; fn: string }[];
}

export interface MelodyChordFocus {
  mode?: KeyMode;
  tonic?: string;
  scaleDegree?: number;
}

const chipId = (degree: number): string => `deg:${degree}`;

export const melodyChord: ExerciseFamily<MelodyChordParams, MelodyChordSolution, MelodyChordFocus> = {
  id: 'melody-chord',
  name: 'Melody note → chord',
  modes: ['tap', 'play'],

  generate(rng, ctx, focus = {}) {
    const mode = focus.mode ?? rng.pick<KeyMode>(['major', 'naturalMinor']);
    const tonic = parseNote(focus.tonic ?? rng.pick(mode === 'major' ? MAJOR_TONICS : MINOR_TONICS));
    const key = scale(tonic, mode);
    const notes = scaleNotes(key);
    assertFocus(focus.scaleDegree === undefined || (focus.scaleDegree >= 1 && focus.scaleDegree <= notes.length), 'melody-chord', `degree ${focus.scaleDegree}`);
    const scaleDegree = focus.scaleDegree ?? rng.int(1, notes.length);
    const note = notes[scaleDegree - 1];
    const pc = notePc(note);

    const { tuning, range } = ctx;
    const lo = Math.min(...tuning.strings) + range.minFret;
    const hi = Math.max(...tuning.strings) + range.maxFret;
    const candidates: Midi[] = [];
    for (let m = lo; m <= hi; m++) if (toPc(m) === pc) candidates.push(m);
    const midi = rng.pick(candidates);

    const choices: ChordChoice[] = harmonize(key, 3).map((dc) => ({
      id: chipId(dc.degree),
      degree: dc.degree,
      roman: dc.roman,
      root: dc.chord.root,
      typeId: dc.chord.type.id,
      symbol: chordSymbol(dc.chord),
    }));
    const chords = diatonicChordsContaining(key, pc, 3).map(({ chord: dc, fn }) => ({
      id: chipId(dc.degree),
      symbol: chordSymbol(dc.chord),
      roman: dc.roman,
      fn: degreeToString(fn),
    }));
    return {
      params: { tonic, mode, note, scaleDegree, midi, choices },
      solution: { chords },
      skills: [`melody:${mode === 'major' ? 'major' : 'minor'}/deg:${scaleDegree}`],
    };
  },

  // Recomputes fitting chords from the chips' own chord tones, not from the stored solution.
  check(ex, r) {
    if (r.kind !== 'choices') return { correct: false };
    const pc = notePc(ex.params.note);
    const right = new Set(ex.params.choices.filter((c) => chordContains(chord(c.root, c.typeId), pc)).map((c) => c.id));
    const known = new Set(ex.params.choices.map((c) => c.id));
    const given = [...new Set(r.ids)];
    const hits = given.filter((id) => right.has(id)).length;
    const wrong = given.filter((id) => !right.has(id) || !known.has(id)).length;
    const missed = right.size - hits;
    return { correct: hits > 0 && wrong === 0 && missed === 0, hits, wrong, missed };
  },

  solve: (ex) => ({ kind: 'choices', ids: ex.solution.chords.map((c) => c.id) }),

  describe: (ex) => {
    const { tonic, mode, note } = ex.params;
    const fits = ex.solution.chords.map((c) => `${c.symbol}(${c.fn})`).join(' ');
    return `${noteName(note)} in ${noteName(tonic)} ${mode === 'major' ? 'major' : 'minor'} → ${fits}`;
  },
};
