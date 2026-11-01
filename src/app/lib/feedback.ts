import { Degree, Evaluation, Exercise, INTERVALS, MelodyChordParams, Note, chord, parseDegree, parseNote, transpose } from '../../core';
import { INTERVAL_DE, showChord, showDegree, showNote } from './names';
import { NoteNames } from './store';

/*
 * The one amber line under the verdict: what a wrong auto-checked answer got wrong, in one short
 * German clause per ErrorKind, built from the diagnosis `detail` the families emit (never from
 * ex.solution). Correct answers, answers without a diagnosis and kinds without a sentence render nothing.
 */

const INVERSION_DE = ['Grundstellung', '1. Umkehrung', '2. Umkehrung', '3. Umkehrung'];

/** Chord degrees with their article: '3' → 'die große Terz', '9' → 'die None'. */
const DEGREE_DE: Record<string, string> = {
  '1': 'der Grundton', b2: 'die kleine Sekunde', '2': 'die große Sekunde', b3: 'die kleine Terz', '3': 'die große Terz',
  '4': 'die Quarte', '#4': 'die übermäßige Quarte', b5: 'die verminderte Quinte', '5': 'die Quinte', '#5': 'die übermäßige Quinte', b6: 'die kleine Sexte',
  '6': 'die große Sexte', bb7: 'die verminderte Septime', b7: 'die kleine Septime', '7': 'die große Septime',
  b9: 'die kleine None', '9': 'die None', '#9': 'die übermäßige None', '11': 'die Undezime', '#11': 'die übermäßige Undezime', '13': 'die Tredezime',
};

const degreeDe = (tok: string): string => DEGREE_DE[tok] ?? `die ${showDegree(tok)}`;
/** 'die große Terz' → 'Die große Terz' at the start of a clause. */
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const safeDegree = (tok: string): Degree | null => {
  try { return parseDegree(tok); } catch { return null; }
};
const safeNote = (name: string): Note | null => {
  try { return parseNote(name); } catch { return null; }
};

/** The note a degree token names over a root, spelled the way the chord spells it. */
const noteOver = (root: Note | undefined, tok: string, style: NoteNames): string | null => {
  const d = root ? safeDegree(tok) : null;
  return root && d ? showNote(transpose(root, d), style) : null;
};

/** 'F' / 'Am' as German chord names: F-Dur, A-Moll; other types keep their symbol. */
const germanChord = (root: Note, typeId: string, style: NoteNames): string | null => {
  if (typeId === 'maj') return `${showNote(root, style)}-Dur`;
  if (typeId === 'min') return `${showNote(root, style)}-Moll`;
  try { return showChord(chord(root, typeId), style); } catch { return null; }
};

/** The chip whose international symbol the diagnosis named (melody-chord only). */
const chipBySymbol = (ex: Exercise, symbol: string | null): { root: Note; typeId: string } | undefined =>
  symbol && ex.family === 'melody-chord' ? (ex.params as MelodyChordParams).choices.find((c) => c.symbol === symbol) : undefined;

const str = (v: string | number | undefined): string | null => (v === undefined ? null : String(v));
const num = (v: string | number | undefined): number | null => (typeof v === 'number' ? v : null);
const withNote = (text: string, note: string | null): string => (note ? `${text} (${note})` : text);

/**
 * One short clause for the feedback line, or null when there is nothing to say.
 * Detail keys per family (tests/diagnose.test.ts): note-find {string} | {frets}; interval-hunt {degree} | {string};
 * triad-build {inversion, note} | {fn} | {type, note}; keys-chord {inversion, note} | {degree} | {fn} | {type};
 * keys-voicing {degree}; melody-chord {symbol, fn} | {symbol, degree}.
 */
