import { describe, expect, it } from './expect';
import { DEFAULT_CONTEXT, STANDARD, buildCatalog } from '../src/core';
import { Edge, TRANSFER_S, buildEdges, relatedSkills, relativeMinorDegree } from '../src/core/mastery/relations';
import { difficulty } from '../src/core/mastery/difficulty';
import { SIMPLER_TYPE } from '../src/core/theory/chord';

const ctx = DEFAULT_CONTEXT;
const ids = buildCatalog(ctx).map((c) => c.skill);
const catalog = new Set(ids);
const intervals = ids.filter((id) => id.startsWith('interval:'));
const notes = ids.filter((id) => id.startsWith('note:'));
const triads = ids.filter((id) => id.startsWith('triad:'));
const melodies = ids.filter((id) => id.startsWith('melody:'));

const edgesOf = (id: string, kind: Edge['kind']): Edge[] => relatedSkills(id, ctx).filter((e) => e.kind === kind);
const edgeTo = (from: string, to: string): Edge | undefined => relatedSkills(from, ctx).find((e) => e.to === to);

/** Interval ids whose two strings sit on opposite sides of the G/B pair (guitarist numbers 3 and 2). */
const crossesGB = (id: string): boolean => {
  const m = /strings:(\d)-(\d)/.exec(id)!;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return Math.min(a, b) <= 2 && Math.max(a, b) >= 3;
};

