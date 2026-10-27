import { useEffect, useState } from 'preact/hooks';
import { Drill, LearnerState } from '../core';
import { context } from './lib/session';
import { DEFAULT_SETTINGS, Settings, loadSettings, loadState, saveSettings, saveState } from './lib/store';
import { Home } from './screens/Home';
import { Practice } from './screens/Practice';
import { Tuner } from './screens/Tuner';
import { Link, resumeLink } from './screens/Link';
import { SongBrief } from './screens/SongBrief';
import { ChordMonitor } from './screens/ChordMonitor';

type Screen = { name: 'home' } | { name: 'practice'; drill: Drill } | { name: 'tuner' } | { name: 'link' } | { name: 'brief' } | { name: 'monitor' };

export function App() {
  const [state, setState] = useState<LearnerState | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  useEffect(() => {
    void Promise.all([loadState(), loadSettings()]).then(([s, st]) => {
      setState(s);
      setSettings(st);
      resumeLink(st, (next) => {
        setSettings(next);
        void saveSettings(next);
      });
    });
  }, []);

  if (!state) return <main class="screen" />;

  const updateState = (s: LearnerState) => {
    setState(s);
    void saveState(s);
  };
  const updateSettings = (s: Settings) => {
    setSettings(s);
    void saveSettings(s);
  };
  const home = () => setScreen({ name: 'home' });

  switch (screen.name) {
    case 'practice':
      return (
        <Practice key={screen.drill.id} drill={screen.drill} state={state} settings={settings}
          onState={updateState} onDrill={(drill) => setScreen({ name: 'practice', drill })} onExit={home} />
      );
    case 'monitor':
      return <ChordMonitor settings={settings} onExit={home} />;
    case 'brief':
      return <SongBrief onExit={home} />;
    case 'link':
      return <Link settings={settings} onSettings={updateSettings} onExit={home} />;
    case 'tuner':
      return <Tuner tuning={context.tuning} settings={settings} onExit={home} />;
    default:
      return <Home state={state} settings={settings} onSettings={updateSettings}
        onStart={(drill) => setScreen({ name: 'practice', drill })} onTuner={() => setScreen({ name: 'tuner' })} onLink={() => setScreen({ name: 'link' })} onBrief={() => setScreen({ name: 'brief' })} onMonitor={() => setScreen({ name: 'monitor' })} />;
  }
}
