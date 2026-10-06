import { Tuning } from '../guitar/tuning';
import { NoteReading, centsOff, frequencyToNote, midiToFrequency } from './pitch';

export interface TunerReading {
  frequency: number;
  /** Chromatic: nearest note anywhere. */
  note: NoteReading;
  /** Nearest open string of the tuning and how far off it is (cents, + = sharp). */
  string: { index: number; cents: number };
  /** Within the in-tune tolerance of that string. */
  inTune: boolean;
}

/** In-tune window in cents; ±3 is about what a good clip-on tuner shows as green. */
export const IN_TUNE_CENTS = 3;

export function tunerReading(frequency: number, tuning: Tuning, a4 = 440, tolerance = IN_TUNE_CENTS): TunerReading {
  let index = 0;
  let best = Infinity;
  tuning.strings.forEach((midi, i) => {
    const c = centsOff(frequency, midiToFrequency(midi, a4));
    if (Math.abs(c) < Math.abs(best)) {
      best = c;
      index = i;
    }
  });
  return {
    frequency,
    note: frequencyToNote(frequency, a4),
    string: { index, cents: best },
    inTune: Math.abs(best) <= tolerance,
  };
}
