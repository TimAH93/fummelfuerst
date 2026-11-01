import { readFileSync } from 'node:fs';
import { describe, expect, it } from './expect';
import {
  ACC_SEED_COMFORT,
  DEFAULT_MODEL,
  LearnerStateV1,
  N_SEED_COMFORT,
  SkillStats,
  SkillStatsV1,
  TRACKS,
  buildCatalog,
  buildCurriculum,
  drillProgress,
  hasSlipped,
  isLeafId,
  knowledge,
  migrateV1,
  parseState,
  recommendDrill,
} from '../src/core';
// The frozen v1 copy (tests/sim/v1) is the "before" of every comparison.
import * as v1 from './sim/v1/curriculum';
import type { LearnerState as LearnerStateV1Frozen } from './sim/v1/model';

const MIN = 60_000;
const DAY = 86_400_000;
const fixtureJson = readFileSync(new URL('./fixtures/learner-v1.json', import.meta.url), 'utf8');
const fixture = JSON.parse(fixtureJson) as LearnerStateV1;
const asV1 = fixture as unknown as LearnerStateV1Frozen;
const catalog = buildCatalog();
const curriculum = buildCurriculum(catalog);
const curriculumV1 = v1.buildCurriculum(catalog);
const migrated = migrateV1(fixture);

/** The v2 comfort gate of §7.4 (time-free; curriculum.isComfortable once it reads the new stats). */
const comfortableV2 = (s: SkillStats | undefined, cfg = DEFAULT_MODEL): boolean =>
  !!s && s.n >= cfg.comfortN && s.held >= 1 && knowledge(s) >= cfg.comfortMastery;

describe('v1 fixture', () => {
  it('covers ancestors, leaves in every box, help levels and three passed drills', () => {
    const ids = Object.keys(fixture.skills);
    expect(fixture.schemaVersion).toBe(1);
    expect(ids.some((id) => !isLeafId(id))).toBe(true);
    expect([...new Set(Object.values(fixture.skills).filter((_, i) => isLeafId(ids[i])).map((s) => s.box))].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(Object.values(fixture.help).map((h) => h.level)).size >= 3).toBe(true);
    expect(Object.keys(fixture.passed).length).toBe(3);
  });
});

