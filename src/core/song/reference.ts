import { BEATS_PER_BAR, Section, SectionKind } from './arrangement';

/*
 * Reference map: while a reference track plays, tap the tempo, then tap at every section change.
 * The taps become sections with bar counts – the producer's version of transcribing a form.
 */

/** Tempo from the last taps: median interval of up to eight, so one late tap does not matter. Null below three taps. */
export function tapTempo(tapsMs: number[]): number | null {
  const taps = tapsMs.slice(-8);
  if (taps.length < 3) return null;
  const gaps = taps.slice(1).map((t, i) => t - taps[i]).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  if (median <= 0) return null;
  return Math.round(60000 / median);
}

/**
 * Bars between taps at a tempo. Whole bars; anything within a bar of a multiple of four snaps to
 * it, because that is how sections are built – a tap is never that precise anyway.
 */
export function barsBetween(fromMs: number, toMs: number, bpm: number): number {
  const barMs = (BEATS_PER_BAR * 60000) / bpm;
  const raw = Math.max(1, Math.round((toMs - fromMs) / barMs));
  const four = Math.round(raw / 4) * 4;
  return four >= 4 && Math.abs(raw - four) <= 1 ? four : raw;
}

const GUESS: Record<number, SectionKind> = { 0: 'intro' };

/**
 * Sections from section-change taps: the first tap is the first downbeat, each further tap a
 * change, `endMs` the end. Names are placeholders to be renamed; the first is an intro, the last
 * an outro, the rest alternate verse and chorus as a starting guess.
 */
export function sectionsFromTaps(tapsMs: number[], endMs: number, bpm: number): Section[] {
  if (tapsMs.length === 0 || bpm <= 0) return [];
  const edges = [...tapsMs, endMs];
  const n = tapsMs.length;
  return tapsMs.map((t, i) => {
    const kind: SectionKind = i === 0 && n > 1 ? GUESS[0] : i === n - 1 && n > 2 ? 'outro' : i % 2 === 1 ? 'verse' : 'chorus';
    const names: Record<SectionKind, string> = { intro: 'Intro', verse: 'Strophe', chorus: 'Refrain', outro: 'Outro', pre: 'Pre', build: 'Build-up', drop: 'Drop', bridge: 'Bridge', break: 'Break' };
    return { name: n === 1 ? 'Teil' : names[kind], bars: barsBetween(t, edges[i + 1], bpm), kind };
  });
}
