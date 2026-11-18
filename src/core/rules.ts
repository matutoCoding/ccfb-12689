// 陈列规则引擎：碰撞、运输超限、KT 裁切、陈列规则、包装体积
import type {
  CollisionResult, LayoutItem, PackageEntry, PanelSlice, Prop, RuleIssue,
  WindowProfile,
} from '../types';
import { aabbFromHalfExtents, aabbOverlap, deg2rad, type AABB } from '../engine/math';

/** 计算元素在橱窗坐标系中的世界 AABB（y 从地台起） */
export function itemAABB(
  item: LayoutItem,
  size: { w: number; h: number; d: number },
  platformHeight: number,
): AABB {
  const yBase = platformHeight + (item.slotY ?? 0);
  const centerY = yBase + size.h / 2;
  return aabbFromHalfExtents(
    [item.x, centerY, item.z],
    [size.w / 2, size.h / 2, size.d / 2],
    deg2rad(item.rotation),
  );
}

export function itemFootprint(item: LayoutItem, size: { w: number; d: number }): AABB {
  return aabbFromHalfExtents(
    [item.x, 0, item.z],
    [size.w / 2, 20, size.d / 2],
    deg2rad(item.rotation),
  );
}

/** 碰撞检测：元素两两 AABB 重叠 + 橱窗边界 */
export function checkCollisions(
  items: LayoutItem[],
  sizeOf: (it: LayoutItem) => { w: number; h: number; d: number },
  profile: WindowProfile,
): CollisionResult[] {
  const results: CollisionResult[] = [];
  const boxes = items.map((it) => ({ it, box: itemAABB(it, sizeOf(it), profile.platformHeight) }));

  for (let i = 0; i < boxes.length; i++) {
    const { it, box } = boxes[i];
    // 橱窗边界（x: ±width/2, z: [-depth/2, depth/2]，高度受净高约束）
    if (
      box.min[0] < -profile.width / 2 || box.max[0] > profile.width / 2 ||
      box.min[2] < -profile.depth / 2 || box.max[2] > profile.depth / 2 ||
      box.max[1] > profile.height
    ) {
      results.push({
        itemId: it.id, type: 'outOfBounds',
        message: `「${it.name}」超出橱窗边界（开间${profile.width}×进深${profile.depth}×净高${profile.height}mm）`,
      });
    }
    for (let j = i + 1; j < boxes.length; j++) {
      const other = boxes[j];
      if (aabbOverlap(box, other.box, 5)) {
        results.push({
          itemId: it.id, withItemId: other.it.id, type: 'overlap',
          message: `「${it.name}」与「${other.it.name}」发生碰撞`,
        });
      }
    }
  }
  return results;
}

/** 门洞/货梯超限：道具最大包装尺寸必须能进 */
export function checkTransport(
  items: LayoutItem[],
  propOf: (id: string) => Prop | undefined,
  profile: WindowProfile,
): CollisionResult[] {
  const results: CollisionResult[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (it.type !== 'prop' || seen.has(it.refId)) continue;
    seen.add(it.refId);
    const prop = propOf(it.refId);
    if (!prop) continue;
    const p = prop.packSize;
    const maxDim = Math.max(p.w, p.h, p.d);
    const midDim = [p.w, p.h, p.d].sort((a, b) => b - a)[1];
    const doorOk = maxDim <= profile.door.h && midDim <= profile.door.w;
    if (!doorOk) {
      results.push({
        itemId: it.id, type: 'doorExceed',
        message: `「${prop.name}」包装${p.w}×${p.h}×${p.d}mm 超门洞${profile.door.w}×${profile.door.h}mm，标红`,
      });
    }
    const elevOk =
      maxDim <= Math.max(profile.elevator.h, profile.elevator.d) &&
      midDim <= profile.elevator.w;
    if (!elevOk) {
      results.push({
        itemId: it.id, type: 'elevatorExceed',
        message: `「${prop.name}」超货梯${profile.elevator.w}×${profile.elevator.h}×${profile.elevator.d}mm，需走楼梯或拆运`,
      });
    }
  }
  return results;
}

/**
 * KT 背板按实际墙面自动分块裁切
 * @param boardW 背板总宽 @param boardH 背板总高
 * @param maxW 单块标准板宽（1200mm 常规 KT 板）
 * @param maxH 单块标准板高
 */
export function sliceKTPanel(
  boardW: number,
  boardH: number,
  maxW = 1200,
  maxH = 2400,
): { slices: PanelSlice[]; cols: number; rows: number } {
  const cols = Math.max(1, Math.ceil(boardW / maxW));
  const rows = Math.max(1, Math.ceil(boardH / maxH));
  const cellW = boardW / cols;
  const cellH = boardH / rows;
  const slices: PanelSlice[] = [];
  let n = 1;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      slices.push({
        index: n++,
        col: col + 1,
        row: row + 1,
        w: Math.round(cellW),
        h: Math.round(cellH),
        x: Math.round(-boardW / 2 + col * cellW),
        y: Math.round(row * cellH),
      });
    }
  }
  return { slices, cols, rows };
}

/** 横杆按件间距自动排满，返回可挂件数 */
export function railCapacity(railWidth: number, spacing: number): number {
  if (spacing <= 0) return 0;
  return Math.max(1, Math.floor((railWidth - 100) / spacing) + 1);
}

/**
 * 陈列规则检查
 * 1) 同色系连续占位不超过 maxSameColor（默认 3）
 * 2) 黄金视线区（地台以上 800~1700mm）不得放空
 * 3) 配饰与主推款需在同组（距离 <= groupRadius）
 * 4) 横杆间距过密/过疏
 */
