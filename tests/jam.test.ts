import { describe, expect, it } from './expect';
import {
  EMPTY_JAM, Key, autoKey, chordFunction, jamStep, keyLabel, melodyGuide, melodyNoteRole, melodyNotes, nextChords,
  parseNote, parseProgression,
} from '../src/core';

const key = (tonic: string, mode: Key['mode'] = 'major'): Key => ({ tonic: parseNote(tonic), mode });
const one = (sym: string) => parseProgression(sym)[0];
const DB = key('Db');
const FM = key('F', 'naturalMinor');

describe('chord function in a key', () => {
  it('names diatonic chords with their roman numeral and a role', () => {
    const f = chordFunction(DB, one('Ab13'));
    expect(f.roman).toBe('V13');
    expect(f.role).toBe('Spannung, will zur I');
    expect(chordFunction(DB, one('Ebm9')).roman).toBe('ii9');
    expect(chordFunction(DB, one('Ebm9')).role).toBe('bereitet die V vor');
    expect(chordFunction(FM, one('Fm9')).role).toBe('zu Hause');
    expect(chordFunction(FM, one('Dbmaj9')).roman).toBe('VImaj9');
  });
  it('reads C7 in Db major as the secondary dominant of iii, not as VII7', () => {
    const f = chordFunction(DB, one('C7#9'));
    expect(f.roman).toBe('V7/iii');
    expect(f.pullsTo).toBe('iii');
    expect(f.role).toBe('zieht zur iii');
    expect(chordFunction(key('C'), one('D7')).roman).toBe('V7/V');
    expect(chordFunction(key('C'), one('A')).roman).toBe('V/ii');
    expect(chordFunction(key('C'), one('G7')).roman).toBe('V7'); // the plain dominant stays V7
  });
  it('names borrowed chords in major and the harmonic-minor V in minor', () => {
    expect(chordFunction(key('C'), one('Bb')).role).toBe('borrowed aus Moll – rockig, führt zur I');
    expect(chordFunction(key('C'), one('Ab')).roman).toBe('♭VI');
    expect(chordFunction(key('C'), one('Fm')).role).toBe('borrowed aus Moll – wehmütig');
    expect(chordFunction(FM, one('C7#9')).role).toBe('Spannung, will zur i (harmonic minor)');
    expect(chordFunction(FM, one('Ebm9')).role).toBe('nicht in F minor – Farbwechsel');
  });
  it('spells the root for the key', () => {
    expect(chordFunction(key('E'), one('D#m7')).root).toEqual(parseNote('D#'));
    expect(chordFunction(DB, one('D#m7')).root).toEqual(parseNote('Eb'));
    expect(chordFunction(DB, one('G7')).root).toEqual(parseNote('G')); // not A𝄫
    expect(chordFunction(DB, one('G7')).roman).toBe('♯IV7');
    expect(chordFunction(key('C'), one('Bb')).roman).toBe('♭VII'); // lowered still wins on a tie
    expect(chordFunction(key('C'), one('F#dim')).roman).toBe('♯iv°');
    expect(chordFunction(key('C'), one('Db')).roman).toBe('♭II');
    expect(chordFunction(key('A', 'naturalMinor'), one('G#dim')).roman).toBe('♯vii°');
    expect(chordFunction(key('A', 'naturalMinor'), one('Bb')).roman).toBe('♭II');
  });
});

describe('what comes next', () => {
  const next = (k: Key, sym: string) => nextChords(k, one(sym)).map((s) => `${s.symbol} ${s.roman}: ${s.why}`);
  it('knows ii – V – I', () => {
    expect(next(DB, 'Ebm9')[0]).toBe('Ab7 V7: der klassische Zug, dann I');
    expect(next(DB, 'Ab13')[0]).toBe('Dbmaj7 Imaj7: löst auf');
    expect(next(DB, 'Ab13')[1]).toBe('Bbm7 vi7: Trugschluss – überrascht');
  });
  it('sends a secondary dominant to its target', () => {
    expect(next(DB, 'C7#9')[0]).toBe('Fm7 iii7: löst auf');
  });
  it('uses the harmonic-minor V in minor keys and leads borrowed chords home', () => {
    expect(next(FM, 'Bbm7')[0]).toBe('C7 V7: Spannung aufbauen');
    expect(next(key('C'), 'Ab')[0]).toBe('Bb ♭VII: dann I: die Mario-Kadenz');
    expect(next(key('C'), 'Bb')[0]).toBe('Cmaj7 Imaj7: zurück nach Hause');
  });
  it('offers two or three options for every diatonic chord of both modes', () => {
    for (const k of [key('C'), key('A', 'naturalMinor')]) {
      for (const sym of k.mode === 'major' ? ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'] : ['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']) {
        const n = nextChords(k, one(sym));
        expect(n.length >= 2 && n.length <= 3).toBe(true);
      }
    }
  });
});

