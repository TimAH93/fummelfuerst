import { RIGHT_HAND, VoicingType } from '../exercises/families/keysVoicing';
import { ProgChord, chordFromHeld } from '../song/analysis';
import { chordType } from '../theory/chord';
import { degreeSemitones, parseFormula } from '../theory/interval';
import { Midi, toPc } from '../theory/pitch';

/*
 * The FLkey's User Chord pads: 16 pads, each holding a chord the device never names. The app
 * keeps a map of what is on them, recognises a pad from its notes, and spells out how to store one.
 */

export const PAD_COUNT = 16;
/** The 37 keys at the FLkey's default octave: C3–C6 as the app's keyboard labels them. */
export const FLKEY_LOW = 48;
export const FLKEY_HIGH = 84;

export interface Pad {
  /** The keys the pad plays, as stored on the device. */
  midis: Midi[];
}

export type PadBank = (Pad | null)[];

export const emptyBank = (): PadBank => Array.from({ length: PAD_COUNT }, () => null);

export const padChord = (p: Pad | null): ProgChord | null => (p ? chordFromHeld(p.midis) : null);

const sameSet = (a: Midi[], b: Midi[]): boolean => a.length === b.length && [...a].sort((x, y) => x - y).every((m, i) => m === [...b].sort((x, y) => x - y)[i]);

/** Which pad (0-based) plays exactly these keys, if any. */
export function padFor(bank: PadBank, midis: Midi[]): number | null {
  const i = bank.findIndex((p) => p !== null && sameSet(p.midis, midis));
  return i < 0 ? null : i;
}

export interface PadStep {
  midi: Midi;
  /** Octave shifts needed on the device before pressing the key: −1 = Octave – once, +1 = Octave + once. */
  octave: number;
  /** The key to press at that octave setting, inside the 37 keys. */
  key: Midi;
}

/**
 * Keys to press, lowest first, with the octave shift each needs. On an FLkey the pad can be held
 * while Octave ± is pressed, so a bass below C3 is reachable.
 */
export function padSteps(p: Pad): PadStep[] {
  return [...p.midis]
    .sort((a, b) => a - b)
    .map((midi) => {
      let octave = 0;
      let key = midi;
      while (key < FLKEY_LOW) { key += 12; octave--; }
      while (key > FLKEY_HIGH) { key -= 12; octave++; }
      return { midi, octave, key };
    });
}

/**
 * A voicing that fits the 37 keys without octave shifting: root in C3–B3, the right hand from C4
 * – the neo-soul shape (3 5 7 9 …) where the app knows one, close position above the root otherwise.
 */
export function suggestVoicing(c: ProgChord): Midi[] {
  const bass = FLKEY_LOW + toPc(c.rootPc);
  const shape = RIGHT_HAND[c.typeId as VoicingType];
  const degrees = shape ? parseFormula(shape) : chordType(c.typeId).formula.slice(1);
  const out = [bass];
  let floor = 60;
  for (const d of degrees) {
    const pc = toPc(c.rootPc + degreeSemitones(d));
    let m = floor + ((pc - toPc(floor) + 12) % 12);
    if (m <= out[out.length - 1]) m += 12;
    out.push(m);
    floor = m + 1;
  }
  return out;
}
