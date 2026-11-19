import type { Vec3 } from '../types';
import type { CameraState } from './Renderer';
import { clamp, norm, sub, v3 } from '../lib/math';

// 轨道相机:球坐标环绕 target,支持行人视点(eye 固定看目标)
export class OrbitCamera {
  target: Vec3 = v3(0, 80, 0);
  yaw = Math.PI;        // 初始从正面(玻璃侧,+Z)看
  pitch = 0.32;
  radius = 420;
  fov = Math.PI / 4.2;
  minRadius = 60;
  maxRadius = 2000;
  pedestrian: { eye: Vec3; target: Vec3 } | null = null;

  rotate(dx: number, dy: number) {
    this.yaw -= dx * 0.005;
    this.pitch = clamp(this.pitch + dy * 0.005, -0.2, 1.45);
  }
  zoom(delta: number) {
    this.radius = clamp(this.radius * Math.exp(delta * 0.0012), this.minRadius, this.maxRadius);
  }
  pan(dx: number, dy: number) {
    const s = this.radius * 0.0016;
    const right = norm(v3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)));
    const fwd = norm(v3(Math.sin(this.yaw), 0, Math.cos(this.yaw)));
    this.target.x += (-right.x * dx + fwd.x * dy) * s;
    this.target.z += (-right.z * dx + fwd.z * dy) * s;
    this.target.y = clamp(this.target.y - dy * s * 0.4, 5, 400);
  }
  frame(w: number, d: number, h: number) {
    this.target = v3(0, h * 0.45, 0);
    this.radius = clamp(Math.max(w, d) * 1.9, this.minRadius, this.maxRadius);
    this.yaw = Math.PI;
    this.pitch = 0.3;
    this.pedestrian = null;
  }
  setPedestrian(eye: Vec3, target: Vec3) {
    this.pedestrian = { eye, target };
  }
  clearPedestrian() { this.pedestrian = null; }

  get eye(): Vec3 {
    if (this.pedestrian) return this.pedestrian.eye;
    const cp = Math.cos(this.pitch);
    return v3(
      this.target.x + this.radius * cp * Math.sin(this.yaw),
      this.target.y + this.radius * Math.sin(this.pitch),
      this.target.z + this.radius * cp * Math.cos(this.yaw),
    );
  }
  get lookTarget(): Vec3 {
    return this.pedestrian ? this.pedestrian.target : this.target;
  }
  state(): CameraState {
    return { eye: this.eye, target: this.lookTarget, fov: this.fov };
  }

  // 屏幕射线(供拾取):ndc ∈ [-1,1]
  ray(ndcX: number, ndcY: number, aspect: number): { origin: Vec3; dir: Vec3 } {
    const eye = this.eye;
    const f = norm(sub(this.lookTarget, eye));
    const r = norm({ x: f.z, y: 0, z: -f.x });
    const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
    const t = Math.tan(this.fov / 2);
    const dir = norm({
      x: f.x + r.x * ndcX * t * aspect + u.x * ndcY * t,
      y: f.y + r.y * ndcX * t * aspect + u.y * ndcY * t,
      z: f.z + r.z * ndcX * t * aspect + u.z * ndcY * t,
    });
    return { origin: eye, dir };
  }
}
