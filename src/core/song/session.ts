/*
 * Session planning: a deadline, a few blocks, a genre with constraints, and a topic that rotates
 * so the skills one avoids (arrangement, mix) get their turn. Output over polish.
 */

export type BlockKind = 'beat' | 'finish' | 'reference' | 'impro' | 'export' | 'listen';

export interface Block {
  name: string;
  minutes: number;
  kind: BlockKind;
  /** One line on what "done" means for this block. */
  done: string;
}

export interface Plan {
  id: string;
  name: string;
  blocks: Block[];
}

const b = (name: string, minutes: number, kind: BlockKind, done: string): Block => ({ name, minutes, kind, done });

export const PLANS: Plan[] = [
  {
    id: 'three-beats', name: '3 Beats · 50 min',
    blocks: [
      b('Beat 1', 15, 'beat', '8 Takte: Drums, Bass, Akkorde – egal wie'),
      b('Beat 2', 15, 'beat', 'anderes Tempo oder andere Pads, wieder 8 Takte'),
      b('Beat 3', 15, 'beat', 'der schnellste: erste Idee nehmen'),
      b('Export', 5, 'export', 'alle drei als MP3, Namen mit Datum'),
    ],
  },
  {
    id: 'finish', name: '1 Track fertig · 45 min',
    blocks: [
      b('Anhören + Plan', 5, 'listen', 'letzten Stand hören, Arrangement-Planer offen'),
      b('Arrangement', 20, 'finish', 'alle Teile liegen in der Playlist, Intro bis Outro'),
      b('Mix grob', 10, 'finish', 'Lautstärken: Melodie vorn, Akkorde hinten, nichts clippt'),
      b('Export', 10, 'export', 'MP3, auf dem Handy anhören'),
    ],
  },
  {
    id: 'reference', name: 'Referenz + Track · 45 min',
    blocks: [
      b('Referenz nachbauen', 15, 'reference', 'Teilwechsel getippt, Vorlage im Planer'),
      b('Track auf der Vorlage', 25, 'beat', 'jeder Teil hat Material, auch wenn es wenig ist'),
      b('Export', 5, 'export', 'MP3, fertig oder nicht'),
    ],
  },
  {
    id: 'impro-beat', name: 'Impro + Beat · 30 min',
    blocks: [
      b('Improvisieren', 10, 'impro', '5 Töne, erst summen, Call & Response; eine Phrase im Score Log sichern'),
      b('Beat um die Phrase', 15, 'beat', 'Phrase wird die Melodie, Drums und Bass drunter'),
      b('Export', 5, 'export', 'MP3'),
    ],
  },
  {
    id: 'quick', name: 'Kurz · 15 min',
    blocks: [
      b('Ein Loop', 12, 'beat', '4 Takte, drei Spuren, erste Idee'),
      b('Export', 3, 'export', 'MP3, auch wenn es nur ein Loop ist'),
    ],
  },
];

export const planById = (id: string): Plan => PLANS.find((p) => p.id === id) ?? PLANS[0];

export const planMinutes = (p: Plan): number => p.blocks.reduce((n, x) => n + x.minutes, 0);

export interface Genre {
  id: string;
  name: string;
  bpm: [number, number];
  /** What the beat does. */
  feel: string;
  /** The three or four things a track in this genre needs. */
  elements: string[];
  /** The one constraint that keeps it quick. */
  constraint: string;
  /** Arrangement template to start from. */
  templateId: string;
}

