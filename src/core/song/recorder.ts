import { chordType } from '../theory/chord';
import { Midi } from '../theory/pitch';
import { noteName, pcToNote } from '../theory/spelling';
import { Key, ProgChord, keyScale, spellInKey } from './analysis';
import { EMPTY_JAM, JamState, jamStep } from './jam';

/*
 * Progression recorder: chords played on the keyboard become a chord sheet with lengths,
 * and a MIDI file FL Studio can read. Lengths come from the clock between chord changes
 * (snapped to 1 / 2 / 4 / 8 / 16 beats) and can be cycled by hand.
 */

export interface RecordedChord {
  chord: ProgChord;
  /** The keys as played – the MIDI file keeps the voicing. */
  midis: Midi[];
  /** Clock time of the first press, ms. */
  at: number;
  /** Length in beats; null while the chord is still the latest one. */
  beats: number | null;
}

export interface Recording {
  chords: RecordedChord[];
  jam: JamState;
}

export const EMPTY_RECORDING: Recording = { chords: [], jam: EMPTY_JAM };
export const BEAT_STEPS = [1, 2, 4, 8, 16] as const;
const DEFAULT_BEATS = 4;

/** Nearest of 1 / 2 / 4 / 8 / 16 beats on a log scale, so 3.4 bars reads as 4, 1.4 as 1. */
export function snapBeats(ms: number, bpm: number): number {
  const beats = (ms / 60000) * bpm;
  if (!(beats > 0)) return DEFAULT_BEATS;
  return BEAT_STEPS.reduce((best, b) => (Math.abs(Math.log(beats / b)) < Math.abs(Math.log(beats / best)) ? b : best), BEAT_STEPS[0] as number);
}

export const cycleBeats = (b: number): number => BEAT_STEPS[(BEAT_STEPS.indexOf(b as (typeof BEAT_STEPS)[number]) + 1) % BEAT_STEPS.length];

/**
 * Feed a settled set of held keys with the clock. A new chord closes the previous one (its
 * length is the time until now, snapped; a plain 4 beats without a tempo); a chord that grows in
 * place (Fm → Fm9) is replaced, not appended.
 */
export function recordStep(rec: Recording, settled: Midi[], nowMs: number, bpm?: number): Recording {
  const jam = jamStep(rec.jam, settled);
  if (jam === rec.jam || !jam.chord) return rec;
  const chords = [...rec.chords];
  const last = chords[chords.length - 1];
  if (jam.history.length === rec.jam.history.length) {
    if (!last || sameProgChord(last.chord, jam.chord)) return { ...rec, jam };
    chords[chords.length - 1] = { ...last, chord: jam.chord, midis: jam.chordMidis };
  } else if (jam.history.length > rec.jam.history.length) {
    if (last) chords[chords.length - 1] = { ...last, beats: last.beats ?? (bpm ? snapBeats(nowMs - last.at, bpm) : DEFAULT_BEATS) };
    chords.push({ chord: jam.chord, midis: jam.chordMidis, at: nowMs, beats: null });
  } else return rec;
  return { chords, jam };
}

/** Close the last chord: as long as the one before it, or a bar. */
export function finishRecording(rec: Recording): RecordedChord[] {
  const n = rec.chords.length;
  if (n === 0) return [];
  const last = rec.chords[n - 1];
  if (last.beats !== null) return rec.chords;
  const before = n > 1 ? rec.chords[n - 2].beats : null;
  return [...rec.chords.slice(0, -1), { ...last, beats: before ?? DEFAULT_BEATS }];
}

export const sameProgChord = (a: ProgChord, b: ProgChord): boolean => a.rootPc === b.rootPc && a.typeId === b.typeId;

/** A B C D A B C D → period 4, twice. Null when the sequence does not repeat whole. */
export function loopOf(chords: ProgChord[]): { period: number; times: number } | null {
  const n = chords.length;
  for (let p = 1; p < n; p++) {
    if (n % p !== 0) continue;
    if (chords.every((c, i) => sameProgChord(c, chords[i % p]))) return { period: p, times: n / p };
  }
  return null;
}

/** "Dbmaj9 C7#9 Fm9 Ebm9 Ab13" – spelled for the key when one is given, flats otherwise. */
export function progressionText(chords: ProgChord[], key?: Key | null): string {
  return chords
    .map((c) => noteName(key ? spellInKey(keyScale(key), c.rootPc).note : pcToNote(c.rootPc, 'flat')) + chordType(c.typeId).symbol)
    .join(' ');
}

export const totalBeats = (chords: RecordedChord[]): number => chords.reduce((a, c) => a + (c.beats ?? DEFAULT_BEATS), 0);

const TPQ = 96;

function vlq(n: number): number[] {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}

/**
 * Standard MIDI file (format 0, 96 ticks per quarter) with the chords as played, one after the
 * other, each held for its length. FL Studio reads it straight into a piano roll.
 */
export function progressionMidi(chords: RecordedChord[], bpm: number, name = 'Akkordfolge'): Uint8Array {
  const events: [tick: number, status: number, a: number, b: number][] = [];
  let tick = 0;
  for (const c of chords) {
    const len = (c.beats ?? DEFAULT_BEATS) * TPQ;
    const midis = [...new Set(c.midis)].sort((a, b) => a - b);
    midis.forEach((m, i) => {
      events.push([tick + i * 3, 0x90, m, 90]);
      events.push([tick + len - 4, 0x80, m, 0]);
    });
    tick += len;
  }
  events.sort((a, b) => a[0] - b[0] || (a[1] === 0x80 ? -1 : 1));
  const usPerQuarter = Math.round(60e6 / bpm);
  const title = Array.from(new TextEncoder().encode(name));
  const body: number[] = [
    0, 0xff, 0x51, 3, (usPerQuarter >> 16) & 255, (usPerQuarter >> 8) & 255, usPerQuarter & 255,
    0, 0xff, 0x58, 4, 4, 2, 24, 8,
    0, 0xff, 0x03, ...vlq(title.length), ...title,
  ];
  let last = 0;
  for (const [t, status, a, b] of events) {
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
