import { useEffect, useRef, useState } from 'preact/hooks';
import { GridNote, MelodyTracker, guessKey, keyLabel, pcToNote, quantizeMelody, shiftOctave, toPc, writeMidi } from '../../core';
import { Roll } from '../components/Roll';
import { downloadBytes } from '../lib/download';
import { sendFile } from '../lib/link';
import { MetronomeHandle, startMetronome } from '../lib/metronome';
import { MicHandle, startMic } from '../lib/mic';
import { showNote } from '../lib/names';
import { Settings } from '../lib/store';
import { useWakeLock } from '../lib/wakeLock';
import { useLink } from './Link';

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => void;
  onExit: () => void;
}

const MAX_S = 60;

/**
 * Idea recorder: hum or whistle into the tablet, get the line as notes on a beat grid and as a MIDI
 * file for FL Studio – before the idea is gone.
 */
export function Hum({ settings, onSettings, onExit }: Props) {
  useWakeLock();
  const link = useLink();
  const [bpmText, setBpmText] = useState(String(settings.recBpm ?? 82));
  const [click, setClick] = useState(true);
  const [phase, setPhase] = useState<'idle' | 'live' | 'done'>('idle');
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [notes, setNotes] = useState<GridNote[]>([]);
  const [octave, setOctave] = useState(0);
  const [note, setNote] = useState('');
  const mic = useRef<MicHandle | null>(null);
  const metro = useRef<MetronomeHandle | null>(null);
  const tracker = useRef(new MelodyTracker());
  /** Beat 1 of the take: the click's downbeat, or – without a click – the first note. */
  const startMs = useRef<number | null>(null);
  const firstFrame = useRef<number | null>(null);
  const countIn = useRef(false);
  const lastPaint = useRef(0);
  const bpm = Number(bpmText) || 82;
  const style = settings.noteNames;

  useEffect(() => () => { mic.current?.stop(); metro.current?.stop(); }, []);

  const stop = () => {
    mic.current?.stop();
    metro.current?.stop();
    mic.current = null;
    metro.current = null;
    const sung = tracker.current.finish();
    const origin = startMs.current ?? sung[0]?.startMs ?? 0;
    setNotes(quantizeMelody(sung, bpm, origin));
    setPhase('done');
  };
  const start = async () => {
    setError('');
    setNote('');
    setNotes([]);
    setOctave(0);
    tracker.current = new MelodyTracker();
    startMs.current = null;
    firstFrame.current = null;
    try {
      if (click) {
        const h = await startMetronome(bpm, (b) => { countIn.current = b.countIn; setTick((t) => t + 1); }, 1);
        metro.current = h;
        startMs.current = h.startPerfMs;
      }
      mic.current = await startMic((r, t) => {
        if (startMs.current !== null && t < startMs.current) return; // the count-in is not part of the take
        firstFrame.current ??= t;
        tracker.current.push(r, t);
        if (t - lastPaint.current > 100) { lastPaint.current = t; setTick((x) => x + 1); }
        if (t - firstFrame.current > MAX_S * 1000) stop();
      });
      onSettings({ ...settings, recBpm: bpm });
      setPhase('live');
    } catch (e) {
      metro.current?.stop();
      setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Mikrofon nicht erlaubt. In den Einstellungen freigeben.' : 'Kein Mikrofon verfügbar.');
    }
  };

  const now = performance.now();
  const origin = startMs.current ?? tracker.current.notes[0]?.startMs ?? null;
  const elapsedBeats = phase === 'live' && origin !== null ? Math.max(0, ((now - origin) / 60000) * bpm) : 0;
  const liveNotes = phase === 'live' && origin !== null ? quantizeMelody(tracker.current.notes, bpm, origin) : [];
  const current = tracker.current.current();
  const live = current !== null && origin !== null ? { midi: current, startBeat: Math.floor(elapsedBeats * 4) / 4 } : null;
  const shown = shiftOctave(notes, octave);
  const key = guessKey(shown);
  const total = shown.length ? Math.max(...shown.map((n) => n.startBeat + n.beats)) : 0;
  const name = `Idee ${new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '')}${key ? ` ${keyLabel(key)}` : ''}.mid`;
  const bytes = () => writeMidi(shown.map((n) => ({ ...n, velocity: 96 })), bpm, name.replace(/\.mid$/, ''));
  const download = () => { downloadBytes(name, 'audio/midi', bytes()); setNote(`Gespeichert: ${name}`); };
  const toPc_ = () => setNote(sendFile(name, 'audio/midi', bytes()) ? `An den PC geschickt: ${name}` : 'Kein PC gekoppelt');

  return (
    <main class="screen hum">
      <header class="bar">
        <span class="drill-name">Idee summen</span>
        <div class="row">
          <label class="field narrow inline">
            <span class="field-label">BPM</span>
            <input class="field-input" inputMode="numeric" value={bpmText} disabled={phase === 'live'} data-testid="bpm"
              onInput={(e) => setBpmText((e.target as HTMLInputElement).value.replace(/\D/g, ''))} />
          </label>
          <button class="quiet" onClick={() => { mic.current?.stop(); metro.current?.stop(); onExit(); }}>Fertig</button>
        </div>
      </header>

      {phase === 'idle' && (
        <section class="focus">
          <h1 class="drill-title">Summen, pfeifen oder singen – die App schreibt die Noten mit.</h1>
          <div class="row wrap center">
            <button class={click ? 'pill on' : 'pill'} aria-pressed={click} onClick={() => setClick(!click)}>{click ? '● Click an (1 Takt Vorzähler)' : '○ Click aus'}</button>
          </div>
          <p class="meta">Einstimmig, nah ans Tablet, Töne klar absetzen. Bis {MAX_S} Sekunden. Der Ton bleibt auf dem Gerät.</p>
          {error && <p class="verdict off">{error}</p>}
          <button class="primary rec-btn" onClick={start} data-testid="start">● Aufnehmen</button>
        </section>
      )}

      {phase === 'live' && (
        <section class="focus rec" data-testid="hum-live" data-tick={tick}>
          <div class="target" data-testid="hum-note">{current !== null ? showNote(pcToNote(toPc(current), 'flat'), style) : countIn.current ? '1 · 2 · 3 · 4' : '–'}</div>
          <Roll notes={liveNotes} beats={Math.max(8, elapsedBeats + 1)} live={live} />
          <p class="meta">{countIn.current ? 'Vorzähler …' : `${Math.floor(elapsedBeats / 4) + 1}. Takt · ${liveNotes.length} Noten`}</p>
          <button class="primary rec-btn stop" onClick={stop} data-testid="stop">■ Stopp</button>
        </section>
      )}

      {phase === 'done' && (
        <section class="focus rec" data-testid="hum-done" data-notes={JSON.stringify(shown)}>
          {shown.length ? (
            <>
              <div class="context"><b>{shown.length} Noten</b> · {Math.ceil(total / 4)} Takte{key ? ` · klingt nach ${keyLabel(key)}` : ''}</div>
              <Roll notes={shown} beats={total} />
              <div class="row wrap center">
                <span class="field-label">Oktave:</span>
                <button class="pill" onClick={() => setOctave(octave - 1)}>−1</button>
                <span class="meta">{octave > 0 ? `+${octave}` : octave}</span>
                <button class="pill" onClick={() => setOctave(octave + 1)}>+1</button>
              </div>
              <div class="row wrap center">
                <button class="secondary" onClick={download}>MIDI speichern</button>
                <button class="secondary" onClick={toPc_} disabled={link.status !== 'connected' || link.role !== 'host'}>An PC senden</button>
                <button class="quiet" onClick={() => setPhase('idle')}>Neu</button>
              </div>
              {note && <p class="verdict small ok">{note}</p>}
            </>
          ) : (
            <>
              <p class="eyebrow">Nichts erkannt</p>
              <p class="meta">Näher ans Mikrofon, lauter, Töne länger halten. Pfeifen geht oft besser als Summen.</p>
              <button class="primary" onClick={() => setPhase('idle')}>Noch mal</button>
            </>
          )}
        </section>
      )}
    </main>
  );
}
