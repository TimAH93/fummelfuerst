import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  PARTS,
  ProgChord,
  STUCK,
  analyzeProgression,
  buildBrief,
  chordFromHeld,
  chordType,
  isAmbiguous,
  keyLabel,
  noteName,
  parseProgression,
  pcToNote,
} from '../../core';
import { useMidi } from '../lib/midi';
import { BriefDraft, EMPTY_BRIEF, loadBrief, saveBrief } from '../lib/store';

const CLAUDE_URL = 'https://claude.ai/new';

/** Symbol for a chord picked up from the keyboard; the analysis re-spells it for the key. */
const symbolOf = (c: ProgChord) => noteName(pcToNote(c.rootPc, 'flat')) + chordType(c.typeId).symbol;

export function SongBrief({ onExit }: { onExit: () => void }) {
  const [draft, setDraft] = useState<BriefDraft | null>(null);
  const [recording, setRecording] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => void loadBrief().then(setDraft), []);
  const update = (patch: Partial<BriefDraft>) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    setCopied(false);
    void saveBrief(next);
  };

  const midi = useMidi((midis) => {
    if (!recording || !draft) return;
    const c = chordFromHeld(midis);
    if (c) update({ chords: `${draft.chords.trim()} ${symbolOf(c)}`.trim() });
  });

  const parsed = useMemo(() => {
    if (!draft?.chords.trim()) return { chords: [] as ProgChord[], error: null as string | null };
    try {
      return { chords: parseProgression(draft.chords), error: null };
    } catch (e) {
      return { chords: [] as ProgChord[], error: e instanceof Error ? e.message : String(e) };
    }
  }, [draft?.chords]);

  if (!draft) return <main class="screen" />;

  const fits = analyzeProgression(parsed.chords);
  const best = fits[0];
  const text = buildBrief({
    chords: parsed.chords,
    tempo: Number(draft.tempo) || undefined,
    bars: Number(draft.bars) || undefined,
    parts: draft.parts,
    stuck: draft.stuck,
    references: draft.references,
    note: draft.note,
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const share = () => void navigator.share?.({ title: 'Song-Steckbrief', text }).catch(() => {});
  const togglePart = (p: (typeof PARTS)[number]) =>
    update({ parts: draft.parts.includes(p) ? draft.parts.filter((x) => x !== p) : [...draft.parts, p] });
  const dropLast = () => update({ chords: draft.chords.trim().split(/\s+/).slice(0, -1).join(' ') });

  return (
    <main class="screen brief">
      <header class="bar">
        <span class="drill-name">Song-Steckbrief</span>
        <button class="quiet" onClick={onExit}>Fertig</button>
      </header>

      <div class="brief-grid">
        <section class="brief-form">
          <label class="field">
            <span class="field-label">Akkorde deines Loops</span>
            <input class="field-input big" value={draft.chords} placeholder="Am F C G" autoComplete="off" spellcheck={false}
              onInput={(e) => update({ chords: (e.target as HTMLInputElement).value })} data-testid="chords" />
          </label>
          <div class="row">
            <button class={recording ? 'pill on' : 'pill'} aria-pressed={recording} onClick={() => setRecording(!recording)}
              disabled={midi.devices.length === 0} title={midi.devices.length ? '' : 'Kein Keyboard verbunden'}>
              {recording ? '● Nimmt auf – Akkorde nacheinander greifen' : '🎹 Vom Keyboard aufnehmen'}
            </button>
            <button class="pill" onClick={dropLast} disabled={!draft.chords.trim()}>⌫ Letzten</button>
            <button class="pill" onClick={() => update({ chords: '' })} disabled={!draft.chords.trim()}>Leeren</button>
          </div>
          {parsed.error && <p class="verdict off small">{parsed.error}</p>}

          <div class="row">
            <label class="field narrow">
              <span class="field-label">Tempo (BPM)</span>
              <input class="field-input" inputMode="numeric" value={draft.tempo} placeholder="92"
                onInput={(e) => update({ tempo: (e.target as HTMLInputElement).value.replace(/\D/g, '') })} />
            </label>
            <label class="field narrow">
              <span class="field-label">Loop-Länge (Takte)</span>
              <input class="field-input" inputMode="numeric" value={draft.bars}
                onInput={(e) => update({ bars: (e.target as HTMLInputElement).value.replace(/\D/g, '') })} />
            </label>
          </div>

          <div class="field">
            <span class="field-label">Was hast du schon?</span>
            <div class="row wrap">
              {PARTS.map((p) => (
                <button class={draft.parts.includes(p) ? 'pill on' : 'pill'} aria-pressed={draft.parts.includes(p)} onClick={() => togglePart(p)}>{p}</button>
              ))}
            </div>
          </div>

          <div class="field">
            <span class="field-label">Wo hängst du?</span>
            <div class="row wrap">
              {STUCK.map((s) => (
                <button class={draft.stuck === s ? 'pill on' : 'pill'} aria-pressed={draft.stuck === s} onClick={() => update({ stuck: s })}>{s}</button>
              ))}
            </div>
          </div>

          <label class="field">
            <span class="field-label">3 Songs, die so klingen sollen (optional)</span>
            <textarea class="field-input" rows={3} value={draft.references} placeholder={'Künstler – Titel\n…'}
              onInput={(e) => update({ references: (e.target as HTMLTextAreaElement).value })} />
          </label>
          <label class="field">
            <span class="field-label">Notiz (optional)</span>
            <input class="field-input" value={draft.note} placeholder="z. B. der Refrain fühlt sich zu leer an"
              onInput={(e) => update({ note: (e.target as HTMLInputElement).value })} />
          </label>
        </section>

        <section class="brief-out">
          {best ? (
            <div class="analysis" data-testid="analysis">
              <div class="key">{keyLabel(best)}</div>
              <div class="numerals">
                {best.numerals.map((n) => (
                  <div class={n.diatonic || n.harmonicMinorDominant ? 'numeral' : 'numeral outside'}>
                    <span class="numeral-chord">{n.symbol}</span>
                    <span class="numeral-roman">{n.roman}</span>
                  </div>
                ))}
              </div>
              {isAmbiguous(fits) && (
                <p class="meta">oder {keyLabel(fits[1])}: {fits[1].numerals.map((n) => n.roman).join(' – ')}</p>
              )}
            </div>
          ) : (
            <p class="meta">Akkorde eingeben oder vom Keyboard aufnehmen – dann erkenne ich Tonart und Stufen.</p>
          )}

          <pre class="brief-text" data-testid="brief-text">{text}</pre>
          <div class="row">
            <button class="primary" onClick={copy}>{copied ? '✓ Kopiert' : 'Für Claude kopieren'}</button>
            {'share' in navigator && <button class="secondary" onClick={share}>Teilen</button>}
          </div>
          <p class="meta">
            Dann in deinem Claude-Projekt „Song-Coach“ einfügen ·{' '}
            <a href={CLAUDE_URL} target="_blank" rel="noopener">Claude öffnen</a>
          </p>
          <button class="quiet" onClick={() => update(EMPTY_BRIEF)}>Neuer Song</button>
        </section>
      </div>
    </main>
  );
}
