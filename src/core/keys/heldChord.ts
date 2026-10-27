import { CHORD_TYPES, ChordType, identifyChordPcs } from '../theory/chord';
import { degreeSemitones } from '../theory/interval';
import { Midi, PitchClass, toPc } from '../theory/pitch';

export interface HeldChord {
  rootPc: PitchClass;
  type: ChordType;
  /** Formula index of the lowest note: 0 root position, 1 first inversion, … */
  inversion: number;
  bassPc: PitchClass;
}

/**
 * Players leave out the perfect fifth of seventh and extended chords (C7#9 as C E Bb D#,
 * Eb13 as Eb Db F G C). Accept a type when everything held belongs to it, it has at least four
 * tones, and only its perfect fifth is missing.
 */
function withoutFifth(rootPc: PitchClass, pcs: PitchClass[]): ChordType | undefined {
  return CHORD_TYPES.find((t) => {
    if (t.formula.length < 4) return false;
    const tones = t.formula.map((d) => ({ d, pc: toPc(rootPc + degreeSemitones(d)) }));
    if (!pcs.every((p) => tones.some((x) => x.pc === p))) return false;
    const missing = tones.filter((x) => !pcs.includes(x.pc));
    return missing.length === 1 && missing[0].d.number === 5 && missing[0].d.acc === 0;
  });
}

/**
 * Name what is being held on a keyboard: pitch-class set → chord type, lowest note → inversion.
 * Symmetric chords (aug, dim7) fit several roots; the bass is preferred as root then.
 * Exact matches win; a voicing without its perfect fifth is the fallback.
 */
export function identifyHeld(midis: Midi[]): HeldChord | null {
  if (midis.length === 0) return null;
  const pcs = [...new Set(midis.map(toPc))];
  if (pcs.length < 3) return null;
  const bassPc = toPc(Math.min(...midis));
  const candidates = [bassPc, ...pcs.filter((p) => p !== bassPc)];
  for (const match of [identifyChordPcs, withoutFifth]) {
    for (const rootPc of candidates) {
      const type = match(rootPc, pcs);
      if (!type) continue;
      const inversion = type.formula.findIndex((d) => toPc(rootPc + degreeSemitones(d)) === bassPc);
      return { rootPc, type, inversion, bassPc };
    }
  }
  return null;
}
