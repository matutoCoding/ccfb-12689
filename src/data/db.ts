// IndexedDB 封装：方案/橱窗/道具/套件/模特/模板/确认书全本地存储
import type {
  ConfirmationDoc, DisplayPlan, DisplayTemplate, LayoutItem, MannequinSeries,
  Prop, PropKit, WindowProfile,
} from '../types';

const DB_NAME = 'window-display-studio';
const DB_VERSION = 1;

export const STORES = {
  plans: 'plans',
  profiles: 'profiles',
  props: 'props',
  kits: 'kits',
  series: 'series',
  templates: 'templates',
  confirmations: 'confirmations',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idb = {
  async all<T>(store: string): Promise<T[]> {
    return tx(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
  },
  async get<T>(store: string, id: string): Promise<T | undefined> {
    return tx(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>);
  },
  async put<T extends { id: string }>(store: string, value: T): Promise<T> {
    await tx(store, 'readwrite', (s) => s.put(value));
    return value;
  },
  async bulkPut<T extends { id: string }>(store: string, values: T[]): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      const s = t.objectStore(store);
      for (const v of values) s.put(v);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
  async remove(store: string, id: string): Promise<void> {
    await tx(store, 'readwrite', (s) => s.delete(id));
  },
  async clear(store: string): Promise<void> {
    await tx(store, 'readwrite', (s) => s.clear());
  },
};

// ---- 类型化快捷方法 ----
export const db = {
  plans: {
    all: () => idb.all<DisplayPlan>(STORES.plans),
    get: (id: string) => idb.get<DisplayPlan>(STORES.plans, id),
    save: (p: DisplayPlan) => idb.put(STORES.plans, p),
    remove: (id: string) => idb.remove(STORES.plans, id),
  },
  profiles: {
    all: () => idb.all<WindowProfile>(STORES.profiles),
    get: (id: string) => idb.get<WindowProfile>(STORES.profiles, id),
    save: (p: WindowProfile) => idb.put(STORES.profiles, p),
    remove: (id: string) => idb.remove(STORES.profiles, id),
  },
  props: {
    all: () => idb.all<Prop>(STORES.props),
    get: (id: string) => idb.get<Prop>(STORES.props, id),
    save: (p: Prop) => idb.put(STORES.props, p),
    remove: (id: string) => idb.remove(STORES.props, id),
  },
  kits: {
    all: () => idb.all<PropKit>(STORES.kits),
    save: (k: PropKit) => idb.put(STORES.kits, k),
    remove: (id: string) => idb.remove(STORES.kits, id),
  },
  series: {
    all: () => idb.all<MannequinSeries>(STORES.series),
    save: (s: MannequinSeries) => idb.put(STORES.series, s),
    remove: (id: string) => idb.remove(STORES.series, id),
  },
  templates: {
    all: () => idb.all<DisplayTemplate>(STORES.templates),
    save: (t: DisplayTemplate) => idb.put(STORES.templates, t),
  },
  confirmations: {
    all: () => idb.all<ConfirmationDoc>(STORES.confirmations),
    save: (d: ConfirmationDoc) => idb.put(STORES.confirmations, d),
  },
};

export type { DisplayPlan, WindowProfile, Prop, PropKit, MannequinSeries, DisplayTemplate, LayoutItem };
