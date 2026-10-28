import { Arrangement, Attempt, KeyMode, LearnerState, PadBank, Part, SessionEntry, Stuck, TrackId, emptyBank, emptyState, parseState } from '../../core';

/** Local persistence: one IndexedDB database, a key-value store plus an append-only attempt log. */
const DB_NAME = 'fummelfuerst';
const DB_VERSION = 1;

export type NoteNames = 'german' | 'international';

export interface Settings {
  track: TrackId;
  noteNames: NoteNames;
  a4: number;
  /** Remembered keyboard pairing; resumed when the app opens. */
  link?: { role: 'host' | 'join'; code: string };
  /** Key the jam screen reads chords in; unset = read it from the chords played. */
  jamKey?: { tonic: string; mode: KeyMode } | null;
  /** Jam screen "Mehr": key, function, melody guide and next chords on top of the plain chord name. */
  jamDetails?: boolean;
  /** Tempo the recorder snaps chord lengths to. */
  recBpm?: number;
  /** Songs finished before the app counted them. */
  songsBase?: number;
  /** Milestones already celebrated, so a card shows once. */
  celebrated?: number[];
}

export const DEFAULT_SETTINGS: Settings = { track: 'fretboard', noteNames: 'international', a4: 440 };

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('attempts')) d.createObjectStore('attempts', { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadState(): Promise<LearnerState> {
  try {
    const raw = await tx<string | undefined>('kv', 'readonly', (s) => s.get('learner'));
    return raw ? parseState(raw) : emptyState();
  } catch {
    return emptyState();
  }
}

export const saveState = (s: LearnerState): Promise<IDBValidKey> => tx('kv', 'readwrite', (st) => st.put(JSON.stringify(s), 'learner'));

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await tx<Partial<Settings> | undefined>('kv', 'readonly', (s) => s.get('settings'));
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const saveSettings = (s: Settings): Promise<IDBValidKey> => tx('kv', 'readwrite', (st) => st.put(s, 'settings'));

/** Raw attempts are kept for stage 7: tuning the model against real data. */
export const logAttempt = (a: Attempt): Promise<IDBValidKey> => tx('attempts', 'readwrite', (st) => st.add(a));

/** Song brief draft: kept so the brief survives closing the app between FL Studio sessions. */
export interface BriefDraft {
  chords: string;
  tempo: string;
  bars: string;
  parts: Part[];
  stuck: Stuck;
  references: string;
  note: string;
}

export const EMPTY_BRIEF: BriefDraft = { chords: '', tempo: '', bars: '8', parts: [], stuck: 'Vom Loop zum Song', references: '', note: '' };

export async function loadBrief(): Promise<BriefDraft> {
  try {
    const raw = await tx<Partial<BriefDraft> | undefined>('kv', 'readonly', (s) => s.get('brief'));
    return { ...EMPTY_BRIEF, ...raw };
  } catch {
    return EMPTY_BRIEF;
  }
}

export const saveBrief = (b: BriefDraft): Promise<IDBValidKey> => tx('kv', 'readwrite', (st) => st.put(b, 'brief'));

/** What is on the FLkey's User Chord pads. */
export async function loadPads(): Promise<PadBank> {
  try {
    const raw = await tx<PadBank | undefined>('kv', 'readonly', (s) => s.get('pads'));
    const bank = emptyBank();
    raw?.forEach((p, i) => { if (p && i < bank.length) bank[i] = p; });
    return bank;
  } catch {
    return emptyBank();
  }
}

export const savePads = (b: PadBank): Promise<IDBValidKey> => tx('kv', 'readwrite', (st) => st.put(b, 'pads'));

export const EMPTY_ARRANGEMENT: Arrangement = { bpm: 140, sections: [] };

export async function loadArrangement(): Promise<Arrangement> {
  try {
    const raw = await tx<Partial<Arrangement> | undefined>('kv', 'readonly', (s) => s.get('arrangement'));
    return { ...EMPTY_ARRANGEMENT, ...raw };
  } catch {
    return EMPTY_ARRANGEMENT;
  }
}

export const saveArrangement = (a: Arrangement): Promise<IDBValidKey> => tx('kv', 'readwrite', (st) => st.put(a, 'arrangement'));

/** Sessions done: plan, genre, topic, exports – feeds the topic rotation and the week count. */
export async function loadSessions(): Promise<SessionEntry[]> {
  try {
    return (await tx<SessionEntry[] | undefined>('kv', 'readonly', (s) => s.get('sessions'))) ?? [];
  } catch {
    return [];
  }
}

export const saveSessions = (log: SessionEntry[]): Promise<IDBValidKey> => tx('kv', 'readwrite', (st) => st.put(log.slice(-200), 'sessions'));
