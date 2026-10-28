import { useState } from 'preact/hooks';
import {
  FLKEY_HIGH, FLKEY_LOW, Key, PAD_COUNT, PadBank, analyzeProgression, chord, chordFunction, padChord, padSteps, parseNote, parseProgression,
  pcToNote, progressionText, suggestVoicing, toPc,
} from '../../core';
import { Piano, PianoMarks } from '../components/Piano';
import { useMidi } from '../lib/midi';
import { keyName, showChord, showNote } from '../lib/names';
import { Settings } from '../lib/store';
import { useWakeLock } from '../lib/wakeLock';

interface Props {
  pads: PadBank;
  onPads: (b: PadBank) => void;
  settings: Settings;
  onExit: () => void;
}

/**
 * Pad map for the FLkey's User Chord Mode: what is on each of the 16 pads, and the key-by-key
 * recipe for storing one (hold the pad, press the keys one at a time; Octave – for a bass below C3).
 */
export function Pads({ pads, onPads, settings, onExit }: Props) {
  useWakeLock();
  const [sel, setSel] = useState<number | null>(null);
  const [arming, setArming] = useState(false);
  const [typed, setTyped] = useState('');
  const [typeError, setTypeError] = useState('');
  const [note, setNote] = useState('');
  const style = settings.noteNames;

  const midi = useMidi((settled) => {
    if (!arming || sel === null) return;
    setArming(false);
    onPads(pads.map((p, i) => (i === sel ? { midis: [...settled].sort((a, b) => a - b) } : p)));
    setNote(`Pad ${sel + 1} vom Keyboard übernommen`);
  }, 3);

  const chords = pads.map(padChord);
  const locked: Key | null = settings.jamKey ? { tonic: parseNote(settings.jamKey.tonic), mode: settings.jamKey.mode } : null;
  const fit = analyzeProgression(chords.flatMap((c) => (c ? [c] : [])))[0];
  const key: Key | null = locked ?? (fit ? { tonic: fit.tonic, mode: fit.mode } : null);
  const nameOf = (i: number) => {
    const c = chords[i];
    if (!c) return null;
    const fn = key ? chordFunction(key, c) : null;
    return { symbol: showChord(chord(fn ? fn.root : pcToNote(c.rootPc, 'flat'), c.typeId), style), roman: fn?.roman ?? '' };
  };

  const pad = sel !== null ? pads[sel] : null;
  const steps = pad ? padSteps(pad) : [];
  const marks: PianoMarks = { held: steps.filter((s) => s.octave === 0).map((s) => s.key), right: steps.filter((s) => s.octave !== 0).map((s) => s.key), dots: {} };
  steps.filter((s) => s.octave !== 0).forEach((s) => { marks.dots![s.key] = { kind: 'colour', label: s.octave < 0 ? `${s.octave}` : `+${s.octave}` }; });
  const recipe: string[] = [];
  let oct = 0;
  for (const s of steps) {
    while (oct > s.octave) { recipe.push('Octave – drücken'); oct--; }
    while (oct < s.octave) { recipe.push('Octave + drücken'); oct++; }
    recipe.push(showNote(pcToNote(toPc(s.midi), 'flat'), style) + (s.key === s.midi ? '' : s.midi < FLKEY_LOW ? ' (tief)' : ' (hoch)'));
  }
  if (oct !== 0) recipe.push(oct < 0 ? 'Octave + zurück' : 'Octave – zurück');

  const setPad = (i: number, midis: number[] | null) => onPads(pads.map((p, j) => (j === i ? (midis ? { midis } : null) : p)));
  const fromText = () => {
    if (sel === null) return;
    try {
      const c = parseProgression(typed)[0];
      if (!c) throw new Error('Akkord eingeben, z. B. Ab13');
      setPad(sel, suggestVoicing(c));
      setTypeError('');
      setNote(`Pad ${sel + 1}: Vorschlag für ${typed.trim()} eingetragen`);
    } catch (e) {
      setTypeError(e instanceof Error ? e.message : String(e));
    }
  };
  const copyAll = async () => {
    const lines = pads.flatMap((p, i) => {
      const c = chords[i];
      return p && c ? [`Pad ${i + 1}: ${progressionText([c], key)} (${[...p.midis].sort((a, b) => a - b).map((m) => showNote(pcToNote(toPc(m), 'flat'), 'international')).join(' ')})`] : [];
    });
    try {
      await navigator.clipboard.writeText(lines.join('\n') || 'Keine Pads belegt');
      setNote('Pad-Liste kopiert');
    } catch {
      setNote('Kopieren ging nicht');
    }
  };

  return (
    <main class="screen pads">
      <header class="bar">
        <span class="drill-name">Pad-Karte · User Chord Mode</span>
        <div class="row">
          {key && <span class="meta">Stufen in {keyName(key.tonic, key.mode, style)}</span>}
          <button class="quiet" onClick={copyAll}>Liste kopieren</button>
          <button class="quiet" onClick={onExit}>Fertig</button>
        </div>
      </header>

      <section class="pads-grid" aria-label="Pads" data-testid="pads-grid">
        {Array.from({ length: PAD_COUNT }, (_, i) => {
          const n = nameOf(i);
          return (
            <button class={`pad${sel === i ? ' on' : ''}${n ? '' : ' empty'}`} onClick={() => { setSel(i); setArming(false); setNote(''); }} aria-pressed={sel === i}>
              <span class="pad-no">{i + 1}</span>
              <span class="pad-name">{n ? n.symbol : '–'}</span>
              <span class="pad-roman">{n?.roman ?? ''}</span>
            </button>
          );
        })}
      </section>

      {sel === null ? (
        <p class="meta center">Pad antippen: zeigt die Tasten und wie du den Akkord auf dem FLkey speicherst.</p>
      ) : (
        <section class="pad-detail" data-testid="pad-detail">
          <div class="context">
            <b>Pad {sel + 1}</b>{nameOf(sel) ? <> · {nameOf(sel)!.symbol}{nameOf(sel)!.roman ? ` · ${nameOf(sel)!.roman}` : ''}</> : ' · leer'}
          </div>
          <Piano low={FLKEY_LOW} high={FLKEY_HIGH} marks={marks} noteNames={style} />
          {pad ? (
            <ol class="recipe" data-testid="recipe">
              <li>Pad {sel + 1} <b>halten</b> (User Chord Mode an)</li>
              {recipe.map((r) => <li>{r}</li>)}
              <li>Pad loslassen – gespeichert</li>
            </ol>
          ) : (
            <p class="meta">Noch nichts drauf. Akkord auf dem Keyboard greifen und übernehmen, oder eintippen.</p>
          )}
          <div class="row wrap center">
            <button class={arming ? 'pill on' : 'pill'} onClick={() => setArming(!arming)} disabled={midi.devices.length === 0}>
              {arming ? '● Jetzt Akkord greifen …' : '🎹 Vom Keyboard übernehmen'}
            </button>
            <form class="row" onSubmit={(e) => { e.preventDefault(); fromText(); }}>
              <input class="field-input" value={typed} placeholder="z. B. Ab13" autoComplete="off" spellcheck={false} size={10}
                onInput={(e) => setTyped((e.target as HTMLInputElement).value)} data-testid="pad-typed" />
              <button class="pill" type="submit" disabled={!typed.trim()}>Vorschlag eintragen</button>
            </form>
            {pad && <button class="pill" onClick={() => { setPad(sel, null); setNote(`Pad ${sel + 1} geleert`); }}>Leeren</button>}
          </div>
          {typeError && <p class="verdict off small">{typeError}</p>}
          {note && <p class="verdict ok small" data-testid="pad-note">{note}</p>}
        </section>
      )}
    </main>
  );
}
