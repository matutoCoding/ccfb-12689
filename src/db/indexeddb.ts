import type { DBShape } from '../types';

const DB_NAME = 'display-studio-db';
const DB_VERSION = 1;
export type StoreName = keyof DBShape;

let dbPromise: Promise<IDBDatabase> | null = null;

const STORES: StoreName[] = ['meta', 'materials', 'groups', 'kits', 'windows', 'schemes', 'docs'];

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === 'meta' ? 'key' : 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  return tx(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
}

export async function get<T>(store: StoreName, id: string): Promise<T | undefined> {
  return tx(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>);
}

export async function put<T>(store: StoreName, value: T): Promise<T> {
  return tx(store, 'readwrite', (s) => s.put(value) as unknown as IDBRequest<T>);
}

export async function putMany<T>(store: StoreName, values: T[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    for (const v of values) s.put(v);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function remove(store: StoreName, id: string): Promise<void> {
  await tx(store, 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>);
}

export async function clearStore(store: StoreName): Promise<void> {
  await tx(store, 'readwrite', (s) => s.clear() as IDBRequest<undefined>);
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await get<{ key: string; value: T }>('meta', key);
  return row ? row.value : fallback;
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await put('meta', { key, value });
}
