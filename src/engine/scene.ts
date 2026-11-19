import type {
  AABB, EnvSettings, ID, Material, PlacedItem, StoreWindow, Vec3, Viewpoint, RGB,
} from '../types';
import type { DrawCall, LineCall, BlobCall } from './Renderer';
import { roomGeos, bakeModelMatrix, box as boxGeo, plane } from '../lib/geometry';
import { itemAABB, rayAABB, compose, mat4, perspective, lookAt, multiply, transformPoint, v3, clamp } from '../lib/math';
import { itemSize, modelForItem, pieceColor } from './ModelRegistry';
import type { OrbitCamera } from './OrbitCamera';

export interface ItemBox { itemId: ID; aabb: AABB; }
export interface SceneData {
  calls: DrawCall[];
  lines: LineCall[];
  blobs: BlobCall[];
  boxes: ItemBox[];
}

export interface BuildContext {
  window: StoreWindow;
  items: PlacedItem[];
  materials: Map<ID, Material>;
  env: EnvSettings;
  selected: Set<ID>;
  flags: Map<ID, 'error' | 'warn'>;
  activeViewpoint?: Viewpoint | null;
  heroIds?: Set<ID>;
  showPanelLines?: boolean;
}

const RED: RGB = [0.95, 0.25, 0.2];
const GREEN: RGB = [0.3, 0.85, 0.45];
const BLUE: RGB = [0.35, 0.6, 1];

function rgb(c: RGB, tint?: 'error' | 'warn'): [number, number, number] {
  if (tint === 'error') return RED;
  if (tint === 'warn') return [0.95, 0.7, 0.25];
  return [c[0], c[1], c[2]];
}

function aabbCorners(b: AABB): Vec3[] {
  const { min, max } = b;
  return [
    v3(min.x, min.y, min.z), v3(max.x, min.y, min.z),
    v3(max.x, min.y, max.z), v3(min.x, min.y, max.z),
    v3(min.x, max.y, min.z), v3(max.x, max.y, min.z),
    v3(max.x, max.y, max.z), v3(min.x, max.y, max.z),
  ];
}

function boxLines(b: AABB, color: RGB, alpha = 1): LineCall {
  const c = aabbCorners(b);
  const points: Vec3[] = [];
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (const [a, z] of edges) points.push(c[a], c[z]);
  return { points, color, alpha, dashed: true };
}

