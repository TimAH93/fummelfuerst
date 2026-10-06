import { useEffect, useState } from 'preact/hooks';
import { Drill, LearnerState } from '../core';
import { context } from './lib/session';
import { DEFAULT_SETTINGS, Settings, loadSettings, loadState, saveSettings, saveState } from './lib/store';
import { Home } from './screens/Home';
import { Practice } from './screens/Practice';
import { Tuner } from './screens/Tuner';

type Screen = { name: 'home' } | { name: 'practice'; drill: Drill } | { name: 'tuner' };

export function App() {
  const [state, setState] = useState<LearnerState | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  useEffect(() => {
    void Promise.all([loadState(), loadSettings()]).then(([s, st]) => {
      setState(s);
      setSettings(st);
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
    case 'tuner':
      return <Tuner tuning={context.tuning} settings={settings} onExit={home} />;
    default:
      return <Home state={state} settings={settings} onSettings={updateSettings}
        onStart={(drill) => setScreen({ name: 'practice', drill })} onTuner={() => setScreen({ name: 'tuner' })} />;
  }
}
