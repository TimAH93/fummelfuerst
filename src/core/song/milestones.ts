import { SessionEntry } from './session';

/*
 * Songs finished, counted for life. Milestones give ranks – the court of the Fummelfürst – and
 * each rank changes the app's look a little. Quiet celebration, nothing in the way.
 */

export interface Rank {
  /** Songs needed. */
  at: number;
  name: string;
  /** Small emblem shown next to the title. */
  emblem: string;
  /** Theme level the stylesheet keys on (0 = default look). */
  level: number;
}

export const RANKS: Rank[] = [
  { at: 0, name: 'Lehrling', emblem: '', level: 0 },
  { at: 10, name: 'Geselle', emblem: '♪', level: 1 },
  { at: 20, name: 'Loop-Ritter', emblem: '♫', level: 2 },
  { at: 25, name: 'Beat-Baron', emblem: '♬', level: 3 },
  { at: 50, name: 'Song-Graf', emblem: '✦', level: 4 },
  { at: 100, name: 'Fummelfürst', emblem: '♛', level: 5 },
  { at: 150, name: 'Herzog', emblem: '♜', level: 6 },
  { at: 200, name: 'Kurfürst', emblem: '♞', level: 7 },
  { at: 250, name: 'König', emblem: '♚', level: 8 },
  { at: 500, name: 'Kaiser', emblem: '☀', level: 9 },
];

export const MILESTONES: number[] = RANKS.slice(1).map((r) => r.at);

/** Songs so far: the count from before the app kept track, plus every export logged since. */
export const totalSongs = (log: SessionEntry[], base = 0): number => base + log.reduce((n, e) => n + e.exported, 0);

export const rankFor = (total: number): Rank => [...RANKS].reverse().find((r) => total >= r.at) ?? RANKS[0];

export const nextRank = (total: number): Rank | null => RANKS.find((r) => r.at > total) ?? null;

/** 0..1 from the current rank to the next; 1 at the top. */
export function progressToNext(total: number): number {
  const cur = rankFor(total);
  const next = nextRank(total);
  if (!next) return 1;
  return Math.min(1, Math.max(0, (total - cur.at) / (next.at - cur.at)));
}

/** Milestones passed between two counts, lowest first – the ones to celebrate. */
export const crossed = (before: number, after: number): number[] => MILESTONES.filter((m) => before < m && after >= m);

/** "7 bis Geselle" / "Kaiser – ganz oben". */
export function nextLabel(total: number): string {
  const next = nextRank(total);
  return next ? `${next.at - total} bis ${next.name}` : 'ganz oben';
}
