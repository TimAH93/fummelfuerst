import { FretPos, pcAt, pitchAt } from '../../guitar/fretboard';
import { Chord, chord, chordPcs, chordSymbol, chordToneNames, functionInChord, identifyChordPcs } from '../../theory/chord';
import { degreeToString } from '../../theory/interval';
import { toPc } from '../../theory/pitch';
import { Note, noteName } from '../../theory/spelling';
import { INVERSION_NAMES, adjacentStringSets, findVoicings, isShape, tab } from '../../voicing/voicing';
import { assertFocus, drillSpellings, pickChordRoot, stringNo } from '../common';
import { Diagnosis, ExerciseFamily } from '../types';
import { Tuning } from '../../guitar/tuning';

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

/** String set as written in skill ids: guitarist's numbers, low string first ('4-3-2'). */
const setLabel = (tuning: Tuning, strings: number[]): string => strings.map((s) => stringNo(tuning, s)).join('-');

/** Skill id of a triad type and inversion on a string set; asides and nudges use the same template. */
const triadSkill = (typeId: string, inversion: number, set: string): string => `triad:${typeId}/inv:${inversion}/strings:${set}`;

const other = (): Diagnosis => ({ kind: 'other', credit: 0 });

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
      const root = pickChordRoot(rng, focus.pc ?? rng.int(0, 11), typeId);
      const c = chord(root, typeId);
      // Skip spellings that need double accidentals (D#aug would need F## and A##; Eb aug is used instead).
      if (chordToneNames(c).some((n) => /##|bb/.test(n))) continue;
      const voicings = findVoicings(tuning, c, {
        minFret: range.minFret, maxFret: range.maxFret, maxSpan, strings, noDoubling: true, inversion, shape: true,
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
        skills: [triadSkill(typeId, inversion, setLabel(tuning, strings))],
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
              return findVoicings(tuning, c, { minFret: range.minFret, maxFret: range.maxFret, maxSpan, strings, noDoubling: true, inversion, shape: true }).length > 0;
            }),
          );
          if (feasible) out.push({
            skill: triadSkill(typeId, inversion, setLabel(tuning, strings)),
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
    const spanOk = given.length > 0 && isShape(tuning, given, maxSpan);
    const correct = inRange && onSet && allTones && bassOk && spanOk;
    const hits = given.filter((p) => pcs.includes(pcAt(tuning, p))).length;
    return { correct, hits, wrong: given.length - hits, missed: Math.max(0, 3 - hits) };
  },

  solve: (ex) => ({ kind: 'positions', positions: ex.solution.shapes[0].positions }),

  // ── Diagnosis ──

  /**
   * With the right three tones: on other strings (wrong-set), too wide (span) or with another
   * chord tone in the bass (inversion). Otherwise another triad over the same root (wrong-type)
   * before two-of-three (missing-tone), because every other triad on the root shares two tones.
   * An aside is only given where the positions would pass that skill's own check.
   */
  diagnose(ex, r) {
    if (r.kind !== 'positions') return other();
    const given = r.positions.filter((p, i) => r.positions.findIndex((q) => q.string === p.string && q.fret === p.fret) === i);
    if (given.length < 3) return { kind: 'incomplete', credit: 0 };
    const { tuning, range, maxSpan } = ex.context;
    const { root, typeId, inversion, strings } = ex.params;
    const c = chord(root, typeId);
    const pcs = chordPcs(c);
    const set = setLabel(tuning, strings);
    const asked = triadSkill(typeId, inversion, set);
    const played = [...new Set(given.map((p) => pcAt(tuning, p)))];
    const allTones = played.length === 3 && pcs.every((pc) => played.includes(pc));
    const onSet = given.length === 3 && strings.every((s) => given.filter((p) => p.string === s).length === 1);
    const bass = given.reduce((a, b) => (pitchAt(tuning, b) < pitchAt(tuning, a) ? b : a));
    const bassPc = pcAt(tuning, bass);
    const inRange = given.every((p) => p.fret >= range.minFret && p.fret <= range.maxFret);
    const shapeOk = isShape(tuning, given, maxSpan);

    if (allTones) {
      const j = pcs.indexOf(bassPc);
      if (!onSet) {
        // The inversion actually built on three adjacent strings of the drill range is a catalog skill.
        const playedStrings = given.map((p) => p.string).sort((x, y) => x - y);
        const adjacent = given.length === 3 && playedStrings[1] === playedStrings[0] + 1 && playedStrings[2] === playedStrings[1] + 1;
        const inDrill = !range.strings || playedStrings.every((s) => range.strings!.includes(s));
        const aside = adjacent && inDrill && inRange && shapeOk ? triadSkill(typeId, j, setLabel(tuning, playedStrings)) : undefined;
        return { kind: 'wrong-set', credit: 0.5, ...(aside ? { aside } : {}) };
      }
      if (j === inversion) return shapeOk ? other() : { kind: 'span', credit: 0.5 };
      // Only a playable grip inside the range would pass the other inversion's own check.
      const aside = inRange && shapeOk ? triadSkill(typeId, j, set) : undefined;
      return { kind: 'inversion', credit: 0.5, ...(aside ? { aside } : {}), nudge: aside ? [asked, aside] : [asked], detail: { inversion: j, note: chordToneNames(c)[j] } };
    }

    const q = played.length === 3 ? identifyChordPcs(pcs[0], played) : undefined;
    if (q && q.id !== typeId) {
      const qc = chord(root, q.id);
      const qPcs = chordPcs(qc);
      const foreign = chordToneNames(qc).find((_, i) => !pcs.includes(qPcs[i])) ?? '';
      const isTriad = (TRIAD_TYPES as readonly string[]).includes(q.id);
      const aside = isTriad && onSet && inRange && shapeOk ? triadSkill(q.id, qPcs.indexOf(bassPc), set) : undefined;
      return { kind: 'wrong-type', credit: 0, ...(aside ? { aside } : {}), nudge: aside ? [asked, aside] : [asked], detail: { type: q.id, note: foreign } };
    }
    if (pcs.filter((pc) => played.includes(pc)).length === 2) {
      const missing = pcs.find((pc) => !played.includes(pc))!;
      return { kind: 'missing-tone', credit: 0.25, detail: { fn: degreeToString(functionInChord(c, missing)!) } };
    }
    return other();
  },

  /** "≈ Fast": the other two inversions on the same string set. */
  nearNeighbours(ex) {
    const { typeId, inversion, strings } = ex.params;
    const set = setLabel(ex.context.tuning, strings);
    return [0, 1, 2].filter((j) => j !== inversion).map((j) => triadSkill(typeId, j, set));
  },

  describe: (ex) => {
    const { root, typeId, inversion, strings } = ex.params;
    const c = chord(root, typeId);
    return `${chordSymbol(c)} ${INVERSION_NAMES[inversion]} on strings ${setLabel(ex.context.tuning, strings)}` +
      ` → ${ex.solution.shapes.map((s) => s.tab).join(' | ')}`;
  },
};

