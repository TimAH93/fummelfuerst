import { useRef, useState } from 'preact/hooks';
import {
  EMPTY_RECORDING, RecordedChord, Recording, analyzeProgression, chord, cycleBeats, finishRecording, isAmbiguous, keyLabel, keyScale, loopOf,
  pcToNote, progressionMidi, progressionText, recordStep, spellInKey, totalBeats,
} from '../../core';
import { downloadBytes } from '../lib/download';
import { sendFile } from '../lib/link';
import { useMidi } from '../lib/midi';
import { showChord } from '../lib/names';
import { Settings, loadBrief, saveBrief } from '../lib/store';
import { useWakeLock } from '../lib/wakeLock';
import { useLink } from './Link';

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => void;
  onExit: () => void;
}

const DEFAULT_BPM = 82;

/**
 * Progression recorder: play the pads in order, stop, and the loop is a chord sheet with lengths
 * – as MIDI for FL Studio, as text for the song file, or straight into the song brief.
 */
export function Recorder({ settings, onSettings, onExit }: Props) {
  useWakeLock();
  const link = useLink();
  const [rec, setRec] = useState<Recording>(EMPTY_RECORDING);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<RecordedChord[] | null>(null);
  const [bpmText, setBpmText] = useState(String(settings.recBpm ?? DEFAULT_BPM));
  const [note, setNote] = useState('');
  const runningRef = useRef(false);
  const bpm = Number(bpmText) || undefined;
  const style = settings.noteNames;

  const midi = useMidi((settled) => {
    if (runningRef.current) setRec((r) => recordStep(r, settled, performance.now(), bpm));
  }, 3);

  const start = () => {
    setRec(EMPTY_RECORDING);
    setDone(null);
    setNote('');
    runningRef.current = true;
    setRunning(true);
  };
  const stop = () => {
    runningRef.current = false;
    setRunning(false);
    setDone(finishRecording(rec));
  };
  const setBpm = (text: string) => {
    const t = text.replace(/\D/g, '');
    setBpmText(t);
    if (Number(t)) onSettings({ ...settings, recBpm: Number(t) });
  };

  const chords = done ?? rec.chords;
  const progs = chords.map((c) => c.chord);
  const fits = analyzeProgression(progs);
  const best = fits[0];
  const key = best ? { tonic: best.tonic, mode: best.mode } : null;
  const loop = loopOf(progs);
  const text = progressionText(progs, key);
  const bars = totalBeats(chords) / 4;
  const fileName = `${text.replace(/[\\/:*?"<>|]/g, '')}.mid`;

  const setBeats = (i: number) => {
    if (!done) return;
    setDone(done.map((c, j) => (j === i ? { ...c, beats: cycleBeats(c.beats ?? 4) } : c)));
  };
  const midiBytes = () => progressionMidi(done ?? [], bpm ?? DEFAULT_BPM, `Akkordfolge ${text}`);
  const download = () => {
    downloadBytes(fileName, 'audio/midi', midiBytes());
    setNote(`Gespeichert: ${fileName}`);
  };
  const toPc = () => setNote(sendFile(fileName, 'audio/midi', midiBytes()) ? `An den PC geschickt: ${fileName}` : 'Kein PC gekoppelt');
  const toBrief = async () => {
    const draft = await loadBrief();
    const loopChords = loop ? progs.slice(0, loop.period) : progs;
    const loopBars = (loop ? totalBeats(chords.slice(0, loop.period)) : totalBeats(chords)) / 4;
    await saveBrief({ ...draft, chords: progressionText(loopChords, key), tempo: bpm ? String(bpm) : draft.tempo, bars: String(Math.max(1, Math.round(loopBars))) });
    setNote('Im Song-Steckbrief eingetragen');
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${text}\n${bpm ? `${bpm} BPM · ` : ''}${bars} Takte${best ? ` · ${keyLabel(best)}: ${best.numerals.map((n) => n.roman).join(' – ')}` : ''}`);
      setNote('Kopiert');
    } catch {
      setNote('Kopieren ging nicht');
    }
  };

  return (
    <main class="screen recorder">
      <header class="bar">
        <span class="drill-name">Akkordfolge aufnehmen</span>
        <div class="row">
          <label class="field narrow inline">
            <span class="field-label">BPM</span>
            <input class="field-input" inputMode="numeric" value={bpmText} onInput={(e) => setBpm((e.target as HTMLInputElement).value)} data-testid="bpm" />
          </label>
          <button class="quiet" onClick={onExit}>Fertig</button>
        </div>
      </header>

      <section class="focus rec">
        {!running && !done && (
          <>
            <p class="eyebrow">Bereit</p>
            <h1 class="drill-title">Metronom in FL an, dann die Pads in deiner Reihenfolge spielen.</h1>
            <p class="meta">Die Länge jedes Akkords kommt von der Uhr (1 · 2 · 4 · 8 Schläge) und lässt sich danach antippen.</p>
            <button class="primary rec-btn" onClick={start} disabled={midi.devices.length === 0} data-testid="start">● Aufnahme</button>
            {midi.devices.length === 0 && <p class="meta">Kein Keyboard – am FLkey anschließen oder koppeln</p>}
          </>
        )}

        {(running || done) && (
          <div class="rec-chips" data-testid="rec-chords">
            {chords.map((c, i) => {
              const n = best?.numerals[i];
              const root = key ? spellInKey(keyScale(key), c.chord.rootPc).note : pcToNote(c.chord.rootPc, 'flat');
              return (
                <button class={done ? 'chip' : 'chip on'} onClick={() => setBeats(i)} disabled={!done} title={done ? 'Antippen: Länge ändern' : ''}>
                  <span class="chip-name">{showChord(chord(root, c.chord.typeId), style)}</span>
                  <span class="chip-roman">{n?.roman ?? ''}</span>
                  <span class="chip-why">{c.beats === null ? '…' : c.beats === 4 ? '1 Takt' : c.beats === 8 ? '2 Takte' : c.beats === 16 ? '4 Takte' : `${c.beats} Schlag${c.beats === 1 ? '' : 'e'}`}</span>
                </button>
              );
            })}
            {running && chords.length === 0 && <p class="meta">Warte auf den ersten Akkord …</p>}
          </div>
        )}

        {running && <button class="primary rec-btn stop" onClick={stop} data-testid="stop">■ Stopp</button>}

        {done && (
          <>
            <div class="context" data-testid="rec-summary">
              {best ? <><b>{keyLabel(best)}</b> · {best.numerals.map((n) => n.roman).join(' – ')}</> : 'Nichts aufgenommen'}
              {loop && <> · Loop: {loop.period} Akkorde × {loop.times}</>}
              {best && isAmbiguous(fits) && <p class="meta">oder {keyLabel(fits[1])}: {fits[1].numerals.map((n) => n.roman).join(' – ')}</p>}
            </div>
            {best && <p class="meta">{Number.isInteger(bars) ? `${bars} Takte` : `${totalBeats(chords)} Schläge`}{bpm ? ` · ${bpm} BPM` : ''} · Länge eines Akkords antippen, um sie zu ändern</p>}
            <div class="row wrap center">
              <button class="secondary" onClick={download} disabled={!best}>MIDI speichern</button>
              <button class="secondary" onClick={toPc} disabled={!best || link.status !== 'connected' || link.role !== 'host'} title="Geht nur mit gekoppeltem PC">An PC senden</button>
              <button class="secondary" onClick={toBrief} disabled={!best}>In Song-Steckbrief</button>
              <button class="secondary" onClick={copy} disabled={!best}>Text kopieren</button>
              <button class="quiet" onClick={start}>Neu aufnehmen</button>
            </div>
            {note && <p class="verdict small ok" data-testid="rec-note">{note}</p>}
          </>
        )}
      </section>
    </main>
  );
}