describe('migration v1 → v2', () => {
  it('drops every ancestor key and keeps every leaf', () => {
    const leaves = Object.keys(fixture.skills).filter(isLeafId).sort();
    expect(leaves.length < Object.keys(fixture.skills).length).toBe(true);
    expect(Object.keys(migrated.skills).sort()).toEqual(leaves);
    for (const id of ['note', 'note:C', 'interval', 'interval:5', 'interval:5/up']) expect(id in migrated.skills).toBe(false);
  });
  it('reads the v1 numbers as counts, half-life and held', () => {
    const cold = migrated.skills['interval:5/up/strings:4-3']; // box 0, acc 0.245, n 2
    expect(cold.a).toBeCloseTo(0.245 * 2);
    expect(cold.b).toBeCloseTo(0.755 * 2);
    expect(cold.flu).toBe(fixture.skills['interval:5/up/strings:4-3'].tempo);
    expect([cold.n, cold.hl, cold.held, cold.lapses]).toEqual([2, 10 * MIN, 0, 0]);
    expect([cold.last, cold.lastOk]).toEqual([fixture.skills['interval:5/up/strings:4-3'].lastSeen, 0]); // acc < 0.5: no recall to measure from
    const once = migrated.skills['interval:5/up/strings:2-1']; // box 1
    expect([once.hl, once.held, once.lastOk]).toEqual([10 * MIN, 0, fixture.skills['interval:5/up/strings:2-1'].lastSeen]);
    const byBox = (id: string) => [migrated.skills[id].hl, migrated.skills[id].held];
    expect(byBox('note:D/string:6')).toEqual([DAY, 1]);       // box 2
    expect(byBox('note:G/string:6')).toEqual([3 * DAY, 2]);   // box 3
    expect(byBox('note:F/string:6')).toEqual([7 * DAY, 3]);   // box 4
    expect(byBox('note:E/string:6')).toEqual([21 * DAY, 3]);  // box 5: held is capped
    for (const s of Object.values(migrated.skills)) {
      expect(s.lapses).toBe(0);
      expect(Number.isFinite(s.a + s.b + s.hl) && s.a >= 0 && s.b >= 0).toBe(true);
    }
  });
  it('seeds the window of a comfortable skill so that acc 0.9 stays above the bar', () => {
    const seeded = migrated.skills['interval:5/up/strings:6-5']; // acc 0.9, n 10, box 2: v1-comfortable
    expect(seeded.a + seeded.b).toBeCloseTo(N_SEED_COMFORT);
    expect(knowledge(seeded)).toBeCloseTo(0.763, 1e-3);
    const plain = migrated.skills['interval:5/up/strings:5-4']; // acc 0.9, n 6, box 2: not comfortable in v1 (0.709 < 0.75)
    expect(plain.a + plain.b).toBeCloseTo(6);
    expect(knowledge(plain) < DEFAULT_MODEL.comfortMastery).toBe(true);
    const many = migrated.skills['note:E/string:6']; // n 18 > seed: its own count is kept
    expect(many.a + many.b).toBeCloseTo(18);
  });
  it('seeds a v1-comfortable skill below 0.9 accuracy at 0.9, so it stays comfortable too', () => {
    // v1's gate needs acc ≈ 0.76 once n ≥ 10: acc 0.887 · 0.978 · tempo 0.869 = 0.754 and 0.78 · 1 · 1 both pass it.
    const at = 1_760_000_000_000;
    const leaf = (acc: number, tempo: number, n: number, box: number): SkillStatsV1 => ({ acc, tempo, n, box, due: at + DAY, lastSeen: at });
    const v1State: LearnerStateV1 = {
      schemaVersion: 1,
      skills: {
        'note:C/string:6': leaf(0.887, 0.869, 11, 2),
        'note:D/string:6': leaf(0.78, 1, 30, 3),
        'note:E/string:6': leaf(0.78, 1, 30, 1), // box 1: not comfortable in v1, so not seeded
      },
      help: {}, recent: [], passed: {},
    };
    const out = migrateV1(v1State);
    const before = (v1State as unknown as LearnerStateV1Frozen).skills;
    for (const id of ['note:C/string:6', 'note:D/string:6']) {
      expect(v1.isComfortable(before[id])).toBe(true);
      expect(comfortableV2(out.skills[id])).toBe(true);
      expect(out.skills[id].a / (out.skills[id].a + out.skills[id].b)).toBeCloseTo(ACC_SEED_COMFORT);
    }
    expect(out.skills['note:C/string:6'].a + out.skills['note:C/string:6'].b).toBeCloseTo(N_SEED_COMFORT);
    expect(out.skills['note:D/string:6'].a + out.skills['note:D/string:6'].b).toBeCloseTo(DEFAULT_MODEL.nMax);
    const plain = out.skills['note:E/string:6'];
    expect(v1.isComfortable(before['note:E/string:6'])).toBe(false);
    expect([plain.a, plain.b]).toEqual([0.78 * DEFAULT_MODEL.nMax, (1 - 0.78) * DEFAULT_MODEL.nMax]);
    expect(comfortableV2(plain)).toBe(false);
  });
  it('keeps comfortable skills comfortable and the others not: upgrade day changes nothing', () => {
    for (const id of Object.keys(migrated.skills)) {
      const before = v1.isComfortable(asV1.skills[id]);
      const after = comfortableV2(migrated.skills[id]);
      if (before !== after) throw new Error(`${id}: comfortable ${before} in v1, ${after} in v2`);
    }
    expect(comfortableV2(migrated.skills['interval:5/up/strings:6-5'])).toBe(true);
    expect(comfortableV2(migrated.skills['note:E/string:6'])).toBe(true);
    expect(comfortableV2(migrated.skills['interval:5/up/strings:5-4'])).toBe(false);
    expect(comfortableV2(migrated.skills['interval:5/up/strings:4-3'])).toBe(false);
  });
  it('keeps every v1-passed drill passed and not slipped', () => {
    expect(migrated.passed).toEqual(fixture.passed);
    for (const id of Object.keys(fixture.passed)) {
      const drill = curriculum.find((d) => d.id === id)!;
      expect(drill !== undefined).toBe(true);
      expect(hasSlipped(migrated, drill)).toBe(false);
      expect(drillProgress(migrated, drill).progress >= 0.9 - 1e-9).toBe(true);
      expect(drill.skills.every((s) => comfortableV2(migrated.skills[s]))).toBe(true);
    }
  });
  it('recommends the same drill per track before and after', () => {
    for (const track of TRACKS) {
      const before = v1.recommendDrill(asV1, curriculumV1, track.id)?.id;
      const after = recommendDrill(migrated, curriculum, track.id)?.id;
      if (before !== after) throw new Error(`${track.id}: ${String(before)} before, ${String(after)} after`);
    }
    expect(recommendDrill(migrated, curriculum, 'fretboard')!.id).toBe('fretboard/5/all');
    expect(recommendDrill(migrated, curriculum, 'intervals')!.id).toBe('intervals/5/up/adjacent');
  });
  it('carries help (at level 1 at most), recent and passed over and starts boost, warm-up and lastActive fresh', () => {
    expect(migrated.schemaVersion).toBe(2);
    // v1 showed levels 1–3 alike; v2's 2 and 3 play the sound and hide the name, so they are earned again from level 1.
    expect(Object.keys(migrated.help).sort()).toEqual(Object.keys(fixture.help).sort());
    for (const [group, h] of Object.entries(fixture.help)) expect(migrated.help[group]).toEqual({ level: Math.min(h.level, 1), good: 0, misses: 0 });
    expect(Object.values(fixture.help).some((h) => h.level === 3)).toBe(true);
    expect(Math.max(...Object.values(migrated.help).map((h) => h.level))).toBe(1);
    expect(migrated.recent).toEqual(fixture.recent);
    expect(migrated.boost).toEqual({});
    expect(migrated.warmup).toBe(0);
    expect(migrated.lastActive).toBe(Math.max(...Object.keys(migrated.skills).map((id) => fixture.skills[id].lastSeen)));
    expect(migrateV1({ schemaVersion: 1, skills: {}, help: {}, recent: [], passed: {} }).lastActive).toBe(0);
  });
  it('does not modify its input', () => {
    expect(JSON.stringify(fixture)).toBe(JSON.stringify(JSON.parse(fixtureJson)));
  });
  it('takes the last v1 answer as the last quiz answer', () => {
    for (const [id, s] of Object.entries(migrated.skills)) expect(s.lastQ).toBe(fixture.skills[id].lastSeen);
  });
  it('round-trips through JSON; parseState migrates v1 on read and still rejects unknown versions', () => {
    expect(parseState(JSON.stringify(migrated))).toEqual(migrated);
    expect(parseState(fixtureJson)).toEqual(migrated);
    // A v2 state written before lastQ existed reads it as `last`.
    const { lastQ: _dropped, ...old } = migrated.skills['note:E/string:6'];
    const early = parseState(JSON.stringify({ ...migrated, skills: { 'note:E/string:6': { ...old, last: 123 } } }));
    expect(early.skills['note:E/string:6'].lastQ).toBe(123);
    expect(() => parseState('{"schemaVersion":99}')).toThrow(/Unsupported/);
    expect(() => parseState('{}')).toThrow(/Unsupported/);
  });
});
