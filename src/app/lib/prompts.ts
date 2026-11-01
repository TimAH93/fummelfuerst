import {
  Exercise,
  HelpLevel,
  IntervalHuntParams,
  KeysChordParams,
  KeysChordSolution,
  KeysVoicingParams,
  KeysVoicingSolution,
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

/**
 * What the music stand shows, by help level: 0 = board + hint + names, 1 = names only,
 * 2 = sound + name, 3 = sound only (`main` is "🔊"; the name appears at the reveal).
 */
export interface Prompt {
  /** The one thing to read from the music stand. */
  main: string;
  sub?: string;
  /** Extra hint, help level 0 only. */
  hint?: string;
  /** Fretboard context, help level 0 only. */
  board?: Board;
  /** Pitches to play one group after another (MIDI numbers), help level ≥ 2 only. */
  sound?: number[][];
  /** True at help level 3: `main` hides the name until the reveal. */
  hideName: boolean;
}

export interface Reveal {
  lines: string[];
  board?: Board;
}

const stringNo = (t: Tuning, s: number) => t.strings.length - s;
const openName = (t: Tuning, s: number, style: NoteNames) => showNote(pcToNote(toPc(t.strings[s])), style);
const onString = (t: Tuning, s: number, style: NoteNames) => `Saite ${stringNo(t, s)} (${openName(t, s, style)})`;
const strings = (t: Tuning, ss: number[]) => ss.map((s) => stringNo(t, s)).join('-');

/** Pitches the prompt can play per family (§8): one pitch, from → target, the shape, or the solution notes. */
function soundFor(ex: Exercise): number[][] | undefined {
  const t = ex.context.tuning;
  switch (ex.family) {
    case 'note-find': {
      const s = ex.solution as NoteFindSolution;
      return s.positions.length ? [[pitchAt(t, s.positions[0])]] : undefined;
    }
    case 'interval-hunt': {
      const p = ex.params as IntervalHuntParams;
      const s = ex.solution as IntervalHuntSolution;
      return [[pitchAt(t, p.from)], [pitchAt(t, s.position)]];
    }
    case 'triad-build': {
      const s = ex.solution as TriadBuildSolution;
      return s.shapes.length ? [s.shapes[0].positions.map((q) => pitchAt(t, q))] : undefined;
    }
    case 'keys-chord':
      return [(ex.solution as KeysChordSolution).notes];
    case 'keys-voicing':
      return [(ex.solution as KeysVoicingSolution).notes];
    case 'melody-chord':
      return [[(ex.params as MelodyChordParams).midi]];
    default:
      return undefined;
  }
}

/** The help level applied to the full (level 0) prompt. */
function fade(full: Omit<Prompt, 'hideName'>, ex: Exercise, help: HelpLevel): Prompt {
  if (help === 0) return { ...full, hideName: false };
  const named = { main: full.main, sub: full.sub, hideName: false };
  if (help === 1) return named;
  const sound = soundFor(ex);
  if (help === 2) return { ...named, sound };
  return { ...named, main: sound ? '🔊' : full.main, sound, hideName: sound !== undefined };
}

export function promptFor(ex: Exercise, help: HelpLevel, style: NoteNames): Prompt {
  return fade(fullPromptFor(ex, style), ex, help);
}

/** The level-0 prompt: board, hint and names. */
function fullPromptFor(ex: Exercise, style: NoteNames): Omit<Prompt, 'hideName'> {
  const t = ex.context.tuning;
  switch (ex.family) {
    case 'note-find': {
      const p = ex.params as NoteFindParams;
      return {
        main: showNote(p.note, style),
        sub: onString(t, p.string, style),
        board: { dots: [], strings: [p.string] },
      };
    }
    case 'interval-hunt': {
      const p = ex.params as IntervalHuntParams;
      return {
        main: `${INTERVAL_DE[p.semitones]} ${p.direction === 'up' ? '↑' : '↓'}`,
        sub: `von ${showNote(p.fromNote, style)} · ${onString(t, p.from.string, style)}, Bund ${p.from.fret} → Saite ${stringNo(t, p.targetString)}`,
        board: { dots: [{ ...p.from, label: showNote(p.fromNote, style), kind: 'given' }], strings: [p.targetString] },
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
        hint: `Töne ${tones.join(' – ')} · Bass: ${tones[p.inversion]}`,
        board: { dots: [], strings: p.strings },
      };
    }
    case 'keys-chord': {
      const p = ex.params as KeysChordParams;
      const c = chord(p.root, p.typeId);
      const tones = chordToneNames(c).map((n) => showNote(parseNote(n), style));
      return {
        main: showChord(c, style),
        sub: `${['Grundstellung', '1. Umkehrung', '2. Umkehrung'][p.inversion]} · auf den Tasten`,
        hint: `Töne ${tones.join(' – ')} · Bass: ${tones[p.inversion]}`,
      };
    }
    case 'keys-voicing': {
      const p = ex.params as KeysVoicingParams;
      const s = ex.solution as KeysVoicingSolution;
      const c = chord(p.root, p.typeId);
      const tone = (label: string) => {
        const [n, d] = label.split(':');
        return `${showNote(parseNote(n), style)} (${d})`;
      };
      return {
        main: showChord(c, style),
        sub: 'Links Grundton · rechts ohne Grundton',
        hint: `Brauchst: ${s.required.map(tone).join(' · ')} · Quinte darf fehlen`,
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
    case 'keys-chord': {
      const s = ex.solution as KeysChordSolution;
      const p = ex.params as KeysChordParams;
      const c = chord(p.root, p.typeId);
      const tones = s.tones.map((n) => showNote(parseNote(n), style)).join(' – ');
      if (!s.guitar) return { lines: [tones] };
      const label = (pos: { string: number; fret: number }) => {
        const d = functionInChord(c, toPc(pitchAt(t, pos)));
        return d ? (d.acc === 0 ? '' : d.acc < 0 ? '♭' : '♯') + d.number : '';
      };
      return {
        lines: [tones, `Gitarre: Saiten ${strings(t, s.guitar.strings)} (${s.guitar.tab})`],
        board: { dots: s.guitar.positions.map((q) => ({ ...q, label: label(q), kind: 'answer' as const })), strings: s.guitar.strings },
      };
    }
    case 'keys-voicing': {
      const p = ex.params as KeysVoicingParams;
      const s = ex.solution as KeysVoicingSolution;
      const c = chord(p.root, p.typeId);
      const bass = showNote(p.root, style);
      const rh = s.rightHand.map((l) => {
        const [n, d] = l.split(':');
        return `${showNote(parseNote(n), style)}${d === '1' ? '' : ` (${d})`}`;
      });
      if (!s.guitar) return { lines: [`${bass} | ${rh.join(' ')}`] };
      const label = (pos: { string: number; fret: number }) => {
        const d = functionInChord(c, toPc(pitchAt(t, pos)));
        return d ? (d.acc === 0 ? '' : d.acc < 0 ? '♭' : '♯') + d.number : '';
      };
      return {
        lines: [`${bass} | ${rh.join(' ')}`, `Gitarre: ${s.guitar.tab}`],
        board: { dots: s.guitar.positions.map((q) => ({ ...q, label: label(q), kind: 'answer' as const })) },
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

