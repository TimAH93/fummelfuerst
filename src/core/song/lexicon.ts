import { Letter, Note, notePc } from '../theory/spelling';
import { scaleNotes } from '../theory/scale';
import { CHORD_TYPES, chordType } from '../theory/chord';
import { toPc } from '../theory/pitch';
import { Key, ProgChord, keyScale } from './analysis';

/*
 * The lexicon: chords worth knowing and the progressions that carry whole genres, written as
 * roman numerals so they land in any key. Data plus a small roman-numeral reader.
 */

export interface RomanChord {
  /** 0-based scale step. */
  step: number;
  /** -1 lowered, +1 raised. */
  acc: number;
  typeId: string;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
/** Suffix → chord type, for upper-case (major-ish) and lower-case (minor-ish) numerals. */
const UPPER: Record<string, string> = {
  '': 'maj', '7': 'dom7', '9': 'dom9', '13': 'dom13', '7#9': 'dom7s9', '7b9': 'dom7b9', 'maj7': 'maj7', 'maj9': 'maj9', 'maj7#11': 'maj7s11',
  '6': 'six', '6/9': 'sixnine', 'add9': 'add9', 'sus2': 'sus2', 'sus4': 'sus4', '7sus4': 'dom7sus4', '+': 'aug',
};
const LOWER: Record<string, string> = {
  '': 'min', '7': 'm7', '9': 'm9', '11': 'm11', '6': 'm6', 'add9': 'madd9', 'maj7': 'mMaj7', '°': 'dim', 'ø7': 'm7b5', '°7': 'dim7',
};

/** 'ii7', '♭VII', 'V7#9', 'vii°', 'iiø7' → step, accidental, chord type. Throws on nonsense. */
export function parseRoman(token: string): RomanChord {
  const m = /^([♭b#♯]?)([ivIV]+)(.*)$/u.exec(token.trim());
  if (!m) throw new Error(`Not a roman numeral: "${token}"`);
  const acc = m[1] === '' ? 0 : m[1] === '#' || m[1] === '♯' ? 1 : -1;
  const numeral = m[2];
  const lower = numeral === numeral.toLowerCase();
  const step = ROMAN.indexOf(numeral.toUpperCase());
  if (step < 0) throw new Error(`Not a roman numeral: "${token}"`);
  const suffix = m[3].replace('♭', 'b').replace('♯', '#');
  const typeId = (lower ? LOWER : UPPER)[suffix];
  if (!typeId) throw new Error(`Unknown chord quality "${suffix}" in "${token}"`);
  return { step, acc, typeId };
}

/** Numerals in a key → chords with pitch classes (spelling comes from the key later). */
export function realize(romans: string[], key: Key): ProgChord[] {
  const notes = scaleNotes(keyScale(key));
  return romans.map((r) => {
    const { step, acc, typeId } = parseRoman(r);
    const n: Note = { letter: notes[step].letter as Letter, acc: notes[step].acc + acc };
    return { rootPc: toPc(notePc(n)), typeId };
  });
}

export interface LexChord {
  typeId: string;
  /** One line on the sound. */
  sound: string;
  /** Where it is heard. */
  heard: string;
}

export interface LexProgression {
  name: string;
  romans: string[];
  /** Mode the numerals are written in. */
  mode: Key['mode'];
  sound: string;
  bpm: number;
}

export interface LexGenre {
  id: string;
  name: string;
  chords: LexChord[];
  progressions: LexProgression[];
}

export const LEXICON: LexGenre[] = [
  {
    id: 'neosoul', name: 'Neo-Soul / R&B',
    chords: [
      { typeId: 'maj9', sound: 'weich und offen, der Grundakkord des Genres', heard: 'D’Angelo, Erykah Badu, Robert Glasper' },
      { typeId: 'm9', sound: 'dunkel und seidig, Moll mit Luft obendrauf', heard: 'fast jeder Neo-Soul-Loop' },
      { typeId: 'dom13', sound: 'Dominante mit Glanz, zieht nach Hause', heard: 'Turnarounds, Gospel-Endungen' },
      { typeId: 'dom7s9', sound: 'der „Hendrix-Akkord“: Dur und Moll zugleich, rau', heard: 'Funk, Purple Haze, Just the Two of Us' },
      { typeId: 'm11', sound: 'schwebend, fast ohne Terz-Gefühl', heard: 'Glasper-Intros, Lo-fi' },
      { typeId: 'sixnine', sound: 'warm und endgültig – der Schlussakkord', heard: 'Jazz-Standards, Stevie Wonder' },
      { typeId: 'dom7b9', sound: 'Spannung mit Biss, will sofort weiter', heard: 'Gospel, Jazz vor dem i' },
    ],
    progressions: [
      { name: 'Just the Two of Us', romans: ['Imaj9', 'VII7#9', 'iii9', 'ii9', 'V13'], mode: 'major', sound: 'deine Folge: Zuhause, Zug, Moll, dann ii–V zurück', bpm: 82 },
      { name: 'Neo-Soul-Loop', romans: ['ii9', 'V13', 'Imaj9', 'vi9'], mode: 'major', sound: 'ii–V–I mit weichem Abgang', bpm: 78 },
      { name: 'Gospel-Turnaround', romans: ['Imaj7', 'VI7b9', 'ii9', 'V13'], mode: 'major', sound: 'die Folge, die jede Kirche kennt', bpm: 72 },
      { name: 'Glasper', romans: ['i11', 'VImaj7#11', 'i11', 'ii7'], mode: 'naturalMinor', sound: 'zwei Akkorde, die schweben', bpm: 70 },
    ],
  },
  {
    id: 'lofi', name: 'Lo-fi Hip-Hop',
    chords: [
      { typeId: 'm7', sound: 'der Staub-Akkord, nie falsch', heard: 'jeder Lo-fi-Beat' },
      { typeId: 'maj7', sound: 'hell, sanft, leicht wehmütig', heard: 'Nujabes, J Dilla' },
      { typeId: 'add9', sound: 'Dur mit einem Hauch Traurigkeit', heard: 'Intros, Pianoloops' },
      { typeId: 'madd9', sound: 'Moll, das nach oben schaut', heard: 'Chillhop' },
      { typeId: 'm9', sound: 'tiefer als m7, sofort Lo-fi', heard: 'Jazzhop-Samples' },
    ],
    progressions: [
      { name: 'Lo-fi-Standard', romans: ['ii7', 'V7', 'Imaj7', 'vi7'], mode: 'major', sound: 'ii–V–I–vi, der Loop schlechthin', bpm: 82 },
      { name: 'Nujabes', romans: ['Imaj7', 'iii7', 'vi7', 'ii7'], mode: 'major', sound: 'Quintfall-Kreis, rollt ewig', bpm: 88 },
      { name: 'Moll-Chill', romans: ['i9', 'iv9', 'VImaj7', 'V7'], mode: 'naturalMinor', sound: 'dunkel, mit Licht am Ende', bpm: 76 },
    ],
  },
  {
    id: 'house', name: 'House / Garage',
    chords: [
      { typeId: 'm7', sound: 'der Stab-Akkord, kurz angeschlagen', heard: 'Deep House' },
      { typeId: 'm9', sound: 'deeper, mit Pad gespielt', heard: 'Kerri Chandler' },
      { typeId: 'dom7sus4', sound: 'offen, ohne Terz – treibt', heard: 'Garage-Orgeln' },
      { typeId: 'maj9', sound: 'hell und weit, für Pads', heard: 'Disclosure' },
      { typeId: 'sus2', sound: 'klar und leer, für Plucks', heard: 'Tech House' },
    ],
    progressions: [
      { name: 'Deep-House-Zwei', romans: ['i9', 'iv9'], mode: 'naturalMinor', sound: 'zwei Akkorde reichen, der Beat macht den Rest', bpm: 122 },
      { name: 'Garage', romans: ['vi7', 'IVmaj7', 'Imaj7', 'V7sus4'], mode: 'major', sound: 'Pop-Kreis mit offenem Ende', bpm: 128 },
      { name: 'Piano-House', romans: ['I', 'V', 'vi', 'IV'], mode: 'major', sound: 'die Axis-Folge, Hände hoch', bpm: 124 },
    ],
  },
  {
    id: 'trap', name: 'Trap / Drill',
    chords: [
      { typeId: 'min', sound: 'Moll-Dreiklang, dunkel und direkt', heard: 'alles von Metro Boomin' },
      { typeId: 'madd9', sound: 'Moll mit Glitzern', heard: 'Bell-Melodien' },
      { typeId: 'dim', sound: 'unruhig, kurz vor dem Kippen', heard: 'Drill-Loops' },
      { typeId: 'mMaj7', sound: 'Film-Noir, bedrohlich', heard: 'Horror-Trap' },
      { typeId: 'sus2', sound: 'kalt und weit', heard: 'Pads unter 808s' },
    ],
    progressions: [
      { name: 'Trap-Loop', romans: ['i', 'VI', 'III', 'VII'], mode: 'naturalMinor', sound: 'Andalusisch rückwärts, läuft ewig', bpm: 140 },
      { name: 'Drill', romans: ['i', 'iv', 'i', 'V'], mode: 'naturalMinor', sound: 'eng, zwei Akkorde und ein Zug', bpm: 142 },
      { name: 'Dark Bells', romans: ['i', 'ii°', 'i', 'VI'], mode: 'naturalMinor', sound: 'der Halbtonschritt macht die Angst', bpm: 136 },
    ],
  },
  {
    id: 'synthwave', name: 'Synthwave / Pop',
    chords: [
      { typeId: 'add9', sound: 'groß und nostalgisch', heard: 'The Midnight, 80er-Pop' },
      { typeId: 'sus2', sound: 'offen für Arpeggios', heard: 'Stranger Things' },
      { typeId: 'maj7', sound: 'sanfter Sonnenuntergang', heard: 'Chillwave' },
      { typeId: 'six', sound: 'altmodisch hell', heard: 'City Pop' },
      { typeId: 'maj7s11', sound: 'schwebend, Film-Himmel', heard: 'Soundtracks' },
    ],
    progressions: [
      { name: 'Axis', romans: ['I', 'V', 'vi', 'IV'], mode: 'major', sound: 'vier Akkorde, tausend Hits', bpm: 110 },
      { name: '80er-Moll', romans: ['vi', 'IV', 'I', 'V'], mode: 'major', sound: 'Axis von der traurigen Seite', bpm: 105 },
      { name: 'Royal Road', romans: ['IVmaj7', 'V7', 'iii7', 'vi7'], mode: 'major', sound: 'die japanische Pop-Folge', bpm: 112 },
      { name: '50er', romans: ['I', 'vi', 'IV', 'V'], mode: 'major', sound: 'Doo-Wop, immer noch gültig', bpm: 100 },
    ],
  },
  {
    id: 'classic', name: 'Klassiker',
    chords: [
      { typeId: 'dom7', sound: 'die Spannung schlechthin', heard: 'Blues, alles vor 1960' },
      { typeId: 'm7b5', sound: 'halbvermindert, der Moll-ii', heard: 'Jazz-Balladen' },
      { typeId: 'dim7', sound: 'symmetrisch, führt überall hin', heard: 'Stummfilm, Übergänge' },
      { typeId: 'aug', sound: 'übermäßig, schwebt nach oben', heard: 'Beatles-Intros' },
      { typeId: 'sus4', sound: 'hält zurück, löst dann', heard: 'Rock-Endungen' },
    ],
    progressions: [
      { name: 'ii–V–I', romans: ['ii7', 'V7', 'Imaj7'], mode: 'major', sound: 'der Satz, aus dem Jazz besteht', bpm: 120 },
      { name: '12-Takt-Blues', romans: ['I7', 'I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'], mode: 'major', sound: 'zwölf Takte, drei Akkorde', bpm: 96 },
      { name: 'Andalusisch', romans: ['i', 'VII', 'VI', 'V7'], mode: 'naturalMinor', sound: 'Flamenco, Hit the Road Jack', bpm: 110 },
      { name: 'Pachelbel', romans: ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V'], mode: 'major', sound: 'der Kanon, acht Akkorde', bpm: 70 },
      { name: 'Moll-ii–V–i', romans: ['iiø7', 'V7b9', 'i9'], mode: 'naturalMinor', sound: 'die dunkle Schwester', bpm: 110 },
    ],
  },
];

export const lexGenre = (id: string): LexGenre | undefined => LEXICON.find((g) => g.id === id);

/** A root that makes sense for a chord type in a key: minor-ish on vi (i in minor), dominants on V, diminished on vii° (ii° in minor), the rest on I (III in minor). */
export function exampleChord(key: Key, typeId: string): ProgChord {
  const f = chordType(typeId).formula;
  const minorish = f.some((d) => d.number === 3 && d.acc === -1);
  const dominant = typeId.startsWith('dom');
  const dim = typeId === 'dim' || typeId === 'dim7' || typeId === 'm7b5';
  const major = key.mode === 'major';
  const step = dim ? (major ? 6 : 1) : dominant ? 4 : minorish ? (major ? 5 : 0) : major ? 0 : 2;
  return { rootPc: notePc(scaleNotes(keyScale(key))[step]), typeId };
}

/** Every chord type the lexicon mentions for a genre. */
export const genreTypes = (g: LexGenre): string[] => [...new Set([...g.chords.map((c) => c.typeId), ...g.progressions.flatMap((p) => p.romans.map((r) => parseRoman(r).typeId))])];

// Every type the lexicon names must exist in the chord table.
for (const g of LEXICON) for (const t of genreTypes(g)) if (!CHORD_TYPES.some((c) => c.id === t)) throw new Error(`Lexicon: unknown chord type ${t}`);
