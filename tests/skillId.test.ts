import { describe, expect, it } from './expect';
import { DEFAULT_CONTEXT, buildCatalog, skillPath } from '../src/core';
import { ParsedSkill, formatSkillId, isLeafId, parseSkillId } from '../src/core/mastery/skillId';

const ids = buildCatalog(DEFAULT_CONTEXT).map((c) => c.skill);

describe('skill ids', () => {
  it('round-trips every catalog id through parse and format', () => {
    expect(ids.length).toBe(285);
    const broken = ids.filter((id) => {
      const p = parseSkillId(id);
      return p === null || formatSkillId(p) !== id;
    });
    expect(broken).toEqual([]);
  });

  it('parses each family into its structured form', () => {
    expect(parseSkillId('note:F#/string:5')).toEqual({ family: 'note', pc: 6, string: 5 });
    expect(parseSkillId('interval:b3/up/strings:5-4')).toEqual({ family: 'interval', degree: 'b3', semitones: 3, dir: 'up', from: 5, to: 4 });
    expect(parseSkillId('interval:8/down/strings:1-4')).toEqual({ family: 'interval', degree: '8', semitones: 12, dir: 'down', from: 1, to: 4 });
    expect(parseSkillId('triad:maj/inv:1/strings:4-3-2')).toEqual({ family: 'triad', type: 'maj', inv: 1, strings: [4, 3, 2] });
    expect(parseSkillId('melody:minor/deg:3')).toEqual({ family: 'melody', mode: 'minor', deg: 3 });
    expect(parseSkillId('keys:dim/inv:2')).toEqual({ family: 'keys', type: 'dim', inv: 2 });
    expect(parseSkillId('voicing:dom7s9')).toEqual({ family: 'voicing', type: 'dom7s9' });
  });

  it('formats a parsed skill back to the id the families emit', () => {
    const p: ParsedSkill = { family: 'triad', type: 'aug', inv: 2, strings: [6, 5, 4] };
    expect(formatSkillId(p)).toBe('triad:aug/inv:2/strings:6-5-4');
    expect(formatSkillId({ family: 'note', pc: 10, string: 1 })).toBe('note:A#/string:1');
  });

  it('rejects every ancestor key of every catalog id', () => {
    const ancestors = new Set(ids.flatMap((id) => skillPath(id).slice(0, -1)));
    expect(ancestors.size).toBeGreaterThan(0);
    expect(ancestors.has('note')).toBe(true);
    expect(ancestors.has('interval:b3/up')).toBe(true);
    expect(ancestors.has('triad:maj/inv:0')).toBe(true);
    for (const a of ancestors) {
      expect(parseSkillId(a)).toBeNull();
      expect(isLeafId(a)).toBe(false);
    }
  });

  it('returns null, never throws, on garbage and near misses', () => {
    const bad = [
      '', 'note', 'note:H/string:6', 'note:Db/string:6', 'note:C/string:0', ' note:C/string:6', 'note:C/string:6/',
      'interval:1/up/strings:5-4', 'interval:b3/sideways/strings:5-4', 'interval:b3/up/strings:5-5', 'interval:#4/up/strings:5-4',
      'triad:sus/inv:0/strings:6-5-4', 'triad:maj/inv:3/strings:6-5-4', 'triad:maj/inv:0/strings:6-5-5', 'triad:maj/inv:0/strings:6-5',
      'melody:dorian/deg:1', 'melody:major/deg:8', 'melody:major/deg:0',
      'keys:maj7/inv:0', 'keys:maj/inv:3', 'voicing', 'voicing:sus2', 'voicing:maj', 'skill:x',
    ];
    for (const id of bad) expect(parseSkillId(id)).toBeNull();
    expect(parseSkillId(undefined as unknown as string)).toBeNull();
    expect(parseSkillId(42 as unknown as string)).toBeNull();
  });

  it('isLeafId is true for exactly the catalog ids among leaves and ancestors', () => {
    for (const id of ids) expect(isLeafId(id)).toBe(true);
    expect(isLeafId('interval:b3')).toBe(false);
    expect(isLeafId('keys:maj')).toBe(false);
  });
});
