// 轻量矩阵/向量/AABB/射线数学库（列主序 mat4，与 WebGL 一致）
export type Mat4 = Float32Array;
export type Vec3 = [number, number, number];

export const v3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function mat4Identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export function mat4Translation(x: number, y: number, z: number): Mat4 {
  const m = mat4Identity();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

export function mat4Scale(sx: number, sy: number, sz: number): Mat4 {
  const m = mat4Identity();
  m[0] = sx; m[5] = sy; m[10] = sz;
  return m;
}

export function mat4RotY(rad: number): Mat4 {
  const c = Math.cos(rad), s = Math.sin(rad);
  const m = mat4Identity();
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  return m;
}

export function mat4TRS(t: Vec3, rotY: number, s: Vec3): Mat4 {
  return mat4Multiply(
    mat4Translation(t[0], t[1], t[2]),
    mat4Multiply(mat4RotY(rotY), mat4Scale(s[0], s[1], s[2])),
  );
}

export function mat4Perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

export function mat4LookAt(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  const z = norm(sub(eye, center));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  const m = mat4Identity();
  m[0] = x[0]; m[4] = x[1]; m[8] = x[2];
  m[1] = y[0]; m[5] = y[1]; m[9] = y[2];
  m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
  m[12] = -dot(x, eye);
  m[13] = -dot(y, eye);
  m[14] = -dot(z, eye);
  return m;
}

export function mat4Invert(a: Mat4): Mat4 {
  // Gauss-Jordan 消元（列主序输入/输出），已对平移/旋转缩放/透视矩阵验证可往返单位阵
  const M: number[][] = Array.from({ length: 4 }, () => new Array(8).fill(0));
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) M[r][c] = a[c * 4 + r];
    M[r][r + 4] = 1;
  }
  for (let i = 0; i < 4; i++) {
    let piv = i;
    for (let k = i + 1; k < 4; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k;
    }
    if (Math.abs(M[piv][i]) < 1e-12) return mat4Identity();
    const tmp = M[i]; M[i] = M[piv]; M[piv] = tmp;
    const d = M[i][i];
    for (let j = 0; j < 8; j++) M[i][j] /= d;
    for (let k = 0; k < 4; k++) {
      if (k === i) continue;
      const f = M[k][i];
      for (let j = 0; j < 8; j++) M[k][j] -= f * M[i][j];
    }
  }
  const out = new Float32Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) out[c * 4 + r] = M[r][c + 4];
  }
  return out;
}

export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  return [
    (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w,
    (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w,
    (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w,
  ];
}

export function transformDir(m: Mat4, p: Vec3): Vec3 {
  return norm([
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2],
  ]);
}

/** 轴对齐包围盒 */
export interface AABB { min: Vec3; max: Vec3; }

export function aabbFromHalfExtents(center: Vec3, he: Vec3, rotY: number): AABB {
  const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
  const ex = he[0] * c + he[2] * s;
  const ez = he[0] * s + he[2] * c;
  return {
    min: [center[0] - ex, center[1] - he[1], center[2] - ez],
    max: [center[0] + ex, center[1] + he[1], center[2] + ez],
  };
}

export function aabbOverlap(a: AABB, b: AABB, eps = 1): boolean {
  return (
    a.min[0] < b.max[0] - eps && a.max[0] > b.min[0] + eps &&
    a.min[1] < b.max[1] - eps && a.max[1] > b.min[1] + eps &&
    a.min[2] < b.max[2] - eps && a.max[2] > b.min[2] + eps
  );
}

/** 射线（拾取） */
export interface Ray { origin: Vec3; dir: Vec3; }

export function rayFromCamera(viewProjInv: Mat4, ndcX: number, ndcY: number): Ray {
  const near = transformPoint(viewProjInv, [ndcX, ndcY, -1]);
  const far = transformPoint(viewProjInv, [ndcX, ndcY, 1]);
  return { origin: near, dir: norm(sub(far, near)) };
}

/** 射线 vs AABB（slab 法），返回 t 或 null */
export function rayAABB(ray: Ray, b: AABB): number | null {
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const inv = 1 / ray.dir[i];
    let t1 = (b.min[i] - ray.origin[i]) * inv;
    let t2 = (b.max[i] - ray.origin[i]) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmax < tmin) return null;
  }
  return tmax >= 0 ? Math.max(0, tmin) : null;
}

export const deg2rad = (d: number): number => (d * Math.PI) / 180;
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const uid = (prefix = 'id'): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
