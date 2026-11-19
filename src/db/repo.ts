import type {
  ConfirmDoc, Kit, MannequinGroup, Material, Scheme, StoreWindow,
} from '../types';
import { getAll, get, put, remove, getMeta, setMeta, putMany } from './indexeddb';
import { SEED_GROUPS, SEED_KITS, SEED_MATERIALS, seedWindows } from '../domain/seed';
import { DAY_MS, uid } from '../lib/math';

export const SEED_FLAG = 'seeded-v1';
const RECYCLE_DAYS = 30;

export async function ensureSeed(): Promise<void> {
  const seeded = await getMeta(SEED_FLAG, false);
  if (seeded) return;
  await putMany('materials', SEED_MATERIALS);
  await putMany('groups', SEED_GROUPS);
  await putMany('kits', SEED_KITS);
  await putMany('windows', seedWindows());
  await setMeta(SEED_FLAG, true);
}

export const repo = {
  materials: {
    all: () => getAll<Material>('materials'),
    save: (m: Material) => put('materials', { ...m, updatedAt: Date.now() }),
    remove: (id: string) => remove('materials', id),
  },
  groups: {
    all: () => getAll<MannequinGroup>('groups'),
    save: (g: MannequinGroup) => put('groups', { ...g, updatedAt: Date.now() }),
    remove: (id: string) => remove('groups', id),
  },
  kits: {
    all: () => getAll<Kit>('kits'),
    save: (k: Kit) => put('kits', { ...k, updatedAt: Date.now() }),
    remove: (id: string) => remove('kits', id),
  },
  windows: {
    all: () => getAll<StoreWindow>('windows'),
    get: (id: string) => get<StoreWindow>('windows', id),
    save: (w: StoreWindow) => put('windows', { ...w, updatedAt: Date.now() }),
    remove: (id: string) => remove('windows', id),
  },
  schemes: {
    all: () => getAll<Scheme>('schemes'),
    get: (id: string) => get<Scheme>('schemes', id),
    save: (s: Scheme) => put('schemes', { ...s, updatedAt: Date.now() }),
    softDelete: async (s: Scheme) => {
      await put('schemes', { ...s, deletedAt: Date.now(), updatedAt: Date.now() });
    },
    restore: async (s: Scheme) => {
      const { deletedAt, ...rest } = s;
      await put('schemes', { ...rest, updatedAt: Date.now() });
    },
    hardDelete: (id: string) => remove('schemes', id),
    duplicate: async (s: Scheme): Promise<Scheme> => {
      const copy: Scheme = {
        ...structuredClone(s),
        id: uid('sch'),
        name: `${s.name} - 副本`,
        status: 'draft',
        confirmedAt: undefined,
        items: s.items.map((i) => ({ ...i, id: uid('pi') })),
        viewpoints: s.viewpoints.map((v) => ({ ...v, id: uid('vp') })),
        changeLog: [{ at: Date.now(), desc: `从方案「${s.name}」复制创建` }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: undefined,
      };
      await put('schemes', copy);
      return copy;
    },
    // 回收站:清理超过 30 天的
    purgeExpired: async (schemes: Scheme[]): Promise<number> => {
      const cutoff = Date.now() - RECYCLE_DAYS * DAY_MS;
      const expired = schemes.filter((s) => s.deletedAt && s.deletedAt < cutoff);
      for (const s of expired) await remove('schemes', s.id);
      return expired.length;
    },
  },
  docs: {
    all: () => getAll<ConfirmDoc>('docs'),
    save: (d: ConfirmDoc) => put('docs', d),
  },
};

// 方案文件:自描述 JSON,门店端可离线打开照装
export interface SchemeFile {
  format: 'display-studio-scheme';
  version: 1;
  exportedAt: number;
  scheme: Scheme;
  window: StoreWindow | null;
  materials: Material[];
}

export function exportSchemeFile(scheme: Scheme, win: StoreWindow | null, mats: Material[]): SchemeFile {
  return {
    format: 'display-studio-scheme',
    version: 1,
    exportedAt: Date.now(),
    scheme: structuredClone(scheme),
    window: win ? structuredClone(win) : null,
    materials: structuredClone(mats),
  };
}

export function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function readJSONFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try { resolve(JSON.parse(String(r.result))); } catch (e) { reject(e); }
    };
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
