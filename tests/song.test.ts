import { describe, expect, it } from './expect';
import { analyzeProgression, buildBrief, chordFromHeld, isAmbiguous, keyLabel, parseProgression } from '../src/core';

const read = (p: string) => {
  const f = analyzeProgression(parseProgression(p));
  return `${keyLabel(f[0])}: ${f[0].numerals.map((n) => n.roman).join(' ')}`;
};

describe('progression parsing', () => {
  it('reads common separators and chord symbols', () => {
    expect(parseProgression('Am, F | C  G').length).toBe(4);
    expect(parseProgression('Dm7 G7 Cmaj7 F#m7b5').map((c) => c.typeId)).toEqual(['m7', 'dom7', 'maj7', 'm7b5']);
    expect(() => parseProgression('Am Xyz')).toThrow(/Xyz/);
  });
  it('turns a held keyboard chord into a progression chord', () => {
    expect(chordFromHeld([57, 60, 64])).toEqual({ rootPc: 9, typeId: 'min' });
    expect(chordFromHeld([60, 62])).toBe(null);
  });
});

describe('key detection', () => {
  it('finds the key and the functions', () => {
    expect(read('C G Am F')).toBe('C-Dur: I V vi IV');
    expect(read('Em C G D')).toBe('e-Moll: i VI III VII');
    expect(read('F Bb C F')).toBe('F-Dur: I IV V I');
    expect(read('Dm7 G7 Cmaj7')).toBe('C-Dur: ii7 V7 Imaj7');
    expect(read('Eb Cm Ab Bb')).toBe('Eb-Dur: I vi IV V');
  });
  it('a loop that starts and lands on C is in C, with ♭VII flagged as borrowed', () => {
    const f = analyzeProgression(parseProgression('C Bb F C'));
    expect(keyLabel(f[0])).toBe('C-Dur');
    expect(f[0].numerals.map((n) => `${n.symbol}:${n.roman}:${n.diatonic}`)).toEqual(['C:I:true', 'Bb:♭VII:false', 'F:IV:true', 'C:I:true']);
  });
  it('treats the major V in minor as at home (harmonic minor)', () => {
    const f = analyzeProgression(parseProgression('Am Dm E Am'));
    expect(keyLabel(f[0])).toBe('a-Moll');
    expect(f[0].numerals[2]).toEqual({ symbol: 'E', roman: 'V', diatonic: false, harmonicMinorDominant: true });
  });
  it('names relative-key ambiguity instead of hiding it', () => {
    const f = analyzeProgression(parseProgression('Am F C G'));
    expect(read('Am F C G')).toBe('a-Moll: i VI III VII');
    expect(isAmbiguous(f)).toBe(true);
    expect(`${keyLabel(f[1])}: ${f[1].numerals.map((n) => n.roman).join(' ')}`).toBe('C-Dur: vi IV I V');
  });
  it('spells chords for the key (Bb in F, not A#)', () => {
    expect(analyzeProgression(parseProgression('F A#'))[0].numerals.map((n) => n.symbol)).toEqual(['F', 'Bb']);
  });
});

describe('song brief', () => {
  it('lists key, functions, both readings, parts and what is missing', () => {
    const text = buildBrief({ chords: parseProgression('Am F C G'), tempo: 92, bars: 8, parts: ['Drums', 'Akkorde'], stuck: 'Vom Loop zum Song', references: 'Song A\nSong B' });
    expect(text).toContain('Akkorde (Loop): Am – F – C – G');
    expect(text).toContain('Tonart: a-Moll → i – VI – III – VII');
    expect(text).toContain('oder: C-Dur → vi – IV – I – V');
    expect(text).toContain('Loop: 92 BPM · 8 Takte');
    expect(text).toContain('Fehlt: Bass, Melodie/Lead, Vocals, FX/Atmo');
    expect(text).toContain('Referenz-Songs: Song A; Song B');
    expect(text).toContain('Wo ich hänge: Vom Loop zum Song');
  });
  it('works without chords', () => {
    expect(buildBrief({ chords: [], parts: [] })).toContain('noch keine');
  });
});