export function feedbackFor(ex: Exercise, evaluation: Evaluation, style: NoteNames): string | null {
  if (evaluation.correct || !evaluation.error) return null;
  const { kind, detail = {} } = evaluation.error;
  const root = (ex.params as { root?: Note }).root;

  switch (kind) {
    // ── notes and intervals ──
    case 'wrong-string': {
      const s = str(detail.string);
      return s ? `Richtiger Ton, Saite ${s}` : 'Richtiger Ton, andere Saite';
    }
    case 'off-by-one': {
      const frets = num(detail.frets);
      if (frets !== null) return frets > 0 ? 'Einen Bund zu hoch' : 'Einen Bund zu tief';
      const degree = str(detail.degree);
      const info = degree ? INTERVALS.find((i) => i.degree === degree) : undefined;
      return info ? `Einen Bund daneben: ${INTERVAL_DE[info.semitones]}` : 'Einen Bund daneben';
    }
    case 'octave':
      return 'Richtiger Ton, eine Oktave daneben';
    case 'direction':
      return 'Richtiger Abstand, falsche Richtung';

    // ── triads on the guitar and on the keys ──
    case 'wrong-set':
      return 'Richtige Töne, andere Saiten';
    case 'span':
      return 'Richtige Töne, aber kein Griff in einer Lage';
    case 'inversion': {
      const inv = num(detail.inversion);
      const name = inv !== null ? INVERSION_DE[inv] : undefined;
      const bass = str(detail.note);
      const bassNote = bass ? safeNote(bass) : null;
      if (name && bassNote) return `Richtige Töne, aber ${showNote(bassNote, style)} im Bass: ${name}`;
      return name ? `Richtige Töne, aber ${name}` : 'Richtige Töne, andere Umkehrung';
    }
    case 'missing-tone': {
      const fn = str(detail.fn);
      return fn ? withNote(`${cap(degreeDe(fn))} fehlt`, noteOver(root, fn, style)) : 'Ein Ton fehlt';
    }
    case 'extra-tone': {
      const degree = str(detail.degree);
      if (!degree) return 'Ein Ton zu viel';
      const note = noteOver(root, degree, style);
      return `Ein Ton zu viel: ${note ? `${note} (${showDegree(degree)})` : showDegree(degree)}`;
    }
    case 'wrong-type': {
      const type = str(detail.type);
      const name = root && type ? germanChord(root, type, style) : null;
      return name ? `Das war ${name}` : 'Anderer Akkordtyp';
    }
    case 'incomplete':
      return 'Zu wenig Töne – mindestens drei';

    // ── neo-soul voicings ──
    case 'bass': {
      const degree = str(detail.degree);
      const note = degree ? noteOver(root, degree, style) : null;
      const rootName = root ? showNote(root, style) : null;
      if (note && rootName) return `${note} im Bass – unten gehört ${rootName}`;
      return rootName ? `Unten gehört ${rootName}` : 'Der Grundton gehört in den Bass';
    }
    case 'missing-guide': {
      const degree = str(detail.degree);
      return degree ? withNote(`${cap(degreeDe(degree))} fehlt`, noteOver(root, degree, style)) : 'Ein Leitton fehlt';
    }
    case 'missing-colour': {
      const degree = str(detail.degree);
      if (!degree) return 'Der Farbton fehlt';
      const note = noteOver(root, degree, style);
      return `Der Farbton fehlt: ${showDegree(degree)}${note ? ` = ${note}` : ''}`;
    }
    case 'wrong-tone': {
      const degree = str(detail.degree);
      if (!degree) return 'Ein Ton passt nicht';
      const note = noteOver(root, degree, style);
      return `Ein Ton passt nicht: ${note ? `${note} (${showDegree(degree)})` : showDegree(degree)}`;
    }

    // ── melody note → chord ──
    case 'missed-chord': {
      const symbol = str(detail.symbol);
      const chip = chipBySymbol(ex, symbol);
      const name = chip ? germanChord(chip.root, chip.typeId, style) : symbol;
      if (!name) return 'Ein Akkord fehlt';
      const fn = str(detail.fn);
      const melody = chip ? showNote((ex.params as MelodyChordParams).note, style) : null;
      return fn && melody ? `${name} fehlt – ${melody} ist dort ${degreeDe(fn)}` : `${name} fehlt`;
    }
    case 'extra-chord': {
      const symbol = str(detail.symbol);
      const chip = chipBySymbol(ex, symbol);
      const name = chip ? germanChord(chip.root, chip.typeId, style) : symbol;
      if (!name) return 'Ein Akkord passt nicht';
      const degree = str(detail.degree);
      const melody = chip ? showNote((ex.params as MelodyChordParams).note, style) : null;
      return degree && melody ? `${name} passt nicht – ${melody} wäre dort ${degreeDe(degree)}` : `${name} passt nicht`;
    }

    default:
      return null;
  }
}
