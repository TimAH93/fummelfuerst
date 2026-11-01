import { listFamilies } from '../exercises';
import { ExerciseContext } from '../exercises/types';
import { crossesIrregularPair, stringGap } from '../guitar/fretboard';
import { Tuning } from '../guitar/tuning';
import { SIMPLER_TYPE } from '../theory/chord';
import { ParsedSkill, parseSkillId } from './skillId';

/*
 * Transfer relations between leaf skills: which other skills an answer says something about,
 * and how much. Edges are computed from the parsed ids and the tuning (the same two positions
 * read up or down, the same hand shape on another string pair, the same pitch class on another
 * string, the same triad grip on a string set with the same gaps …) and only ever point at
 * ids that exist in the catalog of the context. The strengths in TRANSFER_S are calibration
 * constants: a prior built from them never gates passing, it only orders the ladder.
 */

export type RelationKind = 'mirror' | 'same-shape' | 'octave-string' | 'same-pc' | 'fret-neighbour' | 'degree-neighbour'
  | 'same-gaps' | 'inversion-sibling' | 'keys-guitar' | 'simpler-voicing' | 'relative-key';

export interface Edge {
  /** Target skill id (always a catalog id). */
  to: string;
  kind: RelationKind;
  /** Fraction of an answer that carries over, 0..1. */
  s: number;
}

// ── Strengths ──

/** Fraction of an answer that carries over, per relation kind (the shape of TRANSFER_S, so the harness can sweep it). */
export interface TransferStrengths {
  mirror: number;
  'same-shape': number;
  'octave-string': number;
  /** Same pitch class on another string, by string distance 1 / 2 / 3 / 4+ (distance 2 is the octave shape). */
  samePc: readonly number[];
  /** Multiplier on same-pc when the two strings straddle the G/B pair. */
  samePcAcrossGB: number;
  'fret-neighbour': number;
  'degree-neighbour': number;
  'same-gaps': number;
  'inversion-sibling': number;
  'keys-guitar': number;
  /** Richer voicing → its simpler colour, and simpler → richer. */
  simplerVoicing: { readonly down: number; readonly up: number };
  'relative-key': number;
}

/**
 * Fraction of an answer that carries over per relation kind; `samePc` by string distance 1..4+, `simplerVoicing` by direction.
 * Checked by `npm run calibrate` (tests/sim/calibrate.ts, WP9 run of 2026-11-01): no strength moved. mirror, same-shape,
 * fret-neighbour and degree-neighbour are a local optimum of their grids (J flat or worse), octave-string and samePc leave J
 * flat; the triad, keys, voicing and melody kinds are not identifiable from the calibration personas (fretboard and
 * intervals only) and keep the spec values. A prior never gates passing, so a wrong strength only reorders the ladder.
 */
export const TRANSFER_S: Readonly<TransferStrengths> = {
  mirror: 0.8,
  'same-shape': 0.6,
  'octave-string': 0.8,
  samePc: [0.3, 0.45, 0.2, 0.2],
  samePcAcrossGB: 0.7,
  'fret-neighbour': 0.3,
  'degree-neighbour': 0.2,
  'same-gaps': 0.6,
  'inversion-sibling': 0.3,
  'keys-guitar': 0.3,
  simplerVoicing: { down: 0.7, up: 0.4 },
  'relative-key': 0.5,
};

// ── Geometry helpers ──

/** Internal string index (0 = lowest) of a guitarist's string number. */
const internal = (t: Tuning, no: number): number => t.strings.length - no;

/** Fret offset of an interval shape: where the target lands relative to the start fret. */
const fretOffset = (t: Tuning, p: Extract<ParsedSkill, { family: 'interval' }>): number =>
  (p.dir === 'up' ? p.semitones : -p.semitones) - (t.strings[internal(t, p.to)] - t.strings[internal(t, p.from)]);

/** `stringGap` sequence across a (adjacent) triad set, lowest string first: '5,5' for 6-5-4 and 5-4-3. */
function gapSequence(t: Tuning, strings: number[]): string {
  const idx = strings.map((no) => internal(t, no));
  const lo = Math.min(...idx), hi = Math.max(...idx);
  return Array.from({ length: hi - lo }, (_, k) => stringGap(t, lo + k)).join(',');
}

/** Scale degree of the relative minor that names the same pitch: major 6 → minor 1, major 1 → minor 3. */
export const relativeMinorDegree = (majorDeg: number): number => ((majorDeg + 1) % 7) + 1;

/** A parsed id that remembers its original string, so edges never re-format. */
type Known = ParsedSkill & { id: string };

/** String numbers a parsed id mentions, guitarist's numbering. */
const stringsOf = (p: ParsedSkill): number[] =>
  p.family === 'note' ? [p.string] : p.family === 'interval' ? [p.from, p.to] : p.family === 'triad' ? p.strings : [];

/** A leaf id whose strings exist in the tuning; anything else has no geometry here. */
const parseKnown = (id: string, t: Tuning): Known | null => {
  const p = parseSkillId(id);
  return p && stringsOf(p).every((no) => no >= 1 && no <= t.strings.length) ? { ...p, id } : null;
};

// ── One pair ──

