import type { PlacedItem, RuleIssue, StoreWindow } from '../types';
import { itemSize, RAIL_LENGTH } from '../engine/ModelRegistry';

const MAX_SAME_HUE_RUN = 4;
// 黄金视线区:距地台 80~170cm(行业通用黄金陈列带)
const GOLD_MIN = 80;
const GOLD_MAX = 170;

export function displayRules(items: PlacedItem[], win: StoreWindow): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const floorY = win.platformHeight;
  const active = items.filter((i) => !i.wallMount);

  // 1. 同色系连续占位数:按 X 排序后扫描
  const sorted = [...active].sort((a, b) => a.position.x - b.position.x);
  let run = 0;
  let runHue = '';
  let runStart: PlacedItem | null = null;
  for (const it of sorted) {
    const hue = it.hueTag ?? '';
    if (!hue) { run = 0; runHue = ''; continue; }
    if (hue === runHue) {
      run++;
      if (run === 1) runStart = it;
      if (run > MAX_SAME_HUE_RUN) {
        issues.push({
          level: 'warning', code: 'HUE_RUN',
          message: `「${hue}」色系连续占位 ${run} 件,超过 ${MAX_SAME_HUE_RUN} 件上限,色彩节奏过闷,建议穿插对比色`,
          itemId: runStart?.id,
        });
      }
    } else {
      run = 1; runHue = hue; runStart = it;
    }
  }

  // 2. 黄金视线区放空:把黄金带投影到 X 轴,检查 >120cm 空档
  const goldRanges = sorted
    .filter((it) => {
      const top = it.position.y + itemSize(it).h - floorY;
      const bottom = it.position.y - floorY;
      return top > GOLD_MIN && bottom < GOLD_MAX;
    })
    .map((it) => {
      const s = itemSize(it);
      return { x1: it.position.x - s.w / 2, x2: it.position.x + s.w / 2 };
    })
    .sort((a, b) => a.x1 - b.x1);
  const merged: typeof goldRanges = [];
  for (const r of goldRanges) {
    const last = merged[merged.length - 1];
    if (last && r.x1 - last.x2 < 120) last.x2 = Math.max(last.x2, r.x2);
    else merged.push({ ...r });
  }
  for (let i = 0; i < merged.length - 1; i++) {
    const gap = merged[i + 1].x1 - merged[i].x2;
    if (gap > 120) {
      issues.push({
        level: 'warning', code: 'GOLDEN_GAP',
        message: `黄金视线区(离地 ${GOLD_MIN}~${GOLD_MAX}cm)出现 ${gap.toFixed(0)}cm 空档,主推内容应落在该带`,
      });
    }
  }
  if (!merged.length && active.length) {
    issues.push({ level: 'warning', code: 'GOLDEN_EMPTY', message: '黄金视线区完全空置,顾客平视看不到重点陈列' });
  }

  // 3. 配饰与主推款同组:每个主推款半径 150cm 内需要至少一件配饰
  const heroes = active.filter((i) => i.isHero);
  const accessories = active.filter((i) => i.isAccessory);
  for (const h of heroes) {
    const ok = accessories.some((a) => Math.hypot(a.position.x - h.position.x, a.position.z - h.position.z) <= 150);
    if (!ok) {
      issues.push({
        level: 'warning', code: 'NO_ACCESSORY',
        message: `主推款「${h.name}」150cm 范围内没有配饰搭配,连带销售位空缺`,
        itemId: h.id,
      });
    }
  }

  // 4. 挂杆容量校验
  for (const it of active.filter((i) => i.rail)) {
    const cap = railCapacity(it);
    if (it.rail!.garments > cap) {
      issues.push({
        level: 'error', code: 'RAIL_OVERFLOW',
        message: `「${it.name}」挂装 ${it.rail!.garments} 件,超过杆容量 ${cap} 件(件间距 ${it.rail!.spacing}cm)`,
        itemId: it.id,
      });
    } else if (it.rail!.garments < cap * 0.6) {
      issues.push({
        level: 'info', code: 'RAIL_LOOSE',
        message: `「${it.name}」挂装仅 ${it.rail!.garments}/${cap} 件,低于 60% 饱满度`,
        itemId: it.id,
      });
    }
  }

  // 5. 叠装塔层数
  for (const it of active.filter((i) => i.tower)) {
    const totalH = 2 + it.tower!.levels * it.tower!.levelHeight;
    if (totalH > 180) {
      issues.push({
        level: 'warning', code: 'TOWER_TALL',
        message: `「${it.name}」叠装塔总高 ${totalH}cm 超过 180cm,顾客取放困难`,
        itemId: it.id,
      });
    }
  }

  // 6. 主推款必须存在
  if (active.length && !heroes.length) {
    issues.push({ level: 'info', code: 'NO_HERO', message: '本方案未标记主推款,建议至少标记 1 个焦点道具' });
  }
  return issues;
}

export function railCapacity(item: PlacedItem): number {
  if (!item.rail) return 0;
  // 容量由物理杆长决定,与当前挂了多少件无关
  return Math.max(1, Math.floor(RAIL_LENGTH / (item.rail.spacing + 4)));
}
