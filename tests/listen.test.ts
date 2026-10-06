import { describe, expect, it } from './expect';
import {
  NoteTracker,
  PitchReading,
  STANDARD,
  createRng,
  detectPitch,
  frequencyToNote,
  midiName,
  midiToFrequency,
  tunerReading,
} from '../src/core';

const SR = 48000;
const FRAME = 2048;

/** Plucked-string stand-in: harmonics with falling amplitude, optional noise. */
function tone(freq: number, opts: { harmonics?: number[]; noise?: number; seed?: number; amp?: number } = {}): Float32Array {
  const { harmonics = [1, 0.7, 0.5, 0.35, 0.25, 0.15], noise = 0, seed = 1, amp = 0.3 } = opts;
  const rng = createRng(seed);
  const out = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i++) {
    let s = 0;
    harmonics.forEach((a, h) => (s += a * Math.sin((2 * Math.PI * freq * (h + 1) * i) / SR + h)));
    out[i] = amp * s / harmonics.length + noise * (rng.next() * 2 - 1);
  }
  return out;
}

const detectNote = (buf: Float32Array) => {
  const r = detectPitch(buf, SR);
  return r ? frequencyToNote(r.frequency) : null;
};

describe('pitch detection', () => {
  it('finds every note from low E (open) to high E fret 24 to within 3 cents', () => {
    for (let midi = 40; midi <= 88; midi++) {
      const n = detectNote(tone(midiToFrequency(midi)));
      if (!n || n.midi !== midi || Math.abs(n.cents) > 3) throw new Error(`${midiName(midi)}: got ${JSON.stringify(n)}`);
    }
  });
  it('reads detuning in cents (for the tuner)', () => {
    for (const off of [-30, -12, -4, 0, 5, 18, 40]) {
      const r = detectPitch(tone(midiToFrequency(40) * 2 ** (off / 1200)), SR)!;
      const reading = tunerReading(r.frequency, STANDARD);
      expect(reading.string.index).toBe(0);
      expect(Math.abs(reading.string.cents - off) < 1.5).toBe(true);
    }
  });
  it('does not jump an octave when the 2nd harmonic dominates', () => {
    for (const midi of [40, 45, 50, 55, 59, 64]) {
      const n = detectNote(tone(midiToFrequency(midi), { harmonics: [0.3, 1, 0.6, 0.4] }));
      expect(n?.midi).toBe(midi);
    }
  });
  it('copes with noise down to ~9 dB SNR', () => {
    for (let midi = 40; midi <= 88; midi += 4)
      for (const seed of [1, 2, 3]) expect(detectNote(tone(midiToFrequency(midi), { noise: 0.03, seed }))?.midi).toBe(midi);
  });
  it('stays silent rather than guessing when noise drowns the note', () => {
    for (let midi = 40; midi <= 88; midi += 4) {
      const n = detectNote(tone(midiToFrequency(midi), { noise: 0.05, seed: 4 }));
      if (n && n.midi !== midi) throw new Error(`${midiName(midi)} misheard as ${midiName(n.midi)}`);
    }
  });
  it('reports silence and pure noise as no pitch', () => {
    expect(detectPitch(new Float32Array(FRAME), SR)).toBe(null);
    const noise = tone(100, { harmonics: [0], noise: 0.3, seed: 9 });
    expect(detectPitch(noise, SR)).toBe(null);
  });
  it('respects a different concert pitch', () => {
    expect(frequencyToNote(432).midi).toBe(69);
    expect(Math.round(frequencyToNote(432).cents)).toBe(-32);
    expect(Math.round(frequencyToNote(432, 432).cents)).toBe(0);
  });
});

describe('tuner', () => {
  it('picks the nearest open string', () => {
    const at = (midi: number) => tunerReading(midiToFrequency(midi), STANDARD);
    expect(STANDARD.strings.map((m) => at(m).string.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(at(59).inTune).toBe(true);
    expect(tunerReading(midiToFrequency(59) * 2 ** (6 / 1200), STANDARD).inTune).toBe(false);
  });
});

describe('note tracker', () => {
  const frame = (midi: number, cents = 0, clarity = 0.95): PitchReading => ({
    frequency: midiToFrequency(midi) * 2 ** (cents / 1200), clarity, rms: 0.1,
  });
  // ~21 ms per frame at 1024-sample hops, 48 kHz.
  const feed = (t: NoteTracker, frames: (PitchReading | null)[]) =>
    frames.map((f, i) => t.push(f, i * 21)).filter((x) => x !== null).map((h) => h!.midi);

  it('reports a held note once, after it is stable', () => {
    const t = new NoteTracker();
    expect(feed(t, [frame(52), frame(52), frame(52), frame(52), frame(52, 3), frame(52, -2), frame(52)])).toEqual([52]);
  });
  it('ignores a pick-noise blip and a one-frame wobble', () => {
    const t = new NoteTracker();
    expect(feed(t, [frame(60, 0, 0.3), frame(52), frame(52), frame(52), frame(52), frame(53), frame(52), frame(52), frame(52), frame(52), frame(52)])).toEqual([52]);
  });
  it('reports a melody and repeated notes after a gap', () => {
    const t = new NoteTracker();
    const hold = (m: number) => Array.from({ length: 6 }, () => frame(m));
    expect(feed(t, [...hold(57), ...hold(60), null, ...hold(60), ...hold(64)])).toEqual([57, 60, 60, 64]);
  });
});
