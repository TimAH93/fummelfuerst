import { TRIAD_TYPES } from '../exercises/families/triadBuild';
import { VOICING_TYPES, voicingComplete } from '../exercises/families/keysVoicing';
import { identifyHeld } from '../keys/heldChord';
import { ProgChord } from '../song/analysis';
import { Verdict } from '../song/timing';
import { SIMPLER_TYPE } from '../theory/chord';
import { Midi, toPc } from '../theory/pitch';
import { recall } from './belief';
import { DEFAULT_MODEL, ModelConfig, PlaySource } from './config';
import { Evidence } from './evidence';
import { LearnerState, applyEvidence } from './model';

/*
 * Play evidence: chords played on the keys outside Practice – the jam monitor, the progression
 * trainer and the timing screen – mapped to the keys / voicing skills they demonstrate and
 * folded into the learner state as light 'play' evidence. Play may raise a skill's belief,
 * fluency and half-life (it stops being due) and lift drill progress; it never touches `n`, `lastQ`,
 * `held`, `lapses`, help, `recent`, `boost` or `passed`, so no drill passes from play alone.
 * The (1 − R) discount tames noodling: a chord the model already expects you to recall is
 * worth almost nothing; a chord equal to a stored pad proves pad memory, not the skill. Play
 * misses do not compound: one counts per recall, so a trainer left running (or a player still
 * listening) cannot wear a quiz-built belief down slot by slot.
 */

export type { PlaySource } from './config';

/** A skill a played chord demonstrates, with its share of the event's weight. */
export interface PlaySkill {
  skill: string;
  /** 1, or cfg.augWeight for an augmented triad (identifyHeld guesses the bass as root). */
  factor: number;
}

export interface PlayEvent {
  source: PlaySource;
  /** Epoch ms. */
  at: number;
  /** Credited skills; empty when the chord maps to no catalog skill. */
  skills: PlaySkill[];
  /** False only for a missed trainer slot. */
  correct: boolean;
  /** 0..1: how clean / in time the chord was; the fluency of the evidence. */
  quality: number;
  /** The chord equals a stored pad (padFor) – pad memory, not the skill. */
  pad: boolean;
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

const isTriadType = (id: string): boolean => (TRIAD_TYPES as readonly string[]).includes(id);
const isVoicingType = (id: string): boolean => (VOICING_TYPES as readonly string[]).includes(id);

// ── Chord → skills ──

/**
 * Which skill the keys are showing: a triad with exactly three distinct pitch classes is a
 * `keys:` skill in the inversion the bass gives (augmented: root position at cfg.augWeight,
 * since the bass is only a guess at the root); a voicing type is `voicing:T` when complete
 * (root in the bass, every essential tone above), else the simpler type it still proves
 * (maj9 → maj7, m9 → m7, the dominants → dom7). Sus, sixth, m11, dim7 … map to nothing.
 */
export function skillsForHeld(midis: Midi[], cfg: ModelConfig = DEFAULT_MODEL): PlaySkill[] {
  const h = identifyHeld(midis);
  if (!h) return [];
  const t = h.type.id;
  if (isTriadType(t)) {
    if (new Set(midis.map(toPc)).size !== 3) return [];
    if (t === 'aug') return [{ skill: 'keys:aug/inv:0', factor: cfg.augWeight }];
    return [{ skill: `keys:${t}/inv:${h.inversion}`, factor: 1 }];
  }
  if (isVoicingType(t)) {
    if (voicingComplete(h.rootPc, t, midis)) return [{ skill: `voicing:${t}`, factor: 1 }];
    const simpler = SIMPLER_TYPE[t];
    if (simpler !== undefined && isVoicingType(simpler) && voicingComplete(h.rootPc, simpler, midis)) {
      return [{ skill: `voicing:${simpler}`, factor: 1 }];
    }
  }
  return [];
}

/** The skill a trainer target stands for when no keys were played: root-position triad or voicing. */
export function skillsForChord(c: ProgChord): PlaySkill[] {
  if (isTriadType(c.typeId)) return [{ skill: `keys:${c.typeId}/inv:0`, factor: 1 }];
  if (isVoicingType(c.typeId)) return [{ skill: `voicing:${c.typeId}`, factor: 1 }];
  return [];
}

// ── Event constructors ──

/** A chord held in the jam monitor; `picked` when it was the one the monitor asked for. */
export const jamEvent = (midis: Midi[], at: number, picked: boolean, pad: boolean): PlayEvent => ({
  source: picked ? 'jamPick' : 'jamFree',
  at,
  skills: skillsForHeld(midis),
  correct: true,
  quality: picked ? 0.8 : 0.7,
  pad,
});

/** Quality of a trainer hit by tempo: 0.4 at 50 bpm, 1 from 90 bpm. */
export const trainerQuality = (bpm: number): number => clamp(0.4 + (0.6 * (bpm - 50)) / 40, 0.4, 1);

/**
 * One trainer slot: a hit credits what was actually played (`midis`); a missed slot
 * (`midis` null) is the only play failure and lands lightly on the target's skill.
 */
export const trainerEvent = (target: ProgChord, midis: Midi[] | null, bpm: number, at: number, pad: boolean): PlayEvent =>
  midis
    ? { source: 'trainerHit', at, skills: skillsForHeld(midis), correct: true, quality: trainerQuality(bpm), pad }
    : { source: 'trainerMiss', at, skills: skillsForChord(target), correct: false, quality: 0, pad };

/** Quality of a timing judgement. */
export const TIMING_QUALITY: Readonly<Record<Verdict, number>> = { genau: 1, 'früh': 0.6, 'spät': 0.6, daneben: 0.3 };

/** A chord change judged on the timing screen. */
export const timingEvent = (midis: Midi[], verdict: Verdict, at: number, pad: boolean): PlayEvent => ({
  source: 'timing',
  at,
  skills: skillsForHeld(midis),
  correct: true,
  quality: TIMING_QUALITY[verdict],
  pad,
});

// ── Reducer ──

/**
 * Evidence of one play event: per credited skill, weight = source weight × factor × pad
 * weight × (1 − R) on a success (floored at cfg.playMin), read against the skill as it is
 * before the event. A miss counts in full, but only when the skill's last evidence was a
 * success: after a miss (or any failure) further play misses are worth 0 until it is recalled
 * again. Evidence worth nothing is dropped by applyEvidence.
 */
export function playEvidence(state: LearnerState, ev: PlayEvent, cfg: ModelConfig = DEFAULT_MODEL): Evidence[] {
  return ev.skills.map(({ skill, factor }) => {
    const s = state.skills[skill];
    const fresh = ev.correct ? Math.max(cfg.playMin, 1 - recall(s, ev.at)) : s !== undefined && s.last > s.lastOk ? 0 : 1;
    const w = cfg.playW[ev.source] * factor * (ev.pad ? cfg.playPadWeight : 1) * fresh;
    return { skill, at: ev.at, x: ev.correct ? 1 : 0, w, f: ev.quality, kind: 'play', missWeight: 0 };
  });
}

/** Fold one play event into the skills; everything else in the state is untouched. */
export function applyPlay(state: LearnerState, ev: PlayEvent, cfg: ModelConfig = DEFAULT_MODEL): LearnerState {
  return applyEvidence(state, playEvidence(state, ev, cfg), cfg);
}
