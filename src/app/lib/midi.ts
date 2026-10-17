import { useEffect, useRef, useState } from 'preact/hooks';

export type MidiStatus = 'unsupported' | 'pending' | 'denied' | 'no-device' | 'ready';

export interface MidiState {
  status: MidiStatus;
  /** Names of connected inputs, e.g. "FLkey 37 MIDI". */
  devices: string[];
  /** Notes currently held down. */
  held: number[];
}

/**
 * Listen to every MIDI input (Chrome/Edge on desktop and Android; not Safari).
 * Calls `onChord` once the held notes have been stable for `settleMs` with at least `min` keys down.
 */
export function useMidi(onChord?: (midis: number[]) => void, min = 3, settleMs = 250): MidiState {
  const [status, setStatus] = useState<MidiStatus>('requestMIDIAccess' in navigator ? 'pending' : 'unsupported');
  const [devices, setDevices] = useState<string[]>([]);
  const [held, setHeld] = useState<number[]>([]);
  const down = useRef(new Set<number>());
  const timer = useRef<number | undefined>(undefined);
  const callback = useRef(onChord);
  callback.current = onChord;

  useEffect(() => {
    if (!('requestMIDIAccess' in navigator)) return;
    let access: MIDIAccess | null = null;
    const onMessage = (e: MIDIMessageEvent) => {
      const data = e.data;
      if (!data || data.length < 3) return;
      const cmd = data[0] & 0xf0;
      const note = data[1];
      if (cmd === 0x90 && data[2] > 0) down.current.add(note);
      else if (cmd === 0x80 || (cmd === 0x90 && data[2] === 0)) down.current.delete(note);
      else return;
      const now = [...down.current].sort((a, b) => a - b);
      setHeld(now);
      window.clearTimeout(timer.current);
      if (now.length >= min) timer.current = window.setTimeout(() => callback.current?.(now), settleMs);
    };
    const wire = () => {
      if (!access) return;
      const inputs = [...access.inputs.values()];
      inputs.forEach((i) => (i.onmidimessage = onMessage));
      setDevices(inputs.map((i) => i.name ?? 'MIDI'));
      setStatus(inputs.length ? 'ready' : 'no-device');
    };
    navigator
      .requestMIDIAccess()
      .then((a) => {
        access = a;
        a.onstatechange = wire;
        wire();
      })
      .catch(() => setStatus('denied'));
    return () => {
      window.clearTimeout(timer.current);
      if (access) [...access.inputs.values()].forEach((i) => (i.onmidimessage = null));
    };
  }, []);

  return { status, devices, held };
}
