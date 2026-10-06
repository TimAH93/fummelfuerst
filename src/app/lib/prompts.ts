import {
  Exercise,
  HelpLevel,
  IntervalHuntParams,
  IntervalHuntSolution,
  MelodyChordParams,
  MelodyChordSolution,
  NoteFindParams,
  NoteFindSolution,
  TriadBuildParams,
  TriadBuildSolution,
  Tuning,
  chord,
  chordToneNames,
  functionInChord,
  parseNote,
  pcToNote,
  pitchAt,
  toPc,
} from '../../core';
import { FUNCTION_DE, INTERVAL_DE, keyName, showChord, showNote } from './names';
import { NoteNames } from './store';

export interface Dot {
  string: number;
  fret: number;
  label?: string;
  kind: 'given' | 'answer' | 'alt';
}

export interface Board {
  dots: Dot[];
  /** Strings to emphasise (internal indices). */
  strings?: number[];
}

export interface Prompt {
  /** The one thing to read from the music stand. */
  main: string;
  sub?: string;
  /** Extra hint, help level 0 only. */
  hint?: string;
  board?: Board;
}

export interface Reveal {
  lines: string[];
  board?: Board;
}

const stringNo = (t: Tuning, s: number) => t.strings.length - s;
const openName = (t: Tuning, s: number, style: NoteNames) => showNote(pcToNote(toPc(t.strings[s])), style);
const onString = (t: Tuning, s: number, style: NoteNames) => `Saite ${stringNo(t, s)} (${openName(t, s, style)})`;
const strings = (t: Tuning, ss: number[]) => ss.map((s) => stringNo(t, s)).join('-');

export function promptFor(ex: Exercise, help: HelpLevel, style: NoteNames): Prompt {
  const t = ex.context.tuning;
  const full = help === 0;
  switch (ex.family) {
    case 'note-find': {
      const p = ex.params as NoteFindParams;
      return {
        main: showNote(p.note, style),
        sub: onString(t, p.string, style),
        board: full ? { dots: [], strings: [p.string] } : undefined,
      };
    }
    case 'interval-hunt': {
      const p = ex.params as IntervalHuntParams;
      return {
        main: `${INTERVAL_DE[p.semitones]} ${p.direction === 'up' ? '↑' : '↓'}`,
        sub: `von ${showNote(p.fromNote, style)} · ${onString(t, p.from.string, style)}, Bund ${p.from.fret} → Saite ${stringNo(t, p.targetString)}`,
        board: full ? { dots: [{ ...p.from, label: showNote(p.fromNote, style), kind: 'given' }], strings: [p.targetString] } : undefined,
      };
    }
    case 'triad-build': {
      const p = ex.params as TriadBuildParams;
      const c = chord(p.root, p.typeId);
      const inv = ['Grundstellung', '1. Umkehrung', '2. Umkehrung'][p.inversion];
      const tones = chordToneNames(c).map((n) => showNote(parseNote(n), style));
      return {
        main: showChord(c, style),
        sub: `${inv} · Saiten ${strings(t, p.strings)}`,
        hint: full ? `Töne ${tones.join(' – ')} · Bass: ${tones[p.inversion]}` : undefined,
        board: full ? { dots: [], strings: p.strings } : undefined,
      };
    }
    case 'melody-chord': {
      const p = ex.params as MelodyChordParams;
      return {
        main: showNote(p.note, style),
        sub: `Melodieton in ${keyName(p.tonic, p.mode, style)} – welche Akkorde passen?`,
      };
    }
    default:
      return { main: ex.id };
  }
}

export function revealFor(ex: Exercise, style: NoteNames): Reveal {
  const t = ex.context.tuning;
  switch (ex.family) {
    case 'note-find': {
      const p = ex.params as NoteFindParams;
      const s = ex.solution as NoteFindSolution;
      const name = showNote(p.note, style);
      return {
        lines: [`${name}: ${s.positions.map((q) => `Bund ${q.fret}`).join(' und ')}`],
        board: { dots: s.positions.map((q) => ({ ...q, label: name, kind: 'answer' as const })), strings: [p.string] },
      };
    }
    case 'interval-hunt': {
      const p = ex.params as IntervalHuntParams;
      const s = ex.solution as IntervalHuntSolution;
      return {
        lines: [`${showNote(s.note, style)} · Saite ${stringNo(t, s.position.string)}, Bund ${s.position.fret}`],
        board: {
          dots: [
            { ...p.from, label: showNote(p.fromNote, style), kind: 'given' },
            { ...s.position, label: showNote(s.note, style), kind: 'answer' },
          ],
        },
      };
    }
    case 'triad-build': {
      const p = ex.params as TriadBuildParams;
      const s = ex.solution as TriadBuildSolution;
      const c = chord(p.root, p.typeId);
      const fnOf = (pos: { string: number; fret: number }) => functionInChord(c, toPc(pitchAt(t, pos)));
      const [first, ...others] = s.shapes;
      const label = (pos: { string: number; fret: number }) => {
        const d = fnOf(pos);
        return d ? (d.acc === 0 ? '' : d.acc < 0 ? '♭' : '♯') + d.number : '';
      };
      return {
        lines: [
          `${first.tones.map((n) => showNote(parseNote(n), style)).join(' – ')}   (${first.tab})`,
          ...(others.length ? [`auch: ${others.map((o) => o.tab).join(', ')}`] : []),
        ],
        board: {
          dots: [
            ...first.positions.map((q) => ({ ...q, label: label(q), kind: 'answer' as const })),
            ...others.flatMap((o) => o.positions.map((q) => ({ ...q, label: label(q), kind: 'alt' as const }))),
          ],
          strings: p.strings,
        },
      };
    }
    case 'melody-chord': {
      const s = ex.solution as MelodyChordSolution;
      const p = ex.params as MelodyChordParams;
      const byId = new Map(p.choices.map((c) => [c.id, c]));
      return {
        lines: s.chords.map((c) => {
          const ch = byId.get(c.id)!;
          return `${showChord(chord(ch.root, ch.typeId), style)} – ${FUNCTION_DE[c.fn] ?? c.fn}`;
        }),
      };
    }
    default:
      return { lines: [] };
  }
}

