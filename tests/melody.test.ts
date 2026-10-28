import { describe, expect, it } from './expect';
import { readMidi } from './midiRead';
import { GridNote, MelodyTracker, PitchReading, guessKey, keyLabel, quantizeMelody, shiftOctave, writeMidi } from '../src/core';

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const frame = (midi: number, clarity = 0.95): PitchReading => ({ frequency: hz(midi), clarity, rms: 0.1 });

/** Simulate 30 fps frames: each entry is [midi or null, duration ms]. Returns the tracker and when each part began. */
function sing(parts: [number | null, number][]): { t: MelodyTracker; at: number[] } {
  const t = new MelodyTracker();
  const at: number[] = [];
  let now = 0;
  for (const [midi, ms] of parts) {
    at.push(now);
    for (const end = now + ms; now < end; now += 33) t.push(midi === null ? null : frame(midi), now);
  }
  at.push(now);
  t.finish();
  return { t, at };
}
const near = (a: number, b: number) => Math.abs(a - b) < 70;

describe('melody tracker', () => {
  it('turns frames into notes with starts and ends', () => {
    const { t, at } = sing([[null, 200], [60, 500], [62, 500], [null, 300], [64, 400]]);
    expect(t.notes.map((n) => n.midi)).toEqual([60, 62, 64]);
    const [c, d, e] = t.notes;
    expect(near(c.startMs, at[1])).toBe(true); // starts where the pitch began, not where it became stable
    expect(near(c.endMs, at[2])).toBe(true);
    expect(near(d.startMs, at[2])).toBe(true);
    expect(near(d.endMs, at[3])).toBe(true); // ends when the sound stops, not after the gap
    expect(near(e.startMs, at[4])).toBe(true);
    expect(near(e.endMs, at[5])).toBe(true);
  });
  it('drops blips and bridges a short dropout inside a note', () => {
    const { t, at } = sing([[60, 600], [null, 60], [60, 600], [67, 40], [64, 500]]);
    expect(t.notes.map((n) => n.midi)).toEqual([60, 64]);
    expect(near(t.notes[0].endMs, at[3])).toBe(true);
  });
  it('reports the note sounding right now', () => {
    const t = new MelodyTracker();
    for (let now = 0; now < 300; now += 33) t.push(frame(65), now);
    expect(t.current()).toBe(65);
    for (let now = 300; now < 600; now += 33) t.push(null, now);
    expect(t.current()).toBe(null);
  });
});

describe('quantising to the grid', () => {
  const bpm = 120; // a beat = 500 ms, a 16th = 125 ms
  it('snaps starts and ends to 16ths and keeps the line monophonic', () => {
    const q = quantizeMelody([
      { midi: 60, startMs: 1010, endMs: 1480, cents: 0 },
      { midi: 62, startMs: 1530, endMs: 1990, cents: 0 },
      { midi: 64, startMs: 2020, endMs: 2040, cents: 0 }, // a blip
      { midi: 65, startMs: 2060, endMs: 3000, cents: 0 },
    ], bpm, 1000);
    expect(q).toEqual([
      { midi: 60, startBeat: 0, beats: 1 },
      { midi: 62, startBeat: 1, beats: 1 },
      { midi: 65, startBeat: 2, beats: 2 },
    ]);
  });
  it('trims an overlap and never writes a zero-length note', () => {
    const q = quantizeMelody([
      { midi: 60, startMs: 0, endMs: 1100, cents: 0 },
      { midi: 62, startMs: 900, endMs: 1500, cents: 0 },
      { midi: 64, startMs: 1500, endMs: 1570, cents: 0 },
    ], bpm, 0);
    expect(q).toEqual([{ midi: 60, startBeat: 0, beats: 1.75 }, { midi: 62, startBeat: 1.75, beats: 1.25 }, { midi: 64, startBeat: 3, beats: 0.25 }]);
  });
  it('shifts octaves and guesses a key', () => {
    const line: GridNote[] = [
      { midi: 65, startBeat: 0, beats: 2 }, { midi: 68, startBeat: 2, beats: 1 }, { midi: 70, startBeat: 3, beats: 1 },
      { midi: 72, startBeat: 4, beats: 2 }, { midi: 75, startBeat: 6, beats: 1 }, { midi: 65, startBeat: 7, beats: 3 },
    ];
    expect(shiftOctave(line, 1)[0].midi).toBe(77);
    expect(keyLabel(guessKey(line)!)).toBe('F minor');
    expect(keyLabel(guessKey([{ midi: 60, startBeat: 0, beats: 1 }, { midi: 64, startBeat: 1, beats: 1 }, { midi: 67, startBeat: 2, beats: 1 }, { midi: 60, startBeat: 3, beats: 2 }])!)).toBe('C major');
    expect(guessKey([])).toBe(null);
  });
});

describe('generic MIDI writer', () => {
  it('writes notes at their beats', () => {
    const m = readMidi(writeMidi([{ midi: 60, startBeat: 0, beats: 1 }, { midi: 62, startBeat: 1.5, beats: 0.25, velocity: 100 }], 100, 'Idee'));
    expect(m.tpq).toBe(96);
    expect(m.tempo).toBe(600000);
    expect(m.name).toBe('Idee');
    expect(m.notes).toEqual([
      { tick: 0, midi: 60, on: true, vel: 90 },
      { tick: 92, midi: 60, on: false, vel: 0 },
      { tick: 144, midi: 62, on: true, vel: 100 },
      { tick: 164, midi: 62, on: false, vel: 0 },
    ]);
  });
});
