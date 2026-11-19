import type { AABB, Material, PanelPiece, PlacedItem, RuleIssue, StoreWindow, Size3 } from '../types';
import { itemAABB, aabbOverlap } from '../lib/math';
import { itemSize } from '../engine/ModelRegistry';

// KT 板标准板材尺寸(cm),超宽自动分块
export const KT_SHEET_W = 120;
export const KT_SHEET_H = 240;
export const KT_GAP = 0.8; // 拼缝

export function splitKTBoard(totalW: number, totalH: number, prefix = 'KT'): PanelPiece[] {
  const cols = Math.max(1, Math.ceil(totalW / KT_SHEET_W));
  const rows = Math.max(1, Math.ceil(totalH / KT_SHEET_H));
  const pieces: PanelPiece[] = [];
  const colLetters = 'ABCDEFGH';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const w = Math.min(KT_SHEET_W, totalW - c * KT_SHEET_W);
      const h = Math.min(KT_SHEET_H, totalH - r * KT_SHEET_H);
      pieces.push({
        code: `${prefix}-${colLetters[c]}${r + 1}`,
        w: Math.max(1, w - KT_GAP),
        h: Math.max(1, h - KT_GAP),
        x: c * KT_SHEET_W,
        y: r * KT_SHEET_H,
      });
    }
  }
  return pieces;
}

export function getAABB(item: PlacedItem, mat?: Material): AABB {
  const size: Size3 = mat ? mat.size : itemSize(item);
  return itemAABB(item.position, size, item.rotationY, item.scale);
}

// 道具间碰撞(忽略墙面挂装与地面的高度差重叠)
export function findCollisions(items: PlacedItem[], mats: Map<string, Material>): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const boxes = items.map((i) => ({ item: i, box: getAABB(i, mats.get(i.refId)) }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.item.wallMount !== b.item.wallMount) continue;
      if (aabbOverlap(a.box, b.box, 1.5)) {
        issues.push({
          level: 'error',
          code: 'COLLISION',
          message: `「${a.item.name}」与「${b.item.name}」发生碰撞(净距 <1.5cm)`,
          itemId: a.item.id,
        });
      }
    }
  }
  return issues;
}

// 超橱窗边界
export function findOutOfBounds(items: PlacedItem[], win: StoreWindow, mats: Map<string, Material>): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const hw = win.width / 2, hd = win.depth / 2;
  for (const it of items) {
    const b = getAABB(it, mats.get(it.refId));
    const floorY = win.platformHeight;
    if (b.min.x < -hw || b.max.x > hw || b.min.z < -hd || b.max.z > hd + 8 ||
        b.max.y > floorY + win.height || b.min.y < floorY - 0.5) {
      issues.push({
        level: 'error', code: 'OUT_OF_WINDOW',
        message: `「${it.name}」超出橱窗实际边界(开间${win.width}×进深${win.depth}×高${win.height}cm)`,
        itemId: it.id,
      });
    }
  }
  return issues;
}

// 门洞 / 货梯准入:道具折叠后最大边必须能过
export function foldedSize(m: Material): Size3 {
  switch (m.fold) {
    case 'fold': return { w: m.size.w, h: m.size.h * 0.4, d: m.size.d * 1.4 };
    case 'detach': return { w: m.size.w * 0.7, h: m.size.h * 0.6, d: m.size.d * 0.7 };
    case 'roll': return { w: Math.min(m.size.w, 40), h: Math.min(m.size.h, 40), d: m.size.d };
    default: return m.size;
  }
}

export function findAccessIssues(items: PlacedItem[], win: StoreWindow, mats: Map<string, Material>): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const m = mats.get(it.refId);
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    const f = foldedSize(m);
    const maxDim = Math.max(f.w, f.h, f.d);
    const doorMax = Math.max(win.door.w, win.door.h);
    const elevMax = Math.max(win.elevator.w, win.elevator.h, win.elevator.d);
    if (maxDim > doorMax) {
      issues.push({
        level: 'error', code: 'DOOR_BLOCK',
        message: `「${m.name}」折叠后最大边 ${maxDim.toFixed(0)}cm 超门洞 ${win.door.w}×${win.door.h}cm,无法进店`,
        itemId: it.id,
      });
    } else if (maxDim > elevMax) {
      issues.push({
        level: 'warning', code: 'ELEVATOR_BLOCK',
        message: `「${m.name}」最大边 ${maxDim.toFixed(0)}cm 超货梯 ${win.elevator.w}×${win.elevator.h}×${win.elevator.d}cm,需走楼梯/吊装`,
        itemId: it.id,
      });
    }
  }
  return issues;
}
