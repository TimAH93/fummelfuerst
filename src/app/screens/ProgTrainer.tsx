import { useEffect, useRef, useState } from 'preact/hooks';
import {
  DEFAULT_TRAINER, Key, ProgChord, TrainerState, VARIATIONS, analyzeProgression, chord, chordFunction, keyScale, nextChord, nudgeBpm, onPlayed,
  onSlot, pcToNote, spellInKey, startTrainer, suggestVoicing,
} from '../../core';
import { Piano } from '../components/Piano';
import { MetronomeHandle, beep, startMetronome } from '../lib/metronome';
import { useMidi } from '../lib/midi';
import { keyName, showChord } from '../lib/names';
import { Settings } from '../lib/store';
import { useWakeLock } from '../lib/wakeLock';

interface Props {
  chords: ProgChord[];
  bpm?: number;
  settings: Settings;
  onExit: () => void;
}

const BEATS_PER_BAR = 4;

/**
 * Progression trainer: the click runs slowly, the chord to play lies amber on the keys with the
 * next one announced, a clean round speeds it up, the target tempo brings rhythm variations.
 */
export function ProgTrainer({ chords, bpm: startBpm, settings, onExit }: Props) {
  useWakeLock();
  const style = settings.noteNames;
  const [state, setState] = useState<TrainerState>(() => startTrainer({ chords, ...DEFAULT_TRAINER, startBpm: startBpm ?? DEFAULT_TRAINER.startBpm, targetBpm: Math.max((startBpm ?? DEFAULT_TRAINER.startBpm) + 24, DEFAULT_TRAINER.targetBpm) }));
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState<{ bar: number; beat: number; countIn: boolean } | null>(null);
  const [targetText, setTargetText] = useState(String(state.config.targetBpm));
  const metro = useRef<MetronomeHandle | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const barCount = useRef(0);

  const fit = analyzeProgression(chords)[0];
  const key: Key | null = fit ? { tonic: fit.tonic, mode: fit.mode } : null;
  const nameOf = (c: ProgChord) => showChord(chord(key ? spellInKey(keyScale(key), c.rootPc).note : pcToNote(c.rootPc, 'flat'), c.typeId), style);
  const romanOf = (c: ProgChord) => (key ? chordFunction(key, c).roman : '');

  const midi = useMidi((settled) => { if (running) setState((s) => onPlayed(s, settled)); }, 3);

  const stopClick = () => { metro.current?.stop(); metro.current = null; };
  const startClick = async (bpm: number, countIn: number) => {
    stopClick();
    barCount.current = 0;
    metro.current = await startMetronome(bpm, (b) => {
      setBeat(b);
      if (b.countIn || b.beat !== 1) return;
      // A new bar: the first one is slot 0 of the round; each further bar moves the slot on.
      if (barCount.current++ === 0) return;
      setState((s) => {
        const next = onSlot(s);
        if (next.lastRound) void beep().catch(() => {});
        if (next.bpm !== s.bpm || next.done) window.setTimeout(() => { if (next.done) stopClick(); else void startClick(next.bpm, 0); }, 0);
        return next;
      });
    }, countIn);
  };
  const start = () => {
    const targetBpm = Math.max(state.bpm, Number(targetText) || state.config.targetBpm);
    setState(startTrainer({ ...state.config, startBpm: state.bpm, targetBpm }));
    setRunning(true);
    void startClick(state.bpm, 1);
  };
  const stop = () => { setRunning(false); stopClick(); setBeat(null); };
  useEffect(() => () => stopClick(), []);
  useEffect(() => { if (state.done) setRunning(false); }, [state.done]);

  const current = chords[state.index];
  const coming = nextChord(state);
  const target = suggestVoicing(current);
  const hit = state.hits[state.index];
  const variation = VARIATIONS[state.variation];
  const atTarget = state.bpm >= state.config.targetBpm;
  const subdivisions = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5];

  return (
    <main class="screen trainer">
      <header class="bar">
        <span class="drill-name">Folge üben{key ? ` · ${keyName(key.tonic, key.mode, style)}` : ''}</span>
        <div class="row">
          <span class="meta">{state.bpm} BPM · Ziel {state.config.targetBpm} · Runde {state.round}</span>
          <button class="quiet" onClick={() => { stop(); onExit(); }}>Fertig</button>
        </div>
      </header>

      <div class="trail" data-testid="trainer-chain">
        {chords.map((c, i) => (
          <span class={`trail-chip${running && i === state.index ? ' on' : ''}${state.hits[i] ? ' hit' : ''}`}>
            <span class="trail-name">{state.hits[i] ? '✓ ' : ''}{nameOf(c)}</span>
            <span class="trail-roman">{romanOf(c)}</span>
          </span>
        ))}
      </div>

      {!running && !state.done && (
        <section class="focus">
          <p class="eyebrow">Langsam anfangen</p>
          <h1 class="drill-title">Jeder Akkord einen Takt. Die Tasten leuchten, du hast Zeit.</h1>
          <div class="row wrap center">
            <button class="pill" onClick={() => setState(nudgeBpm(state, -4))}>−4</button>
            <span class="context">{state.bpm} BPM</span>
            <button class="pill" onClick={() => setState(nudgeBpm(state, 4))}>+4</button>
            <label class="field narrow inline"><span class="field-label">Ziel</span>
              <input class="field-input" inputMode="numeric" value={targetText} onInput={(e) => setTargetText((e.target as HTMLInputElement).value.replace(/\D/g, ''))} data-testid="target" /></label>
          </div>
          <p class="meta">Saubere Runde = +{state.config.stepBpm} BPM. Am Ziel kommen Rhythmus-Varianten: {VARIATIONS.map((v) => v.name).join(' · ')}.</p>
          <button class="primary" onClick={start} disabled={midi.devices.length === 0 || chords.length === 0} data-testid="trainer-start">▶ Los · ein Takt Vorzähler</button>
          {midi.devices.length === 0 && <p class="meta">Kein Keyboard – am FLkey anschließen oder koppeln</p>}
        </section>
      )}

      {running && (
        <section class="focus" data-testid="trainer-live">
          <div class="beat-dots">
            {[1, 2, 3, 4].map((b) => <span class={`beat-dot${beat?.beat === b ? ' on' : ''}${beat?.countIn ? ' count' : ''}`} />)}
            <span class="meta">{beat?.countIn ? 'Vorzähler' : state.lastRound === 'clean' ? `✓ Runde sauber · ${state.bpm} BPM` : state.lastRound === 'missed' ? 'Runde mit Lücken · Tempo bleibt' : `Runde ${state.round}`}</span>
          </div>
          <div class={`target ${hit ? 'ok' : ''}`} data-testid="trainer-now">{hit ? '✓ ' : ''}{nameOf(current)}</div>
          <div class="context">danach <b>{nameOf(coming)}</b>{atTarget ? ` · ${variation.name}: ${variation.hint}` : ''}</div>
          <Piano marks={{ held: midi.held, pick: target, right: hit ? midi.held : [] }} noteNames={style} />
          {atTarget && (
            <div class="rhythm" data-testid="rhythm">
              {subdivisions.map((b) => <span class={`rhythm-dot${variation.beats.includes(b) ? ' on' : ''}${Number.isInteger(b) ? ' main' : ''}`}>{Number.isInteger(b) ? b : '+'}</span>)}
            </div>
          )}
          <button class="secondary" onClick={stop} data-testid="trainer-stop">■ Stopp</button>
        </section>
      )}

      {state.done && (
        <section class="focus">
          <p class="eyebrow ok">Geschafft</p>
          <h1 class="drill-title">{state.config.targetBpm} BPM, alle Varianten sauber.</h1>
          <p class="meta">{state.round - 1} Runden. Nächstes Mal: Ziel höher setzen oder eine andere Folge.</p>
          <button class="primary" onClick={() => { setState(startTrainer({ ...state.config, startBpm: state.config.targetBpm - 8, targetBpm: state.config.targetBpm + 12 })); setTargetText(String(state.config.targetBpm + 12)); }}>Noch mal, schneller</button>
        </section>
      )}
    </main>
  );
}
