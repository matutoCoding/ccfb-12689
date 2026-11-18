// 3D 视口组件：渲染循环 + 轨道相机 + 点选/拖拽 + 机位跳转 + 截图
import { Renderer, type DrawInstance } from '../engine/renderer';
import { clamp, deg2rad } from '../engine/math';
import type { Viewpoint } from '../types';
import { h } from './dom';

export interface ViewportCallbacks {
  onPick?: (itemId: string | null) => void;
  onDrag?: (itemId: string, x: number, z: number) => void;
  onDragEnd?: () => void;
  onFps?: (fps: number, ms: number, draws: number, instances: number) => void;
}

export class Viewport {
  readonly el: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly renderer: Renderer;
  private instances: DrawInstance[] = [];
  private pickMap = new Map<number, string>();
  private lines: number[] = [];
  private raf = 0;
  private lastFpsReport = 0;
  private mode: 'orbit' | 'drag' = 'orbit';
  private dragItemId: string | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private panButton = false;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);
  private dirty = true;
  private disposed = false;
  private cb: ViewportCallbacks;

  constructor(cb: ViewportCallbacks = {}) {
    this.cb = cb;
    this.canvas = h('canvas', { class: 'vp-canvas' }) as HTMLCanvasElement;
    this.el = h('div', { class: 'viewport' }, this.canvas);
    this.renderer = new Renderer(this.canvas);
    this.bindEvents();
    const loop = (): void => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this.renderer.resize(rect.width, rect.height, this.dpr);
        this.renderer.beginFrame(this.instances, this.lines);
        this.renderer.render();
        const now = performance.now();
        if (now - this.lastFpsReport > 500) {
          this.lastFpsReport = now;
          this.cb.onFps?.(this.renderer.fps, this.renderer.frameMs,
            this.renderer.drawCalls, this.renderer.instanceCount);
        }
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  setScene(instances: DrawInstance[], pickMap: Map<number, string>, lines: number[]): void {
    this.instances = instances;
    this.pickMap = pickMap;
    this.lines = lines;
    this.dirty = true;
  }

  setEnvFog(fog: number): void { this.renderer.setEnv({
    fog, signboard: true, ambient: 0.55,
  }); }

  jumpViewpoint(vp: Viewpoint, profileDepth: number): void {
    this.renderer.camera.jumpTo(
      [vp.x, vp.eyeHeight, profileDepth / 2 + vp.distance],
      [vp.target.x, vp.target.y, vp.target.z],
    );
  }

  presetCamera(view: 'front' | 'side' | 'top' | 'iso'): void {
    this.renderer.camera.preset(view);
  }

  screenshot(): string {
    return this.renderer.screenshot();
  }

  private bindEvents(): void {
    const c = this.canvas;
  c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.panButton = e.button === 2 || e.shiftKey;
      if (e.button === 0 && !e.shiftKey && this.pointers.size === 1) {
        const id = this.pickAt(e);
        if (id) {
          this.mode = 'drag';
          this.dragItemId = id;
          this.cb.onPick?.(id);
          return;
        }
        this.cb.onPick?.(null);
      }
      this.mode = 'orbit';
    });

    c.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pointers.size >= 2) {
        this.renderer.camera.orbit(dx * 0.5, dy * 0.5);
        return;
      }
      if (this.mode === 'drag' && this.dragItemId) {
        const pos = this.screenToFloor(e.clientX, e.clientY);
        if (pos) {
          // 10mm 网格吸附，跟手不跳变
          const gx = Math.round(pos.x / 10) * 10;
          const gz = Math.round(pos.z / 10) * 10;
          this.cb.onDrag?.(this.dragItemId, gx, gz);
        }
      } else if (this.panButton) {
        this.renderer.camera.pan(dx, dy);
      } else {
        this.renderer.camera.orbit(dx, dy);
      }
    });

    const end = (e: PointerEvent): void => {
      this.pointers.delete(e.pointerId);
      if (this.mode === 'drag' && this.dragItemId) {
        this.cb.onDragEnd?.();
      }
      this.dragItemId = null;
      this.mode = 'orbit';
      this.panButton = false;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.renderer.camera.zoom(e.deltaY);
    }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private pickAt(e: MouseEvent): string | null {
    const rect = this.canvas.getBoundingClientRect();
    const id = this.renderer.pick(e.clientX - rect.left, e.clientY - rect.top);
    return id ? this.pickMap.get(id) ?? null : null;
  }

  /** 屏幕坐标 → 地台平面（y = platformY）世界坐标 */
  screenToFloor(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const cam = this.renderer.camera;
    const vp = cam.projMatrix();
    const view = cam.viewMatrix();
    const inv = invert4(mult4(vp, view));
    const near = transformP(inv, [ndcX, ndcY, -1]);
    const far = transformP(inv, [ndcX, ndcY, 1]);
    const dir = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
    if (Math.abs(dir[1]) < 1e-6) return null;
    const t = (0 - near[1]) / dir[1];
    if (t < 0) return null;
    return { x: near[0] + dir[0] * t, z: near[2] + dir[2] * t };
  }

  /** 屏幕坐标 → 绕选中元素当前高度的水平移动（保持 y 不变） */
  screenToPlaneAtY(clientX: number, clientY: number, y: number): { x: number; z: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const cam = this.renderer.camera;
    const inv = invert4(mult4(cam.projMatrix(), cam.viewMatrix()));
    const near = transformP(inv, [ndcX, ndcY, -1]);
    const far = transformP(inv, [ndcX, ndcY, 1]);
    const dir = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
    if (Math.abs(dir[1]) < 1e-6) return null;
    const t = (y - near[1]) / dir[1];
    if (t < 0) return null;
    return {
      x: clamp(near[0] + dir[0] * t, -5000, 5000),
      z: clamp(near[2] + dir[2] * t, -5000, 5000),
    };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.el.remove();
  }
}

// 避免与引擎 math 的循环引用，内联小型矩阵运算
function mult4(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1]
      + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return out;
}
function invert4(a: Float32Array): Float32Array {
  const out = new Float32Array(16);
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return out;
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06) * det;
  return out;
}
function transformP(m: Float32Array, p: number[]): number[] {
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  return [
    (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w,
    (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w,
    (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w,
  ];
}

export { deg2rad };
