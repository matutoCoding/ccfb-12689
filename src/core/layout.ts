// 自动排版：主题批量适配门店、模板套用、教学评分
import type {
  BatchAdaptResult, DisplayPlan, DisplayTemplate, LayoutItem, Prop,
  TeachingScore, WindowProfile,
} from '../types';
import { checkCollisions, checkDisplayRules, checkTransport } from './rules';
import { uid } from '../engine/math';

/** 元素有效占地尺寸 */
function footprint(item: LayoutItem, propOf: (id: string) => Prop | undefined, fallback = 600) {
  if (item.type === 'prop') {
    const p = propOf(item.refId);
    return { w: p?.size.w ?? fallback, d: p?.size.d ?? fallback, h: p?.size.h ?? fallback };
  }
  if (item.type === 'rail') return { w: 1800, d: 450, h: 1600 };
  if (item.type === 'foldTower') return { w: 900, d: 700, h: 1200 };
  return { w: 1200, d: 500, h: 1750 };
}

/**
 * 按目标橱窗尺寸重排道具位置
 * 规则：
 *  - 锁定(locked/主推锁定)的元素保持原位不参与
 *  - 其余元素按背板网格贪心摆放，行距/列距留出 300mm 通道
 *  - 超界即返回标记，由调用方收集
 */
export function autoLayout(opts: {
  items: LayoutItem[];
  source: WindowProfile;
  target: WindowProfile;
  propOf: (id: string) => Prop | undefined;
  seriesColor: (id: string) => string | undefined;
}): { items: LayoutItem[]; issues: BatchAdaptResult['issues']; collisions: BatchAdaptResult['collisions'] } {
  const { items, target, propOf, seriesColor } = opts;
  const margin = 250;
  const aisle = 300;
  const usableW = target.width - margin * 2;
  const backZ = -target.depth / 2 + 400;

  // 先复制，锁定项不动
  const next = items.map((it) => ({ ...it, flags: [...it.flags] }));
  const movable = next.filter((it) => !it.flags.includes('locked'));
  const placed: LayoutItem[] = next.filter((it) => it.flags.includes('locked'));

  let cursorX = -usableW / 2;
  let rowZ = backZ;
  let rowMaxD = 0;

  for (const it of movable) {
    const fp = footprint(it, propOf);
    // 换行
    if (cursorX + fp.w / 2 > usableW / 2) {
      cursorX = -usableW / 2;
      rowZ += rowMaxD + aisle;
      rowMaxD = 0;
    }
    it.x = cursorX + fp.w / 2;
    it.z = Math.min(rowZ + fp.d / 2, target.depth / 2 - 300);
    cursorX += fp.w + 200;
    rowMaxD = Math.max(rowMaxD, fp.d);
    placed.push(it);
  }

  // 进深不够时的兜底压缩 x 间距
  const overflowZ = rowZ + rowMaxD > target.depth / 2 - 200;
  const collisions = checkCollisions(placed, (it) => footprint(it, propOf), target);
  const transport = checkTransport(placed, propOf, target);
  const issues = checkDisplayRules(placed, (it) => footprint(it, propOf), target, seriesColor);
  if (overflowZ) {
    issues.push({
      level: 'error', code: 'DEPTH_OVERFLOW',
      message: `道具排到第 ${Math.abs(rowZ).toFixed(0)}mm 仍超进深 ${target.depth}mm，需删减道具或缩小体量`,
    });
  }
  return { items: next, issues, collisions: [...collisions, ...transport] };
}

