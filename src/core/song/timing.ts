/*
 * Timing trainer: step 1 of the live-looping ladder – change chords on the bar line, four loops in a
 * row without stumbling. Pure arithmetic over a metronome grid; the screen owns the clock and the click.
 */

export interface Grid {
  bpm: number;
  /** Beats each chord lasts; 4 = one bar. */
  beatsPerChord: number;
  /** Clock time (ms) of beat 1 of bar 1 – after the count-in. */
  startMs: number;
}

export type Verdict = 'genau' | 'früh' | 'spät' | 'daneben';

export interface Judgement {
  /** Index of the chord change the onset was closest to (0 = the downbeat the grid starts on). */
  slot: number;
  expectedMs: number;
  /** Positive = late. */
  offsetMs: number;
  verdict: Verdict;
}

export const beatMs = (bpm: number): number => 60000 / bpm;
export const periodMs = (g: Grid): number => g.beatsPerChord * beatMs(g.bpm);

/** Default window for "genau": players hear anything tighter as on the beat. */
export const TOLERANCE_MS = 80;

/** Where a chord onset sits against the nearest expected change. "daneben" beyond a quarter of the chord length. */
export function judgeChange(g: Grid, onsetMs: number, toleranceMs = TOLERANCE_MS): Judgement {
  const period = periodMs(g);
  const slot = Math.round((onsetMs - g.startMs) / period);
  const expectedMs = g.startMs + slot * period;
  const offsetMs = onsetMs - expectedMs;
  const abs = Math.abs(offsetMs);
  const verdict: Verdict = abs <= toleranceMs ? 'genau' : abs <= period / 4 ? (offsetMs < 0 ? 'früh' : 'spät') : 'daneben';
  return { slot, expectedMs, offsetMs, verdict };
}

export interface TimingStats {
  changes: number;
  hits: number;
  /** Mean absolute offset over all changes, ms. */
  meanAbsMs: number;
  /** Hits in a row right now. */
  streak: number;
  bestStreak: number;
  /** The last change's slot, so a second onset inside the same slot does not count twice. */
  lastSlot: number | null;
}

export const EMPTY_STATS: TimingStats = { changes: 0, hits: 0, meanAbsMs: 0, streak: 0, bestStreak: 0, lastSlot: null };

/** Fold a judgement in. An onset in a slot already judged (a re-hit of the same chord) is ignored. */
export function addJudgement(s: TimingStats, j: Judgement): TimingStats {
  if (s.lastSlot !== null && j.slot <= s.lastSlot) return s;
  const hit = j.verdict === 'genau';
  const changes = s.changes + 1;
  const streak = hit ? s.streak + 1 : 0;
  return {
    changes,
    hits: s.hits + (hit ? 1 : 0),
    meanAbsMs: (s.meanAbsMs * s.changes + Math.abs(j.offsetMs)) / changes,
    streak,
    bestStreak: Math.max(s.bestStreak, streak),
    lastSlot: j.slot,
  };
}

/** Loops the ladder asks for in a row. */
export const GOAL_LOOPS = 4;

export const loopsInRow = (streak: number, chordsPerLoop: number): number => Math.floor(streak / Math.max(1, chordsPerLoop));

export interface BeatPosition {
  /** 1-based bar; 0 or negative during the count-in. */
  bar: number;
  /** 1-based beat in the bar. */
  beat: number;
  /** 0..1 inside the current beat. */
  phase: number;
}

export function beatAt(g: Grid, nowMs: number, beatsPerBar = 4): BeatPosition {
  const beats = (nowMs - g.startMs) / beatMs(g.bpm);
  const whole = Math.floor(beats);
  return { bar: Math.floor(whole / beatsPerBar) + 1, beat: ((whole % beatsPerBar) + beatsPerBar) % beatsPerBar + 1, phase: beats - whole };
}
