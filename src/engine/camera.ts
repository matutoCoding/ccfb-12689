import { clamp, deg2rad, mat4LookAt, mat4Perspective, type Mat4, type Vec3 } from './math';

/** 轨道相机：绕目标点旋转/缩放/平移，支持机位书签 */
export class OrbitCamera {
  target: Vec3 = [0, 900, 0];
  distance = 6000;
  azimuth = Math.PI * 0.25;   // 绕 Y
  elevation = Math.PI * 0.18; // 仰角
  fov = 50;
  near = 30;
  far = 60000;
  aspect = 1;

  get position(): Vec3 {
    const ce = Math.cos(this.elevation);
    return [
      this.target[0] + this.distance * ce * Math.sin(this.azimuth),
      this.target[1] + this.distance * Math.sin(this.elevation),
      this.target[2] + this.distance * ce * Math.cos(this.azimuth),
    ];
  }

  viewMatrix(): Mat4 {
    return mat4LookAt(this.position, this.target, [0, 1, 0]);
  }

  projMatrix(): Mat4 {
    return mat4Perspective(deg2rad(this.fov), this.aspect, this.near, this.far);
  }

  orbit(dx: number, dy: number): void {
    this.azimuth -= dx * 0.006;
    this.elevation = clamp(this.elevation + dy * 0.006, -0.25, Math.PI * 0.49);
  }

  pan(dx: number, dy: number): void {
    const eye = this.position;
    const fwd = [this.target[0] - eye[0], 0, this.target[2] - eye[2]];
    const fl = Math.hypot(fwd[0], fwd[2]) || 1;
    const right: Vec3 = [-fwd[2] / fl, 0, fwd[0] / fl];
    const k = this.distance * 0.0012;
    this.target = [
      this.target[0] - right[0] * dx * k,
      clamp(this.target[1] + dy * k, 0, 5000),
      this.target[2] - right[2] * dx * k,
    ];
  }

  zoom(delta: number): void {
    this.distance = clamp(this.distance * Math.exp(delta * 0.0012), 800, 30000);
  }

  /** 跳转到视点书签（行人眼高视角） */
  jumpTo(eye: Vec3, target: Vec3): void {
    this.target = [...target];
    const d: Vec3 = [eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]];
    this.distance = Math.hypot(d[0], d[1], d[2]);
    this.elevation = Math.asin(clamp(d[1] / this.distance, -1, 1));
    this.azimuth = Math.atan2(d[0], d[2]);
  }

  /** 标准三视图（确认书截图用） */
  preset(view: 'front' | 'side' | 'top' | 'iso'): void {
    this.target = [0, 1000, 0];
    this.elevation = view === 'top' ? Math.PI * 0.49 : view === 'iso' ? Math.PI * 0.18 : 0.05;
    this.azimuth = view === 'front' ? 0 : view === 'side' ? Math.PI / 2 : view === 'top' ? 0 : Math.PI * 0.25;
    this.distance = view === 'top' ? 7000 : 6000;
  }
}
