import { describe, expect, it } from './expect';
import { readMidi } from './midiRead';
import {
  EMPTY_RECORDING, Recording, cycleBeats, finishRecording, loopOf, parseNote, parseProgression, progressionMidi, progressionText,
  recordStep, snapBeats, totalBeats,
} from '../src/core';

const PAD1 = [49, 53, 56, 60, 63]; // Dbmaj9
const PAD2 = [48, 52, 58, 63]; // C7#9
const PAD3 = [53, 56, 60, 63, 67]; // Fm9
const PAD4 = [51, 54, 58, 61, 65]; // Ebm9
const PAD5 = [44, 54, 60, 65]; // Ab13
const BAR = (60000 / 82) * 4; // one bar at 82 BPM

describe('beat snapping', () => {
  it('snaps clock time to 1 / 2 / 4 / 8 / 16 beats on a log scale', () => {
    expect(snapBeats(BAR, 82)).toBe(4);
    expect(snapBeats(BAR * 0.85, 82)).toBe(4);
    expect(snapBeats(BAR * 0.6, 82)).toBe(2);
    expect(snapBeats(BAR * 2.2, 82)).toBe(8);
    expect(snapBeats(BAR * 0.2, 82)).toBe(1);
    expect(snapBeats(BAR * 9, 82)).toBe(16);
    expect(snapBeats(0, 82)).toBe(4);
  });
  it('cycles lengths by hand', () => {
    expect([4, 8, 16, 1].map(cycleBeats)).toEqual([8, 16, 1, 2]);
  });
});

describe('recording', () => {
  it('turns pad presses into a chord sheet with lengths from the clock', () => {
    let r: Recording = EMPTY_RECORDING;
    r = recordStep(r, PAD1, 0, 82);
    r = recordStep(r, PAD2, BAR, 82);
    r = recordStep(r, PAD3, BAR * 2.05, 82);
    r = recordStep(r, PAD4, BAR * 3, 82);
    r = recordStep(r, PAD5, BAR * 3.5, 82);
    expect(r.chords.map((c) => c.beats)).toEqual([4, 4, 4, 2, null]);
    const done = finishRecording(r);
    expect(done.map((c) => c.beats)).toEqual([4, 4, 4, 2, 2]);
    expect(progressionText(done.map((c) => c.chord))).toBe('Dbmaj9 C7#9 Fm9 Ebm9 Ab13');
    expect(progressionText(done.map((c) => c.chord), { tonic: parseNote('C#'), mode: 'major' })).toBe('C#maj9 B#7#9 E#m9 D#m9 G#13');
    expect(totalBeats(done)).toBe(16);
  });
  it('keeps melody keys and repeats out of the sheet, and grows a chord in place', () => {
    let r: Recording = EMPTY_RECORDING;
    r = recordStep(r, [53, 56, 60], 0, 82); // Fm
    r = recordStep(r, [53, 56, 60, 63, 67], 200, 82); // grows to Fm9
    r = recordStep(r, [...PAD3, 80], 500, 82); // Ab on top: melody
    r = recordStep(r, [60, 62, 67], 900, 82); // sus2: unknown, ignored
    r = recordStep(r, PAD3.map((m) => m + 12), BAR, 82); // same chord again
    expect(r.chords.length).toBe(1);
    expect(r.chords[0].chord.typeId).toBe('m9');
    expect(r.chords[0].midis).toEqual([53, 56, 60, 63, 67]);
    expect(finishRecording(r)[0].beats).toBe(4);
    expect(finishRecording(EMPTY_RECORDING)).toEqual([]);
  });
  it('lengths default to a bar without a tempo', () => {
    let r: Recording = EMPTY_RECORDING;
    r = recordStep(r, PAD1, 0);
    r = recordStep(r, PAD2, 12345);
    expect(r.chords[0].beats).toBe(4);
  });
});

describe('loops', () => {
  it('finds the repeating unit', () => {
    expect(loopOf(parseProgression('Am F C G Am F C G'))).toEqual({ period: 4, times: 2 });
    expect(loopOf(parseProgression('Am F C G Am F C'))).toBe(null);
    expect(loopOf(parseProgression('Am F C G'))).toBe(null);
    expect(loopOf(parseProgression('C G C G C G'))).toEqual({ period: 2, times: 3 });
  });
});

describe('MIDI export', () => {
  it('writes the voicings one after the other at the tempo', () => {
    let r: Recording = EMPTY_RECORDING;
    r = recordStep(r, PAD1, 0, 82);
    r = recordStep(r, PAD4, BAR, 82);
    r = recordStep(r, PAD5, BAR * 1.5, 82);
    const bytes = progressionMidi(finishRecording(r), 82, 'Test');
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x4d, 0x54, 0x68, 0x64]);
    const m = readMidi(bytes);
    expect(m.tpq).toBe(96);
    expect(m.tempo).toBe(Math.round(60e6 / 82));
    expect(m.name).toBe('Test');
    const ons = m.notes.filter((n) => n.on);
    expect(ons.length).toBe(PAD1.length + PAD4.length + PAD5.length);
    expect(ons.filter((n) => n.tick < 96 * 4).map((n) => n.midi)).toEqual(PAD1); // bar 1: Dbmaj9
    expect(ons.slice(0, 5).map((n) => n.tick)).toEqual([0, 3, 6, 9, 12]); // a light roll upwards
    expect(ons.filter((n) => n.tick >= 96 * 4 && n.tick < 96 * 6).map((n) => n.midi)).toEqual(PAD4); // beats 5–6
    expect(ons.filter((n) => n.tick >= 96 * 6).map((n) => n.midi)).toEqual(PAD5); // beats 7–8
    const lastOff = Math.max(...m.notes.filter((n) => !n.on).map((n) => n.tick));
    expect(lastOff).toBe(96 * 8 - 4);
  });
});
