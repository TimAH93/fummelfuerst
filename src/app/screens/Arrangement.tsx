import { useEffect, useState } from 'preact/hooks';
import { Arrangement as Plan, KIND_NAMES, Section, SectionKind, TEMPLATES, arrangementText, fmtTime, timeline, tips, totalBars, totalSeconds } from '../../core';
import { loadArrangement, saveArrangement } from '../lib/store';

const KINDS = Object.keys(KIND_NAMES) as SectionKind[];

/** Arrangement planner: sections as a timeline with bar numbers and the clock – the map from loop to song. */
export function Arrangement({ onExit }: { onExit: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => void loadArrangement().then(setPlan), []);
  if (!plan) return <main class="screen" />;

  const update = (next: Plan) => {
    setPlan(next);
    setCopied(false);
    void saveArrangement(next);
  };
  const setSections = (sections: Section[]) => update({ ...plan, sections });
  const patch = (i: number, p: Partial<Section>) => setSections(plan.sections.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= plan.sections.length) return;
    const next = [...plan.sections];
    [next[i], next[j]] = [next[j], next[i]];
    setSections(next);
  };
  // Whole phrases (4 bars) once past the first one; single bars below that for intros and tails.
  const step = (bars: number, d: number) => (d > 0 ? (bars < 4 ? bars + 1 : bars + 4) : bars <= 4 ? Math.max(1, bars - 1) : bars - 4);
  const add = () => setSections([...plan.sections, { name: 'Teil', bars: 8, kind: 'verse' }]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(arrangementText(plan));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const total = totalSeconds(plan);
  const tl = timeline(plan);
  const hints = tips(plan);

  return (
    <main class="screen arrangement">
      <header class="bar">
        <span class="drill-name">Arrangement</span>
        <div class="row">
          <label class="field narrow inline">
            <span class="field-label">BPM</span>
            <input class="field-input" inputMode="numeric" value={plan.bpm} data-testid="arr-bpm"
              onInput={(e) => update({ ...plan, bpm: Number((e.target as HTMLInputElement).value.replace(/\D/g, '')) || plan.bpm })} />
          </label>
          <button class="quiet" onClick={onExit}>Fertig</button>
        </div>
      </header>

      <div class="row wrap">
        <span class="field-label">Vorlage:</span>
        {TEMPLATES.map((t) => (
          <button class="pill" onClick={() => update({ bpm: t.bpm, sections: t.sections.map((s) => ({ ...s })) })}>{t.name}</button>
        ))}
      </div>

      <section class="arr-total" data-testid="arr-total">
        <span class="arr-time">{fmtTime(total)}</span>
        <span class="meta">{totalBars(plan)} Takte · {plan.bpm} BPM · {plan.sections.length} Teile</span>
      </section>

      {tl.length > 0 && (
        <div class="timeline" role="img" aria-label="Zeitleiste" data-testid="timeline">
          {tl.map((t) => (
            <div class={`tl-block ${t.section.kind}`} style={{ flex: t.section.bars }} title={`${t.section.name}: Takt ${t.startBar}, ${fmtTime(t.startSec)}`}>
              <span class="tl-name">{t.section.name}</span>
              <span class="tl-bars">{t.section.bars}</span>
            </div>
          ))}
        </div>
      )}

      <section class="sections" data-testid="sections">
        {tl.map((t) => (
          <div class="section-row">
            <span class={`sec-swatch ${t.section.kind}`} />
            <input class="field-input sec-name" value={t.section.name} onInput={(e) => patch(t.index, { name: (e.target as HTMLInputElement).value })} aria-label="Name" />
            <select class="field-input sec-kind" value={t.section.kind} onChange={(e) => patch(t.index, { kind: (e.target as HTMLSelectElement).value as SectionKind })} aria-label="Art">
              {KINDS.map((k) => <option value={k}>{KIND_NAMES[k]}</option>)}
            </select>
            <div class="stepper">
              <button class="pill" onClick={() => patch(t.index, { bars: step(t.section.bars, -1) })} aria-label="weniger Takte">−</button>
              <span class="sec-bars">{t.section.bars} T.</span>
              <button class="pill" onClick={() => patch(t.index, { bars: step(t.section.bars, 1) })} aria-label="mehr Takte">+</button>
            </div>
            <span class="meta sec-at">Takt {t.startBar} · {fmtTime(t.startSec)}</span>
            <div class="row">
              <button class="pill" onClick={() => move(t.index, -1)} aria-label="nach oben">▲</button>
              <button class="pill" onClick={() => move(t.index, 1)} aria-label="nach unten">▼</button>
              <button class="pill" onClick={() => setSections(plan.sections.filter((_, j) => j !== t.index))} aria-label="entfernen">✕</button>
            </div>
          </div>
        ))}
        <div class="row wrap">
          <button class="secondary" onClick={add}>+ Teil</button>
          <button class="secondary" onClick={copy} disabled={plan.sections.length === 0}>{copied ? '✓ Kopiert' : 'Plan kopieren'}</button>
        </div>
      </section>

      {hints.length > 0 && (
        <ul class="tips" data-testid="tips">
          {hints.map((h) => <li>{h}</li>)}
        </ul>
      )}
    </main>
  );
}