/** Connected components over edges of one kind, as sorted member lists. */
function components(members: string[], kind: Edge['kind']): string[][] {
  const parent = new Map(members.map((m) => [m, m]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  for (const m of members) for (const e of edgesOf(m, kind)) parent.set(find(m), find(e.to));
  const groups = new Map<string, string[]>();
  for (const m of members) groups.set(find(m), [...(groups.get(find(m)) ?? []), m]);
  return [...groups.values()];
}

describe('relations', () => {
  it('never points outside the catalog', () => {
    for (const id of ids) for (const e of relatedSkills(id, ctx)) expect(catalog.has(e.to)).toBe(true);
    expect(relatedSkills('note:C/string:9', ctx)).toEqual([]);
    expect(relatedSkills('interval:b3', ctx)).toEqual([]);
  });

  it('is symmetric in kind and strength except for simpler-voicing', () => {
    for (const id of ids) {
      for (const e of relatedSkills(id, ctx)) {
        const back = edgeTo(e.to, id);
        expect(back?.kind).toBe(e.kind);
        if (e.kind !== 'simpler-voicing') expect(back?.s).toBe(e.s);
        expect(e.to === id).toBe(false);
      }
    }
  });

  it('gives all 132 interval skills exactly one mirror, the same two positions read the other way', () => {
    expect(intervals.length).toBe(132);
    for (const id of intervals) {
      const [m] = edgesOf(id, 'mirror');
      expect(edgesOf(id, 'mirror').length).toBe(1);
      expect(m.s).toBe(TRANSFER_S.mirror);
      expect(edgeTo(m.to, id)?.kind).toBe('mirror');
    }
    expect(edgesOf('interval:3/up/strings:5-4', 'mirror')[0].to).toBe('interval:3/down/strings:4-5');
    expect(edgesOf('interval:8/down/strings:1-4', 'mirror')[0].to).toBe('interval:8/up/strings:4-1');
  });

  it('groups intervals into 60 same-shape classes: 16 singletons, 30 pairs, 14 quads', () => {
    const classes = components(intervals, 'same-shape');
    expect(classes.length).toBe(60);
    const sizes = classes.reduce<Record<number, number>>((acc, c) => ({ ...acc, [c.length]: (acc[c.length] ?? 0) + 1 }), {});
    expect(sizes).toEqual({ 1: 16, 2: 30, 4: 14 });
    // A class is a clique with one strength, and a shape never straddles the G/B pair on one side only.
    for (const c of classes) {
      for (const a of c) {
        expect(edgesOf(a, 'same-shape').map((e) => e.to).sort()).toEqual(c.filter((b) => b !== a).sort());
        for (const e of edgesOf(a, 'same-shape')) expect(e.s).toBe(TRANSFER_S['same-shape']);
        expect(crossesGB(a)).toBe(crossesGB(c[0]));
      }
    }
    expect(edgesOf('interval:3/up/strings:5-4', 'same-shape').map((e) => e.to).sort())
      .toEqual(['interval:3/up/strings:2-1', 'interval:3/up/strings:4-3', 'interval:3/up/strings:6-5']);
    expect(edgesOf('interval:3/up/strings:3-2', 'same-shape')).toEqual([]);
  });

  it('links degree neighbours on the same pair and direction only', () => {
    expect(edgesOf('interval:b3/up/strings:5-4', 'degree-neighbour').map((e) => e.to).sort())
      .toEqual(['interval:2/up/strings:5-4', 'interval:3/up/strings:5-4']);
    expect(edgesOf('interval:4/up/strings:5-4', 'degree-neighbour').map((e) => e.to)).toContain('interval:b5/up/strings:5-4');
    // b2 on 5-4 is no catalog skill, so the second neighbour of '2' never appears as a phantom id.
    expect(catalog.has('interval:b2/up/strings:5-4')).toBe(false);
    expect(edgesOf('interval:2/up/strings:5-4', 'degree-neighbour').map((e) => e.to)).toEqual(['interval:b3/up/strings:5-4']);
  });

  it('relates triad grips across sets with the same gaps: only 6-5-4 ≅ 5-4-3', () => {
    const all = triads.flatMap((id) => edgesOf(id, 'same-gaps').map((e) => [id, e.to] as const));
    expect(all.length).toBe(22);
    for (const [a, b] of all) {
      const sets = [a, b].map((id) => /strings:(.+)$/.exec(id)![1]).sort();
      expect(sets).toEqual(['5-4-3', '6-5-4']);
      expect(a.replace(/strings:.+$/, '')).toBe(b.replace(/strings:.+$/, ''));
    }
    expect(edgesOf('triad:maj/inv:0/strings:6-5-4', 'same-gaps')).toEqual([{ to: 'triad:maj/inv:0/strings:5-4-3', kind: 'same-gaps', s: 0.6 }]);
    expect(edgesOf('triad:maj/inv:0/strings:4-3-2', 'same-gaps')).toEqual([]);
    expect(edgesOf('triad:maj/inv:0/strings:3-2-1', 'same-gaps')).toEqual([]);
    // dim/inv:0 exists on neither low set, so the missing counterpart produces no phantom edge.
    expect(triads.includes('triad:dim/inv:0/strings:6-5-4')).toBe(false);
  });

  it('links inversions of one grip and of one keys chord', () => {
    expect(edgesOf('triad:maj/inv:0/strings:6-5-4', 'inversion-sibling').map((e) => e.to).sort())
      .toEqual(['triad:maj/inv:1/strings:6-5-4', 'triad:maj/inv:2/strings:6-5-4']);
    expect(edgesOf('keys:maj/inv:0', 'inversion-sibling').map((e) => e.to).sort()).toEqual(['keys:maj/inv:1', 'keys:maj/inv:2']);
    expect(edgesOf('keys:maj/inv:0', 'inversion-sibling')[0].s).toBe(TRANSFER_S['inversion-sibling']);
  });

  it('bridges keys and guitar triads of the same type and inversion', () => {
    expect(edgesOf('keys:maj/inv:0', 'keys-guitar').map((e) => e.to).sort())
      .toEqual(['triad:maj/inv:0/strings:3-2-1', 'triad:maj/inv:0/strings:4-3-2', 'triad:maj/inv:0/strings:5-4-3', 'triad:maj/inv:0/strings:6-5-4']);
    expect(edgesOf('keys:dim/inv:0', 'keys-guitar').map((e) => e.to).sort())
      .toEqual(['triad:dim/inv:0/strings:3-2-1', 'triad:dim/inv:0/strings:4-3-2']);
    expect(edgeTo('triad:min/inv:2/strings:4-3-2', 'keys:min/inv:2')).toEqual({ to: 'keys:min/inv:2', kind: 'keys-guitar', s: 0.3 });
    expect(edgeTo('triad:min/inv:2/strings:4-3-2', 'keys:min/inv:1')).toBe(undefined);
  });

  it('pairs each note with its octave string 6 ↔ 1 and scales same-pc by string distance', () => {
    const octave = notes.flatMap((id) => edgesOf(id, 'octave-string').map((e) => [id, e.to] as const));
    expect(octave.length).toBe(24);
    for (const [a, b] of octave) {
      expect([a, b].map((id) => id.slice(-1)).sort()).toEqual(['1', '6']);
      expect(a.split('/')[0]).toBe(b.split('/')[0]);
    }
    expect(edgeTo('note:C/string:6', 'note:C/string:1')).toEqual({ to: 'note:C/string:1', kind: 'octave-string', s: 0.8 });
    expect(edgeTo('note:C/string:6', 'note:C/string:5')?.s).toBeCloseTo(0.3);
    expect(edgeTo('note:C/string:6', 'note:C/string:4')?.s).toBeCloseTo(0.45);
    expect(edgeTo('note:C/string:6', 'note:C/string:3')?.s).toBeCloseTo(0.2);
    // Across the G/B pair the shape shifts a fret: ×0.7.
    expect(edgeTo('note:C/string:6', 'note:C/string:2')?.s).toBeCloseTo(0.2 * 0.7);
    expect(edgeTo('note:C/string:3', 'note:C/string:2')?.s).toBeCloseTo(0.3 * 0.7);
    expect(edgeTo('note:C/string:4', 'note:C/string:2')?.s).toBeCloseTo(0.45 * 0.7);
    expect(edgeTo('note:C/string:2', 'note:C/string:1')?.s).toBeCloseTo(0.3);
  });

  it('links fret neighbours on the same string, wrapping B ↔ C', () => {
    expect(edgesOf('note:C/string:6', 'fret-neighbour').map((e) => e.to).sort()).toEqual(['note:B/string:6', 'note:C#/string:6']);
    expect(edgesOf('note:E/string:1', 'fret-neighbour').map((e) => e.to).sort()).toEqual(['note:D#/string:1', 'note:F/string:1']);
    for (const id of notes) expect(edgesOf(id, 'fret-neighbour').length).toBe(2);
  });

  it('pairs each melody degree with its relative-key twin', () => {
    expect(relativeMinorDegree(6)).toBe(1);
    expect(relativeMinorDegree(1)).toBe(3);
    expect(relativeMinorDegree(7)).toBe(2);
    for (const id of melodies) expect(edgesOf(id, 'relative-key').length).toBe(1);
    expect(edgesOf('melody:major/deg:6', 'relative-key')).toEqual([{ to: 'melody:minor/deg:1', kind: 'relative-key', s: 0.5 }]);
    expect(edgesOf('melody:minor/deg:3', 'relative-key')[0].to).toBe('melody:major/deg:1');
    expect(edgesOf('melody:major/deg:5', 'relative-key')[0].to).toBe('melody:minor/deg:7');
  });

  it('rates a shell voicing as proof of its simpler colour more than the other way round', () => {
    expect(SIMPLER_TYPE.maj9).toBe('maj7');
    expect(relatedSkills('voicing:maj9', ctx)).toEqual([{ to: 'voicing:maj7', kind: 'simpler-voicing', s: 0.7 }]);
    expect(edgeTo('voicing:maj7', 'voicing:maj9')).toEqual({ to: 'voicing:maj9', kind: 'simpler-voicing', s: 0.4 });
    expect(edgesOf('voicing:dom7', 'simpler-voicing').map((e) => e.to).sort()).toEqual(['voicing:dom13', 'voicing:dom7s9', 'voicing:dom9']);
    // m7b5 → dim is in SIMPLER_TYPE but dim is no voicing skill: no phantom edge.
    expect(relatedSkills('voicing:m7b5', ctx)).toEqual([]);
    expect(relatedSkills('voicing:m9', ctx)).toEqual([{ to: 'voicing:m7', kind: 'simpler-voicing', s: 0.7 }]);
  });

  it('memoises per skill and tuning', () => {
    expect(relatedSkills('note:C/string:6', ctx) === relatedSkills('note:C/string:6', { ...ctx, tuning: STANDARD })).toBe(true);
  });

  it('buildEdges keeps only targets inside the given skills', () => {
    const subset = ['note:C/string:6', 'note:C/string:1', 'note:C#/string:6', 'keys:maj/inv:0', 'triad:maj/inv:0/strings:6-5-4', 'bogus'];
    const edges = buildEdges(subset, ctx);
    expect(Object.keys(edges).sort()).toEqual([...subset].sort());
    for (const id of subset) for (const e of edges[id]) expect(subset.includes(e.to)).toBe(true);
    expect(edges['note:C/string:6'].map((e) => e.kind).sort()).toEqual(['fret-neighbour', 'octave-string']);
    expect(edges['keys:maj/inv:0']).toEqual([{ to: 'triad:maj/inv:0/strings:6-5-4', kind: 'keys-guitar', s: 0.3 }]);
    expect(edges.bogus).toEqual([]);
    // The full catalog reproduces relatedSkills exactly.
    const full = buildEdges(ids, ctx);
    for (const id of ids) expect(full[id]).toEqual(relatedSkills(id, ctx));
  });
});

describe('difficulty', () => {
  it('stays in 0..1 for every catalog skill', () => {
    for (const id of ids) {
      const d = difficulty(id, ctx);
      expect(d >= 0 && d <= 1).toBe(true);
    }
  });

  it('orders the naturals on string 6 by fret: E F G A B C D', () => {
    const naturals = ['E', 'F', 'G', 'A', 'B', 'C', 'D'].map((n) => difficulty(`note:${n}/string:6`, ctx));
    for (let i = 1; i < naturals.length; i++) expect(naturals[i]).toBeGreaterThan(naturals[i - 1]);
    expect(difficulty('note:E/string:6', ctx)).toBe(0);
    expect(difficulty('note:F#/string:6', ctx)).toBeCloseTo(0.6 * 2 / 12 + 0.4);
  });

  it('weighs intervals by G/B crossing, string distance, direction and fret offset', () => {
    expect(difficulty('interval:4/up/strings:5-4', ctx)).toBeCloseTo(0);          // same fret, adjacent, up
    expect(difficulty('interval:4/up/strings:3-2', ctx)).toBeCloseTo(0.3 + 0.05);  // crosses G/B, one fret up
    expect(difficulty('interval:4/down/strings:4-5', ctx)).toBeCloseTo(0.2);       // the mirror, read downwards
    expect(difficulty('interval:3/up/strings:5-4', ctx)).toBeCloseTo(0.05);        // one fret back
    expect(difficulty('interval:5/up/strings:6-4', ctx)).toBeCloseTo(0.3 + 0.2 * 3 / 4); // string skip, offset −3
  });

  it('weighs triads by inversion, type, G/B crossing and the low set', () => {
    expect(difficulty('triad:maj/inv:0/strings:5-4-3', ctx)).toBeCloseTo(0);
    expect(difficulty('triad:maj/inv:0/strings:6-5-4', ctx)).toBeCloseTo(0.2);
    expect(difficulty('triad:maj/inv:0/strings:4-3-2', ctx)).toBeCloseTo(0.25);
    expect(difficulty('triad:dim/inv:2/strings:3-2-1', ctx)).toBeCloseTo(0.25 + 0.3 + 0.25);
    expect(difficulty('keys:maj/inv:0', ctx)).toBe(0);
    expect(difficulty('keys:aug/inv:1', ctx)).toBeCloseTo(0.15 + 0.4);
  });

  it('weighs voicings by extensions and melody degrees by position', () => {
    expect(difficulty('voicing:maj7', ctx)).toBe(0);
    expect(difficulty('voicing:maj9', ctx)).toBeCloseTo(0.15);
    expect(difficulty('voicing:dom7s9', ctx)).toBeCloseTo(0.15 + 0.3);
    expect(difficulty('voicing:dom13', ctx)).toBeCloseTo(0.3 + 0.2);
    expect(difficulty('melody:major/deg:1', ctx)).toBeCloseTo(0.2);
    expect(difficulty('melody:major/deg:4', ctx)).toBeCloseTo(0.5);
    expect(difficulty('melody:minor/deg:7', ctx)).toBeCloseTo(0.8);
    expect(difficulty('not-a-skill', ctx)).toBe(0.5);
  });
});
