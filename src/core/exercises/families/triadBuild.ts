import { FretPos, fretSpan, pcAt, pitchAt } from '../../guitar/fretboard';
import { Chord, chord, chordPcs, chordSymbol, chordToneNames } from '../../theory/chord';
import { toPc } from '../../theory/pitch';
import { Note, noteName } from '../../theory/spelling';
import { INVERSION_NAMES, adjacentStringSets, findVoicings, tab } from '../../voicing/voicing';
import { assertFocus, drillSpellings, stringNo } from '../common';
import { ExerciseFamily } from '../types';

export const TRIAD_TYPES = ['maj', 'min', 'dim', 'aug'] as const;
export type TriadType = (typeof TRIAD_TYPES)[number];

/** "F major, 1st inversion, on strings 4-3-2." One note per string, no doubling. */
export interface TriadBuildParams {
  root: Note;
  typeId: TriadType;
  /** 0 root position, 1 first, 2 second inversion. */
  inversion: number;
  /** Three adjacent internal string indices, low → high. */
  strings: number[];
}

export interface TriadBuildSolution {
  /** Every matching shape in range, lowest first (often the same shape an octave apart). */
  shapes: { tab: string; positions: FretPos[]; tones: string[] }[];
}

export interface TriadBuildFocus {
  typeId?: TriadType;
  inversion?: number;
  /** Lowest string of the set (internal index). */
  lowString?: number;
  pc?: number;
}

const MAX_TRIES = 200;

export const triadBuild: ExerciseFamily<TriadBuildParams, TriadBuildSolution, TriadBuildFocus> = {
  id: 'triad-build',
  name: 'Build the triad',
  modes: ['play', 'tap'],
  tempo: { fastMs: 4000, slowMs: 15000 },

  generate(rng, ctx, focus = {}) {
    const { tuning, range, maxSpan } = ctx;
    const sets = adjacentStringSets(tuning, 3).filter((set) => !range.strings || set.every((s) => range.strings!.includes(s)));
    assertFocus(focus.inversion === undefined || [0, 1, 2].includes(focus.inversion), 'triad-build', `inversion ${focus.inversion}`);
    assertFocus(focus.lowString === undefined || sets.some((s) => s[0] === focus.lowString), 'triad-build', `string set from ${focus.lowString}`);

    for (let i = 0; i < MAX_TRIES; i++) {
      const typeId = focus.typeId ?? rng.pick(TRIAD_TYPES);
      const inversion = focus.inversion ?? rng.int(0, 2);
      const strings = focus.lowString !== undefined ? sets.find((s) => s[0] === focus.lowString)! : rng.pick(sets);
      const root = rng.pick(drillSpellings(focus.pc ?? rng.int(0, 11)));
      const c = chord(root, typeId);
      // Skip spellings that need double accidentals (D#aug would need F## and A##; Eb aug is used instead).
      if (chordToneNames(c).some((n) => /##|bb/.test(n))) continue;
      const voicings = findVoicings(tuning, c, {
        minFret: range.minFret, maxFret: range.maxFret, maxSpan, strings, noDoubling: true, inversion,
      });
      if (voicings.length === 0) continue;
      return {
        params: { root, typeId, inversion, strings },
        solution: {
          shapes: voicings.map((v) => ({
            tab: tab(v.frets),
            positions: v.notes.map((n) => n.pos),
            tones: v.notes.map((n) => noteName(n.note)),
          })),
        },
        skills: [`triad:${typeId}/inv:${inversion}/strings:${strings.map((s) => stringNo(tuning, s)).join('-')}`],
      };
    }
    throw new Error(`triad-build: nothing playable for focus ${JSON.stringify(focus)}`);
  },

  skillSpace({ tuning, range, maxSpan }) {
    const sets = adjacentStringSets(tuning, 3).filter((set) => !range.strings || set.every((s) => range.strings!.includes(s)));
    const out: { skill: string; focus: TriadBuildFocus }[] = [];
    for (const typeId of TRIAD_TYPES)
      for (const inversion of [0, 1, 2])
        for (const strings of sets) {
          const feasible = Array.from({ length: 12 }, (_, pc) => pc).some((pc) =>
            drillSpellings(pc).some((root) => {
              const c = chord(root, typeId);
              if (chordToneNames(c).some((n) => /##|bb/.test(n))) return false;
              return findVoicings(tuning, c, { minFret: range.minFret, maxFret: range.maxFret, maxSpan, strings, noDoubling: true, inversion }).length > 0;
            }),
          );
          if (feasible) out.push({
            skill: `triad:${typeId}/inv:${inversion}/strings:${strings.map((s) => stringNo(tuning, s)).join('-')}`,
            focus: { typeId, inversion, lowString: strings[0] },
          });
        }
    return out;
  },

  // Independent of the voicing search: checks the three notes directly.
  check(ex, r) {
    if (r.kind !== 'positions') return { correct: false };
    const { tuning, range, maxSpan } = ex.context;
    const { strings, inversion } = ex.params;
    const c: Chord = chord(ex.params.root, ex.params.typeId);
    const pcs = chordPcs(c);
    const given = r.positions;
    const inRange = given.every((p) => p.fret >= range.minFret && p.fret <= range.maxFret);
    const onSet = given.length === 3 && strings.every((s) => given.filter((p) => p.string === s).length === 1);
    const played = new Set(given.map((p) => pcAt(tuning, p)));
    const allTones = played.size === 3 && pcs.every((pc) => played.has(pc));
    const bass = given.length ? given.reduce((a, b) => (pitchAt(tuning, b) < pitchAt(tuning, a) ? b : a)) : null;
    const bassOk = bass !== null && toPc(pitchAt(tuning, bass)) === pcs[inversion];
    const spanOk = fretSpan(given.map((p) => p.fret)) <= maxSpan;
    const correct = inRange && onSet && allTones && bassOk && spanOk;
    const hits = given.filter((p) => pcs.includes(pcAt(tuning, p))).length;
    return { correct, hits, wrong: given.length - hits, missed: Math.max(0, 3 - hits) };
  },

  solve: (ex) => ({ kind: 'positions', positions: ex.solution.shapes[0].positions }),

  describe: (ex) => {
    const { root, typeId, inversion, strings } = ex.params;
    const c = chord(root, typeId);
    return `${chordSymbol(c)} ${INVERSION_NAMES[inversion]} on strings ${strings.map((s) => stringNo(ex.context.tuning, s)).join('-')}` +
      ` → ${ex.solution.shapes.map((s) => s.tab).join(' | ')}`;
  },
};

