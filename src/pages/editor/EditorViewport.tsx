import { useEffect, useRef, type MutableRefObject } from 'react';
import type { ID, PlacedItem, StoreWindow, Vec3, Viewpoint, Material } from '../../types';
import { Renderer, type LineCall, type BlobCall } from '../../engine/Renderer';
import { OrbitCamera } from '../../engine/OrbitCamera';
import { InteractionController, type DragMode } from '../../engine/InteractionController';
import { buildScene, projectWorld, type ItemBox } from '../../engine/scene';
import { itemSize } from '../../engine/ModelRegistry';
import { v3 } from '../../lib/math';

export interface EditorViewportProps {
  win: StoreWindow;
  items: PlacedItem[];
  materials: Map<ID, Material>;
  selected: Set<ID>;
  flags: Map<ID, 'error' | 'warn'>;
  activeViewpoint: Viewpoint | null;
  showPanelLines: boolean;
  fog: number;
  lightboxPower: boolean;
  onPick: (id: ID | null, additive: boolean) => void;
  onMove: (id: ID, pos: Vec3, rotY: number, commit: boolean) => void;
  onCamera: (cam: OrbitCamera) => void;
  registerApi: (api: ViewportApi) => void;
  fpsRef: MutableRefObject<number>;
  labelsRef: MutableRefObject<{ id: string; text: string; x: number; y: number; color: string }[]>;
}

export interface ViewportApi {
  setMode: (m: DragMode) => void;
  frame: () => void;
  saveViewpoint: (name: string, eyeHeight: number) => Viewpoint;
  jumpViewpoint: (vp: Viewpoint) => void;
  clearViewpoint: () => void;
  screenshot: () => string;
  getCamera: () => OrbitCamera;
}

export function EditorViewport(props: EditorViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(props);
  stateRef.current = props;
  const rendererRef = useRef<Renderer | null>(null);
  const camRef = useRef<OrbitCamera>(new OrbitCamera());
  const boxesRef = useRef<ItemBox[]>([]);
  const rafRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current!;
    let renderer: Renderer;
    let alive = true;   // StrictMode 双挂载守卫:cleanup 后旧循环立即停转
    try {
      renderer = new Renderer(canvas);
    } catch (e) {
      alert((e as Error).message);
      return;
    }
    rendererRef.current = renderer;
    const cam = camRef.current;
    const w = stateRef.current.win;
    cam.frame(w.width, w.depth, w.height);

    const controller = new InteractionController(canvas, cam, {
      getBoxes: () => boxesRef.current,
      getItems: () => stateRef.current.items,
      getWindowBounds: () => ({
        halfW: stateRef.current.win.width / 2,
        halfD: stateRef.current.win.depth / 2,
        floorY: stateRef.current.win.platformHeight,
        height: stateRef.current.win.height,
      }),
      onPick: (id, additive) => stateRef.current.onPick(id, additive),
      onDragStart: () => {},
      onDragMove: (id, pos, rotY) => stateRef.current.onMove(id, pos, rotY, false),
      onDragEnd: () => {
        const p = stateRef.current;
        p.items.filter((i) => p.selected.has(i.id)).forEach((i) => p.onMove(i.id, i.position, i.rotationY, true));
      },
      onCameraChange: () => stateRef.current.onCamera(cam),
      isLocked: (id) => !!stateRef.current.items.find((i) => i.id === id)?.locked,
      getSelectedIds: () => Array.from(stateRef.current.selected),
    });

    const api: ViewportApi = {
      setMode: (m) => controller.setMode(m),
      frame: () => cam.frame(stateRef.current.win.width, stateRef.current.win.depth, stateRef.current.win.height),
      saveViewpoint: (name, eyeHeight) => {
        const vp: Viewpoint = {
          id: `vp_${Date.now().toString(36)}`, name, eyeHeight,
          position: { ...cam.eye }, target: { ...cam.lookTarget },
        };
        return vp;
      },
      jumpViewpoint: (vp) => {
        cam.setPedestrian({ ...vp.position }, { ...vp.target });
      },
      clearViewpoint: () => cam.clearPedestrian(),
      screenshot: () => {
        const p = stateRef.current;
        const scene = buildScene({
          window: p.win, items: p.items, materials: p.materials, env: p.win.env,
          selected: new Set(), flags: p.flags, activeViewpoint: p.activeViewpoint, showPanelLines: p.showPanelLines,
        });
        return renderer.capture(cam.state(), scene.calls, scene.lines, scene.blobs);
      },
      getCamera: () => cam,
    };
    props.registerApi(api);
    props.onCamera(cam);

    let frames = 0;
    let fpsTimer = performance.now();
    let sceneSig = '';

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;
      const p = stateRef.current;
      renderer.fog = p.fog;
      renderer.lightboxPower = p.lightboxPower;
      const scene = buildScene({
        window: p.win, items: p.items, materials: p.materials, env: p.win.env,
        selected: p.selected, flags: p.flags, activeViewpoint: p.activeViewpoint, showPanelLines: p.showPanelLines,
      });
      boxesRef.current = scene.boxes;
      // 场景内容变化才重建环境立方图,相机环绕/静止不触发,保证连续调参不越用越卡
      const sig = `${p.items.length}:${p.items.map((i) =>
        `${i.id}@${i.position.x.toFixed(1)},${i.position.y.toFixed(1)},${i.position.z.toFixed(1)},${i.rotationY.toFixed(2)},${i.scale},${i.flipY ? 1 : 0}`).join('|')}:${p.lightboxPower}:${p.win.id}`;
      if (sig !== sceneSig) { sceneSig = sig; renderer.markEnvDirty(); }
      renderer.render(cam.state(), scene.calls, scene.lines, scene.blobs, dt);

      // HTML 标签层:KT 编号等,投影到屏幕
      const rect = canvas.getBoundingClientRect();
      const labels: typeof props.labelsRef.current = [];
      if (p.showPanelLines) {
        for (const it of p.items) {
          if (!it.panelPieces) continue;
          const s = itemSize(it);
          for (const pc of it.panelPieces) {
            const world = v3(it.position.x - s.w / 2 + pc.x + pc.w / 2, it.position.y + pc.y + pc.h / 2, it.position.z + 4);
            const pr = projectWorld(world, cam, rect.width, rect.height);
            if (!pr.behind) labels.push({ id: pc.code, text: pc.code, x: pr.x, y: pr.y, color: '#ffd479' });
          }
        }
      }
      p.labelsRef.current = labels;

      frames++;
      if (now - fpsTimer > 1000) {
        p.fpsRef.current = Math.round((frames * 1000) / (now - fpsTimer));
        frames = 0;
        fpsTimer = now;
      }
      if (alive) rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      controller.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 窗口尺寸变化时重新取景
  useEffect(() => {
    camRef.current.frame(props.win.width, props.win.depth, props.win.height);
  }, [props.win.id, props.win.width, props.win.depth, props.win.height]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'grab' }} />;
}
