/*
 * Every tunable of the learner model in one object. Public model functions take
 * `cfg: ModelConfig = DEFAULT_MODEL` as their optional last argument, so call sites keep
 * compiling while the simulation harness (tests/sim) sweeps the constants. Values marked
 * "principle" are not tuned: they encode how the app is meant to feel, not a fit.
 */

const MIN = 60_000;
const DAY = 86_400_000;

/** Where a play event came from; its weight lives in `ModelConfig.playW`. */
export type PlaySource = 'jamFree' | 'jamPick' | 'trainerHit' | 'trainerMiss' | 'timing';

export interface ModelConfig {
  // ── belief ──
  /** Window after a success: weighted counts are shrunk to this total. */
  nMax: number;
  /** Window after a failure: old successes count less once you miss. */
  nLapse: number;
  /** Evidence weight per help level 0..3. */
  helpW: readonly number[];
  /** Weight of the skill a wrong answer demonstrated instead. */
  asideW: number;
  /** x of a self-rated "≈ Fast". */
  nearCredit: number;
  /** EMA rate of the fluency estimate. */
  fluAlpha: number;
  // ── memory ──
  /** Half-life after the first success. */
  hl0: number;
  hlMin: number;
  hlMax: number;
  /** A recall one half-life later multiplies the half-life by 1 + hlGain. */
  hlGain: number;
  /** Spacing credit saturates at this many half-lives. */
  hlGainCap: number;
  /** A recall after gap Δ proves hl ≥ hlDemo·Δ (× weight × fluency factor). */
  hlDemo: number;
  /** Shrink factor of a fully surprising miss (R = 1). */
  missShrink: number;
  /** Exponent floor of the surprise term: an expected miss (R = 0) shrinks by missShrink^missFloor. */
  missFloor: number;
  /** Gap after which a quiz success counts as "held" (principle). */
  heldGap: number;
  heldMax: number;
  lapseMax: number;
  // ── transfer ──
  /** Transfer is never worth more than this many real answers. */
  priorMax: number;
  /** Ladder rank = difficulty − ladderTransfer × (priorMean − 0.5). */
  ladderTransfer: number;
  // ── gates ──
  /** Knowledge a comfortable skill needs (principle). */
  comfortMastery: number;
  /** Quiz attempts a comfortable skill needs (principle). */
  comfortN: number;
  /** Knowledge above which a skill leaves "in learning". */
  learningDone: number;
  /** Progress multiplier by consecutive misses 0..3. */
  lapsePenalty: readonly number[];
  /** A passed drill has slipped below this progress (principle). */
  slipProgress: number;
  // ── selection ──
  maxLearningDrill: number;
  maxLearningFree: number;
  /** Full forgetting pressure once expected recall is at or below this. */
  rTarget: number;
  /** Slow-but-right skills get a little more practice: eff = low × (fluFloor + (1 − fluFloor) × flu). */
  fluFloor: number;
  weights: { weak: number; forget: number; fresh: number; floor: number; recent: number; boost: number; ladderSecond: number };
  /** How long a confusable skill stays boosted. */
  boostMs: number;
  boostMax: number;
  // ── session ──
  reviewDrills: number;
  /** Review candidate once mean recall is below this. */
  reviewBelow: number;
  mixBase: number;
  mixMax: number;
  /** Break after which a session opens with warmupN review picks. */
  warmupGap: number;
  warmupN: number;
  // ── play ──
  playW: Record<PlaySource, number>;
  /** Floor of the (1 − R) discount on play evidence. */
  playMin: number;
  /** A chord equal to a stored pad proves pad memory, not the skill. */
  playPadWeight: number;
  /** identifyHeld reports the bass as root of an augmented triad. */
  augWeight: number;
  // ── help ──
  /** Group knowledge needed to fade help from level 0, 1, 2. */
  helpUp: readonly number[];
  /** Consecutive good answers before help fades (principle). */
  helpUpStreak: number;
  /** Weighted misses that bring help back (principle). */
  helpDownMisses: number;
  /** A near miss is this much of a miss for the hysteresis counter. */
  nearMissWeight: number;
}

/**
 * The defaults the app runs with. Fitted by `npm run calibrate` (tests/sim/calibrate.ts, WP9 run
 * of 2026-11-01): coordinate descent on J over seeds 11–15 of the steady, quick, foundOnly,
 * forgetful and optimist learners took J from 3.858 to 2.841 in one pass; a second pass, and a
 * fresh run from these values, move nothing. The acceptance thresholds of tests/calibration.test.ts
 * were then measured on seeds 1–5. Fields marked "calibrated" moved in that run; every other
 * tunable is the spec value and a local optimum of its grid; principles were not swept.
 */
export const DEFAULT_MODEL: ModelConfig = {
  nMax: 20,
  /** calibrated (spec 12): the simulated misses are mostly overnight forgetting, so a miss shrinks the window no further than a success. */
  nLapse: 20,
  /** calibrated (spec [0.7, 0.85, 1, 1]): answers with the board on screen still count 0.9; a p = 0.97 player passes 7 skills in 56–86 answers instead of 82–117. */
  helpW: [0.9, 1, 1, 1],
  asideW: 0.5,
  nearCredit: 0.25,
  fluAlpha: 0.3,
  hl0: 10 * MIN,
  hlMin: 5 * MIN,
  hlMax: 120 * DAY,
  hlGain: 2,
  hlGainCap: 3,
  hlDemo: 0.5,
  missShrink: 0.2,
  missFloor: 0.5,
  heldGap: 10 * MIN,
  heldMax: 3,
  lapseMax: 3,
  priorMax: 4,
  ladderTransfer: 0.5,
  comfortMastery: 0.75,
  comfortN: 3,
  /** calibrated (spec 0.6): two clean answers take a skill out of "in learning". */
  learningDone: 0.5,
  lapsePenalty: [1, 0.85, 0.6, 0.3],
  slipProgress: 0.5,
  /** calibrated (spec 2): the grid's cap – the simulated learner has no interference cost, so the sweep stops at four. */
  maxLearningDrill: 4,
  maxLearningFree: 8,
  rTarget: 0.6,
  fluFloor: 0.75,
  /** calibrated: recent 0.5 (spec 0.1) – with up to four skills in learning, the last five asked are nearly the whole pool. */
  weights: { weak: 1, forget: 0.8, fresh: 0.6, floor: 0.03, recent: 0.5, boost: 3, ladderSecond: 0.3 },
  boostMs: 20 * MIN,
  boostMax: 8,
  reviewDrills: 2,
  reviewBelow: 0.9,
  mixBase: 0.25,
  mixMax: 0.5,
  warmupGap: 7 * DAY,
  warmupN: 5,
  playW: { jamFree: 0.1, jamPick: 0.25, trainerHit: 0.3, trainerMiss: 0.15, timing: 0.15 },
  playMin: 0.1,
  playPadWeight: 0,
  augWeight: 0.5,
  /** calibrated (spec [0.5, 0.65, 0.8]): help fades later; level 3 stays reachable for a p = 0.97 player (≈ 0.87). */
  helpUp: [0.6, 0.75, 0.85],
  helpUpStreak: 4,
  helpDownMisses: 2,
  nearMissWeight: 0.5,
};

/** How many recently practised leaf skills the state remembers. */
export const RECENT_LENGTH = 5;
