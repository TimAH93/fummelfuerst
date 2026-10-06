import { useEffect, useRef, useState } from 'preact/hooks';
import { PitchReading, Tuning, pcToNote, toPc, tunerReading } from '../../core';
import { showNote } from '../lib/names';
import { MicHandle, startMic } from '../lib/mic';
import { Settings } from '../lib/store';
import { useWakeLock } from '../lib/wakeLock';

const SMOOTH = 5;
const HOLD_MS = 600;

export function Tuner({ tuning, settings, onExit }: { tuning: Tuning; settings: Settings; onExit: () => void }) {
  useWakeLock();
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [freq, setFreq] = useState<number | null>(null);
  const mic = useRef<MicHandle | null>(null);
  const recent = useRef<number[]>([]);
  const lastHeard = useRef(0);

  useEffect(() => () => mic.current?.stop(), []);

  const start = async () => {
    setError(null);
    try {
      mic.current = await startMic((r: PitchReading | null, t: number) => {
        if (r && r.clarity > 0.85) {
          recent.current = [...recent.current, r.frequency].slice(-SMOOTH);
          const sorted = [...recent.current].sort((a, b) => a - b);
          setFreq(sorted[Math.floor(sorted.length / 2)]);
          lastHeard.current = t;
        } else if (t - lastHeard.current > HOLD_MS) {
          recent.current = [];
          setFreq(null);
        }
      });
      setListening(true);
    } catch (e) {
      setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Mikrofon nicht erlaubt. In den Einstellungen freigeben.' : 'Kein Mikrofon verfügbar.');
    }
  };

  const reading = freq ? tunerReading(freq, tuning, settings.a4) : null;
  const n = tuning.strings.length;
  const style = settings.noteNames;
  const cents = reading ? Math.max(-50, Math.min(50, reading.string.cents)) : 0;

  return (
    <main class="screen tuner">
      <header class="bar">
        <span class="drill-name">Stimmgerät · A = {settings.a4} Hz</span>
        <button class="quiet" onClick={() => { mic.current?.stop(); onExit(); }}>Fertig</button>
      </header>

      {!listening ? (
        <section class="focus">
          <h1 class="drill-title">Stimmgerät</h1>
          <p class="meta">Braucht das Mikrofon. Der Ton bleibt auf dem Gerät.</p>
          {error && <p class="verdict off">{error}</p>}
          <button class="primary" onClick={start}>Zuhören</button>
        </section>
      ) : (
        <section class={reading?.inTune ? 'tuner-face in-tune' : 'tuner-face'} data-testid="tuner-face">
          <div class="target">
            {reading ? showNote(pcToNote(toPc(tuning.strings[reading.string.index])), style) : '–'}
          </div>
          <div class="context">{reading ? `Saite ${n - reading.string.index}` : 'Spiel eine leere Saite'}</div>
          <div class="needle" aria-hidden="true">
            <div class="needle-zone" />
            <div class="needle-center" />
            {reading && <div class="needle-mark" style={{ left: `${50 + cents}%` }} />}
          </div>
          <div class="cents" data-testid="cents">
            {reading ? `${reading.string.cents > 0 ? '+' : ''}${Math.round(reading.string.cents)} ct` : ' '}
          </div>
          <div class="meta">
            {reading ? `${reading.inTune ? '✓ gestimmt' : reading.string.cents < 0 ? 'zu tief ↑' : 'zu hoch ↓'} · chromatisch ${showNote(pcToNote(toPc(reading.note.midi)), style)} ${Math.round(reading.frequency * 10) / 10} Hz` : ' '}
          </div>
        </section>
      )}
    </main>
  );
}