describe('melody guide', () => {
  it('marks 3rd and 7th as targets, extensions as colour, root and fifth as stable', () => {
    const g = melodyGuide(DB, one('Fm9'));
    expect(g.tones.map((t) => `${t.degree}:${t.weight}`)).toEqual(['1:stable', 'b3:target', '5:stable', 'b7:target', '9:colour']);
    expect(g.scalePcs).toEqual([1, 3, 5, 6, 8, 10, 0]);
    expect(g.avoid).toEqual([]);
  });
  it('flags the 4th over a major third as the avoid note', () => {
    expect(melodyGuide(DB, one('C7#9')).avoid).toEqual([5]); // F over C7
    expect(melodyGuide(DB, one('Dbmaj9')).avoid).toEqual([6]); // Gb over Dbmaj9
    expect(melodyGuide(DB, one('Ab13')).avoid).toEqual([1]); // Db over Ab13
  });
  it('tells what a melody note does over the chord', () => {
    const over = (sym: string, pc: number) => {
      const r = melodyNoteRole(DB, one(sym), pc);
      return `${r.degree} ${r.kind}`;
    };
    expect(over('Fm9', 8)).toBe('b3 target'); // Ab
    expect(over('Fm9', 7)).toBe('9 colour'); // G
    expect(over('Fm9', 10)).toBe('11 passing'); // Bb: in Db major, not a chord tone
    expect(over('Fm9', 4)).toBe('7 outside'); // E
    expect(over('C7#9', 5)).toBe('11 avoid'); // F over C7
    expect(over('C7#9', 3)).toBe('#9 colour');
    expect(melodyNoteRole(null, one('Fm9'), 10).kind).toBe('passing'); // no key: nothing is "outside"
  });
});

describe('jam state', () => {
  const PAD1 = [49, 53, 56, 60, 63]; // Dbmaj9
  const PAD2 = [48, 52, 58, 63]; // C7#9 without the fifth
  const PAD3 = [53, 56, 60, 63, 67]; // Fm9
  it('keeps the chord while melody keys are added on top, and after the pad is released', () => {
    let s = jamStep(EMPTY_JAM, PAD1);
    expect(s.chord).toEqual({ rootPc: 1, typeId: 'maj9' });
    s = jamStep(s, [...PAD1, 70]); // Bb on top
    expect(s.chord?.typeId).toBe('maj9');
    expect(melodyNotes(s, [...PAD1, 70])).toEqual([70]);
    expect(melodyNotes(s, [...PAD1])).toEqual([]);
    expect(melodyNotes(s, [72])).toEqual([72]); // pad released, a single key: melody over the remembered chord
    s = jamStep(s, PAD2);
    expect(s.chord).toEqual({ rootPc: 0, typeId: 'dom7s9' });
    expect(s.history.map((c) => c.typeId)).toEqual(['maj9', 'dom7s9']);
  });
  it('does not flip to another root when the melody completes a different chord', () => {
    let s = jamStep(EMPTY_JAM, [60, 64, 67]); // C
    s = jamStep(s, [60, 64, 67, 69]); // + A = Am7 as a set, but C is being held
    expect(s.chord).toEqual({ rootPc: 0, typeId: 'maj' });
    expect(melodyNotes(s, [60, 64, 67, 69])).toEqual([69]);
  });
  it('upgrades a chord built up slowly instead of calling the extensions melody', () => {
    let s = jamStep(EMPTY_JAM, [53, 56, 60]); // Fm
    s = jamStep(s, [53, 56, 60, 63]); // Fm7
    s = jamStep(s, [53, 56, 60, 63, 67]); // Fm9
    expect(s.chord).toEqual({ rootPc: 5, typeId: 'm9' });
    expect(s.history.length).toBe(1);
  });
  it('folds repeats and ignores sets it cannot name', () => {
    let s = jamStep(EMPTY_JAM, PAD3);
    s = jamStep(s, [60, 62, 67]); // sus2: unknown
    expect(s.chord?.typeId).toBe('m9');
    s = jamStep(s, PAD3.map((m) => m + 12));
    expect(s.history.length).toBe(1);
    expect(s.chordMidis[0]).toBe(65);
    expect(jamStep(s, [])).toBe(s);
  });
});

describe('auto key', () => {
  const loop = parseProgression('Dbmaj9 C7#9 Fm9 Ebm9 Ab13');
  it('reads the key from the chords so far and stays put while two keys are close', () => {
    let k = autoKey(loop.slice(0, 1), null);
    expect(keyLabel(k!)).toBe('Db major');
    k = autoKey(loop.slice(0, 3), k); // Dbmaj9 C7#9 Fm9 leans to F minor (3.4 vs 2.0), not enough to flip
    expect(keyLabel(k!)).toBe('Db major');
    k = autoKey([...loop, ...loop], k);
    expect(keyLabel(k!)).toBe('Db major');
    expect(autoKey([], k)).toBe(k);
  });
  it('switches when the music clearly moves', () => {
    const k = autoKey(parseProgression('C F G C'), null);
    expect(keyLabel(k!)).toBe('C major');
    expect(keyLabel(autoKey(parseProgression('Am Dm E Am Dm E Am'), k)!)).toBe('A minor');
  });
});
