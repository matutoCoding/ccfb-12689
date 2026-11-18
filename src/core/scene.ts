// 场景构建：领域模型(LayoutItem/WindowProfile) → 渲染实例(DrawInstance)
import type { DrawInstance } from '../engine/renderer';
import { deg2rad } from '../engine/math';
import type {
  LayoutItem, MannequinSeries, Prop, Viewpoint, WindowProfile,
} from '../types';

let pickSeq = 1;
export function resetPickIds(): void { pickSeq = 1; }
const nextPick = (): number => pickSeq++;

function matKindOf(prop: Prop): 0 | 1 | 2 | 3 | 4 | 5 {
  switch (prop.category) {
    case 'acrylic': return 1;
    case 'chrome': return 2;
    case 'lightbox': return 3;
    default: return 0;
  }
}

function textureKindOf(prop: Prop): 'white' | 'wood' | 'kt' | 'velvet' | 'fabric' {
  if (prop.material.texture?.woodGrain) return 'wood';
  if (prop.category === 'kt') return 'kt';
  if (prop.material.texture?.velvet) return 'velvet';
  if (prop.material.texture?.fabric) return 'fabric';
  return 'white';
}

const hexToRgb01 = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
};

export interface SceneBuildResult {
  instances: DrawInstance[];
  /** pickId → itemId */
  pickMap: Map<number, string>;
  /** 元素包围盒中心（视线遮挡计算用） */
  itemCenters: Map<string, { x: number; y: number; z: number; h: number }>;
}

