import { useEffect, useState } from 'preact/hooks';
import { Piano } from '../components/Piano';
import { LinkState, formatCode, hostLink, joinLink, linkState, newCode, onLink, stopLink } from '../lib/link';
import { useMidi } from '../lib/midi';
import { Settings } from '../lib/store';
import { useKeyRange } from '../lib/keyRange';

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => void;
  onExit: () => void;
}

const STATUS: Record<LinkState['status'], string> = {
  idle: '',
  connecting: 'Verbinde …',
  waiting: 'Warte auf das andere Gerät …',
  connected: 'Verbunden',
  error: 'Fehler',
};

export function useLink(): LinkState {
  const [s, setS] = useState(linkState);
  useEffect(() => onLink(setS), []);
  return s;
}

/** Start the remembered pairing when the app opens, so a reload reconnects by itself. */
export function resumeLink(settings: Settings, onSettings: (s: Settings) => void): void {
  if (linkState().role || !settings.link) return;
  if (settings.link.role === 'host') hostLink(settings.link.code, (code) => onSettings({ ...settings, link: { role: 'host', code } }));
  else joinLink(settings.link.code);
}

export function Link({ settings, onSettings, onExit }: Props) {
  const link = useLink();
  const midi = useMidi();
  const [linkLow, linkHigh] = useKeyRange(midi.held);
  const [typed, setTyped] = useState('');
  const [isPc, setIsPc] = useState(false);

  const host = () => {
    const code = settings.link?.role === 'host' ? settings.link.code : newCode();
    onSettings({ ...settings, link: { role: 'host', code } });
    hostLink(code, (fresh) => onSettings({ ...settings, link: { role: 'host', code: fresh } }));
  };
  const join = () => {
    const code = typed.replace(/\D/g, '');
    if (code.length !== 6) return;
    onSettings({ ...settings, link: { role: 'join', code } });
    joinLink(code);
  };
  const disconnect = () => {
    stopLink();
    onSettings({ ...settings, link: undefined });
  };

  return (
    <main class="screen link">
      <header class="bar">
        <span class="drill-name">Keyboard koppeln</span>
        <button class="quiet" onClick={onExit}>Fertig</button>
      </header>

      {!link.role && (
        <section class="focus">
          <h1 class="drill-title">Welches Gerät ist das?</h1>
          <div class="choice">
            <button class="primary" onClick={host}>Tablet<br /><small>zeigt die Übungen</small></button>
            <button class="secondary" onClick={() => setIsPc(true)}>PC<br /><small>hat das Keyboard</small></button>
          </div>
          {isPc && (
            <form class="code-entry" onSubmit={(e) => { e.preventDefault(); join(); }}>
              <label for="code" class="meta">Code vom Tablet eingeben</label>
              <input id="code" class="code-input" inputMode="numeric" autoComplete="off" maxLength={7} placeholder="123 456"
                value={typed} onInput={(e) => setTyped((e.target as HTMLInputElement).value)} />
              <button class="primary" type="submit" disabled={typed.replace(/\D/g, '').length !== 6}>Verbinden</button>
            </form>
          )}
        </section>
      )}

      {link.role === 'host' && (
        <section class="focus">
          <p class="eyebrow">Am PC eingeben</p>
          <div class="target code" data-testid="link-code">{link.code ? formatCode(link.code) : '…'}</div>
          <p class={link.status === 'connected' ? 'verdict ok' : 'meta'} data-testid="link-status">
            {link.status === 'connected' ? `✓ ${midi.devices.filter((d) => d.endsWith('(PC)')).join(', ') || 'PC verbunden'}` : STATUS[link.status]}
            {link.error ? ` (${link.error})` : ''}
          </p>
          <p class="meta">Am PC: Fummelfürst in Chrome öffnen → Keyboard koppeln → PC → Code eingeben.</p>
          <button class="secondary" onClick={disconnect}>Trennen</button>
        </section>
      )}

      {link.role === 'join' && (
        <section class="focus">
          <p class="eyebrow">Code {link.code ? formatCode(link.code) : ''}</p>
          <h1 class="drill-title" data-testid="link-status">{STATUS[link.status]}</h1>
          <p class="meta">
            {midi.status === 'ready'
              ? `🎹 ${midi.devices.join(', ')}`
              : 'Kein Keyboard sichtbar. Läuft FL Studio? Dann FL Studio kurz schließen oder in FL Studio einen MIDI-Ausgang auf loopMIDI legen.'}
          </p>
          <Piano low={linkLow} high={linkHigh} marks={{ held: midi.held }} noteNames={settings.noteNames} />
          <p class="meta">Dieses Fenster offen lassen – gespielt wird ab jetzt am Tablet.</p>
          <button class="secondary" onClick={disconnect}>Trennen</button>
        </section>
      )}
    </main>
  );
}
