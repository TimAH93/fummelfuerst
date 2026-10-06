import { describe, expect, it } from './expect';
import {
  CHORD_TYPES,
  chord,
  chordFormulaString,
  chordToneNames,
  chordSymbol,
  degreeBetween,
  degreeToString,
  diatonicChordOn,
  diatonicChordsContaining,
  enharmonics,
  functionInChord,
  harmonize,
  degreeOverRoot,
  identifyChordPcs,
  intervalInfo,
  noteName,
  parseChord,
  parseNote,
  pcName,
  scale,
  scaleDegreeOf,
  scaleNoteNames,
  semitonesBetween,
  transpose,
  transposeDown,
  parseDegree,
} from '../src/core';

const names = (s: string, t: string) => scaleNoteNames(scale(s, t)).join(' ');

describe('notes and spelling', () => {
  it('maps pitch classes C=0 … B=11', () => {
    expect([0, 1, 2, 11].map((p) => pcName(p))).toEqual(['C', 'C#', 'D', 'B']);
    expect(pcName(1, 'flat')).toBe('Db');
  });
  it('parses and prints spelled notes', () => {
    expect(noteName(parseNote('Bb'))).toBe('Bb');
    expect(noteName(parseNote('f#'))).toBe('F#');
    expect(noteName(parseNote('C♯'), 'unicode')).toBe('C♯');
  });
  it('lists enharmonic spellings', () => {
    expect(enharmonics(1, 1).map((n) => noteName(n))).toEqual(['C#', 'Db']);
    expect(enharmonics(0).map((n) => noteName(n))).toContain('B#');
  });
});

describe('intervals', () => {
  it('names all 13 spec intervals by semitones', () => {
    expect(intervalInfo(0).name).toBe('root');
    expect(intervalInfo(3).name).toBe('minor 3rd');
    expect(intervalInfo(4).name).toBe('major 3rd');
    expect(intervalInfo(6).name).toBe('tritone');
    expect(intervalInfo(11).name).toBe('major 7th');
    expect(intervalInfo(12).name).toBe('octave');
  });
  it('computes ascending semitones between pitch classes', () => {
    expect(semitonesBetween(0, 4)).toBe(4); // C → E
    expect(semitonesBetween(9, 0)).toBe(3); // A → C
    expect(semitonesBetween(5, 0)).toBe(7); // F → C
  });
  it('transposes with correct letters', () => {
    expect(noteName(transpose(parseNote('A'), parseDegree('b3')))).toBe('C');
    expect(noteName(transpose(parseNote('E'), parseDegree('3')))).toBe('G#');
    expect(noteName(transpose(parseNote('F'), parseDegree('4')))).toBe('Bb');
    expect(noteName(transpose(parseNote('B'), parseDegree('b5')))).toBe('F');
  });
  it('transposes downwards with correct letters', () => {
    expect(noteName(transposeDown(parseNote('C'), parseDegree('3')))).toBe('Ab');
    expect(noteName(transposeDown(parseNote('F'), parseDegree('5')))).toBe('Bb');
    expect(noteName(transposeDown(parseNote('C'), parseDegree('b5')))).toBe('F#');
    expect(noteName(transposeDown(parseNote('E'), parseDegree('8')))).toBe('E');
  });
  it('derives the degree between two spelled notes', () => {
    expect(degreeToString(degreeBetween(parseNote('G'), parseNote('C')))).toBe('4');
    expect(degreeToString(degreeBetween(parseNote('A'), parseNote('C')))).toBe('b3');
    expect(degreeToString(degreeBetween(parseNote('B'), parseNote('C')))).toBe('b2');
    expect(degreeToString(degreeBetween(parseNote('C'), parseNote('B#')))).toBe('#7');
  });
});

describe('scales', () => {
  it('C major = C D E F G A B', () => expect(names('C', 'major')).toBe('C D E F G A B'));
  it('A natural minor = A B C D E F G', () => expect(names('A', 'naturalMinor')).toBe('A B C D E F G'));
  it('spells flat and sharp keys correctly', () => {
    expect(names('F', 'major')).toBe('F G A Bb C D E');
    expect(names('E', 'major')).toBe('E F# G# A B C# D#');
    expect(names('Eb', 'naturalMinor')).toBe('Eb F Gb Ab Bb Cb Db');
  });
  it('builds pentatonics', () => {
    expect(names('C', 'majorPentatonic')).toBe('C D E G A');
    expect(names('A', 'minorPentatonic')).toBe('A C D E G');
  });
  it('finds scale degrees', () => {
    expect(scaleDegreeOf(scale('A', 'naturalMinor'), 0)).toEqual({ index: 3, degree: 'b3' });
    expect(scaleDegreeOf(scale('C', 'major'), 1)).toBeNull();
  });
});

