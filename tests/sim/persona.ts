import { ProgChord } from '../../src/core/song/analysis';

/**
 * Simulated learners for the calibration harness (spec §9.1). A persona is plain data: the
 * hidden learner in world.ts reads it, the runner in run.ts draws sessions from it. The
 * numbers describe a *different* functional form from the learner model on purpose (power-law
 * recall, durable prior knowledge beside fragile new knowledge, multiplicative help bonus,
 * hidden transfer), so tuning the model against them is not circular.
 */
export interface Persona {
  id: string;
  /** Initial true knowledge of every skill before any practice, 0..1; durable – it starts at world.ts priorStability(k0), not S0. */
  k0: number;
  /** Learning rate: a correct answer moves k by learn·hard·(1 − k); the reveal after a miss by half of that. */
  learn: number;
  /** Multiplier on `learn` for skills with difficulty ≥ HARD_DIFFICULTY (slow learners find hard things harder). */
  hard: number;
  /** Chance level on note and interval questions; other families scale from it (FAMILY_GUESS). */
  guess: number;
  /** Hidden transfer: a cold skill starts at max(k0, transfer · max k over its true neighbours), with the stability of prior knowledge. */
  transfer: number;
  /** Help bonus per help level: P' = 1 − (1 − P)(1 − bonus[level]). Level 0 shows everything. */
  helpBonus: readonly number[];
  /** Self-rates 'instant' when k·R ≥ instantAt, 'found' otherwise. */
  instantAt: number;
  /** Always taps "Gefunden", never "Sofort" (the v1 defect: such a player never passes). */
  foundOnly?: boolean;
  /** Reports 20 % of 'found' answers as 'instant'. */
  optimist?: boolean;
  /** Stability growth per spaced recall: 2.2 normally, 1.4 for the forgetful. */
  sGrowth: number;
  /** Practice rhythm: mean sessions per week, answers per session [min, max]. */
  sessionsPerWeek: number;
  sessionLen: [number, number];
  /** One long break of breakDays after the first session on or after day breakEvery. */
  breakEvery?: number;
  breakDays?: number;
  /** Knowledge and learning handicap on G/B-crossing interval skills (deltas: k0 + k0, learn × learn). */
  gbWeak?: { k0: number; learn: number };
  /** Jamming on the keys between sessions: chords per day, the chords, share hit via a stored pad. */
  play?: { perDay: number; chords: ProgChord[]; padShare: number };
}

/** Skills at or above this (sim-side) difficulty take the persona's `hard` multiplier. */
export const HARD_DIFFICULTY = 0.4;

/** Chance level per family: 1/12 notes and intervals, 1/9 triads and keys inversions, 0.14 melody. */
export const FAMILY_GUESS: Record<string, number> = {
  'note-find': 1 / 12,
  'interval-hunt': 1 / 12,
  'triad-build': 1 / 9,
  'keys-chord': 1 / 9,
  'keys-voicing': 1 / 9,
  'melody-chord': 0.14,
};

/** Share of a 'found'-quality answer the optimist calls 'instant'. */
export const OPTIMIST_SHARE = 0.2;

const DEFAULT_HELP_BONUS = [0.5, 0.3, 0.1, 0] as const;

/** Everything a persona shares unless it says otherwise: the steady learner's habits. */
const base = (id: string, over: Partial<Persona>): Persona => ({
  id,
  k0: 0.25,
  learn: 0.2,
  hard: 1,
  guess: 1 / 12,
  transfer: 0.5,
  helpBonus: DEFAULT_HELP_BONUS,
  instantAt: 0.6,
  sGrowth: 2.2,
  sessionsPerWeek: 5,
  sessionLen: [12, 20],
  ...over,
});

// ── Pad chords of the noodler: the four chords of a pop loop, as a 37-key voicing ──
const pc = (rootPc: number, typeId: string): ProgChord => ({ rootPc, typeId });
const NOODLER_CHORDS: ProgChord[] = [pc(0, 'maj'), pc(9, 'min'), pc(5, 'maj'), pc(7, 'maj')];

export const steady = base('steady', {});
export const quick = base('quick', { k0: 0.7, learn: 0.35 });
export const slow = base('slow', { k0: 0.1, learn: 0.08, hard: 0.5, guess: 0.1 });
/** Knows half of everything and never learns: p ≈ 0.5 must not pass. */
export const stuck = base('stuck', { k0: 0.5, learn: 0, transfer: 0 });
export const foundOnly = base('foundOnly', { foundOnly: true });
export const optimist = base('optimist', { optimist: true });
export const forgetful = base('forgetful', { sGrowth: 1.4 });
export const returning = base('returning', { breakEvery: 12, breakDays: 14 });
export const gbWeak = base('gbWeak', { gbWeak: { k0: -0.2, learn: 0.5 } });
export const noodler = base('noodler', { play: { perDay: 30, chords: NOODLER_CHORDS, padShare: 0.7 } });

export const PERSONAS: readonly Persona[] = [quick, steady, slow, stuck, foundOnly, optimist, forgetful, returning, gbWeak, noodler];

export const personaById = (id: string): Persona => {
  const p = PERSONAS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown persona: ${id}`);
  return p;
};
