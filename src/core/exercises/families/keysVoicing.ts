import { FretPos } from '../../guitar/fretboard';
import { SIMPLER_TYPE, chord, chordPcs, chordSymbol, chordToneNames, chordType, functionInChord } from '../../theory/chord';
import { Degree, degreeSemitones, degreeToString, intervalInfo, parseFormula } from '../../theory/interval';
import { Midi, PitchClass, toPc } from '../../theory/pitch';
import { Note } from '../../theory/spelling';
import { findVoicings, tab } from '../../voicing/voicing';
import { assertFocus, pickChordRoot } from '../common';
import { Diagnosis, ExerciseFamily } from '../types';

/**
 * Neo-soul / jazz voicing on the keys: left hand plays the root, right hand the colour
 * without the root. What makes the chord is its guide tones (3rd, 7th) and its colour
 * (9, #9, 13, an altered 5th); the plain fifth may be left out, as players do.
 */
export const VOICING_TYPES = ['maj7', 'm7', 'dom7', 'm7b5', 'maj9', 'm9', 'dom9', 'dom13', 'dom7s9'] as const;
export type VoicingType = (typeof VOICING_TYPES)[number];

/** Right-hand voicing, bottom to top, as degree tokens – the sound players reach for. */
export const RIGHT_HAND: Record<VoicingType, string> = {
  maj7: '3 5 7',
  m7: 'b3 5 b7',
  dom7: '3 5 b7',
  m7b5: 'b3 b5 b7',
  maj9: '3 5 7 9',
  m9: 'b3 5 b7 9',
  dom9: '3 5 b7 9',
  dom13: 'b7 9 3 13',
  dom7s9: '3 b7 #9',
};

export interface KeysVoicingParams {
  root: Note;
  typeId: VoicingType;
}

export interface KeysVoicingSolution {
  /** Bass first, then the right hand. */
  notes: Midi[];
  /** Right-hand tones with their function, e.g. ['Ab:b3', 'Eb:b7', 'G:9']. */
  rightHand: string[];
  /** Tones that must be in the right hand (guide tones + colour). */
  required: string[];
  guitar: { tab: string; positions: FretPos[] } | null;
}

export interface KeysVoicingFocus {
  typeId?: VoicingType;
  pc?: number;
}

/** Guide tones (3rd, 7th), every extension and any altered fifth are essential; root and plain 5th are not. */
export const isEssential = (d: Degree): boolean =>
  d.number === 3 || d.number === 7 || d.number >= 9 || (d.number === 5 && d.acc !== 0);

/** The guide tones among the essentials: what makes a chord major, minor or dominant at all. */
const isGuide = (d: Degree): boolean => d.number === 3 || d.number === 7;

/**
 * What a voicing of `typeId` over `rootPc` must show: the lowest note is the root and every
 * essential degree sounds above it. Foreign tones are not judged here (check() counts them);
 * octaves and doublings are free. Shared by check(), the diagnosis and the play mapping.
 */
export function voicingComplete(rootPc: PitchClass, typeId: string, midis: Midi[]): boolean {
  if (midis.length === 0) return false;
  const bass = Math.min(...midis);
  if (toPc(bass) !== toPc(rootPc)) return false;
  const above = new Set(midis.filter((m) => m > bass).map(toPc));
  return chordType(typeId).formula.filter(isEssential).every((d) => above.has(toPc(rootPc + degreeSemitones(d))));
}

const other = (): Diagnosis => ({ kind: 'other', credit: 0 });

// Inside the 37 keys of an FLkey at its default octave (C3–C6): bass C3–B3, right hand from C4.
/**
 * How awkward a jazz guitar shape is. A muted string right above the bass is the classic
 * jazz grip (5x665x) and free; any other muted string inside the shape is hard to keep quiet.
 * Then prefer four strings and low positions.
 */
export function shapeCost(frets: (number | null)[]): number {
  const played = frets.map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0);
  const first = played[0];
  const last = played[played.length - 1];
  let innerMutes = 0;
  for (let i = first + 1; i < last; i++) if (frets[i] === null && i !== first + 1) innerMutes++;
  const lowest = Math.min(...played.map((i) => frets[i] as number));
  return innerMutes * 10 + Math.abs(played.length - 4) + lowest * 0.1;
}

const BASS_LOW = 48;
const RIGHT_LOW = 60;
const MAX_TRIES = 50;

