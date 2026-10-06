import { Attempt, LearnerState, TrackId, emptyState, parseState } from '../../core';

/** Local persistence: one IndexedDB database, a key-value store plus an append-only attempt log. */
const DB_NAME = 'fummelfuerst';
const DB_VERSION = 1;

export type NoteNames = 'german' | 'international';

export interface Settings {
  track: TrackId;
  noteNames: NoteNames;
  a4: number;
}

export const DEFAULT_SETTINGS: Settings = { track: 'fretboard', noteNames: 'german', a4: 440 };

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
