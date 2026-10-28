import { chordType } from '../theory/chord';
import { degreeSemitones } from '../theory/interval';
import { Midi, toPc } from '../theory/pitch';
import { identifyHeld } from '../keys/heldChord';
import { ProgChord } from './analysis';

/*
 * Progression trainer: a progression at a slow click, the next chord shown a bar ahead, time to
 * find the keys. A clean round makes it a little faster; at the target tempo, rhythm variations
 * take over. Pure state and transitions; the screen owns the click and the keys.
 */

export interface Variation {
  id: string;
  name: string;
  /** Beats to strike in a 4/4 bar; .5 = the "and". */
  beats: number[];
  hint: string;
}

export const VARIATIONS: Variation[] = [
  { id: 'whole', name: 'Ganze', beats: [1], hint: 'Einmal auf die 1, dann halten.' },
  { id: 'half', name: 'Halbe', beats: [1, 3], hint: 'Auf 1 und 3 anschlagen.' },
  { id: 'push', name: 'Push', beats: [1, 2.5], hint: 'Auf 1 und auf die „und“ von 2 – der Neo-Soul-Schubser.' },
  { id: 'quarter', name: 'Viertel', beats: [1, 2, 3, 4], hint: 'Jeden Schlag, kurz anschlagen.' },
  { id: 'offbeat', name: 'Off-Beat', beats: [1.5, 2.5, 3.5, 4.5], hint: 'Nur die „unds“ – House-Stabs.' },
  { id: 'arp', name: 'Arpeggio', beats: [1, 2, 3, 4], hint: 'Töne einzeln von unten nach oben, einer pro Schlag.' },
];

export interface TrainerConfig {
  chords: ProgChord[];
  startBpm: number;
  targetBpm: number;
  /** Tempo gained per clean round. */
  stepBpm: number;
  beatsPerChord: number;
}

export interface TrainerState {
  config: TrainerConfig;
  bpm: number;
  /** 1-based round. */
  round: number;
  /** Chord slot the click is on right now. */
  index: number;
  /** Hit per chord in this round. */
  hits: boolean[];
  cleanRounds: number;
  /** Index into VARIATIONS; stays at 0 until the target tempo is reached. */
  variation: number;
  /** Every variation played clean at the target tempo. */
  done: boolean;
  /** Set for one bar when a round just ended: was it clean? */
  lastRound: 'clean' | 'missed' | null;
}

export const DEFAULT_TRAINER: Omit<TrainerConfig, 'chords'> = { startBpm: 50, targetBpm: 90, stepBpm: 4, beatsPerChord: 4 };

export function startTrainer(config: TrainerConfig): TrainerState {
  return { config, bpm: config.startBpm, round: 1, index: 0, hits: config.chords.map(() => false), cleanRounds: 0, variation: 0, done: false, lastRound: null };
}

/** The keys make the target chord: same root, every tone inside the chord, at least a triad. */
export function matchesChord(target: ProgChord, midis: Midi[]): boolean {
  const h = identifyHeld(midis);
  if (!h || h.rootPc !== target.rootPc) return false;
  const pcs = new Set(chordType(target.typeId).formula.map((d) => toPc(target.rootPc + degreeSemitones(d))));
  return [...new Set(midis.map(toPc))].every((pc) => pcs.has(pc));
}

export function onPlayed(s: TrainerState, midis: Midi[]): TrainerState {
  if (s.done || s.hits[s.index] || !matchesChord(s.config.chords[s.index], midis)) return s;
  return { ...s, hits: s.hits.map((h, i) => (i === s.index ? true : h)) };
}

/** The click reached the next chord slot. At the wrap, the round is judged. */
export function onSlot(s: TrainerState): TrainerState {
  if (s.done) return s;
  const next = s.index + 1;
  if (next < s.config.chords.length) return { ...s, index: next, lastRound: null };
  const clean = s.hits.every(Boolean);
  const atTarget = s.bpm >= s.config.targetBpm;
  let { bpm, variation, cleanRounds } = s;
  let done: boolean = s.done;
  if (clean) {
    cleanRounds++;
    if (!atTarget) bpm = Math.min(s.config.targetBpm, bpm + s.config.stepBpm);
    else if (variation + 1 < VARIATIONS.length) variation++;
    else done = true;
  }
  return { ...s, index: 0, round: s.round + 1, hits: s.config.chords.map(() => false), bpm, variation, cleanRounds, done, lastRound: clean ? 'clean' : 'missed' };
}

/** Manual tempo nudge between rounds. */
export const nudgeBpm = (s: TrainerState, delta: number): TrainerState => ({ ...s, bpm: Math.max(30, Math.min(200, s.bpm + delta)) });

export const nextChord = (s: TrainerState): ProgChord => s.config.chords[(s.index + 1) % s.config.chords.length];
