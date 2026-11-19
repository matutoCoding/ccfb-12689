import type {
  AdaptConflict, ID, Material, PlacedItem, RuleIssue, StoreWindow,
} from '../types';
import { itemAABB, aabbOverlap, uid, v3 } from '../lib/math';
import { itemSize } from '../engine/ModelRegistry';
import { findAccessIssues, findCollisions, findOutOfBounds } from './geometryRules';
import { displayRules } from './displayRules';

export interface AdaptResult {
  windowId: ID;
  items: PlacedItem[];
  issues: RuleIssue[];
}

interface Box2 { x: number; z: number; w: number; d: number; }

function footprint(it: PlacedItem): Box2 {
  const s = itemSize(it);
  const c = Math.abs(Math.cos(it.rotationY)), sn = Math.abs(Math.sin(it.rotationY));
  const w = s.w * c + s.d * sn;
  const d = s.w * sn + s.d * c;
  return { x: it.position.x, z: it.position.z, w, d };
}

function overlaps2(a: Box2, b: Box2, pad = 3): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad &&
         Math.abs(a.z - b.z) < (a.d + b.d) / 2 + pad;
}

// 行式自动排布:大件优先,从前到后逐行摆放,锁定项作为障碍跳过
export function autoLayout(
  items: PlacedItem[],
  win: StoreWindow,
  mats: Map<ID, Material>,
): PlacedItem[] {
  const floorY = win.platformHeight;
  const hw = win.width / 2 - 8;
  const hd = win.depth / 2 - 8;
  const locked = items.filter((i) => i.locked);
  const moving = items
    .filter((i) => !i.locked)
    .map((i) => ({ i, s: itemSize(i) }))
    .sort((a, b) => b.s.w * b.s.d - a.s.w * a.s.d);

  const occupied: Box2[] = locked.map(footprint);
  const out = items.map((i) => ({ ...i, position: { ...i.position }, mannequins: i.mannequins?.map((m) => ({ ...m })) }));
  const outMap = new Map(out.map((i) => [i.id, i]));

  let cursorZ = hd - 20;
  let cursorX = -hw + 20;
  let rowMaxD = 0;

  for (const { i, s } of moving) {
    const halfW = s.w / 2 + 4;
    const halfD = s.d / 2 + 4;
    let placed = false;
    for (let guard = 0; guard < 400 && !placed; guard++) {
      const candidate: Box2 = { x: cursorX + halfW - 20, z: cursorZ - halfD + 20, w: s.w + 8, d: s.d + 8 };
      const inX = candidate.x - s.w / 2 > -hw && candidate.x + s.w / 2 < hw;
      const inZ = candidate.z - s.d / 2 > -hd && candidate.z + s.d / 2 < hd;
      const clash = occupied.some((o) => overlaps2(candidate, o));
      if (inX && inZ && !clash) {
        const target = outMap.get(i.id)!;
        target.position = v3(candidate.x, floorY, candidate.z);
        target.rotationY = 0;
        occupied.push(candidate);
        placed = true;
        rowMaxD = Math.max(rowMaxD, s.d);
      }
      cursorX += s.w + 16;
      if (cursorX + halfW > hw) {
        cursorX = -hw + 20;
        cursorZ -= rowMaxD + 22;
        rowMaxD = 0;
        if (cursorZ - halfD < -hd) {
          // 空间耗尽:沿背板层叠(抬高),标记留给后续规则报冲突
          cursorZ = hd - 20;
        }
      }
    }
    if (!placed) {
      const target = outMap.get(i.id)!;
      target.position = v3(clamp(cursorX, -hw, hw), floorY, clamp(cursorZ, -hd, hd));
    }
  }
  return out;
}

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

// 单店适配:复制阵 → 自动排 → 全量规则校验
export function adaptToWindow(
  items: PlacedItem[],
  win: StoreWindow,
  mats: Map<ID, Material>,
): AdaptResult {
  const remapped = items.map((i) => ({
    ...i,
    id: uid('pi'),
    position: { ...i.position },
    mannequins: i.mannequins?.map((m) => ({ ...m })),
  }));
  const laid = autoLayout(remapped, win, mats);
  const issues: RuleIssue[] = [
    ...findCollisions(laid, mats),
    ...findOutOfBounds(laid, win, mats),
    ...findAccessIssues(laid, win, mats),
    ...displayRules(laid, win),
  ];
  // 去重
  const seen = new Set<string>();
  const dedup = issues.filter((x) => {
    const k = x.code + x.message;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { windowId: win.id, items: laid, issues: dedup };
}

// 批量挂主题:对每家门店档案适配,返回冲突清单(规格 8)
export function batchAdapt(
  items: PlacedItem[],
  windows: StoreWindow[],
  mats: Map<ID, Material>,
): { results: AdaptResult[]; conflicts: AdaptConflict[] } {
  const results = windows.map((win) => adaptToWindow(items, win, mats));
  const conflicts = results
    .filter((r) => r.issues.some((x) => x.level === 'error' || x.level === 'warning'))
    .map((r) => ({
      windowId: r.windowId,
      storeName: windows.find((w) => w.id === r.windowId)?.storeName ?? r.windowId,
      issues: r.issues,
    }));
  return { results, conflicts };
}

// 联动更新校验:主题改了一件道具后,确认锁定道具仍在原位且尺寸不超界
export function verifyLinkedLayout(
  layout: PlacedItem[],
  original: PlacedItem[],
  win: StoreWindow,
  mats: Map<ID, Material>,
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const origMap = new Map(original.map((i) => [i.id, i]));
  for (const it of layout.filter((i) => i.locked)) {
    const o = origMap.get(it.id);
    if (o && (o.position.x !== it.position.x || o.position.z !== it.position.z)) {
      issues.push({ level: 'error', code: 'LOCK_MOVED', message: `锁定主推道具「${it.name}」在联动更新中发生位移`, itemId: it.id });
    }
  }
  issues.push(...findOutOfBounds(layout, win, mats));
  return issues;
}

// 供 AABB 测试复用
export { itemAABB, aabbOverlap };
