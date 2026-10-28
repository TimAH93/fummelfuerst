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
 * Eb13 as Eb Db F G C), and the ninth of a 13th chord too (Ab13 as Ab Gb C F). Accept a type
 * when everything held belongs to it, it has at least four tones, its top extension is there,
 * and only the perfect fifth and/or the natural ninth are missing.
 */
function shellOf(rootPc: PitchClass, pcs: PitchClass[]): ChordType | undefined {
  return CHORD_TYPES.find((t) => {
    if (t.formula.length < 4) return false;
    const tones = t.formula.map((d) => ({ d, pc: toPc(rootPc + degreeSemitones(d)) }));
    if (!pcs.every((p) => tones.some((x) => x.pc === p))) return false;
    const missing = tones.filter((x) => !pcs.includes(x.pc));
    const top = tones[tones.length - 1];
    return missing.length > 0 && !missing.includes(top) && missing.every((x) => (x.d.number === 5 || x.d.number === 9) && x.d.acc === 0);
  });
}

/**
 * Name what is being held on a keyboard: pitch-class set → chord type, lowest note → inversion.
 * Symmetric chords (aug, dim7) fit several roots; the bass is preferred as root then.
 * Exact matches win; a shell voicing (fifth and/or ninth left out) is the fallback.
 */
export function identifyHeld(midis: Midi[]): HeldChord | null {
  if (midis.length === 0) return null;
  const pcs = [...new Set(midis.map(toPc))];
  if (pcs.length < 3) return null;
  const bassPc = toPc(Math.min(...midis));
  const candidates = [bassPc, ...pcs.filter((p) => p !== bassPc)];
  for (const match of [identifyChordPcs, shellOf]) {
    for (const rootPc of candidates) {
      const type = match(rootPc, pcs);
      if (!type) continue;
      const inversion = type.formula.findIndex((d) => toPc(rootPc + degreeSemitones(d)) === bassPc);
      return { rootPc, type, inversion, bassPc };
    }
  }
  return null;
}
