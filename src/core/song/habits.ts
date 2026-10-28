import { chordType } from '../theory/chord';
import { PitchClass } from '../theory/pitch';
import { noteName, pcToNote } from '../theory/spelling';
import { Key, ProgChord, analyzeProgression, keyLabel } from './analysis';
import { nextChords } from './jam';
import { LEXICON, LexGenre, exampleChord, genreTypes } from './lexicon';
import { progressionText, sameProgChord } from './recorder';

/*
 * Playing habits: every chord recognised on the jam screen goes into a log. From it: what is
 * played most, which changes recur, which key it all sits in – and nudges towards what has not
 * been tried. The log is plain rows, exportable as CSV for any database later.
 */

export interface PlayEntry {
  at: number;
  rootPc: PitchClass;
  typeId: string;
}

export const MAX_LOG = 5000;

/** Append a chord unless it repeats the last one (a pad re-pressed is not a new habit). */
export function logChord(log: PlayEntry[], c: ProgChord, at: number): PlayEntry[] {
  const last = log[log.length - 1];
  if (last && sameProgChord(last, c)) return log;
  return [...log, { at, rootPc: c.rootPc, typeId: c.typeId }].slice(-MAX_LOG);
}

export interface Count<T> {
  item: T;
  n: number;
}

const symbolOf = (c: ProgChord): string => noteName(pcToNote(c.rootPc, 'flat')) + chordType(c.typeId).symbol;

function tally<T>(items: T[], keyOf: (t: T) => string): Count<T>[] {
  const map = new Map<string, Count<T>>();
  for (const it of items) {
    const k = keyOf(it);
    const e = map.get(k);
    if (e) e.n++;
    else map.set(k, { item: it, n: 1 });
  }
  return [...map.values()].sort((a, b) => b.n - a.n);
}

export interface Habits {
  total: number;
  /** Most played chords, as symbols. */
  chords: Count<string>[];
  /** Most played chord types. */
  types: Count<string>[];
  /** Most frequent changes "A → B". */
  changes: Count<string>[];
  /** Key the recent playing sits in, if any. */
  key: Key | null;
  /** Share of recent chords that are at home in that key (0..1). */
  keyShare: number;
  /** Lexicon genre whose palette overlaps most with the played types. */
  genre: LexGenre | null;
}

const RECENT = 200;

export function habits(log: PlayEntry[]): Habits {
  const recent = log.slice(-RECENT);
  const chords = tally(recent.map(symbolOf), (s) => s);
  const types = tally(recent.map((e) => e.typeId), (t) => t);
  const pairs: string[] = [];
  for (let i = 1; i < recent.length; i++) pairs.push(`${symbolOf(recent[i - 1])} → ${symbolOf(recent[i])}`);
  const changes = tally(pairs, (s) => s);
  const fits = recent.length >= 3 ? analyzeProgression(recent) : [];
  const key = fits[0] ? { tonic: fits[0].tonic, mode: fits[0].mode } : null;
  const keyShare = fits[0] ? fits[0].numerals.filter((n) => n.diatonic || n.harmonicMinorDominant).length / recent.length : 0;
  const played = new Set(types.map((t) => t.item));
  const scored = LEXICON.map((g) => ({ g, score: genreTypes(g).filter((t) => played.has(t)).length / genreTypes(g).length }));
  const best = scored.sort((a, b) => b.score - a.score)[0];
  return { total: log.length, chords, types, changes, key, keyShare, genre: recent.length >= 5 && best && best.score > 0 ? best.g : null };
}

export interface Nudge {
  kind: 'genre' | 'colour' | 'next' | 'key' | 'start';
  text: string;
  /** Chords to try, when the nudge names some. */
  chords?: ProgChord[];
}

/**
 * Three nudges at most: the genre the playing leans to, a colour from that genre never played, a
 * continuation after the most-played change that has not been tried, a key when everything sits
 * in one.
 */
export function nudges(log: PlayEntry[]): Nudge[] {
  const h = habits(log);
  if (h.total < 5) return [{ kind: 'start', text: 'Spiel ein paar Akkorde auf dem Jam-Screen, dann sehe ich, was du gern spielst.' }];
  const out: Nudge[] = [];
  const played = new Set(h.types.map((t) => t.item));
  if (h.genre) {
    out.push({ kind: 'genre', text: `Dein Spiel klingt nach ${h.genre.name}: ${h.types.slice(0, 3).map((t) => chordType(t.item).symbol || 'Dur').join(', ')} kommen am häufigsten.` });
    const missing = h.genre.chords.find((c) => !played.has(c.typeId));
    if (missing && h.key) {
      const c = exampleChord(h.key, missing.typeId);
      out.push({ kind: 'colour', text: `Noch nie gespielt: ${chordType(missing.typeId).symbol} – ${missing.sound}. Probier ${progressionText([c], h.key)}.`, chords: [c] });
    }
  }
  const top = h.changes[0];
  if (top && h.key && top.n >= 3) {
    const [, to] = top.item.split(' → ');
    const toChord = log.slice(-RECENT).find((e) => symbolOf(e) === to);
    if (toChord) {
      const tried = new Set(log.slice(-RECENT).filter((e, i, a) => i > 0 && symbolOf(a[i - 1]) === to).map(symbolOf));
      const fresh = nextChords(h.key, toChord).find((s) => !tried.has(symbolOf(s.chord)));
      if (fresh) out.push({ kind: 'next', text: `${top.item} spielst du oft (${top.n}×). Nach ${to} mal ${progressionText([fresh.chord], h.key)} – ${fresh.why}.`, chords: [fresh.chord] });
    }
  }
  if (h.key && h.keyShare > 0.85 && h.total >= 30) {
    const parallel: Key = { tonic: h.key.tonic, mode: h.key.mode === 'major' ? 'naturalMinor' : 'major' };
    out.push({ kind: 'key', text: `Fast alles in ${keyLabel(h.key)}. Für einen anderen Ton: ${keyLabel(parallel)} mit denselben Pads-Formen, einen Halbton verschoben.` });
  }
  return out.slice(0, 3);
}

/** CSV with a header, one chord per row – for SQLite or a spreadsheet. */
export function logCsv(log: PlayEntry[]): string {
  const rows = log.map((e) => `${new Date(e.at).toISOString()},${e.rootPc},${noteName(pcToNote(e.rootPc, 'flat'))},${e.typeId},${symbolOf(e)}`);
  return ['at,root_pc,root,type,symbol', ...rows].join('\n');
}
