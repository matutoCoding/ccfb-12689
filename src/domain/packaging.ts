import type {
  ConfirmDoc, Material, PackagingLine, PackagingResult, PlacedItem, RuleIssue, Size3,
} from '../types';
import { foldedSize } from './geometryRules';

// 按道具尺寸/数量自动算包装体积、运输箱数、建议工时
export function calcPackaging(items: PlacedItem[], mats: Map<string, Material>): PackagingResult {
  const count = new Map<string, number>();
  for (const it of items) {
    if (it.kind !== 'material' && it.kind !== 'panel') continue;
    count.set(it.refId, (count.get(it.refId) ?? 0) + 1);
  }
  const lines: PackagingLine[] = [];
  let totalVolume = 0;
  let totalWeight = 0;
  let maxW = 0, maxH = 0, maxD = 0;
  for (const [id, n] of count) {
    const m = mats.get(id);
    if (!m) continue;
    const f = foldedSize(m);
    const unitVolume = f.w * f.h * f.d;
    const line: PackagingLine = {
      materialId: id, name: m.name, count: n, foldedSize: f,
      unitVolume, totalVolume: unitVolume * n, weight: m.weight * n,
    };
    lines.push(line);
    totalVolume += line.totalVolume;
    totalWeight += line.weight;
    maxW = Math.max(maxW, f.w); maxH = Math.max(maxH, f.h); maxD = Math.max(maxD, f.d);
  }
  // 标准运输箱 120×80×100,装箱效率系数 0.72
  const boxSpec: Size3 = { w: 120, h: 80, d: 100 };
  const boxVolume = boxSpec.w * boxSpec.h * boxSpec.d * 0.72;
  const boxCount = Math.max(1, Math.ceil(totalVolume / boxVolume));
  // 工时:每件 6 分钟 + 每箱 15 分钟 + KT 分块拼装每块 3 分钟
  const pieceCount = items.reduce((s, i) => s + (i.panelPieces?.length ?? 0), 0);
  const itemCount = items.length;
  const laborHours = Math.round((itemCount * 6 + boxCount * 15 + pieceCount * 3) / 60 * 10) / 10;
  return { lines, totalVolume, totalWeight, boxSpec, boxCount, laborHours };
}

// ---- 教学模式评分(规格 10)----
export interface TeachingScore {
  total: number;          // 0~100
  focus: number;          // 主推焦点位置
  color: number;          // 色彩节奏
  density: number;        // 道具疏密
  details: string[];
}

export function scoreTeaching(actual: PlacedItem[], target: PlacedItem[]): TeachingScore {
  const details: string[] = [];
  // 1. 焦点位置:主推款与目标主推的平面距离
  const aHero = actual.find((i) => i.isHero);
  const tHero = target.find((i) => i.isHero);
  let focus = 0;
  if (aHero && tHero) {
    const dist = Math.hypot(aHero.position.x - tHero.position.x, aHero.position.z - tHero.position.z);
    focus = Math.max(0, 100 - dist * 1.2);
    if (dist > 40) details.push(`主推款偏离目标位置 ${dist.toFixed(0)}cm,焦点应更靠近橱窗视觉中心`);
    else details.push(`主推款焦点位置准确(偏差 ${dist.toFixed(0)}cm)`);
  } else {
    details.push('未摆放或未标记主推款,焦点缺失');
  }

  // 2. 色彩节奏:与目标的色系序列做最长公共子序列比对
  const seqA = actual.filter((i) => i.hueTag).sort((a, b) => a.position.x - b.position.x).map((i) => i.hueTag!);
  const seqT = target.filter((i) => i.hueTag).sort((a, b) => a.position.x - b.position.x).map((i) => i.hueTag!);
  const lcs = lcsLength(seqA, seqT);
  const color = seqT.length ? Math.round((lcs / seqT.length) * 100) : 60;
  if (color < 70) details.push('色彩节奏与目标差异较大:检查同色系连续占位和对比色穿插顺序');
  else details.push('色彩节奏与目标基本一致');

  // 3. 疏密:最近邻平均间距对比
  const density = densityScore(actual, target);
  if (density < 70) details.push('道具疏密不匀:目标阵列的平均间距未还原,注意留白与组团关系');
  else details.push('道具疏密搭配合理');

  const total = Math.round(focus * 0.45 + color * 0.3 + density * 0.25);
  return { total, focus: Math.round(focus), color, density: Math.round(density), details };
}

function lcsLength(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function densityScore(actual: PlacedItem[], target: PlacedItem[]): number {
  const avg = (list: PlacedItem[]) => {
    if (list.length < 2) return 100;
    let sum = 0, n = 0;
    for (let i = 0; i < list.length; i++) {
      let best = Infinity;
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        best = Math.min(best, Math.hypot(list[i].position.x - list[j].position.x, list[i].position.z - list[j].position.z));
      }
      sum += best; n++;
    }
    return sum / n;
  };
  const a = avg(actual), t = avg(target);
  if (!t) return 80;
  return Math.max(0, 100 - Math.abs(a - t) * 1.5);
}

export function buildConfirmDoc(
  schemeName: string,
  brand: string,
  schemeId: string,
  shots: ConfirmDoc['shots'],
  packaging: PackagingResult,
  issues: RuleIssue[],
  signedBy: string,
  panelImage?: string,
): ConfirmDoc {
  return {
    id: `doc_${Date.now().toString(36)}`,
    schemeId, schemeName, brand, shots, panelImage, packaging, issues,
    signedBy, signedAt: Date.now(), archived: true,
  };
}
