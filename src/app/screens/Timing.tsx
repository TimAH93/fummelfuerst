import { useEffect, useRef, useState } from 'preact/hooks';
import { EMPTY_STATS, GOAL_LOOPS, Grid, Judgement, TimingStats, addJudgement, beatAt, chord, chordFromHeld, judgeChange, loopsInRow, pcToNote } from '../../core';
import { MetronomeHandle, startMetronome } from '../lib/metronome';
import { useMidi } from '../lib/midi';
import { showChord } from '../lib/names';
import { subscribe } from '../lib/noteBus';
import { Settings } from '../lib/store';
import { useWakeLock } from '../lib/wakeLock';

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => void;
  onExit: () => void;
}

const LENGTHS: [number, string][] = [[2, '½ Takt'], [4, '1 Takt'], [8, '2 Takte']];
const LOOPS = [2, 3, 4, 5, 8];
const COLOUR: Record<Judgement['verdict'], string> = { genau: 'ok', früh: 'off', spät: 'off', daneben: 'bad' };

/**
 * Timing trainer – step 1 of the live-looping ladder: a click runs, every pad press is judged
 * against the bar line, four clean loops in a row pass the step.
 */
export function Timing({ settings, onSettings, onExit }: Props) {
  useWakeLock();
  const [bpmText, setBpmText] = useState(String(settings.recBpm ?? 82));
  const [beatsPerChord, setBeatsPerChord] = useState(4);
  const [chordsPerLoop, setChordsPerLoop] = useState(4);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [beat, setBeat] = useState<{ bar: number; beat: number; countIn: boolean } | null>(null);
  const [last, setLast] = useState<{ j: Judgement; name: string } | null>(null);
  const [stats, setStats] = useState<TimingStats>(EMPTY_STATS);
  const [error, setError] = useState('');
  const metro = useRef<MetronomeHandle | null>(null);
  const gridRef = useRef<Grid | null>(null);
  const onset = useRef<number | null>(null);
  const prevHeld = useRef<number[]>([]);
  const chordMidis = useRef<number[]>([]);
  const bpm = Number(bpmText) || 82;

  // Onset = the first key of a press that is not part of the chord already down (pads overlap when played legato).
  useEffect(() => subscribe((s) => {
    const fresh = s.held.filter((m) => !prevHeld.current.includes(m));
    if (fresh.length && onset.current === null && (prevHeld.current.length === 0 || fresh.some((m) => !chordMidis.current.includes(m)))) onset.current = performance.now();
    prevHeld.current = s.held;
  }), []);
  useEffect(() => () => metro.current?.stop(), []);

  const midi = useMidi((settled) => {
    const g = gridRef.current;
    const at = onset.current ?? performance.now() - 250;
    onset.current = null;
    chordMidis.current = settled;
    if (!g) return;
    const j = judgeChange(g, at);
    const c = chordFromHeld(settled);
    setLast({ j, name: c ? showChord(chord(pcToNote(c.rootPc, 'flat'), c.typeId), settings.noteNames) : '' });
    setStats((s) => addJudgement(s, j));
  }, 3);

  const start = async () => {
    setError('');
    setStats(EMPTY_STATS);
    setLast(null);
    try {
      const h = await startMetronome(bpm, (b) => setBeat(b), 1);
      metro.current = h;
      const g: Grid = { bpm, beatsPerChord, startMs: h.startPerfMs };
      gridRef.current = g;
      setGrid(g);
      onSettings({ ...settings, recBpm: bpm });
    } catch {
      setError('Kein Ton möglich – Lautstärke an?');
    }
  };
  const stop = () => {
    metro.current?.stop();
    metro.current = null;
    gridRef.current = null;
    setGrid(null);
    setBeat(null);
  };

  const loops = loopsInRow(stats.streak, chordsPerLoop);
  const passed = loops >= GOAL_LOOPS;
  const pos = grid && beat ? beatAt(grid, performance.now()) : null;

  return (
    <main class="screen timing">
      <header class="bar">
        <span class="drill-name">Im Takt wechseln · Live-Loop Stufe 1</span>
        <div class="row">
          <label class="field narrow inline">
            <span class="field-label">BPM</span>
            <input class="field-input" inputMode="numeric" value={bpmText} disabled={!!grid} data-testid="bpm"
              onInput={(e) => setBpmText((e.target as HTMLInputElement).value.replace(/\D/g, ''))} />
          </label>
          <button class="quiet" onClick={() => { stop(); onExit(); }}>Fertig</button>
        </div>
      </header>

      {!grid ? (
        <section class="focus">
          <p class="eyebrow">Ziel</p>
          <h1 class="drill-title">{GOAL_LOOPS} Loops in Folge, jeder Wechsel auf der Eins.</h1>
          <div class="row wrap center">
            <span class="field-label">Pro Akkord:</span>
            {LENGTHS.map(([b, label]) => <button class={beatsPerChord === b ? 'pill on' : 'pill'} onClick={() => setBeatsPerChord(b)}>{label}</button>)}
          </div>
          <div class="row wrap center">
            <span class="field-label">Akkorde pro Loop:</span>
            {LOOPS.map((n) => <button class={chordsPerLoop === n ? 'pill on' : 'pill'} onClick={() => setChordsPerLoop(n)}>{n}</button>)}
          </div>
          <p class="meta">Ein Takt Vorzähler, dann spielst du deine Pads. Als „genau“ zählt ± 80 ms.</p>
          {error && <p class="verdict off">{error}</p>}
          <button class="primary" onClick={start} disabled={midi.devices.length === 0} data-testid="start">▶ Click starten</button>
          {midi.devices.length === 0 && <p class="meta">Kein Keyboard – am FLkey anschließen oder koppeln</p>}
        </section>
      ) : (
        <section class={`focus ${passed ? 'passed' : ''}`} data-testid="timing-live" data-start={grid.startMs} data-period={(grid.beatsPerChord * 60000) / grid.bpm}>
          <div class="beat-dots" aria-label="Schlag">
            {[1, 2, 3, 4].map((b) => <span class={`beat-dot${beat?.beat === b ? ' on' : ''}${beat?.countIn ? ' count' : ''}`} />)}
            <span class="meta">{beat?.countIn ? 'Vorzähler' : pos ? `Takt ${pos.bar}` : ''}</span>
          </div>
          <div class={`target verdict-big ${last ? COLOUR[last.j.verdict] : ''}`} data-testid="verdict">{last ? last.j.verdict : '…'}</div>
          <div class="context" data-testid="offset">
            {last ? <>{last.name && <b>{last.name}</b>} {last.j.offsetMs > 0 ? '+' : ''}{Math.round(last.j.offsetMs)} ms</> : 'Ersten Akkord auf die Eins'}
          </div>
          <div class="stat-row" data-testid="stats">
            <span><b>{loops}</b> / {GOAL_LOOPS} Loops in Folge</span>
            <span><b>{stats.hits}</b> / {stats.changes} genau</span>
            <span>Serie <b>{stats.streak}</b> · beste {stats.bestStreak}</span>
            <span>Ø <b>{Math.round(stats.meanAbsMs)}</b> ms daneben</span>
          </div>
          {passed && <p class="eyebrow ok">Stufe 1 geschafft ✓</p>}
          <div class="row wrap center">
            <button class="secondary" onClick={() => { setStats(EMPTY_STATS); setLast(null); }}>Zähler auf null</button>
            <button class="primary" onClick={stop} data-testid="stop">■ Stopp</button>
          </div>
        </section>
      )}
    </main>
  );
}
