import type { ConfirmDoc, Kit, MannequinGroup, Material, Scheme, StoreWindow } from '../types';
import { Store } from './Store';
import { repo, ensureSeed } from '../db/repo';

export interface AppState {
  ready: boolean;
  materials: Material[];
  groups: MannequinGroup[];
  kits: Kit[];
  windows: StoreWindow[];
  schemes: Scheme[];
  docs: ConfirmDoc[];
  currentSchemeId: string | null;
  currentWindowId: string | null;
}

const initial: AppState = {
  ready: false,
  materials: [], groups: [], kits: [], windows: [], schemes: [], docs: [],
  currentSchemeId: null, currentWindowId: null,
};

export const appStore = new Store<AppState>(initial);

export async function bootstrap() {
  await ensureSeed();
  const [materials, groups, kits, windows, schemes, docs] = await Promise.all([
    repo.materials.all(), repo.groups.all(), repo.kits.all(),
    repo.windows.all(), repo.schemes.all(), repo.docs.all(),
  ]);
  // 启动即清理回收站过期项
  const purged = await repo.schemes.purgeExpired(schemes);
  appStore.setState({
    ready: true, materials, groups, kits, windows,
    schemes: purged ? schemes.filter((s) => !(s.deletedAt && Date.now() - s.deletedAt > 30 * 86400_000)) : schemes,
    docs,
    currentSchemeId: appStore.getState().currentSchemeId,
    currentWindowId: appStore.getState().currentWindowId,
  });
}

export async function refreshMaterials() {
  appStore.patch({ materials: await repo.materials.all() });
}
export async function refreshGroups() {
  appStore.patch({ groups: await repo.groups.all() });
}
export async function refreshKits() {
  appStore.patch({ kits: await repo.kits.all() });
}
export async function refreshWindows() {
  appStore.patch({ windows: await repo.windows.all() });
}
export async function refreshSchemes() {
  appStore.patch({ schemes: await repo.schemes.all() });
}
export async function refreshDocs() {
  appStore.patch({ docs: await repo.docs.all() });
}
