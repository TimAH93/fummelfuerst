import { useEffect, useRef, useState } from 'preact/hooks';
import { busState, setDevices, setHeld, subscribe } from './noteBus';

export type MidiStatus = 'unsupported' | 'pending' | 'denied' | 'no-device' | 'ready';

export interface MidiState {
  /** Local Web MIDI only; a paired PC shows up in `devices` regardless. */
  status: MidiStatus;
  /** Every source, e.g. "FLkey 37 MIDI" or "FLkey 37 MIDI (PC)". */
  devices: string[];
  /** Notes currently held, from all sources. */
  held: number[];
}

let localStatus: MidiStatus = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator ? 'pending' : 'unsupported';
const statusListeners = new Set<(s: MidiStatus) => void>();
let started = false;

/** Open every local MIDI input once per app run (Chrome/Edge on desktop and Android; not Safari). */
export function ensureLocalMidi(): void {
  if (started || localStatus === 'unsupported') return;
  started = true;
  const setStatus = (s: MidiStatus) => {
    localStatus = s;
    statusListeners.forEach((l) => l(s));
  };
  const down = new Set<number>();
  const onMessage = (e: MIDIMessageEvent) => {
    const data = e.data;
    if (!data || data.length < 3) return;
    const cmd = data[0] & 0xf0;
    if (cmd === 0x90 && data[2] > 0) down.add(data[1]);
    else if (cmd === 0x80 || (cmd === 0x90 && data[2] === 0)) down.delete(data[1]);
    else return;
    setHeld('local', [...down].sort((a, b) => a - b));
  };
  navigator
    .requestMIDIAccess()
    .then((access) => {
      const wire = () => {
        const inputs = [...access.inputs.values()];
        inputs.forEach((i) => (i.onmidimessage = onMessage));
        setDevices('local', inputs.map((i) => i.name ?? 'MIDI'));
        setStatus(inputs.length ? 'ready' : 'no-device');
      };
      access.onstatechange = wire;
      wire();
    })
    .catch(() => setStatus('denied'));
}

/**
 * Held notes from all sources. Calls `onChord` once they have been stable for `settleMs`
 * with at least `min` keys down.
 */
export function useMidi(onChord?: (midis: number[]) => void, min = 3, settleMs = 250): MidiState {
  const [status, setStatus] = useState<MidiStatus>(localStatus);
  const [bus, setBus] = useState(busState);
  const timer = useRef<number | undefined>(undefined);
  const callback = useRef(onChord);
  callback.current = onChord;

  useEffect(() => {
    ensureLocalMidi();
    statusListeners.add(setStatus);
    setStatus(localStatus);
    const off = subscribe((s) => {
      setBus(s);
      window.clearTimeout(timer.current);
      if (s.held.length >= min) {
        const snapshot = s.held;
        timer.current = window.setTimeout(() => callback.current?.(snapshot), settleMs);
      }
    });
    return () => {
      off();
      statusListeners.delete(setStatus);
      window.clearTimeout(timer.current);
    };
  }, []);

  return { status, devices: bus.devices, held: bus.held };
}