/** The relation from `a` to `b`, or null. At most one kind applies to a pair. */
function relation(a: Known, b: Known, t: Tuning, S: Readonly<TransferStrengths>): Edge | null {
  const edge = (kind: RelationKind, s: number): Edge => ({ to: b.id, kind, s });
  if (a.family === 'note' && b.family === 'note') {
    if (a.pc === b.pc && a.string !== b.string) {
      const ia = internal(t, a.string), ib = internal(t, b.string);
      if ((t.strings[ia] - t.strings[ib]) % 12 === 0) return edge('octave-string', S['octave-string']);
      const d = Math.abs(a.string - b.string);
      const base = S.samePc[Math.min(d, S.samePc.length) - 1];
      return edge('same-pc', crossesIrregularPair(t, ia, ib) ? base * S.samePcAcrossGB : base);
    }
    const step = (a.pc - b.pc + 12) % 12;
    if (a.string === b.string && (step === 1 || step === 11)) return edge('fret-neighbour', S['fret-neighbour']);
    return null;
  }
  if (a.family === 'interval' && b.family === 'interval') {
    if (a.semitones === b.semitones && a.dir !== b.dir && a.from === b.to && a.to === b.from) return edge('mirror', S.mirror);
    if (a.semitones === b.semitones && a.dir === b.dir) {
      if (a.from === b.from && a.to === b.to) return null;
      if (b.to - b.from === a.to - a.from && fretOffset(t, a) === fretOffset(t, b)) return edge('same-shape', S['same-shape']);
      return null;
    }
    if (a.dir === b.dir && a.from === b.from && a.to === b.to && Math.abs(a.semitones - b.semitones) === 1)
      return edge('degree-neighbour', S['degree-neighbour']);
    return null;
  }
  if (a.family === 'triad' && b.family === 'triad') {
    if (a.type !== b.type) return null;
    const sameSet = a.strings.join('-') === b.strings.join('-');
    if (a.inv === b.inv && !sameSet && gapSequence(t, a.strings) === gapSequence(t, b.strings)) return edge('same-gaps', S['same-gaps']);
    if (a.inv !== b.inv && sameSet) return edge('inversion-sibling', S['inversion-sibling']);
    return null;
  }
  if (a.family === 'keys' && b.family === 'keys') {
    return a.type === b.type && a.inv !== b.inv ? edge('inversion-sibling', S['inversion-sibling']) : null;
  }
  if ((a.family === 'keys' && b.family === 'triad') || (a.family === 'triad' && b.family === 'keys')) {
    return a.type === b.type && a.inv === b.inv ? edge('keys-guitar', S['keys-guitar']) : null;
  }
  if (a.family === 'voicing' && b.family === 'voicing') {
    if (SIMPLER_TYPE[a.type] === b.type) return edge('simpler-voicing', S.simplerVoicing.down);
    if (SIMPLER_TYPE[b.type] === a.type) return edge('simpler-voicing', S.simplerVoicing.up);
    return null;
  }
  if (a.family === 'melody' && b.family === 'melody') {
    if (a.mode === b.mode) return null;
    const [major, minor] = a.mode === 'major' ? [a, b] : [b, a];
    return relativeMinorDegree(major.deg) === minor.deg ? edge('relative-key', S['relative-key']) : null;
  }
  return null;
}

// ── Catalog and memo ──

/** Everything about a context that changes the catalog or the geometry. */
const ctxKey = (ctx: ExerciseContext): string =>
  `${ctx.tuning.id}|${ctx.range.minFret}-${ctx.range.maxFret}|${(ctx.range.strings ?? []).join(',')}|${ctx.maxSpan}`;

const catalogCache = new Map<string, Map<string, Known>>();
const edgeCache = new Map<string, Edge[]>();

/** Every leaf skill the families produce for this context, parsed once, by id. */
function catalogOf(ctx: ExerciseContext): Map<string, Known> {
  const key = ctxKey(ctx);
  let known = catalogCache.get(key);
  if (!known) {
    known = new Map();
    for (const f of listFamilies()) for (const s of f.skillSpace(ctx)) {
      const p = parseKnown(s.skill, ctx.tuning);
      if (p) known.set(p.id, p);
    }
    catalogCache.set(key, known);
  }
  return known;
}

const edgesAmong = (from: Known, candidates: Known[], t: Tuning, S: Readonly<TransferStrengths> = TRANSFER_S): Edge[] =>
  candidates.map((c) => (c.id === from.id ? null : relation(from, c, t, S))).filter((e): e is Edge => e !== null);

/**
 * Edges from one catalog skill into the catalog of the context; a skill outside the catalog
 * has none. Memoised per (skill, tuning.id) – the key also carries the range and span, which
 * decide which ids exist. `cfg` is accepted for call-site compatibility; strengths come from
 * TRANSFER_S (buildEdges takes another table for the calibration sweep).
 */
export function relatedSkills(skill: string, ctx: ExerciseContext, _cfg?: unknown): Edge[] {
  const key = `${ctxKey(ctx)}|${skill}`;
  const hit = edgeCache.get(key);
  if (hit) return hit;
  const catalog = catalogOf(ctx);
  const from = catalog.get(skill);
  const edges = from ? edgesAmong(from, [...catalog.values()], ctx.tuning) : [];
  edgeCache.set(key, edges);
  return edges;
}

/**
 * Edges among the given skills only: every target is one of `skills`. Ids that are no leaf here get no edges.
 * `strengths` defaults to TRANSFER_S; the calibration harness passes a swept table instead.
 */
export function buildEdges(skills: string[], ctx: ExerciseContext, strengths: Readonly<TransferStrengths> = TRANSFER_S): Record<string, Edge[]> {
  const known = skills.map((id) => parseKnown(id, ctx.tuning)).filter((p): p is Known => p !== null);
  const out: Record<string, Edge[]> = {};
  for (const id of skills) out[id] = [];
  for (const from of known) out[from.id] = edgesAmong(from, known, ctx.tuning, strengths);
  return out;
}
