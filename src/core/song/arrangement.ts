/*
 * Arrangement planner: the song as a row of sections with bar counts. Pure arithmetic – where
 * each part starts, how long the whole thing runs at the tempo, and a few rules of thumb.
 */

export type SectionKind = 'intro' | 'verse' | 'pre' | 'chorus' | 'build' | 'drop' | 'bridge' | 'break' | 'outro';

export interface Section {
  name: string;
  bars: number;
  kind: SectionKind;
}

export interface Arrangement {
  bpm: number;
  sections: Section[];
}

export interface Template {
  id: string;
  name: string;
  bpm: number;
  sections: Section[];
}

const s = (name: string, bars: number, kind: SectionKind): Section => ({ name, bars, kind });

export const TEMPLATES: Template[] = [
  { id: 'drop', name: 'Build-up & Drop', bpm: 140, sections: [s('Intro', 8, 'intro'), s('Build-up', 8, 'build'), s('Drop', 16, 'drop'), s('Outro', 4, 'outro')] },
  { id: 'drop2', name: 'Zwei Drops', bpm: 140, sections: [s('Intro', 8, 'intro'), s('Build-up', 8, 'build'), s('Drop 1', 16, 'drop'), s('Break', 8, 'break'), s('Build-up', 8, 'build'), s('Drop 2', 16, 'drop'), s('Outro', 4, 'outro')] },
  { id: 'ballad', name: 'Klavier-Ballade', bpm: 70, sections: [s('Intro', 2, 'intro'), s('A', 8, 'verse'), s('B', 8, 'chorus'), s('A', 8, 'verse'), s('Outro', 2, 'outro')] },
  { id: 'loopsong', name: 'Vom Loop zum Song', bpm: 90, sections: [s('Intro', 4, 'intro'), s('A', 8, 'verse'), s("A'", 8, 'verse'), s('B', 8, 'chorus'), s('A', 8, 'verse'), s('Outro', 4, 'outro')] },
  { id: 'pop', name: 'Pop: Strophe / Refrain', bpm: 100, sections: [s('Intro', 4, 'intro'), s('Strophe', 8, 'verse'), s('Pre', 4, 'pre'), s('Refrain', 8, 'chorus'), s('Strophe', 8, 'verse'), s('Pre', 4, 'pre'), s('Refrain', 8, 'chorus'), s('Bridge', 8, 'bridge'), s('Refrain', 8, 'chorus'), s('Outro', 4, 'outro')] },
  { id: 'lofi', name: 'Lo-fi', bpm: 80, sections: [s('Intro', 4, 'intro'), s('A', 8, 'verse'), s('B', 8, 'chorus'), s('A', 8, 'verse'), s('Outro', 4, 'outro')] },
  { id: 'dnb', name: 'Drum & Bass', bpm: 174, sections: [s('Intro', 16, 'intro'), s('Build-up', 8, 'build'), s('Drop 1', 16, 'drop'), s('Break', 8, 'break'), s('Drop 2', 16, 'drop'), s('Outro', 8, 'outro')] },
];

export const KIND_NAMES: Record<SectionKind, string> = {
  intro: 'Intro', verse: 'Strophe / A', pre: 'Pre-Chorus', chorus: 'Refrain / B', build: 'Build-up', drop: 'Drop', bridge: 'Bridge', break: 'Break', outro: 'Outro',
};

export const BEATS_PER_BAR = 4;
export const barSeconds = (bpm: number): number => (BEATS_PER_BAR * 60) / bpm;

export interface TimedSection {
  section: Section;
  index: number;
  /** 1-based bar where the section starts. */
  startBar: number;
  startSec: number;
  seconds: number;
}

export function timeline(a: Arrangement): TimedSection[] {
  const out: TimedSection[] = [];
  let bar = 1;
  let sec = 0;
  a.sections.forEach((section, index) => {
    const seconds = section.bars * barSeconds(a.bpm);
    out.push({ section, index, startBar: bar, startSec: sec, seconds });
    bar += section.bars;
    sec += seconds;
  });
  return out;
}

export const totalBars = (a: Arrangement): number => a.sections.reduce((n, x) => n + x.bars, 0);
export const totalSeconds = (a: Arrangement): number => totalBars(a) * barSeconds(a.bpm);

/** 62.4 → "1:02". */
export function fmtTime(sec: number): string {
  const whole = Math.round(sec);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** Bars needed for a target length at the tempo, rounded to whole bars. */
export const barsFor = (seconds: number, bpm: number): number => Math.max(1, Math.round(seconds / barSeconds(bpm)));

/** Rules of thumb for a loop-maker who wants a song. Empty when nothing stands out. */
export function tips(a: Arrangement): string[] {
  const out: string[] = [];
  const total = totalSeconds(a);
  if (a.sections.length === 0) return ['Noch kein Teil – wähl eine Vorlage oder leg mit „+ Teil“ los.'];
  for (const x of a.sections) {
    if (x.bars > 16) out.push(`„${x.name}“ hat ${x.bars} Takte: spätestens alle 8 Takte etwas ändern (Hat dazu, Filter auf, Melodie eine Oktave höher).`);
    else if (x.bars % 4 !== 0 && x.bars > 2) out.push(`„${x.name}“ hat ${x.bars} Takte – nicht durch 4 teilbar. Gewollt?`);
  }
  a.sections.forEach((x, i) => {
    if (x.kind === 'build' && a.sections[i + 1]?.kind !== 'drop') out.push(`Nach „${x.name}“ kommt kein Drop – ein Build-up braucht die Auflösung.`);
  });
  if (a.sections.length > 1 && a.sections[a.sections.length - 1].kind !== 'outro') out.push('Kein Outro: wie hört der Song auf? Zwei bis vier Takte nur Akkorde reichen.');
  if (total < 50) out.push(`Unter einer Minute (${fmtTime(total)}). Für 1:00 bei ${a.bpm} BPM brauchst du ${barsFor(60, a.bpm)} Takte.`);
  if (total > 200) out.push(`Über drei Minuten (${fmtTime(total)}). Erst kurz fertig machen, dann verlängern.`);
  return out;
}

/** "Intro · Takt 1–8 · 0:00" lines plus the total – for the song file and the coach. */
export function arrangementText(a: Arrangement): string {
  const lines = timeline(a).map((t) => `${t.section.name}: Takt ${t.startBar}–${t.startBar + t.section.bars - 1} (${t.section.bars}) · ab ${fmtTime(t.startSec)}`);
  return [`${a.bpm} BPM · ${totalBars(a)} Takte · ${fmtTime(totalSeconds(a))}`, ...lines].join('\n');
}
