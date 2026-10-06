import { generateExercise } from '../exercises/registry';
import { Rng } from '../exercises/rng';
import { DEFAULT_CONTEXT, ExerciseContext } from '../exercises/types';
import { CatalogEntry, NextExercise, selectSkill } from '../mastery/select';
import { LearnerState, SkillStats, helpLevelFor, mastery } from '../mastery/model';

/**
 * Practice like a fighting-game training mode: one small drill at a time, in a fixed
 * order, until it is comfortable. The app recommends exactly one next drill; the player
 * decides when to move on. Nothing is skipped – a drill you already know is simply
 * comfortable after a few minutes.
 */
export type TrackId = 'fretboard' | 'intervals' | 'triads' | 'melody';

export interface Track {
  id: TrackId;
  title: string;
  family: string;
}

export const TRACKS: readonly Track[] = [
  { id: 'fretboard', title: 'Griffbrett', family: 'note-find' },
  { id: 'intervals', title: 'Intervalle', family: 'interval-hunt' },
  { id: 'triads', title: 'Dreiklänge', family: 'triad-build' },
  { id: 'melody', title: 'Melodieton → Akkord', family: 'melody-chord' },
];

export interface Drill {
  /** Stable id, stored with progress: 'intervals/5/up/adjacent'. */
  id: string;
  track: TrackId;
  /** Shown big on the home screen. */
  title: string;
  family: string;
  skills: string[];
}

interface DrillSpec {
  id: string;
  title: string;
  match: (skill: string) => boolean;
}

// ── Fretboard: naturals first, then all twelve, one string at a time ──────────────
const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const STRING_ORDER = [6, 5, 4, 3, 2, 1];
const fretboardSpecs = (): DrillSpec[] =>
  STRING_ORDER.flatMap((n) => [
    { id: `${n}/naturals`, title: `Saite ${n}: Stammtöne`, match: (s: string) => s.endsWith(`/string:${n}`) && NATURALS.includes(s.slice(5, s.indexOf('/'))) },
    { id: `${n}/all`, title: `Saite ${n}: alle 12 Töne`, match: (s: string) => s.endsWith(`/string:${n}`) },
  ]);

// ── Intervals: most useful first; each up, then down; each in three shapes ─────────
const INTERVAL_ORDER: [string, string][] = [
  ['5', 'Quinte'], ['4', 'Quarte'], ['8', 'Oktave'], ['3', 'große Terz'], ['b3', 'kleine Terz'],
  ['b7', 'kleine Septime'], ['6', 'große Sexte'], ['2', 'große Sekunde'], ['7', 'große Septime'],
  ['b6', 'kleine Sexte'], ['b2', 'kleine Sekunde'], ['b5', 'Tritonus'],
];
export type IntervalShape = 'adjacent' | 'adjacent-gb' | 'skip';
const SHAPE_TITLE: Record<IntervalShape, string> = {
  adjacent: 'Nachbarsaite',
  'adjacent-gb': 'Nachbarsaite über G/H',
  skip: 'eine Saite übersprungen',
};

/** Shape class of a string pair (guitarist numbers): what the hand actually has to learn. */
export function intervalShape(from: number, to: number): IntervalShape | null {
  const d = Math.abs(from - to);
  if (d === 1) return Math.min(from, to) === 2 ? 'adjacent-gb' : 'adjacent';
  if (d === 2) return 'skip';
  return null; // wider jumps are not part of the path (yet)
}

const intervalSpecs = (): DrillSpec[] =>
  INTERVAL_ORDER.flatMap(([deg, name]) =>
    (['up', 'down'] as const).flatMap((dir) =>
      (['adjacent', 'adjacent-gb', 'skip'] as IntervalShape[]).map((shape) => ({
        id: `${deg}/${dir}/${shape}`,
        title: `${name} ${dir === 'up' ? 'aufwärts' : 'abwärts'} – ${SHAPE_TITLE[shape]}`,
        match: (s: string) => {
          const m = /^interval:([^/]+)\/(up|down)\/strings:(\d)-(\d)$/.exec(s);
          return !!m && m[1] === deg && m[2] === dir && intervalShape(Number(m[3]), Number(m[4])) === shape;
        },
      })),
    ),
  );

// ── Triads: top strings first (most used for comping), major/minor by inversion ──
const TRIAD_SETS = ['3-2-1', '4-3-2', '5-4-3', '6-5-4'];
const INV_TITLE = ['Grundstellung', '1. Umkehrung', '2. Umkehrung'];
const triadSpecs = (): DrillSpec[] => [
  ...TRIAD_SETS.flatMap((set) =>
    (['maj', 'min'] as const).flatMap((type) =>
      [0, 1, 2].map((inv) => ({
        id: `${set}/${type}/${inv}`,
        title: `${type === 'maj' ? 'Dur' : 'Moll'}, ${INV_TITLE[inv]} – Saiten ${set}`,
        match: (s: string) => s === `triad:${type}/inv:${inv}/strings:${set}`,
      })),
    ),
  ),
  ...TRIAD_SETS.flatMap((set) =>
    (['dim', 'aug'] as const).map((type) => ({
      id: `${set}/${type}`,
      title: `${type === 'dim' ? 'Vermindert' : 'Übermäßig'}, alle Umkehrungen – Saiten ${set}`,
      match: (s: string) => s.startsWith(`triad:${type}/`) && s.endsWith(`/strings:${set}`),
    })),
  ),
];

