import type { Material, MannequinGroup, PlacedItem, Size3, SurfaceType } from '../types';
import {
  genericModel, mannequinModel, railModel, towerModel, type ModelDef,
} from '../lib/geometry';
import { hashStr } from '../lib/math';

// 模型注册表:同 SKU 共享 GPU 几何,几百件道具也只建一次模型
const cache = new Map<string, ModelDef>();

function key(parts: (string | number)[]): string {
  return parts.join('|');
}

export function materialModel(m: Material): ModelDef {
  const k = key(['mat', m.id, m.size.w, m.size.h, m.size.d, m.surface]);
  const hit = cache.get(k);
  if (hit) return hit;
  const def = genericModel(m.size, m.surface, m.category);
  cache.set(k, def);
  return def;
}

export function groupModel(g: MannequinGroup): ModelDef {
  const poseSig = g.mannequins
    .map((p) => `${p.offsetX.toFixed(1)},${p.offsetZ.toFixed(1)},${p.rotationY.toFixed(2)},${p.pose}`)
    .join(';');
  const k = key(['grp', g.id, g.mannequins.length, g.spacing, hashStr(poseSig)]);
  const hit = cache.get(k);
  if (hit) return hit;
  const single = mannequinModel('stand');
  const n = g.mannequins.length;
  const span = (n - 1) * g.spacing;
  const def: ModelDef = {
    bounds: { w: span + 46, h: 180, d: 24 },
    submeshes: g.mannequins.flatMap((p) =>
      single.submeshes.map((sm) => ({
        ...sm,
        model: translateModel(sm.model, p.offsetX, 0, p.offsetZ, p.rotationY, 1),
        surface: 'skin' as SurfaceType,
      })),
    ),
  };
  cache.set(k, def);
  return def;
}

function translateModel(src: Float32Array, tx: number, ty: number, tz: number, ry: number, s: number): Float32Array {
  const c = Math.cos(ry), sn = Math.sin(ry);
  const out = new Float32Array(16);
  // 先 Y 旋转再平移
  out[0] = c * s; out[1] = 0; out[2] = -sn * s; out[3] = 0;
  out[4] = 0; out[5] = s; out[6] = 0; out[7] = 0;
  out[8] = sn * s; out[9] = 0; out[10] = c * s; out[11] = 0;
  out[12] = tx + src[12]; out[13] = ty + src[13]; out[14] = tz + src[14]; out[15] = 1;
  return out;
}

// 挂杆物理杆长(立杆内侧可用长度),容量基于它计算,不随件数变化
export const RAIL_LENGTH = 152;

export function railDef(item: PlacedItem): ModelDef {
  const w = itemSize(item).w;
  const k = key(['rail', w]);
  const hit = cache.get(k);
  if (hit) return hit;
  const def = railModel(Math.max(w, RAIL_LENGTH + 8));
  cache.set(k, def);
  return def;
}

export function towerDef(item: PlacedItem): ModelDef {
  const s = itemSize(item);
  const lv = item.tower?.levels ?? 4;
  const lh = item.tower?.levelHeight ?? 28;
  const k = key(['tower', s.w, s.d, lv, lh]);
  const hit = cache.get(k);
  if (hit) return hit;
  const def = towerModel(s.w, s.d, lv, lh);
  cache.set(k, def);
  return def;
}

// 道具在场景中的实际尺寸(挂杆视觉宽度随件数但不超物理杆长,叠装塔按层数)
export function itemSize(item: PlacedItem): Size3 {
  if (item.kind === 'mannequinGroup') {
    const n = item.mannequins?.length ?? 1;
    const spacing = 90;
    return { w: (n - 1) * spacing + 46, h: 180, d: 24 };
  }
  if (item.rail) {
    const used = Math.min(item.rail.garments * (item.rail.spacing + 4) + 30, RAIL_LENGTH + 30);
    return { w: used, h: 160, d: 40 };
  }
  if (item.tower) {
    return { w: 70, h: 2 + item.tower.levels * item.tower.levelHeight, d: 50 };
  }
  // material / panel / kit:从 ref 尺寸由调用方注入(这里给兜底)
  return { w: 40, h: 40, d: 40 };
}

export function modelForItem(item: PlacedItem, mat?: Material): ModelDef {
  if (item.kind === 'mannequinGroup') {
    return groupModel({
      id: item.refId, name: item.name, series: '', spacing: 90,
      mannequins: item.mannequins ?? [], updatedAt: 0,
    });
  }
  if (item.rail) return railDef(item);
  if (item.tower) return towerDef(item);
  if (mat) return materialModel(mat);
  const s = itemSize(item);
  const k = key(['generic', s.w, s.h, s.d, 'matte', 'other']);
  const hit = cache.get(k);
  if (hit) return hit;
  const def = genericModel(s, 'matte', 'other');
  cache.set(k, def);
  return def;
}

// 稳定的伪随机色(分块编号区分用)
export function pieceColor(seed: string): [number, number, number] {
  const h = hashStr(seed);
  return [
    0.55 + (h & 255) / 255 * 0.3,
    0.55 + ((h >> 8) & 255) / 255 * 0.3,
    0.55 + ((h >> 16) & 255) / 255 * 0.3,
  ];
}

export function clearModelCache() { cache.clear(); }