export function buildScene(ctx: BuildContext): SceneData {
  const calls: DrawCall[] = [];
  const lines: LineCall[] = [];
  const blobs: BlobCall[] = [];
  const boxes: ItemBox[] = [];
  const w = ctx.window;
  const halfW = w.width / 2, halfD = w.depth / 2;
  const ph = w.platformHeight;

  // ---- 房间 ----
  const room = roomGeos(w.width, w.depth, w.height, ph);
  const floorM = compose(mat4(), v3(0, ph - 4, 0), 0, 1);
  calls.push({ geo: room.floor, model: floorM, surface: 'matte', color: [0.32, 0.3, 0.28] });
  calls.push({ geo: room.platform, model: compose(mat4(), v3(0, ph / 2, 0), 0, 1), surface: 'wood', color: [0.45, 0.36, 0.27], color2: [0.3, 0.22, 0.15] });
  calls.push({ geo: room.backWall, model: compose(mat4(), v3(0, ph + w.height / 2, -halfD - 4), 0, 1), surface: 'matte', color: [0.78, 0.77, 0.74] });
  calls.push({ geo: room.sideWallL, model: compose(mat4(), v3(-halfW - 4, ph + w.height / 2, 0), 0, 1), surface: 'matte', color: [0.72, 0.71, 0.68] });
  calls.push({ geo: room.sideWallR, model: compose(mat4(), v3(halfW + 4, ph + w.height / 2, 0), 0, 1), surface: 'matte', color: [0.72, 0.71, 0.68] });
  calls.push({ geo: room.ceiling, model: compose(mat4(), v3(0, ph + w.height + 4, 0), 0, 1), surface: 'matte', color: [0.85, 0.84, 0.82] });

  // 玻璃前窗(雾化/沾灰)
  calls.push({
    geo: room.glass,
    model: compose(mat4(), v3(0, ph + w.height / 2, halfD + 0.5), 0, 1),
    surface: 'glass', color: [0.8, 0.85, 0.9], transparent: true,
  });

  // 店外:对铺灯箱招牌(可开关的反光干扰源)
  if (ctx.env.oppositeReflection) {
    const signZ = halfD + clamp(ctx.env.oppositeDistance, 80, 1200);
    calls.push({
      geo: boxGeo(w.width * 0.7, 120, 8),
      model: compose(mat4(), v3(0, ph + 160, signZ), 0, 1),
      surface: 'lightbox', color: [0.95, 0.2, 0.35], lightboxOn: true,
    });
    // 玻璃上的反光斑块:半透明亮片
    calls.push({
      geo: plane(w.width * 0.5, 60),
      model: compose(mat4(), v3(w.width * 0.12, ph + w.height * 0.62, halfD + 0.8), 0, 1),
      surface: 'glass', color: [1, 0.5, 0.55], transparent: true,
    });
  }
  // 通道地面提示(店外)
  calls.push({
    geo: boxGeo(Math.max(w.width, 120), 1, 220),
    model: compose(mat4(), v3(0, -0.5, halfD + 120), 0, 1),
    surface: 'matte', color: [0.22, 0.23, 0.25],
  });

  // ---- 道具实例 ----
  for (const item of ctx.items) {
    const mat = ctx.materials.get(item.refId);
    const model = modelForItem(item, mat);
    const inst = compose(mat4(), item.position, item.rotationY, item.scale * (item.flipY ? -1 : 1));
    const flag = ctx.flags.get(item.id);
    const baseColor: RGB = item.color ?? mat?.color ?? [0.6, 0.6, 0.62];
    const baseColor2: RGB = mat?.color2 ?? baseColor;
    for (const sm of model.submeshes) {
      calls.push({
        geo: sm.geo,
        model: bakeModelMatrix(inst, sm.model),
        surface: sm.surface,
        color: rgb(baseColor, flag),
        color2: rgb(baseColor2, flag),
        transparent: sm.surface === 'acrylic' || sm.surface === 'glass',
        lightboxOn: ctx.env.lightboxPower,
      });
    }
    const size = item.kind === 'material' && mat ? mat.size : itemSize(item);
    const aabb = itemAABB(item.position, size, item.rotationY, item.scale);
    boxes.push({ itemId: item.id, aabb });
    blobs.push({ center: v3(item.position.x, ph + 0.2, item.position.z), rx: Math.max(size.w, 30) * 0.55, rz: Math.max(size.d, 30) * 0.55 });

    // KT 背板分块:分块缝 + 编号色块
    if (item.panelPieces?.length && ctx.showPanelLines) {
      for (const p of item.panelPieces) {
        const pc = pieceColor(p.code);
        calls.push({
          geo: boxGeo(p.w - 1.2, p.h - 1.2, 1.2),
          model: compose(mat4(), v3(item.position.x - itemSize(item).w / 2 + p.x + p.w / 2,
            item.position.y + p.y + p.h / 2, item.position.z + 2), 0, 1),
          surface: 'matte', color: pc,
        });
      }
    }

    if (ctx.selected.has(item.id)) {
      lines.push(boxLines(aabb, GREEN, 0.95));
    } else if (flag) {
      lines.push(boxLines(aabb, flag === 'error' ? RED : [0.95, 0.7, 0.25], 0.8));
    }
    if (item.isHero) {
      lines.push(boxLines(aabb, BLUE, 0.55));
    }
  }

  // ---- 行人视点:机位标记 + 视线遮挡分析 ----
  if (ctx.activeViewpoint) {
    const vp = ctx.activeViewpoint;
    lines.push({
      points: [v3(vp.position.x, ph + 2, vp.position.z), v3(vp.position.x, ph + vp.eyeHeight, vp.position.z)],
      color: [1, 0.85, 0.3], alpha: 1,
    });
    const eye = v3(vp.position.x, ph + vp.eyeHeight, vp.position.z);
    const heroes = ctx.items.filter((i) => i.isHero || ctx.heroIds?.has(i.id));
    const targets = heroes.length ? heroes : ctx.items;
    for (const h of targets) {
      const size = ctx.materials.get(h.refId)?.size ?? itemSize(h);
      const hb = itemAABB(h.position, size, h.rotationY, h.scale);
      const center = v3(hb.min.x + (hb.max.x - hb.min.x) / 2, hb.min.y + (hb.max.y - hb.min.y) * 0.6, hb.min.z + (hb.max.z - hb.min.z) / 2);
      const dir = { x: center.x - eye.x, y: center.y - eye.y, z: center.z - eye.z };
      const tl = Math.hypot(dir.x, dir.y, dir.z);
      const nd = { x: dir.x / tl, y: dir.y / tl, z: dir.z / tl };
      let blocked: { by: ID; t: number } | null = null;
      for (const ob of boxes) {
        if (ob.itemId === h.id) continue;
        const t = rayAABB(eye, nd, ob.aabb);
        if (t !== null && t < tl - 2) { blocked = { by: ob.itemId, t }; break; }
      }
      if (blocked) {
        const hit = v3(eye.x + nd.x * blocked.t, eye.y + nd.y * blocked.t, eye.z + nd.z * blocked.t);
        lines.push({ points: [eye, hit], color: RED, alpha: 1, dashed: true });
        lines.push({ points: [hit, center], color: [0.6, 0.6, 0.6], alpha: 0.5, dashed: true });
      } else {
        lines.push({ points: [eye, center], color: GREEN, alpha: 0.9, dashed: true });
      }
    }
  }

  return { calls, lines, blobs, boxes };
}

// 世界坐标 -> 屏幕像素(给 HTML 标签层用)
export function projectWorld(world: Vec3, cam: OrbitCamera, width: number, height: number): { x: number; y: number; behind: boolean } {
  const st = cam.state();
  const proj = perspective(mat4(), st.fov, width / height, 1, 8000);
  const view = lookAt(mat4(), st.eye, st.target, v3(0, 1, 0));
  const vp = multiply(mat4(), proj, view);
  const c = transformPoint(vp, world);
  return {
    x: (c.x * 0.5 + 0.5) * width,
    y: (-c.y * 0.5 + 0.5) * height,
    behind: c.z > 1,
  };
}
