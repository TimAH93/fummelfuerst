import { generateExercise } from '../exercises/registry';
import { Rng } from '../exercises/rng';
import { DEFAULT_CONTEXT, ExerciseContext } from '../exercises/types';
import { belief, knowledge, priorFor, recall } from '../mastery/belief';
import { DEFAULT_MODEL, ModelConfig } from '../mastery/config';
import { LearnerState, SkillStats, helpLevelFor, warmupLeft } from '../mastery/model';
import { CatalogEntry, NextExercise, seen, selectSkill } from '../mastery/select';

/**
 * Practice like a fighting-game training mode: one small drill at a time, in a fixed
 * order, until it is comfortable. The app recommends exactly one next drill; the player
 * decides when to move on. Nothing is skipped – a drill you already know is simply
 * comfortable after a few minutes. Gates are time-free: nothing un-passes by the calendar.
 * Forgetting drives what is reviewed – labelled review picks from passed drills of the same
 * track inside the normal session, and a warm-up of review picks after a long break.
 */
export type TrackId = 'fretboard' | 'intervals' | 'triads' | 'melody' | 'keys' | 'neosoul';

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
  { id: 'keys', title: 'Tasten → Gitarre', family: 'keys-chord' },
  { id: 'neosoul', title: 'Neo-Soul-Akkorde', family: 'keys-voicing' },
];

