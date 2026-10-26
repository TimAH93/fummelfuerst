/**
 * Held notes from every source in one place: the local MIDI port and a paired PC.
 * Exercises listen here and do not care where a note came from.
 */
export type Source = 'local' | 'remote';

export interface BusState {
  held: number[];
  devices: string[];
  bySource: Record<Source, { held: number[]; devices: string[] }>;
}

const bySource: BusState['bySource'] = { local: { held: [], devices: [] }, remote: { held: [], devices: [] } };
const listeners = new Set<(s: BusState) => void>();

export function busState(): BusState {
  const held = [...new Set([...bySource.local.held, ...bySource.remote.held])].sort((a, b) => a - b);
  return { held, devices: [...bySource.local.devices, ...bySource.remote.devices], bySource };
}

const emit = () => {
  const s = busState();
  listeners.forEach((l) => l(s));
};

export function setHeld(source: Source, held: number[]): void {
  bySource[source] = { ...bySource[source], held };
  emit();
}

export function setDevices(source: Source, devices: string[]): void {
  bySource[source] = { ...bySource[source], devices };
  emit();
}

export function subscribe(l: (s: BusState) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
