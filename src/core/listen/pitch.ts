import { Midi } from '../theory/pitch';

/**
 * Monophonic pitch detection (YIN, de Cheveigné & Kawahara 2002) on one block of
 * samples. Pure function: the audio layer feeds it Float32Array frames from the mic.
 */
export interface PitchOptions {
  /** Lowest frequency to look for. 60 Hz covers drop tunings down to B1. */
  minFreq?: number;
  /** Highest frequency. 1400 Hz covers fret 24 on the high E string. */
  maxFreq?: number;
  /** YIN absolute threshold; lower is stricter. */
  threshold?: number;
  /** Below this RMS the frame counts as silence. */
  minRms?: number;
}

export interface PitchReading {
  frequency: number;
  /** 0..1, how periodic the frame is (1 = perfect). */
  clarity: number;
  rms: number;
}

const DEFAULTS: Required<PitchOptions> = { minFreq: 60, maxFreq: 1400, threshold: 0.15, minRms: 0.01 };

export function detectPitch(buf: Float32Array, sampleRate: number, options: PitchOptions = {}): PitchReading | null {
  const { minFreq, maxFreq, threshold, minRms } = { ...DEFAULTS, ...options };
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  if (rms < minRms) return null;

  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.ceil(sampleRate / minFreq);
  const window = buf.length - tauMax;
  if (window < tauMax) throw new Error(`Frame too short: need ≥ ${2 * tauMax} samples for ${minFreq} Hz`);

  // Cumulative mean normalised difference, computed lazily: high notes stop early.
  const d = new Float32Array(tauMax + 2);
  d[0] = 1;
  let running = 0;
  let computed = 0;
  const at = (tau: number): number => {
    while (computed < tau) {
      const t = ++computed;
      let acc = 0;
      for (let j = 0; j < window; j++) {
        const diff = buf[j] - buf[j + t];
        acc += diff * diff;
      }
      running += acc;
      d[t] = running === 0 ? 1 : (acc * t) / running;
    }
    return d[tau];
  };

  // First dip under the threshold, followed down to its local minimum.
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (at(t) < threshold) {
      while (t + 1 <= tauMax && at(t + 1) < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  at(tau + 1);

  // Parabolic interpolation for sub-sample accuracy.
  const a = d[tau - 1], b = d[tau], c = d[tau + 1];
  const denom = a - 2 * b + c;
  const shift = denom === 0 ? 0 : (a - c) / (2 * denom);
  const frequency = sampleRate / (tau + shift);
  if (frequency < minFreq || frequency > maxFreq) return null;
  return { frequency, clarity: Math.max(0, Math.min(1, 1 - b)), rms };
}

export interface NoteReading {
  /** Nearest equal-tempered note. */
  midi: Midi;
  /** Deviation from it, −50..+50. */
  cents: number;
}

export const midiToFrequency = (midi: number, a4 = 440): number => a4 * 2 ** ((midi - 69) / 12);

export function frequencyToNote(frequency: number, a4 = 440): NoteReading {
  const exact = 69 + 12 * Math.log2(frequency / a4);
  const midi = Math.round(exact);
  return { midi, cents: (exact - midi) * 100 };
}

/** Cents from `target` to `frequency` (positive = sharp). */
export const centsOff = (frequency: number, target: number): number => 1200 * Math.log2(frequency / target);