/** Genres that are simple to build and teach the producing moves; no vocals needed. */
export const GENRES: Genre[] = [
  { id: 'lofi', name: 'Lo-fi Hip-Hop', bpm: [70, 90], feel: 'schleppend, Swing', elements: ['2–4 Neo-Soul-Akkorde (deine Pads)', 'staubige Drums, Snare etwas spät', 'Bass auf dem Grundton', 'Vinyl-Rauschen oder Regen'], constraint: 'ein Piano/E-Piano-Preset, Stock-Drums', templateId: 'lofi' },
  { id: 'house', name: 'House', bpm: [120, 126], feel: 'Kick auf jeder Zählzeit, Off-Hat', elements: ['Kick 1-2-3-4, Hat dazwischen, Clap auf 2 und 4', 'Chord-Stabs kurz', 'Bass: Grundton + Oktave', 'ein Filter, das auf- und zugeht'], constraint: 'ein FLEX-Pluck, ein Bass-Preset', templateId: 'drop2' },
  { id: 'trap', name: 'Trap', bpm: [130, 150], feel: 'Half-Time: Snare auf 3', elements: ['808 auf den Grundtönen, gleitend', 'Hat-Rolls (Note Repeat)', 'dunkle Melodie, 2 Akkorde', 'Clap/Snare auf 3'], constraint: 'FLEX 808, ein Lead, Stock-Drums', templateId: 'drop' },
  { id: 'dnb', name: 'Drum & Bass', bpm: [170, 176], feel: 'Two-Step: Kick 1 und 11, Snare 5 und 13', elements: ['Break-Pattern', 'Reese- oder Sub-Bass', 'Pad-Akkorde lang', 'Riser vor dem Drop'], constraint: 'Liquid-DnB-Pack, nichts anderes', templateId: 'dnb' },
  { id: 'synthwave', name: 'Synthwave', bpm: [100, 115], feel: 'gerade, Gated Snare', elements: ['Arpeggio (FLEX-Arp)', 'breites Pad', 'Bass in Achteln', 'große Snare mit Hall'], constraint: 'ein Arp-Preset, ein Pad, Stock-Drums', templateId: 'pop' },
  { id: 'hyperpop', name: 'Hyperpop', bpm: [150, 170], feel: 'Half-Time-Trap-Drums, alles zu laut', elements: ['Supersaw-Akkorde', 'Rise + Drop', '808 verzerrt', 'gepitchte Vocal-Schnipsel (später)'], constraint: 'Pandora-Presets, kein Sounddesign', templateId: 'drop' },
  { id: 'ballad', name: 'Klavier-Ballade', bpm: [60, 80], feel: 'frei, Pedal', elements: ['Akkorde links, Melodie rechts', 'ein zweiter Teil mit einer harmonischen Änderung', 'Intro und Ende aus dem Material'], constraint: 'nur Piano in Blue', templateId: 'ballad' },
];

export const genreById = (id: string): Genre | undefined => GENRES.find((g) => g.id === id);

/** A seeded pick, so "Zufall" is testable. */
export const pickGenre = (seed: number): Genre => GENRES[Math.abs(Math.floor(seed)) % GENRES.length];

export const TOPICS = ['Drums', 'Bass', 'Arrangement', 'Mix', 'Melodie'] as const;
export type Topic = (typeof TOPICS)[number];

export interface SessionEntry {
  at: number;
  planId: string;
  genreId?: string;
  topic: Topic;
  blocksDone: number;
  blocks: number;
  exported: number;
}

/** The topic that has waited longest – never-used ones first, in list order. */
export function suggestTopic(log: SessionEntry[]): Topic {
  const last = new Map<Topic, number>();
  for (const e of log) last.set(e.topic, Math.max(last.get(e.topic) ?? 0, e.at));
  return [...TOPICS].sort((a, b) => (last.get(a) ?? -1) - (last.get(b) ?? -1) || TOPICS.indexOf(a) - TOPICS.indexOf(b))[0];
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

/** Exports in the last seven days. */
export const weekExports = (log: SessionEntry[], now: number): number =>
  log.filter((e) => now - e.at < WEEK_MS).reduce((n, e) => n + e.exported, 0);

export const sessionsThisWeek = (log: SessionEntry[], now: number): number => log.filter((e) => now - e.at < WEEK_MS).length;

/** Time left in a block, ms (negative when over). */
export const blockLeftMs = (block: Block, startedAt: number, now: number, extraMs = 0): number =>
  block.minutes * 60000 + extraMs - (now - startedAt);

/** "12:05" for ms; "−0:30" when over. */
export function fmtCountdown(ms: number): string {
  const neg = ms < 0;
  const s = Math.round(Math.abs(ms) / 1000);
  return `${neg ? '−' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