// ── Melody note → chord: tonic-triad tones first, then the rest ─────────────────
const DEGREE_ORDER = [1, 5, 3, 4, 2, 6, 7];
const melodySpecs = (): DrillSpec[] =>
  (['major', 'minor'] as const).flatMap((mode) =>
    DEGREE_ORDER.map((deg) => ({
      id: `${mode}/${deg}`,
      title: `${mode === 'major' ? 'Dur' : 'Moll'}: Melodieton auf Stufe ${deg}`,
      match: (s: string) => s === `melody:${mode}/deg:${deg}`,
    })),
  );

const SPECS: Record<TrackId, () => DrillSpec[]> = {
  fretboard: fretboardSpecs,
  intervals: intervalSpecs,
  triads: triadSpecs,
  melody: melodySpecs,
};

/** Resolve the path against the catalog of a context; drills with nothing playable drop out. */
export function buildCurriculum(catalog: CatalogEntry[]): Drill[] {
  return TRACKS.flatMap((track) => {
    const skills = catalog.filter((c) => c.family === track.family).map((c) => c.skill);
    return SPECS[track.id]()
      .map((spec) => ({ id: `${track.id}/${spec.id}`, track: track.id, title: spec.title, family: track.family, skills: skills.filter(spec.match) }))
      .filter((d) => d.skills.length > 0);
  });
}

/** A skill is comfortable when it is mastered *and* has held over at least one break (box ≥ 2). */
export const COMFORT_MASTERY = 0.75;
export const COMFORT_BOX = 2;
export const isComfortable = (s: SkillStats | undefined): boolean => !!s && mastery(s) >= COMFORT_MASTERY && s.box >= COMFORT_BOX;

export type DrillStatus = 'new' | 'learning' | 'comfortable';

export interface DrillProgress {
  status: DrillStatus;
  /** 0..1 for a progress bar. */
  progress: number;
  comfortable: number;
  total: number;
}

export function drillProgress(state: LearnerState, drill: Drill): DrillProgress {
  const stats = drill.skills.map((id) => state.skills[id]);
  const comfortable = stats.filter(isComfortable).length;
  const score = (s: SkillStats | undefined) => (isComfortable(s) ? 1 : Math.min(0.9, mastery(s) / COMFORT_MASTERY));
  const progress = stats.reduce((a, s) => a + score(s), 0) / stats.length;
  const status: DrillStatus = comfortable === stats.length ? 'comfortable' : stats.some(Boolean) ? 'learning' : 'new';
  return { status, progress, comfortable, total: stats.length };
}

/** A passed drill comes back only when it has clearly slipped, not after one miss. */
export const SLIP_PROGRESS = 0.5;

/** Record drills that are comfortable now. Call after applyAttempt. */
export function markPassed(state: LearnerState, curriculum: Drill[], now: number): LearnerState {
  const fresh = curriculum.filter((d) => state.passed[d.id] === undefined && drillProgress(state, d).status === 'comfortable');
  if (fresh.length === 0) return state;
  return { ...state, passed: { ...state.passed, ...Object.fromEntries(fresh.map((d) => [d.id, now])) } };
}

export const hasSlipped = (state: LearnerState, drill: Drill): boolean =>
  state.passed[drill.id] !== undefined && drillProgress(state, drill).progress < SLIP_PROGRESS;

/**
 * The one drill to do next in a track: the first one not yet passed, or – earlier in the
 * path – a passed one that has clearly slipped. Undefined when the track is done.
 */
export function recommendDrill(state: LearnerState, curriculum: Drill[], track: TrackId): Drill | undefined {
  return curriculum.find((d) => d.track === track && (state.passed[d.id] === undefined || hasSlipped(state, d)));
}

/** Next exercise inside one drill. The learner model only chooses among the drill's skills. */
export function nextDrillExercise(
  state: LearnerState, drill: Drill, catalog: CatalogEntry[], rng: Rng, now: number, ctx: ExerciseContext = DEFAULT_CONTEXT,
): NextExercise {
  const pool = catalog.filter((c) => drill.skills.includes(c.skill));
  const target = selectSkill(state, pool, rng, { now, maxLearning: Infinity });
  const exercise = generateExercise(target.family, rng.uint32(), ctx, target.focus);
  return { exercise, helpLevel: helpLevelFor(state, target.skill), target };
}
