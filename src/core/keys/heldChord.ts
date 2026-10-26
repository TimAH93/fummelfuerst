import { ChordType, identifyChordPcs } from '../theory/chord';
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
 * Name what is being held on a keyboard: pitch-class set → chord type, lowest note → inversion.
 * Symmetric chords (aug, dim7) fit several roots; the bass is preferred as root then.
 */
export function identifyHeld(midis: Midi[]): HeldChord | null {
  if (midis.length === 0) return null;
  const pcs = [...new Set(midis.map(toPc))];
  if (pcs.length < 3) return null;
  const bassPc = toPc(Math.min(...midis));
  const candidates = [bassPc, ...pcs.filter((p) => p !== bassPc)];
  for (const rootPc of candidates) {
    const type = identifyChordPcs(rootPc, pcs);
    if (!type) continue;
    const inversion = type.formula.findIndex((d) => toPc(rootPc + degreeSemitones(d)) === bassPc);
    return { rootPc, type, inversion, bassPc };
  }
  return null;
}
