import Peer, { DataConnection, PeerOptions } from 'peerjs';
import { busState, setDevices, setHeld, subscribe } from './noteBus';

/**
 * Pair a PC (MIDI keyboard attached) with the tablet by a 6-digit code.
 * The public PeerJS broker only introduces the two; notes then travel directly over WebRTC.
 */
const PREFIX = 'fummelfuerst-';
const RETRY_MS = 3000;

export type LinkRole = 'host' | 'join';
export type LinkStatus = 'idle' | 'connecting' | 'waiting' | 'connected' | 'error';

export interface LinkState {
  role: LinkRole | null;
  code: string | null;
  status: LinkStatus;
  error?: string;
}

type Message =
  | { type: 'held'; held: number[] }
  | { type: 'devices'; devices: string[] }
  /** Tablet → PC: a file to save next to FL Studio (a recorded progression as MIDI). */
  | { type: 'file'; name: string; mime: string; data: ArrayBuffer };

let state: LinkState = { role: null, code: null, status: 'idle' };
const listeners = new Set<(s: LinkState) => void>();
let peer: Peer | null = null;
let cleanup: (() => void) | null = null;
/** The PC's connection while hosting, for sending files back. */
let hostConn: DataConnection | null = null;
let fileListener: ((name: string, mime: string, data: ArrayBuffer) => void) | null = null;

/** PC side: what to do with a file the tablet sends (the Link screen downloads it). */
export function onFile(l: typeof fileListener): () => void {
  fileListener = l;
  return () => { if (fileListener === l) fileListener = null; };
}

/** Tablet side: send a file to the paired PC. False when nothing is connected. */
export function sendFile(name: string, mime: string, data: Uint8Array): boolean {
  if (!hostConn?.open) return false;
  const copy = new Uint8Array(data);
  hostConn.send({ type: 'file', name, mime, data: copy.buffer } satisfies Message);
  return true;
}

const set = (patch: Partial<LinkState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
};

export const linkState = (): LinkState => state;
export function onLink(l: (s: LinkState) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const newCode = (): string => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
export const formatCode = (c: string): string => `${c.slice(0, 3)} ${c.slice(3)}`;

/** `?peer=host:port` points at a self-hosted PeerServer (used by the end-to-end test). */
function peerOptions(): PeerOptions {
  const custom = new URLSearchParams(location.search).get('peer');
  if (!custom) return {};
  const [host, port] = custom.split(':');
  return { host, port: Number(port), path: '/', secure: false };
}

export function stopLink(): void {
  cleanup?.();
  cleanup = null;
  hostConn = null;
  peer?.destroy();
  peer = null;
  setHeld('remote', []);
  setDevices('remote', []);
  set({ role: null, code: null, status: 'idle', error: undefined });
}

/** Tablet side: wait under `code` for the PC to connect; remote notes land on the note bus. */
export function hostLink(code: string, onCodeTaken?: (fresh: string) => void): void {
  stopLink();
  set({ role: 'host', code, status: 'connecting' });
  const p = new Peer(PREFIX + code, peerOptions());
  peer = p;
  p.on('open', () => set({ status: 'waiting', error: undefined }));
  p.on('connection', (conn) => {
    conn.on('open', () => { hostConn = conn; set({ status: 'connected' }); });
    conn.on('data', (raw) => {
      const msg = raw as Message;
      if (msg.type === 'held') setHeld('remote', msg.held);
      if (msg.type === 'devices') setDevices('remote', msg.devices.map((d) => `${d} (PC)`));
    });
    conn.on('close', () => {
      if (hostConn === conn) hostConn = null;
      setHeld('remote', []);
      setDevices('remote', []);
      if (peer === p) set({ status: 'waiting' });
    });
  });
  p.on('disconnected', () => p.reconnect());
  p.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      const fresh = newCode();
      onCodeTaken?.(fresh);
      hostLink(fresh, onCodeTaken);
    } else set({ status: 'error', error: err.type });
  });
}

/** PC side: connect to the tablet's code and stream the local keyboard to it. Retries until stopped. */
export function joinLink(code: string): void {
  stopLink();
  set({ role: 'join', code, status: 'connecting' });
  const p = new Peer(peerOptions());
  peer = p;
  let conn: DataConnection | null = null;
  let retry: number | undefined;
  const send = (m: Message) => conn?.open && conn.send(m);
  const off = subscribe((s) => {
    send({ type: 'held', held: s.bySource.local.held });
    send({ type: 'devices', devices: s.bySource.local.devices });
  });
  const connect = () => {
    if (peer !== p || p.destroyed) return;
    conn = p.connect(PREFIX + code, { reliable: true });
    conn.on('open', () => {
      set({ status: 'connected', error: undefined });
      const s = busState();
      send({ type: 'devices', devices: s.bySource.local.devices });
      send({ type: 'held', held: s.bySource.local.held });
    });
    conn.on('data', (raw) => {
      const msg = raw as Message;
      if (msg.type === 'file') fileListener?.(msg.name, msg.mime, msg.data instanceof ArrayBuffer ? msg.data : new Uint8Array(msg.data as ArrayLike<number>).buffer);
    });
    conn.on('close', () => {
      if (peer !== p) return;
      set({ status: 'waiting' });
      retry = window.setTimeout(connect, RETRY_MS);
    });
  };
  p.on('open', connect);
  p.on('disconnected', () => p.reconnect());
  p.on('error', (err) => {
    if (err.type === 'peer-unavailable') {
      set({ status: 'waiting', error: 'peer-unavailable' });
      window.clearTimeout(retry);
      retry = window.setTimeout(connect, RETRY_MS);
    } else set({ status: 'error', error: err.type });
  });
  cleanup = () => {
    off();
    window.clearTimeout(retry);
  };
}