export function checkDisplayRules(
  items: LayoutItem[],
  sizeOf: (it: LayoutItem) => { w: number; h: number; d: number },
  profile: WindowProfile,
  seriesColor: (id: string) => string | undefined,
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const GOLDEN_LO = 800;
  const GOLDEN_HI = 1700;
  const MAX_SAME = 3;
  const GROUP_RADIUS = 1500;

  // 按 x 坐标排序模拟从左到右的陈列节奏
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let runColor = '';
  let runLen = 0;
  for (const it of sorted) {
    const color = it.type === 'mannequin' ? seriesColor(it.refId) : it.rail?.garmentColor;
    if (!color) { runColor = ''; runLen = 0; continue; }
    if (color === runColor) {
      runLen++;
      if (runLen > MAX_SAME) {
        issues.push({
          level: 'warn', code: 'COLOR_RUN', itemId: it.id,
          message: `「${it.name}」同色系「${color}」连续占位 ${runLen} 组，超过 ${MAX_SAME} 组上限，色彩节奏单调`,
        });
      }
    } else {
      runColor = color;
      runLen = 1;
    }
  }

  // 黄金视线区：检查是否有主推元素的包围盒覆盖该高度区间
  const plat = profile.platformHeight;
  const inGolden = items.filter((it) => {
    const s = sizeOf(it);
    const top = plat + (it.slotY ?? 0) + s.h;
    const bottom = plat + (it.slotY ?? 0);
    return top > plat + GOLDEN_LO && bottom < plat + GOLDEN_HI;
  });
  const hasMainInGolden = inGolden.some((it) => it.flags.includes('main'));
  if (!hasMainInGolden && items.length > 0) {
    issues.push({
      level: 'warn', code: 'GOLDEN_EMPTY',
      message: `黄金视线区（地台以上 ${GOLDEN_LO}~${GOLDEN_HI}mm）没有主推款，黄金位放空`,
    });
  }

  // 配饰与主推同组
  const mains = items.filter((i) => i.flags.includes('main'));
  const accessories = items.filter((i) => i.flags.includes('accessory'));
  for (const acc of accessories) {
    const near = mains.some((m) => Math.hypot(m.x - acc.x, m.z - acc.z) <= GROUP_RADIUS);
    if (!near) {
      issues.push({
        level: 'warn', code: 'ACCESSORY_GROUP', itemId: acc.id,
        message: `配饰「${acc.name}」${GROUP_RADIUS}mm 内没有主推款，未搭在同组`,
      });
    }
  }

  // 横杆密度
  for (const it of items) {
    if (it.type !== 'rail' || !it.rail) continue;
    const s = sizeOf(it);
    const cap = railCapacity(s.w, it.rail.spacing);
    if (it.rail.garmentCount > cap) {
      issues.push({
        level: 'error', code: 'RAIL_OVERFLOW', itemId: it.id,
        message: `「${it.name}」挂 ${it.rail.garmentCount} 件超出容量 ${cap} 件（间距 ${it.rail.spacing}mm）`,
      });
    } else if (it.rail.garmentCount < cap * 0.5) {
      issues.push({
        level: 'info', code: 'RAIL_SPARSE', itemId: it.id,
        message: `「${it.name}」仅挂 ${it.rail.garmentCount}/${cap} 件，排面偏空可加密或收窄间距`,
      });
    }
  }

  // 叠装塔层数提示
  for (const it of items) {
    if (it.type === 'foldTower' && it.tower && it.tower.layers > 8) {
      issues.push({
        level: 'warn', code: 'TOWER_HIGH', itemId: it.id,
        message: `「${it.name}」叠装 ${it.tower.layers} 层过高，顾客取放易倒，建议 ≤8 层`,
      });
    }
  }
  return issues;
}

/** 包装用量汇总：按道具尺寸/数量算体积、箱数 */
export function computePackages(items: LayoutItem[], propOf: (id: string) => Prop | undefined): PackageEntry[] {
  const countMap = new Map<string, number>();
  for (const it of items) {
    if (it.type !== 'prop') continue;
    countMap.set(it.refId, (countMap.get(it.refId) ?? 0) + 1);
  }
  const entries: PackageEntry[] = [];
  for (const [propId, count] of countMap) {
    const prop = propOf(propId);
    if (!prop) continue;
    const p = prop.packSize;
    // 每箱可装件数：扁平/可折叠件按厚度估算，整件 1 件/箱
    const perBox = prop.packMethod === 'flat' || prop.packMethod === 'foldable'
      ? Math.max(1, Math.floor(1200 / Math.max(20, p.d)))
      : 1;
    const boxes = Math.ceil(count / perBox);
    const volume = (p.w * p.h * p.d) / 1e9 * count; // mm³ → m³
    entries.push({
      propId, name: prop.name, count, packMethod: prop.packMethod,
      perBox, boxes, volume: Math.round(volume * 1000) / 1000,
      weight: Math.round(prop.weight * count * 10) / 10,
    });
  }
  return entries.sort((a, b) => b.volume - a.volume);
}

/** 建议现场安装工时（分钟→小时）：基础 1.5h + 每大件 8 分钟 + 每箱 3 分钟 */
export function estimateInstall(packages: PackageEntry[], panelCount: number): number {
  const pieces = packages.reduce((s, e) => s + e.count, 0);
  const boxes = packages.reduce((s, e) => s + e.boxes, 0);
  const minutes = 90 + pieces * 8 + boxes * 3 + panelCount * 6;
  return Math.round((minutes / 60) * 10) / 10;
}
