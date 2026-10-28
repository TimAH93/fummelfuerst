import { MAJOR_TONICS, MINOR_TONICS } from '../exercises/common';
import { KeyMode } from '../exercises/families/melodyChord';
import { Key } from '../song/analysis';
import { Midi, toPc } from '../theory/pitch';
import { scale, scalePcs } from '../theory/scale';
import { notePc, parseNote } from '../theory/spelling';
import { PitchReading, frequencyToNote } from './pitch';
import { TrackerOptions } from './tracker';

/*
 * Idea recorder: hum or whistle a line, get notes with lengths, snapped to a beat grid, as MIDI.
 * The tracker below is the monophonic note tracker plus note ends; the rest is grid arithmetic.
 */

export interface SungNote {
  midi: Midi;
  startMs: number;
  endMs: number;
  cents: number;
}

export interface MelodyOptions extends TrackerOptions {
  /** Silence or unclear frames longer than this end the note (ms). */
  gapMs?: number;
  /** Notes shorter than this are breath and noise (ms). */
  minLenMs?: number;
}

/**
 * Frames → notes with ends. A pitch has to hold for `minHoldMs` to start a note; the note runs
 * while frames keep matching it, survives a dropout shorter than `gapMs`, and ends at the last
 * matching frame when the pitch moves or the sound stops.
 */
export class MelodyTracker {
  readonly notes: SungNote[] = [];
  private readonly opt: Required<MelodyOptions>;
  private open: { midi: Midi; startMs: number; cents: number[] } | null = null;
  private candidate: { midi: Midi; since: number; cents: number[] } | null = null;
  private lastSame = 0;

  constructor(options: MelodyOptions = {}) {
    // Voices wander more than strings: a wider band and a shorter hold than the tuner uses.
    this.opt = { minHoldMs: 60, maxCents: 45, minClarity: 0.75, a4: 440, gapMs: 120, minLenMs: 90, ...options };
  }

  push(reading: PitchReading | null, timeMs: number): void {
    const note = reading && reading.clarity >= this.opt.minClarity ? frequencyToNote(reading.frequency, this.opt.a4) : null;
    const pitch = note && Math.abs(note.cents) <= this.opt.maxCents ? note : null;
    if (!pitch) {
      this.candidate = null;
      if (this.open && timeMs - this.lastSame > this.opt.gapMs) this.close();
      return;
    }
    if (this.open && pitch.midi === this.open.midi) {
      this.open.cents.push(pitch.cents);
      this.lastSame = timeMs;
      this.candidate = null;
      return;
    }
    if (!this.candidate || this.candidate.midi !== pitch.midi) this.candidate = { midi: pitch.midi, since: timeMs, cents: [] };
    this.candidate.cents.push(pitch.cents);
    if (timeMs - this.candidate.since < this.opt.minHoldMs) return;
    this.close();
    this.open = { midi: this.candidate.midi, startMs: this.candidate.since, cents: this.candidate.cents };
    this.lastSame = timeMs;
    this.candidate = null;
  }

  /** Close the open note at the last frame that matched it. */
  private close(): void {
    if (!this.open) return;
    const { midi, startMs, cents } = this.open;
    const endMs = Math.max(this.lastSame, startMs);
    if (endMs - startMs >= this.opt.minLenMs) {
      const sorted = [...cents].sort((a, b) => a - b);
      this.notes.push({ midi, startMs, endMs, cents: sorted[Math.floor(sorted.length / 2)] ?? 0 });
    }
    this.open = null;
  }

  /** The note sounding right now, for live display. */
  current(): Midi | null {
    return this.open?.midi ?? null;
  }

  finish(): SungNote[] {
    this.close();
    this.candidate = null;
    return this.notes;
  }
}

export interface GridNote {
  midi: Midi;
  startBeat: number;
  beats: number;
}

/**
 * Snap sung notes to a grid of `division` steps per beat (4 = 16ths). Starts and ends go to the
 * nearest step; anything shorter than half a step is dropped; overlaps are trimmed so the line
 * stays monophonic.
 */