export const keysVoicing: ExerciseFamily<KeysVoicingParams, KeysVoicingSolution, KeysVoicingFocus> = {
  id: 'keys-voicing',
  name: 'Neo-soul voicing',
  modes: ['tap'],
  tempo: { fastMs: 4000, slowMs: 15000 },

  generate(rng, ctx, focus = {}) {
    assertFocus(focus.typeId === undefined || VOICING_TYPES.includes(focus.typeId), 'keys-voicing', `type ${focus.typeId}`);
    for (let i = 0; i < MAX_TRIES; i++) {
      const typeId = focus.typeId ?? rng.pick(VOICING_TYPES);
      const root = pickChordRoot(rng, focus.pc ?? rng.int(0, 11), typeId, true);
      const c = chord(root, typeId);
      const names = chordToneNames(c);
      // Double accidentals only where theory demands them on an extension (E7#9 has F##).
      if (names.some((n, k) => /##|bb/.test(n) && c.type.formula[k].number < 9)) continue;

      const rootPc = chordPcs(c)[0];
      let bass = BASS_LOW;
      while (toPc(bass) !== rootPc) bass++;
      const rh: Midi[] = [];
      const labels: string[] = [];
      for (const d of parseFormula(RIGHT_HAND[typeId])) {
        const pc = toPc(rootPc + degreeSemitones(d));
        let m = rh.length ? rh[rh.length - 1] + 1 : RIGHT_LOW;
        while (toPc(m) !== pc) m++;
        rh.push(m);
        const idx = c.type.formula.findIndex((f) => degreeToString(f) === degreeToString(d));
        labels.push(`${names[idx]}:${degreeToString(d)}`);
      }

      const required = c.type.formula.filter(isEssential);
      const optional = c.type.formula.filter((d) => !isEssential(d) && d.number !== 1).map((d) => toPc(rootPc + degreeSemitones(d)));
      // Guitar: a movable shape with the root in the bass on string 6 or 5, fifth optional.
      const shapes = findVoicings(ctx.tuning, c, {
        minFret: Math.max(1, ctx.range.minFret), maxFret: ctx.range.maxFret, maxSpan: ctx.maxSpan,
        inversion: 0, minStrings: 4, innerMutes: true, noDoubling: true,
        optional: c.type.formula.length > 4 ? optional : [],
      }).filter((v) => v.notes[0].pos.string <= 1);
      const best = [...shapes].sort((a, b) => shapeCost(a.frets) - shapeCost(b.frets))[0];
      return {
        params: { root, typeId },
        solution: {
          notes: [bass, ...rh],
          rightHand: labels,
          required: required.map((d) => `${names[c.type.formula.indexOf(d)]}:${degreeToString(d)}`),
          guitar: best ? { tab: tab(best.frets), positions: best.notes.map((n) => n.pos) } : null,
        },
        skills: [`voicing:${typeId}`],
      };
    }
    throw new Error(`keys-voicing: nothing spellable for focus ${JSON.stringify(focus)}`);
  },

  skillSpace: () => VOICING_TYPES.map((typeId) => ({ skill: `voicing:${typeId}`, focus: { typeId } })),

  // Lowest note = root; everything above must be a chord tone and must contain every essential tone.
  check(ex, r) {
    if (r.kind !== 'notes' || r.midis.length < 3) return { correct: false };
    const c = chord(ex.params.root, ex.params.typeId);
    const pcs = chordPcs(c);
    const sorted = [...r.midis].sort((a, b) => a - b);
    const above = new Set(sorted.slice(1).map(toPc));
    const required = c.type.formula.filter(isEssential).map((d) => toPc(pcs[0] + degreeSemitones(d)));
    const wrong = [...above].filter((p) => !pcs.includes(p)).length;
    const hits = required.filter((p) => above.has(p)).length;
    const missed = required.length - hits;
    return { correct: voicingComplete(pcs[0], ex.params.typeId, r.midis) && wrong === 0, hits, wrong, missed };
  },

  solve: (ex) => ({ kind: 'notes', midis: ex.solution.notes }),

  // ── Diagnosis ──

  /**
   * In order of what breaks the chord most: another tone in the bass, a guide tone missing,
   * the colour missing (the simpler type is credited as an aside when its voicing is complete
   * and nothing foreign sounds), a foreign tone above the bass. Degrees are over the root.
   */
  diagnose(ex, r) {
    if (r.kind !== 'notes') return other();
    if (r.midis.length < 3) return { kind: 'incomplete', credit: 0 };
    const { root, typeId } = ex.params;
    const c = chord(root, typeId);
    const pcs = chordPcs(c);
    const rootPc = pcs[0];
    const degreeOf = (pc: PitchClass): string => {
      const fn = functionInChord(c, pc);
      return fn ? degreeToString(fn) : intervalInfo(toPc(pc - rootPc)).degree;
    };
    const sorted = [...r.midis].sort((a, b) => a - b);
    const bassPc = toPc(sorted[0]);
    if (bassPc !== rootPc) return { kind: 'bass', credit: 0.5, detail: { degree: degreeOf(bassPc) } };
    const above = new Set(sorted.slice(1).map(toPc));
    const has = (d: Degree): boolean => above.has(toPc(rootPc + degreeSemitones(d)));
    const missingGuide = c.type.formula.filter(isGuide).find((d) => !has(d));
    if (missingGuide) return { kind: 'missing-guide', credit: 0, detail: { degree: degreeToString(missingGuide) } };
    const foreign = [...above].filter((p) => !pcs.includes(p));
    const missingColour = c.type.formula.filter((d) => isEssential(d) && !isGuide(d)).find((d) => !has(d));
    if (missingColour) {
      const simpler = SIMPLER_TYPE[typeId];
      const demonstrated = simpler !== undefined && (VOICING_TYPES as readonly string[]).includes(simpler)
        && foreign.length === 0 && voicingComplete(rootPc, simpler, r.midis);
      const aside = demonstrated ? `voicing:${simpler}` : undefined;
      return { kind: 'missing-colour', credit: 0.5, ...(aside ? { aside } : {}), nudge: aside ? [aside] : [], detail: { degree: degreeToString(missingColour) } };
    }
    if (foreign.length > 0) return { kind: 'wrong-tone', credit: 0.25, detail: { degree: degreeOf(foreign[0]) } };
    return other();
  },

  describe: (ex) => {
    const c = chord(ex.params.root, ex.params.typeId);
    const g = ex.solution.guitar;
    return `${chordSymbol(c)}: bass ${chordToneNames(c)[0]} | RH ${ex.solution.rightHand.join(' ')}` + (g ? ` → guitar ${g.tab}` : '');
  },
};

// The chord-type table is the source of truth for formulas; keep the voicing table in step with it.
for (const t of VOICING_TYPES) chordType(t);
