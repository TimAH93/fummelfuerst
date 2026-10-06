import { Midi } from '../theory/pitch';
import { PitchReading, frequencyToNote } from './pitch';

/** A note the player actually played: held stably long enough to count. */
export interface HeardNote {
  midi: Midi;
  /** Median deviation over the held frames. */
  cents: number;
  /** Time (ms) the note became stable. */
  at: number;
}

export interface TrackerOptions {
  /** How long a pitch must hold before it counts (ms). Filters pick noise and slides. */
  minHoldMs?: number;
  /** Frames further off than this from the nearest note are treated as unstable. */
  maxCents?: number;
  /** Frames below this clarity count as noise. */
  minClarity?: number;
  a4?: number;
}

/**
 * Turns a stream of per-frame pitch readings into discrete played notes.
 * Each note is reported once; a new note needs a different pitch or a gap first.
 */
export class NoteTracker {
  private readonly opt: Required<TrackerOptions>;
  private candidate: { midi: Midi; since: number; cents: number[] } | null = null;
  private reported: Midi | null = null;

  constructor(options: TrackerOptions = {}) {
    this.opt = { minHoldMs: 80, maxCents: 35, minClarity: 0.8, a4: 440, ...options };
  }

  /** Feed one frame; returns a HeardNote the moment a note becomes stable. */
  push(reading: PitchReading | null, timeMs: number): HeardNote | null {
    if (!reading || reading.clarity < this.opt.minClarity) {
      this.candidate = null;
      this.reported = null;
      return null;
    }
    const { midi, cents } = frequencyToNote(reading.frequency, this.opt.a4);
    if (Math.abs(cents) > this.opt.maxCents) {
      this.candidate = null;
      return null;
    }
    if (!this.candidate || this.candidate.midi !== midi) {
      this.candidate = { midi, since: timeMs, cents: [] };
    }
    this.candidate.cents.push(cents);
    if (this.reported === midi || timeMs - this.candidate.since < this.opt.minHoldMs) return null;
    this.reported = midi;
    const sorted = [...this.candidate.cents].sort((a, b) => a - b);
    return { midi, cents: sorted[Math.floor(sorted.length / 2)], at: timeMs };
  }

  reset(): void {
    this.candidate = null;
    this.reported = null;
  }
}