export function buildScene(opts: {
  profile: WindowProfile;
  items: LayoutItem[];
  propOf: (id: string) => Prop | undefined;
  seriesOf: (id: string) => MannequinSeries | undefined;
  selectedId?: string;
  lightboxPowerOn: boolean;
}): SceneBuildResult {
  const { profile, items, propOf, seriesOf, selectedId, lightboxPowerOn } = opts;
  resetPickIds();
  const instances: DrawInstance[] = [];
  const pickMap = new Map<number, string>();
  const itemCenters = new Map<string, { x: number; y: number; z: number; h: number }>();
  const p = profile;
  const plat = p.platformHeight;

  const add = (d: DrawInstance, itemId?: string): void => {
    if (itemId) pickMap.set(d.pickId, itemId);
    instances.push(d);
  };

  // ---------- 橱窗壳体 ----------
  // 地台
  add({
    meshName: 'box', position: [0, plat / 2, 0], rotationY: 0,
    scale: [p.width, plat, p.depth], color: [0.62, 0.58, 0.53], alpha: 1,
    roughness: 0.7, matKind: 0, param: 0, emissive: [0, 0, 0],
    textureKind: 'white', pickId: 0, transparent: false,
  });
  // 地面（通道）
  add({
    meshName: 'plane', position: [0, -2, p.depth / 2 + p.walkwayWidth / 2 + 200], rotationY: 0,
    scale: [p.width + 6000, 1, p.walkwayWidth + 4000], color: [0.45, 0.44, 0.42], alpha: 1,
    roughness: 0.9, matKind: 0, param: 0, emissive: [0, 0, 0],
    textureKind: 'white', pickId: 0, transparent: false,
  });
  // 背板
  const backZ = -p.depth / 2 + 10;
  add({
    meshName: 'wall', position: [0, plat + p.height / 2, backZ], rotationY: 0,
    scale: [p.width, p.height, 20], color: [0.86, 0.84, 0.8], alpha: 1,
    roughness: 0.85, matKind: 0, param: 0, emissive: [0, 0, 0],
    textureKind: 'white', pickId: 0, transparent: false,
  });
  // 左右侧板
  for (const sx of [-1, 1]) {
    add({
      meshName: 'wall',
      position: [sx * (p.width / 2 - 10), plat + p.height / 2, 0],
      rotationY: sx * Math.PI / 2,
      scale: [p.depth, p.height, 20], color: [0.8, 0.78, 0.74], alpha: 1,
      roughness: 0.85, matKind: 0, param: 0, emissive: [0, 0, 0],
      textureKind: 'white', pickId: 0, transparent: false,
    });
  }
  // 顶板
  add({
    meshName: 'box', position: [0, plat + p.height + 30, 0], rotationY: 0,
    scale: [p.width, 60, p.depth], color: [0.75, 0.73, 0.7], alpha: 1,
    roughness: 0.8, matKind: 0, param: 0, emissive: [0, 0, 0],
    textureKind: 'white', pickId: 0, transparent: false,
  });
  // 玻璃（橱窗正面）
  add({
    meshName: 'wall', position: [0, plat + p.height / 2, p.depth / 2 + 5], rotationY: 0,
    scale: [p.width, p.height, 8], color: [0.75, 0.85, 0.9], alpha: 0.12,
    roughness: 0.05, matKind: 4, param: 0, emissive: [0, 0, 0],
    textureKind: 'white', pickId: 0, transparent: true, isGlass: true,
  });
  // 门洞示意（侧板上的深色框，仅当门洞小于橱窗时）
  if (p.door.w < p.width) {
    add({
      meshName: 'box',
      position: [-p.width / 2 + 40, plat + p.door.h / 2, p.depth / 2 - 400],
      rotationY: 0,
      scale: [30, p.door.h, 800], color: [0.2, 0.22, 0.25], alpha: 0.5,
      roughness: 0.6, matKind: 5, param: 0, emissive: [0, 0, 0],
      textureKind: 'white', pickId: 0, transparent: true,
    });
  }

  // ---------- 背板槽位横线 ----------
  for (const sh of p.slotHeights) {
    add({
      meshName: 'box', position: [0, plat + sh, backZ + 25], rotationY: 0,
      scale: [p.width - 80, 12, 12], color: [0.35, 0.35, 0.38], alpha: 1,
      roughness: 0.4, matKind: 2, param: 0, emissive: [0, 0, 0],
      textureKind: 'white', pickId: 0, transparent: false,
    });
  }

  // ---------- 陈列元素 ----------
  for (const item of items) {
    const selected = item.id === selectedId;
    const baseY = plat + (item.slotY ?? 0);
    const rot = deg2rad(item.rotation) * (item.flipped ? -1 : 1);

    if (item.type === 'prop') {
      const prop = propOf(item.refId);
      if (!prop) continue;
      const kind = matKindOf(prop);
      const isTransparent = kind === 1 || (prop.material.opacity ?? 1) < 1;
      const power = kind === 3 ? (lightboxPowerOn ? 1 : 0) : 0;
      const pickId = nextPick();
      const d: DrawInstance = {
        meshName: 'box',
        position: [item.x, baseY + prop.size.h / 2, item.z],
        rotationY: rot,
        scale: [prop.size.w, prop.size.h, prop.size.d],
        color: [...prop.material.color],
        alpha: prop.material.opacity ?? 1,
        roughness: prop.material.roughness,
        matKind: kind,
        param: kind === 1 ? (1 - (prop.material.opacity ?? 1)) : kind === 3 ? power : (prop.material.texture?.velvet ? 0.8 : 0),
        emissive: kind === 3
          ? (lightboxPowerOn ? prop.material.lightbox?.onColor ?? [0.6, 0.5, 0.4] : [0.2, 0.2, 0.2])
          : [0, 0, 0],
        textureKind: textureKindOf(prop),
        pickId,
        transparent: isTransparent,
      };
      add(d, item.id);
      itemCenters.set(item.id, { x: item.x, y: baseY + prop.size.h / 2, z: item.z, h: prop.size.h });
      if (selected) addSelectionBox(prop.size, [item.x, baseY + prop.size.h / 2, item.z], rot, add);
    }

    if (item.type === 'mannequin') {
      const series = seriesOf(item.refId);
      const color: [number, number, number] = series ? hexToRgb01(series.color) : [0.9, 0.88, 0.85];
      const spacing = series?.spacing ?? 900;
      const count = series?.count ?? 1;
      for (let k = 0; k < count; k++) {
        const mx = item.x + (k - (count - 1) / 2) * spacing;
        const pickId = nextPick();
        const height = 1750;
        add({
          meshName: 'mannequin',
          position: [mx, baseY, item.z],
          rotationY: rot + deg2rad(item.mannequins?.facing ?? 0),
          scale: [420, height, 260],
          color, alpha: 1, roughness: 0.55, matKind: 0, param: 0,
          emissive: [0, 0, 0], textureKind: 'fabric', pickId, transparent: false,
        }, item.id);
        itemCenters.set(item.id, { x: item.x, y: baseY + height * 0.7, z: item.z, h: height });
      }
      if (selected) {
        const totalW = count * spacing;
        addSelectionBox({ w: totalW, h: 1750, d: 300 },
          [item.x, baseY + 875, item.z], rot, add);
      }
    }

    if (item.type === 'rail') {
      const s = item.rail!;
      const railW = 1800, railH = 1600, railD = 450;
      const pickId = nextPick();
      add({
        meshName: 'rail',
        position: [item.x, baseY, item.z], rotationY: rot,
        scale: [railW, railH, railD], color: [0.72, 0.72, 0.75], alpha: 1,
        roughness: 0.18, matKind: 2, param: 0, emissive: [0, 0, 0],
        textureKind: 'white', pickId, transparent: false,
      }, item.id);
      // 挂装衣物（按件间距排满）
      const cap = Math.max(1, Math.floor((railW - 100) / s.spacing) + 1);
      const n = Math.min(s.garmentCount, cap);
      const garmentColor = hexToRgb01(s.garmentColor || '#8a6f52');
      for (let k = 0; k < n; k++) {
        const gx = item.x - (n - 1) * s.spacing / 2 + k * s.spacing;
        add({
          meshName: 'box',
          position: [gx, baseY + railH * 0.62, item.z + 30],
          rotationY: rot,
          scale: [s.spacing * 0.7, 700, 120],
          color: garmentColor, alpha: 1, roughness: 0.8, matKind: 0, param: 0,
          emissive: [0, 0, 0], textureKind: 'fabric', pickId: 0, transparent: false,
        });
      }
      itemCenters.set(item.id, { x: item.x, y: baseY + railH * 0.7, z: item.z, h: railH });
      if (selected) addSelectionBox({ w: railW, h: railH, d: railD },
        [item.x, baseY + railH / 2, item.z], rot, add);
    }

    if (item.type === 'foldTower') {
      const t = item.tower!;
      const meshName = 'tower' + (t.layers <= 3 ? 3 : t.layers <= 5 ? 5 : 8);
      const tw = 900, th = 400 + t.layers * t.layerHeight, td = 700;
      const pickId = nextPick();
      add({
        meshName,
        position: [item.x, baseY, item.z], rotationY: rot,
        scale: [tw, th, td], color: [0.55, 0.45, 0.38], alpha: 1,
        roughness: 0.75, matKind: 0, param: 0, emissive: [0, 0, 0],
        textureKind: 'velvet', pickId, transparent: false,
      }, item.id);
      itemCenters.set(item.id, { x: item.x, y: baseY + th / 2, z: item.z, h: th });
      if (selected) addSelectionBox({ w: tw, h: th, d: td },
        [item.x, baseY + th / 2, item.z], rot, add);
    }
  }

  return { instances, pickMap, itemCenters };
}

