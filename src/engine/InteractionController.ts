import type { PlacedItem, Vec3, ID } from '../types';
import type { OrbitCamera } from './OrbitCamera';
import type { ItemBox } from './scene';
import { rayAABB, v3, clamp, rad } from '../lib/math';

export type DragMode = 'move' | 'rotate' | 'height';

export interface DragState {
  mode: DragMode;
  ids: ID[];
  startPointer: { x: number; y: number };
  startPositions: Map<ID, Vec3>;
  startRotations: Map<ID, number>;
}

export interface InteractionCallbacks {
  getBoxes: () => ItemBox[];
  getItems: () => PlacedItem[];
  getWindowBounds: () => { halfW: number; halfD: number; floorY: number; height: number };
  onPick: (id: ID | null, additive: boolean) => void;
  onDragStart: (ids: ID[], mode: DragMode) => void;
  onDragMove: (id: ID, pos: Vec3, rotY: number) => void;
  onDragEnd: () => void;
  onCameraChange: () => void;
  isLocked: (id: ID) => boolean;
  getSelectedIds: () => ID[];
}

export class InteractionController {
  private canvas: HTMLCanvasElement;
  private cam: OrbitCamera;
  private cb: InteractionCallbacks;
  private mode: DragMode = 'move';
  private drag: DragState | null = null;
  private orbiting = false;
  private last = { x: 0, y: 0 };
  private downPos = { x: 0, y: 0 };
  private moved = 0;

  constructor(canvas: HTMLCanvasElement, cam: OrbitCamera, cb: InteractionCallbacks) {
    this.canvas = canvas;
    this.cam = cam;
    this.cb = cb;
    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onCtx);
  }

  setMode(m: DragMode) { this.mode = m; }
  getMode(): DragMode { return this.mode; }

  private onCtx = (e: Event) => e.preventDefault();

  private ndc(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * 2 - 1,
      y: -((e.clientY - r.top) / r.height) * 2 + 1,
      aspect: r.width / r.height,
    };
  }

  private pick(e: PointerEvent): ID | null {
    const { x, y, aspect } = this.ndc(e);
    const { origin, dir } = this.cam.ray(x, y, aspect);
    let best: { id: ID; t: number } | null = null;
    for (const b of this.cb.getBoxes()) {
      const t = rayAABB(origin, dir, b.aabb);
      if (t !== null && (!best || t < best.t)) best = { id: b.itemId, t };
    }
    return best?.id ?? null;
  }

  // 射线与水平平面 y=const 的交点
  private groundHit(e: PointerEvent, y: number): Vec3 | null {
    const { x, y: ny, aspect } = this.ndc(e);
    const { origin, dir } = this.cam.ray(x, ny, aspect);
    if (Math.abs(dir.y) < 1e-6) return null;
    const t = (y - origin.y) / dir.y;
    if (t < 0) return null;
    return v3(origin.x + dir.x * t, y, origin.z + dir.z * t);
  }

  private onDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.last = { x: e.clientX, y: e.clientY };
    this.downPos = { x: e.clientX, y: e.clientY };
    this.moved = 0;
    if (e.button === 2 || e.button === 1) {
      this.orbiting = true;
      return;
    }
    const id = this.pick(e);
    if (!id) {
      this.cb.onPick(null, false);
      this.orbiting = true; // 空白处左键 = 转视角
      return;
    }
    if (this.cb.isLocked(id)) {
      this.cb.onPick(id, e.shiftKey);
      this.orbiting = true;
      return;
    }
    this.cb.onPick(id, e.shiftKey);
    const items = this.cb.getItems();
    // 多选:由上层维护选中集
    const ids = this.cb.getSelectedIds();
    this.drag = {
      mode: this.mode,
      ids: ids.length ? ids : [id],
      startPointer: { x: e.clientX, y: e.clientY },
      startPositions: new Map(items.map((i) => [i.id, { ...i.position }])),
      startRotations: new Map(items.map((i) => [i.id, i.rotationY])),
    };
    this.cb.onDragStart(this.drag.ids, this.mode);
  };

  private onMove = (e: PointerEvent) => {
    const dx = e.clientX - this.last.x;
    const dy = e.clientY - this.last.y;
    this.last = { x: e.clientX, y: e.clientY };
    this.moved += Math.abs(dx) + Math.abs(dy);
    if (this.orbiting) {
      if (e.shiftKey) this.cam.pan(dx, dy);
      else this.cam.rotate(dx, dy);
      this.cb.onCameraChange();
      return;
    }
    if (!this.drag) return;
    const items = this.cb.getItems();
    const bounds = this.cb.getWindowBounds();
    if (this.drag.mode === 'move') {
      const anchor = items.find((i) => i.id === this.drag!.ids[0]);
      if (!anchor) return;
      const hit = this.groundHit(e, anchor.position.y);
      const startHit = this.groundHitAt(this.drag.startPointer, anchor.position.y);
      if (!hit || !startHit) return;
      const ddx = hit.x - startHit.x;
      const ddz = hit.z - startHit.z;
      for (const id of this.drag.ids) {
        const it = items.find((i) => i.id === id);
        const sp = this.drag.startPositions.get(id);
        if (!it || !sp || this.cb.isLocked(id)) continue;
        const nx = clamp(sp.x + ddx, -bounds.halfW + 5, bounds.halfW - 5);
        const nz = clamp(sp.z + ddz, -bounds.halfD + 5, bounds.halfD + 60);
        this.cb.onDragMove(id, v3(nx, sp.y, nz), it.rotationY);
      }
    } else if (this.drag.mode === 'rotate') {
      const ang = rad((e.clientX - this.drag.startPointer.x) * 0.8);
      for (const id of this.drag.ids) {
        const it = items.find((i) => i.id === id);
        const sr = this.drag.startRotations.get(id);
        if (!it || sr === undefined || this.cb.isLocked(id)) continue;
        this.cb.onDragMove(id, { ...it.position }, sr + ang);
      }
    } else {
      const dyCm = (this.drag.startPointer.y - e.clientY) * 1.2;
      for (const id of this.drag.ids) {
        const it = items.find((i) => i.id === id);
        const sp = this.drag.startPositions.get(id);
        if (!it || !sp || this.cb.isLocked(id)) continue;
        const ny = clamp(sp.y + dyCm, bounds.floorY, bounds.floorY + bounds.height - 5);
        this.cb.onDragMove(id, v3(sp.x, ny, sp.z), it.rotationY);
      }
    }
  };

  private groundHitAt(p: { x: number; y: number }, y: number): Vec3 | null {
    const r = this.canvas.getBoundingClientRect();
    const nx = ((p.x - r.left) / r.width) * 2 - 1;
    const ny = -((p.y - r.top) / r.height) * 2 + 1;
    const { origin, dir } = this.cam.ray(nx, ny, r.width / r.height);
    if (Math.abs(dir.y) < 1e-6) return null;
    const t = (y - origin.y) / dir.y;
    return v3(origin.x + dir.x * t, y, origin.z + dir.z * t);
  }

  private onUp = () => {
    if (this.drag) this.cb.onDragEnd();
    this.drag = null;
    this.orbiting = false;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.cam.zoom(e.deltaY);
    this.cb.onCameraChange();
  };

  dispose() {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onCtx);
  }
}