/** 一套主题批量挂到多家门店，返回逐店适配结果（锁定道具不动） */
export function batchAdaptTheme(opts: {
  theme: DisplayPlan;
  sourceProfile: WindowProfile;
  targets: WindowProfile[];
  propOf: (id: string) => Prop | undefined;
  seriesColor: (id: string) => string | undefined;
}): { planByStore: Map<string, DisplayPlan>; results: BatchAdaptResult[] } {
  const { theme, sourceProfile, targets, propOf, seriesColor } = opts;
  const results: BatchAdaptResult[] = [];
  const planByStore = new Map<string, DisplayPlan>();

  for (const target of targets) {
    const { items, issues, collisions } = autoLayout({
      items: theme.items, source: sourceProfile, target, propOf, seriesColor,
    });
    const ok = issues.every((i) => i.level !== 'error') &&
      !collisions.some((c) => c.type !== 'overlap');
    results.push({
      profileId: target.id, storeName: `${target.storeCode} ${target.storeName}`,
      ok, issues, collisions,
    });
    const storePlan: DisplayPlan = {
      ...theme,
      id: uid('plan'),
      name: `${theme.name} · ${target.storeName}`,
      windowProfileId: target.id,
      items,
      status: 'draft',
      themeSourceId: theme.id,
      changeLog: [{ at: Date.now(), text: `从主题「${theme.name}」批量适配生成` }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: theme.version,
    };
    planByStore.set(target.id, storePlan);
  }
  return { planByStore, results };
}

/** 套用经典模板：归一化坐标按橱窗尺寸反归一化 */
export function applyTemplate(
  template: DisplayTemplate,
  profile: WindowProfile,
): LayoutItem[] {
  return template.items.map((t) => {
    const { nx, nz, ...rest } = t;
    const item: LayoutItem = { ...(rest as LayoutItem), id: uid('item') };
    item.x = (nx ?? 0.5) * (profile.width - 600) - (profile.width - 600) / 2;
    item.z = -profile.depth / 2 + (nz ?? 0.3) * (profile.depth - 600);
    return item;
  });
}

/**
 * 教学模式评分
 * 维度：主推焦点位置(40)、色彩节奏(30)、道具疏密(30)
 * 参考目标为内置理想布局（归一化），不依赖照片识别
 */
export function scoreTeaching(
  items: LayoutItem[],
  profile: WindowProfile,
): TeachingScore {
  const comments: string[] = [];
  // 焦点：主推款是否落在橱窗水平中心 ±20%、黄金视线高度
  const mains = items.filter((i) => i.flags.includes('main'));
  let focus = 0;
  if (mains.length === 0) {
    comments.push('缺少标记为主推款的元素，焦点无从谈起（-40）');
  } else {
    const main = mains[0];
    const xRatio = Math.abs(main.x) / (profile.width / 2);
    focus = Math.round(40 * Math.max(0, 1 - xRatio * 1.4));
    if (xRatio > 0.2) comments.push(`主推款偏离视觉中心 ${(xRatio * 100).toFixed(0)}%，向中间收拢可提升焦点分`);
    if (focus >= 32) comments.push('主推款焦点位置准确，顾客第一眼可捕捉');
  }

  // 色彩节奏：相邻元素颜色交替程度
  const colors = [...items]
    .sort((a, b) => a.x - b.x)
    .map((i) => i.rail?.garmentColor || '')
    .filter(Boolean);
  let changes = 0;
  for (let i = 1; i < colors.length; i++) if (colors[i] !== colors[i - 1]) changes++;
  const rhythm = colors.length > 1 ? changes / (colors.length - 1) : 0;
  const colorRhythm = Math.round(30 * Math.min(1, rhythm * 1.6));
  if (rhythm < 0.4) comments.push('色彩缺少交替节奏，建议深浅/冷暖穿插排列');
  else comments.push('色彩节奏明快，相邻色系有呼应');

  // 疏密：元素数量相对橱窗面积的覆盖度（理想 0.12~0.3 件/㎡）
  const area = (profile.width * profile.depth) / 1e6;
  const density = items.length / Math.max(1, area);
  let densityScore = 30;
  if (density < 0.12) {
    densityScore = Math.round(30 * density / 0.12);
    comments.push(`排面过疏（${density.toFixed(2)} 件/㎡），留白过多显空`);
  } else if (density > 0.3) {
    densityScore = Math.round(30 * Math.max(0.3, 1 - (density - 0.3)));
    comments.push(`排面过密（${density.toFixed(2)} 件/㎡），顾客视线找不到落点`);
  } else {
    comments.push('道具疏密得当，主次层次清晰');
  }

  return {
    total: focus + colorRhythm + densityScore,
    focus, colorRhythm, density: densityScore, comments,
  };
}
