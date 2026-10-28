import { useEffect, useState } from 'preact/hooks';
import { Drill, LearnerState, PadBank, SessionEntry, emptyBank } from '../core';
import { downloadBytes } from './lib/download';
import { onFile } from './lib/link';
import { context } from './lib/session';
import { DEFAULT_SETTINGS, Settings, loadPads, loadSessions, loadSettings, loadState, savePads, saveSessions, saveSettings, saveState } from './lib/store';
import { Home } from './screens/Home';
import { Practice } from './screens/Practice';
import { Tuner } from './screens/Tuner';
import { Link, resumeLink } from './screens/Link';
import { SongBrief } from './screens/SongBrief';
import { ChordMonitor } from './screens/ChordMonitor';
import { Recorder } from './screens/Recorder';
import { Pads } from './screens/Pads';
import { Arrangement } from './screens/Arrangement';
import { Timing } from './screens/Timing';
import { Hum } from './screens/Hum';
import { Session } from './screens/Session';

type Screen =
  | { name: 'home' } | { name: 'practice'; drill: Drill } | { name: 'tuner' } | { name: 'link' } | { name: 'brief' }
  | { name: 'monitor' } | { name: 'recorder' } | { name: 'pads' } | { name: 'arrangement'; reference?: boolean } | { name: 'timing' } | { name: 'hum' } | { name: 'session' };

export function App() {
  const [state, setState] = useState<LearnerState | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [pads, setPads] = useState<PadBank>(emptyBank);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);

  useEffect(() => {
    void Promise.all([loadState(), loadSettings(), loadPads(), loadSessions()]).then(([s, st, p, log]) => {
      setState(s);
      setSettings(st);
      setPads(p);
      setSessions(log);
      resumeLink(st, (next) => {
        setSettings(next);
        void saveSettings(next);
      });
    });
    // PC side of a pairing: files the tablet sends (recorded progressions as MIDI) land in Downloads.
    return onFile((name, mime, data) => downloadBytes(name, mime, data));
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
  const updatePads = (p: PadBank) => {
    setPads(p);
    void savePads(p);
  };
  const addSession = (e: SessionEntry) => {
    const next = [...sessions, e];
    setSessions(next);
    void saveSessions(next);
  };
  const home = () => setScreen({ name: 'home' });

  switch (screen.name) {
    case 'practice':
      return (
        <Practice key={screen.drill.id} drill={screen.drill} state={state} settings={settings}
          onState={updateState} onDrill={(drill) => setScreen({ name: 'practice', drill })} onExit={home} />
      );
    case 'monitor':
      return <ChordMonitor settings={settings} onSettings={updateSettings} pads={pads} onExit={home} />;
    case 'recorder':
      return <Recorder settings={settings} onSettings={updateSettings} onExit={home} />;
    case 'pads':
      return <Pads pads={pads} onPads={updatePads} settings={settings} onExit={home} />;
    case 'arrangement':
      return <Arrangement onExit={home} reference={screen.reference} />;
    case 'session':
      return <Session sessions={sessions} onDone={addSession} onArrangement={(reference) => setScreen({ name: 'arrangement', reference })} onExit={home} />;
    case 'timing':
      return <Timing settings={settings} onSettings={updateSettings} onExit={home} />;
    case 'hum':
      return <Hum settings={settings} onSettings={updateSettings} onExit={home} />;
    case 'brief':
      return <SongBrief onExit={home} />;
    case 'link':
      return <Link settings={settings} onSettings={updateSettings} onExit={home} />;
    case 'tuner':
      return <Tuner tuning={context.tuning} settings={settings} onExit={home} />;
    default:
      return <Home state={state} settings={settings} onSettings={updateSettings}
        onStart={(drill) => setScreen({ name: 'practice', drill })} onTuner={() => setScreen({ name: 'tuner' })} onLink={() => setScreen({ name: 'link' })} onBrief={() => setScreen({ name: 'brief' })} onMonitor={() => setScreen({ name: 'monitor' })}
        onRecorder={() => setScreen({ name: 'recorder' })} onPads={() => setScreen({ name: 'pads' })} onArrangement={() => setScreen({ name: 'arrangement' })}
        onTiming={() => setScreen({ name: 'timing' })} onHum={() => setScreen({ name: 'hum' })}
        sessions={sessions} onSession={() => setScreen({ name: 'session' })} />;
  }
}
