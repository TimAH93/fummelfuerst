import { describe, expect, it } from './expect';
import { LEXICON, PlayEntry, genreTypes, habits, logChord, logCsv, nudges, parseNote, parseProgression, parseRoman, progressionText, realize } from '../src/core';

const key = (t: string, mode: 'major' | 'naturalMinor' = 'major') => ({ tonic: parseNote(t), mode });

describe('roman numerals', () => {
  it('reads step, accidental and quality', () => {
    expect(parseRoman('ii7')).toEqual({ step: 1, acc: 0, typeId: 'm7' });
    expect(parseRoman('♭VII')).toEqual({ step: 6, acc: -1, typeId: 'maj' });
    expect(parseRoman('V7#9')).toEqual({ step: 4, acc: 0, typeId: 'dom7s9' });
    expect(parseRoman('vii°')).toEqual({ step: 6, acc: 0, typeId: 'dim' });
    expect(parseRoman('iiø7')).toEqual({ step: 1, acc: 0, typeId: 'm7b5' });
    expect(parseRoman('Imaj9')).toEqual({ step: 0, acc: 0, typeId: 'maj9' });
    expect(parseRoman('i11')).toEqual({ step: 0, acc: 0, typeId: 'm11' });
    expect(() => parseRoman('X7')).toThrow();
    expect(() => parseRoman('Ifoo')).toThrow(/foo/);
  });
  it('lands progressions in a key', () => {
    expect(progressionText(realize(['I', 'V', 'vi', 'IV'], key('C')))).toBe('C G Am F');
    expect(progressionText(realize(['i', 'VII', 'VI', 'V7'], key('A', 'naturalMinor')))).toBe('Am G F E7');
    expect(progressionText(realize(['Imaj9', 'VII7#9', 'iii9', 'ii9', 'V13'], key('Db')), key('Db'))).toBe('Dbmaj9 C7#9 Fm9 Ebm9 Ab13');
    expect(progressionText(realize(['I', '♭VII', 'IV'], key('C')))).toBe('C Bb F');
  });
  it('every lexicon progression realises in its mode and every genre names its types', () => {
    for (const g of LEXICON) {
      expect(genreTypes(g).length > 0).toBe(true);
      for (const p of g.progressions) expect(realize(p.romans, key('C', p.mode)).length).toBe(p.romans.length);
    }
  });
});

describe('habits', () => {
  const loop = parseProgression('Dbmaj9 C7#9 Fm9 Ebm9 Ab13');
  let log: PlayEntry[] = [];
  let t = 0;
  for (let i = 0; i < 8; i++) for (const c of loop) { log = logChord(log, c, (t += 1000)); log = logChord(log, c, (t += 100)); }
  it('logs chords without consecutive repeats and keeps the cap', () => {
    expect(log.length).toBe(40);
    expect(logChord([], loop[0], 1).length).toBe(1);
  });
  it('tells the top chords, changes, key and genre', () => {
    const h = habits(log);
    expect(h.total).toBe(40);
    expect(h.chords[0].item).toBe('Dbmaj9');
    expect(h.chords[0].n).toBe(8);
    expect(h.types.map((x) => x.item).slice(0, 2)).toEqual(['m9', 'maj9']); // Fm9 and Ebm9 both count as m9; ties keep insertion order
    expect(h.changes[0].item).toBe('Dbmaj9 → C7#9');
    expect(h.key && progressionText([{ rootPc: 1, typeId: 'maj' }], h.key)).toBe('Db');
    expect(h.genre?.id).toBe('neosoul');
    expect(h.keyShare > 0.7).toBe(true);
  });
  it('nudges towards what has not been tried', () => {
    const n = nudges(log);
    expect(n.length >= 2 && n.length <= 3).toBe(true);
    expect(n[0].kind).toBe('genre');
    expect(n[0].text.includes('Neo-Soul')).toBe(true);
    const colour = n.find((x) => x.kind === 'colour');
    expect(colour?.chords?.length).toBe(1);
    expect(['m11', 'sixnine', 'dom7b9'].includes(colour!.chords![0].typeId)).toBe(true); // the ones never played
    expect(nudges([])[0].kind).toBe('start');
  });
  it('exports CSV rows', () => {
    const csv = logCsv(log.slice(0, 2));
    expect(csv.split('\n')[0]).toBe('at,root_pc,root,type,symbol');
    expect(csv.split('\n')[1].endsWith(',1,Db,maj9,Dbmaj9')).toBe(true);
    expect(csv.split('\n').length).toBe(3);
  });
});