/** 选中描边：8 个角的发光小方块 + matKind 5 纯色 */
function addSelectionBox(
  size: { w: number; h: number; d: number },
  center: [number, number, number],
  rot: number,
  add: (d: DrawInstance) => void,
): void {
  const g = 60;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const lx = sx * size.w / 2, ly = sy * size.h / 2, lz = sz * size.d / 2;
    const c = Math.cos(rot), s = Math.sin(rot);
    add({
      meshName: 'box',
      position: [
        center[0] + lx * c + lz * s,
        center[1] + ly,
        center[2] - lx * s + lz * c,
      ],
      rotationY: 0,
      scale: [g, g, g],
      color: [0.2, 0.85, 1], alpha: 1, roughness: 0.2, matKind: 5, param: 0,
      emissive: [0, 0, 0], textureKind: 'white', pickId: 0, transparent: false,
    });
  }
}

/**
 * 视线遮挡线：行人视点 → 主推款中心，若中途与其他元素 AABB 相交，输出红线线段
 * 用线段列表表达（每段 6 个 float）
 */
export function buildOcclusionLines(
  viewpoints: Viewpoint[],
  activeView: Viewpoint | undefined,
  items: LayoutItem[],
  centers: Map<string, { x: number; y: number; z: number; h: number }>,
  profile: WindowProfile,
  sizeOf: (it: LayoutItem) => { w: number; h: number; d: number },
): number[] {
  if (!activeView) return [];
  const lines: number[] = [];
  const eye: [number, number, number] = [
    activeView.x,
    activeView.eyeHeight,
    profile.depth / 2 + activeView.distance,
  ];
  const mains = items.filter((i) => i.flags.includes('main'));
  for (const main of mains) {
    const c = centers.get(main.id);
    if (!c) continue;
    const target: [number, number, number] = [c.x, c.y, c.z];
    // 与非主推元素做粗略线段-包围盒相交测试
    let blocked = false;
    for (const other of items) {
      if (other.id === main.id || other.flags.includes('main')) continue;
      const oc = centers.get(other.id);
      const s = sizeOf(other);
      if (!oc) continue;
      if (segmentHitsBox(eye, target, [oc.x, oc.y, oc.z], [s.w / 2, s.h / 2, s.d / 2])) {
        blocked = true;
        break;
      }
    }
    // 整条视线画出；被挡时用更亮红（统一红，前端可区分）
    lines.push(eye[0], eye[1], eye[2], target[0], target[1], target[2]);
    if (blocked) {
      // 在主推中心补一个小十字提示
      const k = 80;
      lines.push(target[0] - k, target[1], target[2], target[0] + k, target[1], target[2]);
      lines.push(target[0], target[1] - k, target[2], target[0], target[1] + k, target[2]);
    }
  }
  return lines;
}

function segmentHitsBox(
  a: number[], b: number[], c: number[], he: number[],
): boolean {
  //  slabs 法，参数 t ∈ [0,1]
  let tmin = 0, tmax = 1;
  for (let i = 0; i < 3; i++) {
    const d = b[i] - a[i];
    if (Math.abs(d) < 1e-6) {
      if (a[i] < c[i] - he[i] || a[i] > c[i] + he[i]) return false;
    } else {
      let t1 = (c[i] - he[i] - a[i]) / d;
      let t2 = (c[i] + he[i] - a[i]) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return tmax > 0.02 && tmin < 0.98;
}
