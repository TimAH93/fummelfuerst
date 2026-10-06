import { Drill, LearnerState, TRACKS, TrackId, drillProgress, hasSlipped, recommendDrill } from '../../core';
import { Progress } from '../components/Progress';
import { curriculum } from '../lib/session';
import { Settings } from '../lib/store';

interface Props {
  state: LearnerState;
  settings: Settings;
  onSettings: (s: Settings) => void;
  onStart: (d: Drill) => void;
  onTuner: () => void;
}

export function Home({ state, settings, onSettings, onStart, onTuner }: Props) {
  const drill = recommendDrill(state, curriculum, settings.track);
  const path = curriculum.filter((d) => d.track === settings.track);
  const passed = path.filter((d) => state.passed[d.id] !== undefined).length;
  const progress = drill ? drillProgress(state, drill) : null;
  const setTrack = (track: TrackId) => onSettings({ ...settings, track });

  return (
    <main class="screen home">
      <header class="bar">
        <nav class="tracks" aria-label="Thema">
          {TRACKS.map((t) => (
            <button class={t.id === settings.track ? 'track on' : 'track'} aria-pressed={t.id === settings.track} onClick={() => setTrack(t.id)}>
              {t.title}
            </button>
          ))}
        </nav>
        <button class="quiet" onClick={onTuner}>Stimmgerät</button>
      </header>

      <section class="focus">
        {drill && progress ? (
          <>
            <p class="eyebrow">{hasSlipped(state, drill) ? 'Wiederholen' : 'Dein Drill'}</p>
            <h1 class="drill-title">{drill.title}</h1>
            <Progress value={progress.progress} label="Fortschritt im Drill" />
            <p class="meta">
              {progress.comfortable} von {progress.total} sitzen · Drill {path.indexOf(drill) + 1} von {path.length}
            </p>
            <button class="primary" onClick={() => onStart(drill)}>Start</button>
          </>
        ) : (
          <>
            <p class="eyebrow">Geschafft</p>
            <h1 class="drill-title">Alle {path.length} Drills dieser Spur sitzen.</h1>
          </>
        )}
      </section>

      <footer class="bar foot">
        <span class="meta">{passed} / {path.length} geschafft</span>
        <button
          class="quiet"
          onClick={() => onSettings({ ...settings, noteNames: settings.noteNames === 'german' ? 'international' : 'german' })}
          aria-label="Notennamen umschalten"
        >
          {settings.noteNames === 'german' ? 'H / B' : 'B / B♭'}
        </button>
      </footer>
    </main>
  );
}