export function quantizeMelody(notes: SungNote[], bpm: number, startMs: number, division = 4): GridNote[] {
  const stepMs = 60000 / bpm / division;
  const out: GridNote[] = [];
  for (const n of [...notes].sort((a, b) => a.startMs - b.startMs)) {
    const s = Math.round((n.startMs - startMs) / stepMs);
    let e = Math.round((n.endMs - startMs) / stepMs);
    if ((n.endMs - n.startMs) / stepMs < 0.5) continue;
    if (e <= s) e = s + 1;
    const prev = out[out.length - 1];
    if (prev && prev.startBeat * division + prev.beats * division > s) {
      const prevEnd = s - prev.startBeat * division;
      if (prevEnd <= 0) { out.pop(); } else prev.beats = prevEnd / division;
    }
    out.push({ midi: n.midi, startBeat: Math.max(0, s) / division, beats: (e - Math.max(0, s)) / division });
  }
  return out;
}

export const shiftOctave = (notes: GridNote[], octaves: number): GridNote[] => notes.map((n) => ({ ...n, midi: n.midi + 12 * octaves }));

/**
 * The key whose scale holds the most of the line (by length). Ties go to the key whose tonic
 * carries the most weight, then to the last and the first note.
 */
export function guessKey(notes: GridNote[]): Key | null {
  if (notes.length === 0) return null;
  const weight = new Array<number>(12).fill(0);
  for (const n of notes) weight[toPc(n.midi)] += n.beats;
  const heaviest = weight.indexOf(Math.max(...weight));
  const keys: [string, KeyMode][] = [...MAJOR_TONICS.map((t) => [t, 'major'] as [string, KeyMode]), ...MINOR_TONICS.map((t) => [t, 'naturalMinor'] as [string, KeyMode])];
  let best: { key: Key; score: number } | null = null;
  for (const [t, mode] of keys) {
    const tonic = parseNote(t);
    const pcs = scalePcs(scale(tonic, mode));
    let score = pcs.reduce((a, pc) => a + weight[pc], 0);
    if (notePc(tonic) === heaviest) score += 0.5;
    if (notePc(tonic) === toPc(notes[notes.length - 1].midi)) score += 0.25;
    if (notePc(tonic) === toPc(notes[0].midi)) score += 0.25;
    if (!best || score > best.score) best = { key: { tonic, mode }, score };
  }
  return best?.key ?? null;
}

export interface MidiEvent {
  midi: Midi;
  startBeat: number;
  beats: number;
  velocity?: number;
}

const TPQ = 96;

function vlq(n: number): number[] {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}

/** Standard MIDI file, format 0, 96 ticks per quarter, 4/4, one named track. */
export function writeMidi(events: MidiEvent[], bpm: number, name: string): Uint8Array {
  const raw: [tick: number, status: number, a: number, b: number][] = [];
  for (const e of events) {
    const on = Math.round(e.startBeat * TPQ);
    const off = Math.max(on + 1, Math.round((e.startBeat + e.beats) * TPQ) - 4);
    raw.push([on, 0x90, e.midi, e.velocity ?? 90], [off, 0x80, e.midi, 0]);
  }
  raw.sort((a, b) => a[0] - b[0] || (a[1] === 0x80 ? -1 : 1));
  const usPerQuarter = Math.round(60e6 / bpm);
  const title = Array.from(new TextEncoder().encode(name));
  const body: number[] = [
    0, 0xff, 0x51, 3, (usPerQuarter >> 16) & 255, (usPerQuarter >> 8) & 255, usPerQuarter & 255,
    0, 0xff, 0x58, 4, 4, 2, 24, 8,
    0, 0xff, 0x03, ...vlq(title.length), ...title,
  ];
  let last = 0;
  for (const [t, status, a, b] of raw) {
    body.push(...vlq(t - last), status, a, b);
    last = t;
  }
  body.push(0, 0xff, 0x2f, 0);
  const be32 = (n: number) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  return Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (TPQ >> 8) & 255, TPQ & 255,
    0x4d, 0x54, 0x72, 0x6b, ...be32(body.length), ...body,
  ]);
}
