import type { Mat4 } from './math';
import { identity, multiply, compose, v3 } from './math';
import type { Size3, SurfaceType } from '../types';

export interface Geometry {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array | Uint32Array;
}

export interface SubMesh {
  geo: Geometry;
  model: Mat4;      // 相对模型原点(模型原点取底面中心)
  surface: SurfaceType;
}

export interface ModelDef {
  submeshes: SubMesh[];
  bounds: Size3;
}

function makeGeo(
  positions: number[],
  normals: number[],
  indices: number[],
): Geometry {
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: indices.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
  };
}

// 几何备忘:相同参数返回同一 Geometry 实例,使渲染器的 VAO 缓存真正命中,
// 避免每帧重新分配/上传 GPU 缓冲(连续调参越用越卡的根因防护)
const geoCache = new Map<string, Geometry>();
function memoized<T extends Geometry>(cacheKey: string, build: () => T): T {
  const hit = geoCache.get(cacheKey);
  if (hit) return hit as T;
  const g = build();
  geoCache.set(cacheKey, g);
  return g;
}

export function box(w: number, h: number, d: number): Geometry {
  return memoized(`box|${w}|${h}|${d}`, () => buildBox(w, h, d));
}
function buildBox(w: number, h: number, d: number): Geometry {
  const x = w / 2, y = h / 2, z = d / 2;
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const face = (pts: number[][], n: number[]) => {
    const base = pos.length / 3;
    for (const p of pts) { pos.push(...p); nor.push(...n); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  face([[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]], [0, 0, 1]);
  face([[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]], [0, 0, -1]);
  face([[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]], [1, 0, 0]);
  face([[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]], [-1, 0, 0]);
  face([[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]], [0, 1, 0]);
  face([[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]], [0, -1, 0]);
  return makeGeo(pos, nor, idx);
}

export function plane(w: number, h: number): Geometry {
  return memoized(`plane|${w}|${h}`, () => makeGeo(
    [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0],
    [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    [0, 1, 2, 0, 2, 3],
  ));
}

export function cylinder(rTop: number, rBottom: number, h: number, seg = 16): Geometry {
  return memoized(`cyl|${rTop}|${rBottom}|${h}|${seg}`, () => buildCylinder(rTop, rBottom, h, seg));
}
function buildCylinder(rTop: number, rBottom: number, h: number, seg = 16): Geometry {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const slope = (rBottom - rTop) / h;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const n = [c, slope, s];
    const nl = Math.hypot(...n) || 1;
    pos.push(c * rBottom, -h / 2, s * rBottom, c * rTop, h / 2, s * rTop);
    nor.push(n[0] / nl, n[1] / nl, n[2] / nl, n[0] / nl, n[1] / nl, n[2] / nl);
  }
  for (let i = 0; i < seg; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 3, b, b + 3, b + 2);
  }
  // 顶/底盖
  const topCenter = pos.length / 3;
  pos.push(0, h / 2, 0); nor.push(0, 1, 0);
  const topRing = pos.length / 3;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pos.push(Math.cos(a) * rTop, h / 2, Math.sin(a) * rTop);
    nor.push(0, 1, 0);
  }
  for (let i = 0; i < seg; i++) idx.push(topCenter, topRing + i, topRing + i + 1);
  const botCenter = pos.length / 3;
  pos.push(0, -h / 2, 0); nor.push(0, -1, 0);
  const botRing = pos.length / 3;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pos.push(Math.cos(a) * rBottom, -h / 2, Math.sin(a) * rBottom);
    nor.push(0, -1, 0);
  }
  for (let i = 0; i < seg; i++) idx.push(botCenter, botRing + i + 1, botRing + i);
  return makeGeo(pos, nor, idx);
}