describe('chords', () => {
  it('C major triad = C E G', () => expect(chordToneNames(chord('C', 'maj'))).toEqual(['C', 'E', 'G']));
  it('A minor triad = A C E', () => expect(chordToneNames(chord('A', 'min'))).toEqual(['A', 'C', 'E']));
  it('diminished triad = 1 b3 b5', () => expect(chordFormulaString(CHORD_TYPES.find((t) => t.id === 'dim')!)).toBe('1 b3 b5'));
  it('builds all nine v0.1 chord types on C', () => {
    const got = Object.fromEntries(CHORD_TYPES.map((t) => [t.id, chordToneNames(chord('C', t.id)).join(' ')]));
    expect(got).toEqual({
      maj: 'C E G',
      min: 'C Eb G',
      dim: 'C Eb Gb',
      aug: 'C E G#',
      maj7: 'C E G B',
      m7: 'C Eb G Bb',
      dom7: 'C E G Bb',
      dim7: 'C Eb Gb Bbb',
      m7b5: 'C Eb Gb Bb',
    });
  });
  it('parses chord symbols', () => {
    expect(chordSymbol(parseChord('Am'))).toBe('Am');
    expect(parseChord('G7').type.id).toBe('dom7');
    expect(parseChord('Bbmaj7').type.id).toBe('maj7');
    expect(parseChord('F#m7b5').type.id).toBe('m7b5');
    expect(parseChord('Bø7').type.id).toBe('m7b5');
    expect(() => parseChord('Cwhatever')).toThrow();
  });
  it('identifies chords from pitch-class sets in any order', () => {
    expect(identifyChordPcs(9, [4, 0, 9])?.id).toBe('min');
    expect(identifyChordPcs(7, [7, 11, 2, 5])?.id).toBe('dom7');
  });
});

describe('harmonisation (derived, not looked up)', () => {
  it('A natural minor → Am Bdim C Dm Em F G', () => {
    expect(harmonize(scale('A', 'naturalMinor')).map((d) => chordSymbol(d.chord))).toEqual([
      'Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G',
    ]);
  });
  it('C major roman numerals', () => {
    expect(harmonize(scale('C', 'major')).map((d) => d.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
  });
  it('C major sevenths', () => {
    expect(harmonize(scale('C', 'major'), 4).map((d) => chordSymbol(d.chord))).toEqual([
      'Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5',
    ]);
  });
  it('spells flat keys correctly (Eb minor iiø7 = Fm7b5 with Cb)', () => {
    const ii = diatonicChordOn(scale('Eb', 'naturalMinor'), 2, 4);
    expect(chordSymbol(ii.chord)).toBe('Fm7b5');
    expect(ii.tones.map((n) => noteName(n))).toEqual(['F', 'Ab', 'Cb', 'Eb']);
  });
  it('builds the triad on degree III of A minor (= C)', () => {
    expect(chordSymbol(diatonicChordOn(scale('A', 'naturalMinor'), 3).chord)).toBe('C');
  });
  it('refuses to stack thirds on a pentatonic', () => {
    expect(() => harmonize(scale('A', 'minorPentatonic'))).toThrow(/7-note/);
  });
});

describe('melody note → chord', () => {
  it('C in A minor lives in Am (b3), C (1) and F (5)', () => {
    const r = diatonicChordsContaining(scale('A', 'naturalMinor'), 0).map(
      (x) => `${chordSymbol(x.chord.chord)}:${degreeToString(x.fn)}`,
    );
    expect(r).toEqual(['Am:b3', 'C:1', 'F:5']);
  });
  it('one note, many functions: C over Am F C G', () => {
    const fns = ['Am', 'F', 'C', 'G'].map((s) => {
      const c = parseChord(s);
      const f = functionInChord(c, 0);
      return f ? degreeToString(f) : `(${degreeToString(degreeOverRoot(c, 'C'))})`;
    });
    expect(fns).toEqual(['b3', '5', '1', '(4)']);
  });
});