export interface Drill {
  /** Stable id, stored with progress: 'intervals/5/up/adjacent'. */
  id: string;
  track: TrackId;
  /** Shown big on the home screen. */
  title: string;
  family: string;
  skills: string[];
  /** The catalog entries of `skills`, same order: the selection pool, with edges and difficulty. */
  entries: CatalogEntry[];
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

// ── Keys → guitar: build it where the intervals are visible, then carry it over ──
const keysSpecs = (): DrillSpec[] => [
  ...(['maj', 'min'] as const).flatMap((type) =>
    [0, 1, 2].map((inv) => ({
      id: `${type}/${inv}`,
      title: `Tasten: ${type === 'maj' ? 'Dur' : 'Moll'}, ${INV_TITLE[inv]}`,
      match: (s: string) => s === `keys:${type}/inv:${inv}`,
    })),
  ),
  ...(['dim', 'aug'] as const).map((type) => ({
    id: type,
    title: `Tasten: ${type === 'dim' ? 'Vermindert' : 'Übermäßig'}, alle Umkehrungen`,
    match: (s: string) => s.startsWith(`keys:${type}/`),
  })),
];

// ── Neo-soul: sevenths as the foundation, then the colours on top ───────────────
const NEOSOUL_ORDER: [string, string][] = [
  ['maj7', 'Major 7 – warm, zuhause'],
  ['m7', 'Moll 7 – weich, nachdenklich'],
  ['dom7', 'Dominant 7 – will weiter'],
  ['m7b5', 'Halbvermindert (m7b5) – Moll-ii-V'],
  ['maj9', 'Major 9 – schwebend'],
  ['m9', 'Moll 9 – der Neo-Soul-Klang'],
  ['dom9', 'Dominant 9 – soulig'],
  ['dom13', 'Dominant 13 – elegant'],
  ['dom7s9', '7#9 – bluesig, Reibung'],
];
const neosoulSpecs = (): DrillSpec[] =>
  NEOSOUL_ORDER.map(([type, title]) => ({ id: type, title, match: (s: string) => s === `voicing:${type}` }));

const SPECS: Record<TrackId, () => DrillSpec[]> = {
  neosoul: neosoulSpecs,
  keys: keysSpecs,
  fretboard: fretboardSpecs,
  intervals: intervalSpecs,
  triads: triadSpecs,
  melody: melodySpecs,
};

/** Resolve the path against the catalog of a context; drills with nothing playable drop out. */
export function buildCurriculum(catalog: CatalogEntry[]): Drill[] {
  return TRACKS.flatMap((track) => {
    const family = catalog.filter((c) => c.family === track.family);
    return SPECS[track.id]()
      .map((spec) => {
        const entries = family.filter((c) => spec.match(c.skill));
        return { id: `${track.id}/${spec.id}`, track: track.id, title: spec.title, family: track.family, skills: entries.map((e) => e.skill), entries };
      })
      .filter((d) => d.skills.length > 0);
  });
}

// ── Gates (time-free) ──

/** Knowledge a comfortable skill needs (alias of DEFAULT_MODEL.comfortMastery). */
export const COMFORT_MASTERY = DEFAULT_MODEL.comfortMastery;

/**
 * A skill is comfortable when it has been asked a few times, held over at least one break
 * (a quiz success ≥ cfg.heldGap after the previous quiz answer) and its knowledge is above the
 * bar. Time-free: the calendar never un-passes anything. `held` and `n` are written by quiz
 * evidence only, and the break is measured between quiz answers, so play never passes a drill:
 * it may lift the knowledge (play raises `a`), but the gate still needs comfortN quiz answers
 * and one of them a quiz-to-quiz break later.
 */
export const isComfortable = (s: SkillStats | undefined, cfg: ModelConfig = DEFAULT_MODEL): boolean =>
  !!s && s.n >= cfg.comfortN && s.held >= 1 && knowledge(s) >= cfg.comfortMastery;

export type DrillStatus = 'new' | 'learning' | 'comfortable';

export interface DrillProgress {
  status: DrillStatus;
  /** 0..1 for a progress bar. */
  progress: number;
  comfortable: number;
  total: number;
  /** Mean expected recall of the drill's skills; only when `now` was given. */
  recall?: number;
}

/** The catalog entries of a drill's skills, in skill order; a skill without entry gets one without edges. */
const entriesOf = (drill: Drill): CatalogEntry[] => {
  const byId = new Map((drill.entries ?? []).map((e) => [e.skill, e]));
  return drill.skills.map((id) => byId.get(id) ?? { family: drill.family, skill: id, focus: undefined, edges: [], difficulty: 0.5 });
};

/** The score of a skill that is not comfortable never reaches this; the lapse penalty multiplies it down. */
const SCORE_CAP = 0.9;

const lapseFactor = (s: SkillStats, cfg: ModelConfig): number => cfg.lapsePenalty[Math.min(s.lapses, cfg.lapsePenalty.length - 1)];

/**
 * Per skill: 1 when comfortable; otherwise the share of the knowledge bar reached (≤ 0.9),
 * multiplied down by consecutive misses (an observed slump, not the calendar); a skill without
 * quiz answers shows what its belief says – its own play or aside evidence plus what its
 * neighbours transfer – at most 0.25 and never as comfortable.
 */
function skillScore(entry: CatalogEntry, s: SkillStats | undefined, skills: Record<string, SkillStats>, cfg: ModelConfig): number {
  if (isComfortable(s, cfg)) return 1;
  if (seen(s)) return Math.min(SCORE_CAP, knowledge(s) / cfg.comfortMastery) * lapseFactor(s, cfg);
  return Math.min(0.25, 2 * Math.max(0, belief(s, priorFor(entry.edges, skills, cfg)).mean - 0.5));
}

export function drillProgress(state: LearnerState, drill: Drill, now?: number, cfg: ModelConfig = DEFAULT_MODEL): DrillProgress {
  const entries = entriesOf(drill);
  const stats = entries.map((e) => state.skills[e.skill]);
  const comfortable = stats.filter((s) => isComfortable(s, cfg)).length;
  const progress = entries.reduce((sum, e, i) => sum + skillScore(e, stats[i], state.skills, cfg), 0) / entries.length;
  const status: DrillStatus = comfortable === stats.length ? 'comfortable' : stats.some(seen) ? 'learning' : 'new';
  const out: DrillProgress = { status, progress, comfortable, total: stats.length };
  if (now !== undefined) out.recall = meanRecall(state, drill, now);
  return out;
}

/** A passed drill comes back only when it has clearly slipped, not after one miss (alias of DEFAULT_MODEL.slipProgress). */
export const SLIP_PROGRESS = DEFAULT_MODEL.slipProgress;

/** Record drills that are comfortable now. Call after applyAttempt. */
export function markPassed(state: LearnerState, curriculum: Drill[], now: number, cfg: ModelConfig = DEFAULT_MODEL): LearnerState {
  const fresh = curriculum.filter((d) => state.passed[d.id] === undefined && drillProgress(state, d, undefined, cfg).status === 'comfortable');
  if (fresh.length === 0) return state;
  return { ...state, passed: { ...state.passed, ...Object.fromEntries(fresh.map((d) => [d.id, now])) } };
}

/**
 * Per skill of a passed drill: 1 while comfortable, otherwise the 0.9 cap multiplied down by
 * consecutive quiz misses alone – not by how far above the bar the skill was when it passed, so
 * a one-skill drill slips after exactly three misses in a row (0.9 × 0.3 < 0.5; two leave
 * 0.9 × 0.6), a 7-skill drill when five of its skills have, and play (which never touches
 * `lapses`) cannot un-pass anything. A skill the drill gained since it passed scores as in drillProgress.
 */
function slipScore(entry: CatalogEntry, s: SkillStats | undefined, skills: Record<string, SkillStats>, cfg: ModelConfig): number {
  if (isComfortable(s, cfg)) return 1;
  if (seen(s)) return SCORE_CAP * lapseFactor(s, cfg);
  return skillScore(entry, s, skills, cfg);
}

export function hasSlipped(state: LearnerState, drill: Drill, cfg: ModelConfig = DEFAULT_MODEL): boolean {
  if (state.passed[drill.id] === undefined) return false;
  const entries = entriesOf(drill);
  return entries.reduce((sum, e) => sum + slipScore(e, state.skills[e.skill], state.skills, cfg), 0) / entries.length < cfg.slipProgress;
}

/**
 * The one drill to do next in a track: the first one not yet passed, or – earlier in the
 * path – a passed one that has clearly slipped. Undefined when the track is done.
 */
export function recommendDrill(state: LearnerState, curriculum: Drill[], track: TrackId, cfg: ModelConfig = DEFAULT_MODEL): Drill | undefined {
  return curriculum.find((d) => d.track === track && (state.passed[d.id] === undefined || hasSlipped(state, d, cfg)));
}

// ── Exercises inside a drill ──

/**
 * Next exercise inside one drill. The learner model only chooses among the drill's skills
 * (`drill.entries`; `catalog` is the fallback for a drill built without entries), with the
 * ladder on: unseen skills enter two at a time, easiest first.
 */
export function nextDrillExercise(
  state: LearnerState, drill: Drill, catalog: CatalogEntry[], rng: Rng, now: number, ctx: ExerciseContext = DEFAULT_CONTEXT,
  cfg: ModelConfig = DEFAULT_MODEL,
): NextExercise {
  const pool = drill.entries ?? catalog.filter((c) => drill.skills.includes(c.skill));
  const target = selectSkill(state, pool, rng, { now, maxLearning: cfg.maxLearningDrill, ladder: true, cfg });
  const exercise = generateExercise(target.family, rng.uint32(), ctx, target.focus);
  return { exercise, helpLevel: helpLevelFor(state, target.skill), target };
}

// ── Mixed session and warm-up ──

export interface SessionPlan {
  /** The recommended drill: the only unpassed drill ever drawn. */
  drill: Drill;
  /** Passed drills of the same track whose skills are fading, most forgotten first. */
  reviews: Drill[];
  /** Probability that the next pick is a review pick: 0 without reviews, 1 during the warm-up. */
  pMix: number;
  /** The comeback warm-up is running: every pick is a review pick. */
  warm: boolean;
}

export interface SessionExercise extends NextExercise {
  /** The review drill this exercise came from; absent for the main drill. */
  review?: Drill;
}

/** Mean expected recall over a drill's skills at `now` (0 for skills never recalled). */
export const meanRecall = (state: LearnerState, drill: Drill, now: number): number =>
  drill.skills.reduce((sum, id) => sum + recall(state.skills[id], now), 0) / drill.skills.length;

/**
 * Review candidates for a session on `drill`: passed drills of the same track (not the drill
 * itself, not one fully contained in it) whose mean recall has dropped below cfg.reviewBelow –
 * the most forgotten first, ties in path order, at most cfg.reviewDrills.
 */
export function reviewDrills(state: LearnerState, curriculum: Drill[], drill: Drill, now: number, cfg: ModelConfig = DEFAULT_MODEL): Drill[] {
  return curriculum
    .map((d, index) => ({ d, index, r: meanRecall(state, d, now) }))
    .filter(({ d, r }) =>
      d.track === drill.track && d.id !== drill.id && state.passed[d.id] !== undefined
      && !d.skills.every((s) => drill.skills.includes(s)) && r < cfg.reviewBelow)
    .sort((p, q) => p.r - q.r || p.index - q.index)
    .slice(0, cfg.reviewDrills)
    .map(({ d }) => d);
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** The plan for the next pick: the main drill, its reviews and how often they come up. Recompute per pick. */
export function planSession(state: LearnerState, curriculum: Drill[], drill: Drill, now: number, cfg: ModelConfig = DEFAULT_MODEL): SessionPlan {
  const reviews = reviewDrills(state, curriculum, drill, now, cfg);
  const warm = reviews.length > 0 && warmupLeft(state, now, cfg) > 0;
  let pMix = 0;
  if (reviews.length > 0) {
    const forgotten = 1 - reviews.reduce((sum, d) => sum + meanRecall(state, d, now), 0) / reviews.length;
    pMix = warm ? 1 : clamp(cfg.mixBase + 0.25 * forgotten, cfg.mixBase, cfg.mixMax);
  }
  return { drill, reviews, pMix, warm };
}

/**
 * The next exercise of a mixed session. Draw order: with reviews, one `rng.next()` decides
 * review or main; a review drill is picked by weight 1 − meanRecall (one more draw only when
 * there are two) and its pool is drawn without new skills or ladder; otherwise the main drill
 * goes through `nextDrillExercise`. Without reviews no extra draw happens, so the single-drill
 * stream is byte-identical to `nextDrillExercise`.
 */
export function nextSessionExercise(
  state: LearnerState, plan: SessionPlan, rng: Rng, now: number, ctx: ExerciseContext = DEFAULT_CONTEXT, cfg: ModelConfig = DEFAULT_MODEL,
): SessionExercise {
  if (plan.reviews.length > 0 && rng.next() < plan.pMix) {
    let review = plan.reviews[0];
    if (plan.reviews.length > 1) {
      const weights = plan.reviews.map((d) => 1 - meanRecall(state, d, now));
      let r = rng.next() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < plan.reviews.length; i++) if ((r -= weights[i]) < 0) { review = plan.reviews[i]; break; }
    }
    const target = selectSkill(state, review.entries, rng, { now, allowNew: false, ladder: false, cfg });
    const exercise = generateExercise(target.family, rng.uint32(), ctx, target.focus);
    return { exercise, helpLevel: helpLevelFor(state, target.skill), target, review };
  }
  return nextDrillExercise(state, plan.drill, plan.drill.entries, rng, now, ctx, cfg);
}
