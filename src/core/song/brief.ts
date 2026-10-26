import { KeyFit, ProgChord, analyzeProgression, isAmbiguous, keyLabel } from './analysis';

/** What the producer already has; the brief lists the rest as missing. */
export const PARTS = ['Drums', 'Bass', 'Akkorde', 'Melodie/Lead', 'Vocals', 'FX/Atmo'] as const;
export type Part = (typeof PARTS)[number];

export const STUCK = ['Vom Loop zum Song', 'Refrain', 'Strophe', 'Melodie', 'Übergänge', 'Ende'] as const;
export type Stuck = (typeof STUCK)[number];

export interface BriefInput {
  chords: ProgChord[];
  tempo?: number;
  bars?: number;
  parts: Part[];
  stuck?: Stuck;
  references?: string;
  note?: string;
}

const fmtNumerals = (f: KeyFit) => f.numerals.map((n) => n.roman).join(' – ');

/**
 * Plain-text song brief to paste into a Claude chat (the "Song-Coach" project).
 * Chord names are international (B = H, Bb = B) so nothing is ambiguous.
 */
export function buildBrief(input: BriefInput): string {
  const fits = analyzeProgression(input.chords);
  const best = fits[0];
  const lines: string[] = ['SONG-STECKBRIEF (aus Fummelfürst)', ''];

  if (best) {
    lines.push(`Akkorde (Loop): ${best.numerals.map((n) => n.symbol).join(' – ')}`);
    lines.push(`Tonart: ${keyLabel(best)} → ${fmtNumerals(best)}`);
    if (isAmbiguous(fits)) lines.push(`  oder: ${keyLabel(fits[1])} → ${fmtNumerals(fits[1])}`);
    const outside = best.numerals.filter((n) => !n.diatonic && !n.harmonicMinorDominant);
    lines.push(`Tonartfremd: ${outside.length ? outside.map((n) => `${n.symbol} (${n.roman})`).join(', ') : '–'}`);
  } else {
    lines.push('Akkorde (Loop): noch keine');
  }

  const meta = [input.tempo ? `${input.tempo} BPM` : null, input.bars ? `${input.bars} Takte` : null].filter(Boolean);
  if (meta.length) lines.push(`Loop: ${meta.join(' · ')}`);
  lines.push(`Vorhanden: ${input.parts.length ? input.parts.join(', ') : '–'}`);
  const missing = (['Drums', 'Bass', 'Akkorde', 'Melodie/Lead', 'Vocals', 'FX/Atmo'] as Part[]).filter((p) => !input.parts.includes(p));
  lines.push(`Fehlt: ${missing.length ? missing.join(', ') : '–'}`);
  if (input.references?.trim()) lines.push(`Referenz-Songs: ${input.references.trim().replace(/\s*\n\s*/g, '; ')}`);
  if (input.stuck) lines.push(`Wo ich hänge: ${input.stuck}`);
  if (input.note?.trim()) lines.push(`Notiz: ${input.note.trim()}`);
  lines.push('', 'Akkordnamen international (B = H, Bb = B). Gib mir bitte den ersten Schritt.');
  return lines.join('\n');
}
