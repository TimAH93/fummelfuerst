import { FretPos } from '../../guitar/fretboard';
import { chord, chordPcs, chordSymbol, chordToneNames } from '../../theory/chord';
import { Midi, toPc } from '../../theory/pitch';
import { Note } from '../../theory/spelling';
import { INVERSION_NAMES, adjacentStringSets, findVoicings, tab } from '../../voicing/voicing';
import { assertFocus, pickChordRoot, stringNo } from '../common';
import { ExerciseFamily } from '../types';
import { TRIAD_TYPES, TriadType } from './triadBuild';

/**
 * "Build F major, 1st inversion, on the keys" – checked note by note over MIDI.
 * The reveal bridges to the guitar: the same chord, same inversion, on three adjacent strings.
 */
export interface KeysChordParams {
  root: Note;
  typeId: TriadType;
  inversion: number;
}

export interface KeysChordSolution {
  /** Close voicing around middle C, bass first. */
  notes: Midi[];
  tones: string[];
  /** The same chord and inversion on the guitar, lowest shape on the highest playable string set. */
  guitar: { strings: number[]; tab: string; positions: FretPos[] } | null;
}

export interface KeysChordFocus {
  typeId?: TriadType;
  inversion?: number;
  pc?: number;
}

/** Bass between A3 and G#4 keeps every voicing inside a 37-key board's middle. */
const BASS_LOW = 57;

const MAX_TRIES = 100;

export const keysChord: ExerciseFamily<KeysChordParams, KeysChordSolution, KeysChordFocus> = {
  id: 'keys-chord',
  name: 'Chord on the keys',
  modes: ['tap'],
  tempo: { fastMs: 3000, slowMs: 12000 },

  generate(rng, ctx, focus = {}) {
    assertFocus(focus.inversion === undefined || [0, 1, 2].includes(focus.inversion), 'keys-chord', `inversion ${focus.inversion}`);
    for (let i = 0; i < MAX_TRIES; i++) {
      const typeId = focus.typeId ?? rng.pick(TRIAD_TYPES);
      const inversion = focus.inversion ?? rng.int(0, 2);
      const root = pickChordRoot(rng, focus.pc ?? rng.int(0, 11), typeId);
      const c = chord(root, typeId);
      if (chordToneNames(c).some((n) => /##|bb/.test(n))) continue;

      // Stack upward from the bass: each chord tone in inversion order, the next one above.
      const pcs = chordPcs(c);
      const order = [0, 1, 2].map((k) => (inversion + k) % 3);
      const notes: Midi[] = [];
      for (const k of order) {
        const prev = notes.length ? notes[notes.length - 1] : BASS_LOW - 1;
        let m = prev + 1;
        while (toPc(m) !== pcs[k]) m++;
        notes.push(m);
      }

      const { tuning, range, maxSpan } = ctx;
      const sets = adjacentStringSets(tuning, 3).reverse(); // top strings first
      let guitar: KeysChordSolution['guitar'] = null;
      for (const strings of sets) {
        const v = findVoicings(tuning, c, { minFret: range.minFret, maxFret: range.maxFret, maxSpan, strings, noDoubling: true, inversion, shape: true })[0];
        if (v) {
          guitar = { strings, tab: tab(v.frets), positions: v.notes.map((n) => n.pos) };
          break;
        }
      }
      return {
        params: { root, typeId, inversion },
        solution: { notes, tones: order.map((k) => chordToneNames(c)[k]), guitar },
        skills: [`keys:${typeId}/inv:${inversion}`],
      };
    }
    throw new Error(`keys-chord: nothing spellable for focus ${JSON.stringify(focus)}`);
  },

  skillSpace: () =>
    TRIAD_TYPES.flatMap((typeId) => [0, 1, 2].map((inversion) => ({ skill: `keys:${typeId}/inv:${inversion}`, focus: { typeId, inversion } }))),

  // Pianists double notes, so doublings are fine: the pitch-class set must match and the bass must be right.
  check(ex, r) {
    if (r.kind !== 'notes') return { correct: false };
    const pcs = chordPcs(chord(ex.params.root, ex.params.typeId));
    const played = [...new Set(r.midis.map(toPc))];
    const hits = played.filter((p) => pcs.includes(p)).length;
    const wrong = played.length - hits;
    const missed = pcs.length - hits;
    const bassOk = r.midis.length > 0 && toPc(Math.min(...r.midis)) === pcs[ex.params.inversion];
    return { correct: wrong === 0 && missed === 0 && bassOk, hits, wrong, missed };
  },

  solve: (ex) => ({ kind: 'notes', midis: ex.solution.notes }),

  describe: (ex) => {
    const c = chord(ex.params.root, ex.params.typeId);
    const g = ex.solution.guitar;
    return `${chordSymbol(c)} ${INVERSION_NAMES[ex.params.inversion]} on keys: ${ex.solution.tones.join(' ')}` +
      (g ? ` → guitar ${g.tab} (strings ${g.strings.map((s) => stringNo(ex.context.tuning, s)).join('-')})` : '');
  },
};
