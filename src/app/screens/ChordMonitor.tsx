import { degreeSemitones, degreeToString, identifyHeld, pcToNote, toPc } from '../../core';
import { Piano } from '../components/Piano';
import { showNote } from '../lib/names';
import { useMidi } from '../lib/midi';
import { Settings } from '../lib/store';
import { useWakeLock } from '../lib/wakeLock';

const FUNCTION = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

/**
 * "What am I playing?" – live chord name and notes for whatever is held on the keyboard
 * (FLkey pads in User Chord Mode don't show their chord on the device).
 */
export function ChordMonitor({ settings, onExit }: { settings: Settings; onExit: () => void }) {
  useWakeLock();
  const midi = useMidi();
  const held = midi.held;
  const h = identifyHeld(held);
  const style = settings.noteNames;
  const name = (pc: number) => showNote(pcToNote(pc, 'flat'), style);
  const symbol = h ? name(h.rootPc) + h.type.symbol + (h.inversion > 0 ? ` / ${name(h.bassPc)}` : '') : null;
  // Name each tone by its role in the recognised chord (9, #9, 13 …), not as a bare interval.
  const role = (pc: number): string | null => {
    if (!h) return null;
    const d = h.type.formula.find((f) => toPc(h.rootPc + degreeSemitones(f)) === pc);
    return d ? degreeToString(d) : FUNCTION[(pc - h.rootPc + 12) % 12];
  };
  const tones = [...held].sort((a, b) => a - b).map((m) => ({ note: name(toPc(m)), fn: role(toPc(m)) }));

  return (
    <main class="screen monitor">
      <header class="bar">
        <span class="drill-name">Was spiele ich?</span>
        <button class="quiet" onClick={onExit}>Fertig</button>
      </header>
      <section class="focus">
        <div class="target" data-testid="chord-name">{symbol ?? (held.length ? '–' : ' ')}</div>
        <div class="context" data-testid="chord-notes">
          {tones.length ? tones.map((t) => (t.fn ? `${t.note} (${t.fn})` : t.note)).join('  ·  ') : midi.devices.length ? 'Taste oder Pad drücken' : 'Kein Keyboard – am FLkey anschließen oder koppeln'}
        </div>
        <Piano marks={{ held }} />
        {midi.devices.length > 0 && <p class="meta">🎹 {midi.devices.join(', ')}</p>}
      </section>
    </main>
  );
}