// 车床体:points 为 [半径, y] 轮廓,绕 Y 轴
export function lathe(points: [number, number][], seg = 20): Geometry {
  const sig = points.map((p) => p.join(',')).join(';');
  return memoized(`lathe|${seg}|${sig}`, () => buildLathe(points, seg));
}
function buildLathe(points: [number, number][], seg = 20): Geometry {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const rows = points.length;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    for (let j = 0; j < rows; j++) {
      const [r, y] = points[j];
      pos.push(c * r, y, s * r);
      const p0 = points[Math.max(0, j - 1)], p1 = points[Math.min(rows - 1, j + 1)];
      const dr = p1[0] - p0[0], dy = p1[1] - p0[1];
      const nx = dy, ny = -dr;
      const nl = Math.hypot(nx, ny) || 1;
      nor.push((nx / nl) * c, ny / nl, (nx / nl) * s);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j, b = (i + 1) * rows + j;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  return makeGeo(pos, nor, idx);
}

// 沿 X 轴的圆柱(横杆用)
export function cylinderX(r: number, len: number, seg = 12): Geometry {
  const g = cylinder(r, r, len, seg);
  const m = mat();
  identity(m);
  // 旋转 90°:Z -> X
  m[0] = 0; m[2] = 1; m[8] = -1; m[10] = 0;
  return transform(g, m);
}

function mat(): Mat4 { return new Float32Array(16); }

export function transform(g: Geometry, m: Mat4): Geometry {
  const pos = new Float32Array(g.positions.length);
  const nor = new Float32Array(g.normals.length);
  for (let i = 0; i < g.positions.length; i += 3) {
    const x = g.positions[i], y = g.positions[i + 1], z = g.positions[i + 2];
    pos[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    pos[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    pos[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    const nx = g.normals[i], ny = g.normals[i + 1], nz = g.normals[i + 2];
    nor[i] = m[0] * nx + m[4] * ny + m[8] * nz;
    nor[i + 1] = m[1] * nx + m[5] * ny + m[9] * nz;
    nor[i + 2] = m[2] * nx + m[6] * ny + m[10] * nz;
  }
  return { positions: pos, normals: nor, indices: g.indices };
}

function sub(geo: Geometry, tx: number, ty: number, tz: number, surface: SurfaceType, ry = 0, sx = 1, sy = 1, sz = 1): SubMesh {
  const m = mat();
  compose(m, v3(tx, ty, tz), ry, 1);
  m[0] *= sx; m[5] *= sy; m[10] *= sz;
  return { geo, model: m, surface };
}

// ---------- 复合模型 ----------

// 全身模特:原点在脚底,身高约 180(单位 cm)
export function mannequinModel(pose: 'stand' | 'sit' = 'stand'): ModelDef {
  const H = 180;
  const torso = lathe([
    [9, 92], [14, 100], [17, 118], [20, 130], [19, 140], [14, 148], [7, 152],
  ], 18);
  const head = lathe([
    [0, 156], [6, 158], [9, 164], [10, 170], [8, 176], [0, 178],
  ], 18);
  const legL = cylinder(4.2, 3.4, pose === 'stand' ? 92 : 70, 12);
  const armL = cylinder(2.8, 2.2, 62, 10);
  const meshes: SubMesh[] = [
    sub(torso, 0, 0, 0, 'skin'),
    sub(head, 0, 0, 0, 'skin'),
    sub(legL, -8, pose === 'stand' ? 46 : 35, 0, 'skin'),
    sub(legL, 8, pose === 'stand' ? 46 : 35, 0, 'skin'),
    sub(armL, -21, 118, 0, 'skin', 0.08),
    sub(armL, 21, 118, 0, 'skin', -0.08),
  ];
  return { submeshes: meshes, bounds: { w: 46, h: H, d: 24 } };
}

// 挂装横杆:宽度 w,高默认 160
export function railModel(w: number): ModelDef {
  const h = 160;
  const meshes: SubMesh[] = [
    sub(cylinderX(1.6, w), 0, h - 8, 0, 'chrome'),
    sub(cylinder(1.8, 1.8, h - 8, 10), -w / 2 + 4, (h - 8) / 2, 0, 'chrome'),
    sub(cylinder(1.8, 1.8, h - 8, 10), w / 2 - 4, (h - 8) / 2, 0, 'chrome'),
    sub(box(14, 3, 14), -w / 2 + 4, 1.5, 0, 'chrome'),
    sub(box(14, 3, 14), w / 2 - 4, 1.5, 0, 'chrome'),
  ];
  return { submeshes: meshes, bounds: { w, h, d: 40 } };
}

// 叠装塔
export function towerModel(w: number, d: number, levels: number, levelH: number): ModelDef {
  const meshes: SubMesh[] = [sub(box(w + 4, 2, d + 4), 0, 1, 0, 'wood')];
  for (let i = 0; i < levels; i++) {
    const y = 2 + levelH / 2 + i * levelH;
    meshes.push(sub(box(w, levelH * 0.55, d), 0, y, 0, 'velvet'));
  }
  return { submeshes: meshes, bounds: { w: w + 4, h: 2 + levels * levelH, d: d + 4 } };
}

// 灯箱:外框 + 发光面
export function lightboxModel(w: number, h: number, d: number): ModelDef {
  const frame = box(w, h, d);
  const face = plane(w * 0.92, h * 0.92);
  const m = mat();
  compose(m, v3(0, 0, d / 2 + 0.2), 0, 1);
  return {
    submeshes: [
      sub(frame, 0, 0, 0, 'metal'),
      { geo: face, model: m, surface: 'lightbox' },
    ],
    bounds: { w, h, d },
  };
}

// 通用物料模型:按材质类别给不同的基础形体
export function genericModel(size: Size3, surface: SurfaceType, category: string): ModelDef {
  if (category === 'lightbox') return lightboxModel(size.w, size.h, size.d);
  if (surface === 'chrome' || category === 'metal') {
    // 镀铬小件用略圆角的组合:主体 + 底座
    return {
      submeshes: [
        sub(box(size.w, size.h, size.d), 0, 0, 0, 'chrome'),
        sub(box(size.w * 1.06, Math.max(1, size.h * 0.08), size.d * 1.06), 0, size.h * 0.04, 0, 'chrome'),
      ],
      bounds: size,
    };
  }
  if (surface === 'acrylic') {
    return {
      submeshes: [
        sub(box(size.w, size.h, size.d), 0, 0, 0, 'acrylic'),
        // 亚克力边缘高光条
        sub(box(size.w + 0.3, 0.6, 0.6), 0, size.h - 0.3, size.d / 2, 'acrylic'),
      ],
      bounds: size,
    };
  }
  return { submeshes: [sub(box(size.w, size.h, size.d), 0, 0, 0, surface)], bounds: size };
}

// 场景静态几何:橱窗房间
export interface RoomGeos {
  floor: Geometry;
  backWall: Geometry;
  sideWallL: Geometry;
  sideWallR: Geometry;
  ceiling: Geometry;
  platform: Geometry;
  glass: Geometry;
}

export function roomGeos(w: number, d: number, h: number, platformH: number): RoomGeos {
  const t = 8; // 墙厚
  return {
    floor: box(w, t, d),
    backWall: box(w + t * 2, h, t),
    sideWallL: box(t, h, d),
    sideWallR: box(t, h, d),
    ceiling: box(w, t, d),
    platform: box(w, platformH || 1, d),
    glass: plane(w, h),
  };
}

// 把 ModelDef 的子网格本地矩阵再叠加实例矩阵,得到最终矩阵
export function bakeModelMatrix(instance: Mat4, local: Mat4): Mat4 {
  const out = new Float32Array(16);
  return multiply(out, instance, local);
}
