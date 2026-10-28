import { useState } from 'preact/hooks';
import { Drill, LearnerState, SessionEntry, TRACKS, TrackId, drillProgress, hasSlipped, recommendDrill, suggestTopic, weekExports } from '../../core';
import { Progress } from '../components/Progress';
import { curriculum } from '../lib/session';
import { Settings } from '../lib/store';
import { useLink } from './Link';

interface Props {
  state: LearnerState;
  settings: Settings;
  onSettings: (s: Settings) => void;
  onStart: (d: Drill) => void;
  onTuner: () => void;
  onLink: () => void;
  onBrief: () => void;
  onMonitor: () => void;
  onRecorder: () => void;
  onPads: () => void;
  onArrangement: () => void;
  onTiming: () => void;
  onHum: () => void;
  sessions: SessionEntry[];
  onSession: () => void;
}

function Tile({ name, sub, onClick }: { name: string; sub: string; onClick: () => void }) {
  return (
    <button class="tile" onClick={onClick} aria-label={name}>
      <span class="tile-name">{name}</span>
      <span class="tile-sub">{sub}</span>
    </button>
  );
}

/** Three areas, in the order the day usually goes: jam, build the song, practise. */
export function Home({ state, settings, onSettings, onStart, onTuner, onLink, onBrief, onMonitor, onRecorder, onPads, onArrangement, onTiming, onHum, sessions, onSession }: Props) {
  const link = useLink();
  const exports = weekExports(sessions, Date.now());
  const [pickTrack, setPickTrack] = useState(false);
  const drill = recommendDrill(state, curriculum, settings.track);
  const path = curriculum.filter((d) => d.track === settings.track);
  const passed = path.filter((d) => state.passed[d.id] !== undefined).length;
  const progress = drill ? drillProgress(state, drill) : null;
  const track = TRACKS.find((t) => t.id === settings.track);
  const setTrack = (id: TrackId) => { onSettings({ ...settings, track: id }); setPickTrack(false); };

  return (
    <main class="screen home">
      <header class="bar">
        <span class="drill-name">Fummelfürst</span>
        <div class="row wrap">
          <button class="quiet" onClick={onTuner}>Stimmgerät</button>
          <button class="quiet" onClick={onLink}>{link.status === 'connected' ? '🎹 gekoppelt' : 'Keyboard koppeln'}</button>
          <button class="quiet" aria-label="Notennamen umschalten"
            onClick={() => onSettings({ ...settings, noteNames: settings.noteNames === 'german' ? 'international' : 'german' })}>
            {settings.noteNames === 'german' ? 'H / B' : 'B / B♭'}
          </button>
        </div>
      </header>

      <div class="home-grid">
        <section class="area">
          <h2 class="area-title">Heute</h2>
          <div class="tiles">
            <button class="tile wide" onClick={onSession} aria-label="Session">
              <span class="tile-name">Session planen</span>
              <span class="tile-sub">Thema dran: {suggestTopic(sessions)} · {exports} Export{exports === 1 ? '' : 's'} in 7 Tagen · Ziel 1 pro Woche</span>
            </button>
          </div>
        </section>

        <section class="area">
          <h2 class="area-title">Jammen</h2>
          <div class="tiles">
            <Tile name="Was spiele ich?" sub="Akkord · Stufe · Melodie-Töne" onClick={onMonitor} />
            <Tile name="Im Takt" sub="Click, Wechsel auf die Eins" onClick={onTiming} />
          </div>
        </section>

        <section class="area">
          <h2 class="area-title">Song bauen</h2>
          <div class="tiles">
            <Tile name="Aufnehmen" sub="Akkordfolge → MIDI" onClick={onRecorder} />
            <Tile name="Summen" sub="Idee → Noten" onClick={onHum} />
            <Tile name="Pads" sub="Deine User Chords" onClick={onPads} />
            <Tile name="Arrangement" sub="Vom Loop zum Song" onClick={onArrangement} />
            <Tile name="Song-Steckbrief" sub="Text für den Coach" onClick={onBrief} />
          </div>
        </section>

        <section class="area practice-area">
          <div class="area-head">
            <h2 class="area-title">Üben · {track?.title}</h2>
            <button class="quiet small" onClick={() => setPickTrack(!pickTrack)} aria-expanded={pickTrack}>Thema wechseln</button>
          </div>
          {pickTrack && (
            <nav class="tracks" aria-label="Thema">
              {TRACKS.map((t) => (
                <button class={t.id === settings.track ? 'track on' : 'track'} aria-pressed={t.id === settings.track} onClick={() => setTrack(t.id)}>
                  {t.title}
                </button>
              ))}
            </nav>
          )}
          {drill && progress ? (
            <div class="drill-card">
              <div class="drill-text">
                <p class="eyebrow">{hasSlipped(state, drill) ? 'Wiederholen' : 'Dein Drill'}</p>
                <h1 class="drill-title">{drill.title}</h1>
                <Progress value={progress.progress} label="Fortschritt im Drill" />
                <p class="meta">
                  {progress.comfortable} von {progress.total} sitzen · Drill {path.indexOf(drill) + 1} von {path.length} · {passed} / {path.length} geschafft
                </p>
              </div>
              <button class="primary" onClick={() => onStart(drill)}>Start</button>
            </div>
          ) : (
            <div class="drill-card">
              <div class="drill-text">
                <p class="eyebrow">Geschafft</p>
                <h1 class="drill-title">Alle {path.length} Drills dieses Themas sitzen.</h1>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
