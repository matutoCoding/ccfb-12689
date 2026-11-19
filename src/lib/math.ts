import type { Vec3, AABB, Size3 } from '../types';

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const deg = (r: number): number => (r * 180) / Math.PI;
export const rad = (d: number): number => (d * Math.PI) / 180;

// 4x4 列主序 Float32Array,适配 WebGL
export type Mat4 = Float32Array;

export const mat4 = (): Mat4 => new Float32Array(16);
export function identity(out: Mat4): Mat4 {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}
export function multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  return out;
}

export function perspective(out: Mat4, fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1.0 / Math.tan(fovy / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function lookAt(out: Mat4, eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  let z = norm(sub(eye, center));
  let x = norm(cross(up, z));
  const y = cross(z, x);
  if (len(x) === 0) { z = { x: 0, y: 0, z: 1 }; x = { x: 1, y: 0, z: 0 }; }
  out[0] = x.x; out[1] = y.x; out[2] = z.x; out[3] = 0;
  out[4] = x.y; out[5] = y.y; out[6] = z.y; out[7] = 0;
  out[8] = x.z; out[9] = y.z; out[10] = z.z; out[11] = 0;
  out[12] = -dot(x, eye);
  out[13] = -dot(y, eye);
  out[14] = -dot(z, eye);
  out[15] = 1;
  return out;
}

export function compose(out: Mat4, pos: Vec3, rotY: number, s: number): Mat4 {
  const c = Math.cos(rotY), sn = Math.sin(rotY);
  out[0] = c * s; out[1] = 0; out[2] = -sn * s; out[3] = 0;
  out[4] = 0; out[5] = s; out[6] = 0; out[7] = 0;
  out[8] = sn * s; out[9] = 0; out[10] = c * s; out[11] = 0;
  out[12] = pos.x; out[13] = pos.y; out[14] = pos.z; out[15] = 1;
  return out;
}

export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  const w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15] || 1;
  return {
    x: (m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12]) / w,
    y: (m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13]) / w,
    z: (m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14]) / w,
  };
}

// 由底中心位姿 + 包围盒尺寸求世界 AABB(考虑 Y 轴旋转)
export function itemAABB(pos: Vec3, size: Size3, rotY: number, s = 1): AABB {
  const hw = (size.w / 2) * s, hd = (size.d / 2) * s, h = size.h * s;
  const c = Math.abs(Math.cos(rotY)), sn = Math.abs(Math.sin(rotY));
  const ex = hw * c + hd * sn, ez = hw * sn + hd * c;
  return {
    min: { x: pos.x - ex, y: pos.y, z: pos.z - ez },
    max: { x: pos.x + ex, y: pos.y + h, z: pos.z + ez },
  };
}

export function aabbOverlap(a: AABB, b: AABB, pad = 0.5): boolean {
  return (
    a.min.x < b.max.x + pad && a.max.x > b.min.x - pad &&
    a.min.y < b.max.y - pad && a.max.y > b.min.y + pad &&
    a.min.z < b.max.z + pad && a.max.z > b.min.z - pad
  );
}

export function pointInAABB(p: Vec3, b: AABB): boolean {
  return p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;
}

// 射线与 AABB(slab 法),返回最近距离或 null
export function rayAABB(origin: Vec3, dir: Vec3, box: AABB): number | null {
  let tmin = -Infinity, tmax = Infinity;
  const o = [origin.x, origin.y, origin.z], d = [dir.x, dir.y, dir.z];
  const lo = [box.min.x, box.min.y, box.min.z], hi = [box.max.x, box.max.y, box.max.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return null;
    } else {
      let t1 = (lo[i] - o[i]) / d[i];
      let t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmax >= 0 ? Math.max(tmin, 0) : null;
}

export function uid(prefix = 'id'): ID {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
type ID = string;

// 确定性哈希(教学评分/分块编号等需要稳定结果时用)
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function nowTs(): number { return Date.now(); }
export const DAY_MS = 86400_000;
