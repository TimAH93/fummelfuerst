import { describe, expect, it } from './expect';
import { Arrangement, TEMPLATES, arrangementText, barsFor, fmtTime, timeline, tips, totalBars, totalSeconds } from '../src/core';

const drop = (): Arrangement => ({ bpm: TEMPLATES[0].bpm, sections: TEMPLATES[0].sections.map((s) => ({ ...s })) });

describe('arrangement arithmetic', () => {
  it('places sections on bars and the clock', () => {
    const a = drop();
    expect(totalBars(a)).toBe(36);
    expect(fmtTime(totalSeconds(a))).toBe('1:02'); // 36 bars at 140 BPM ≈ 61.7 s
    const t = timeline(a);
    expect(t.map((x) => x.startBar)).toEqual([1, 9, 17, 33]);
    expect(t.map((x) => fmtTime(x.startSec))).toEqual(['0:00', '0:14', '0:27', '0:55']);
    expect(barsFor(60, 140)).toBe(35);
    expect(barsFor(60, 82)).toBe(21); // 20.5 bars – rounds up
    expect(fmtTime(0)).toBe('0:00');
    expect(fmtTime(125.6)).toBe('2:06');
  });
  it('writes the plan as text', () => {
    const text = arrangementText(drop());
    expect(text.split('\n')[0]).toBe('140 BPM · 36 Takte · 1:02');
    expect(text).toContain('Drop: Takt 17–32 (16) · ab 0:27');
  });
  it('every template is sane', () => {
    for (const t of TEMPLATES) {
      expect(tips({ bpm: t.bpm, sections: t.sections })).toEqual([]);
      expect(totalSeconds({ bpm: t.bpm, sections: t.sections }) >= 50).toBe(true);
    }
  });
});

describe('arrangement tips', () => {
  it('flags long sections, a build-up without drop, a missing outro and a short song', () => {
    const a: Arrangement = { bpm: 140, sections: [{ name: 'Intro', bars: 4, kind: 'intro' }, { name: 'Build-up', bars: 8, kind: 'build' }, { name: 'Loop', bars: 24, kind: 'verse' }] };
    const t = tips(a);
    expect(t.some((x) => x.startsWith('„Loop“ hat 24 Takte'))).toBe(true);
    expect(t.some((x) => x.includes('kommt kein Drop'))).toBe(true);
    expect(t.some((x) => x.startsWith('Kein Outro'))).toBe(true);
    expect(tips({ bpm: 140, sections: [{ name: 'A', bars: 8, kind: 'verse' }, { name: 'Outro', bars: 4, kind: 'outro' }] })).toEqual(['Unter einer Minute (0:21). Für 1:00 bei 140 BPM brauchst du 35 Takte.']);
    expect(tips({ bpm: 140, sections: [{ name: 'A', bars: 7, kind: 'verse' }, { name: 'Outro', bars: 4, kind: 'outro' }] })[0]).toBe('„A“ hat 7 Takte – nicht durch 4 teilbar. Gewollt?');
    expect(tips({ bpm: 140, sections: [] }).length).toBe(1);
  });
});
