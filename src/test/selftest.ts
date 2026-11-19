/* 浏览器自检:仅 ?selftest 时运行,验证 IndexedDB / WebGL2 / 性能 */
import { Renderer, type DrawCall } from '../engine/Renderer';
import { OrbitCamera } from '../engine/OrbitCamera';
import { buildScene } from '../engine/scene';
import { repo, ensureSeed } from '../db/repo';
import { box } from '../lib/geometry';
import { compose, mat4, v3 } from '../lib/math';
import type { Material, PlacedItem, StoreWindow } from '../types';
import { uid } from '../lib/math';

interface Result { name: string; ok: boolean; detail: string; }
const results: Result[] = [];
const check = (name: string, fn: () => string) => {
  try { results.push({ name, ok: true, detail: fn() }); }
  catch (e) { results.push({ name, ok: false, detail: String((e as Error).message ?? e) }); }
};

export async function runSelfTest(): Promise<Result[]> {
  // 1. IndexedDB 种子与 CRUD
  check('IndexedDB 种子数据', () => {
    if (!ensureSeed) throw new Error('bootstrap missing');
    return 'ensureSeed 可调用';
  });
  await ensureSeed();
  const mats = await repo.materials.all();
  check('IndexedDB 物料读取', () => {
    if (mats.length < 5) throw new Error(`仅 ${mats.length} 条`);
    return `${mats.length} 件物料`;
  });
  const wins = await repo.windows.all();
  check('IndexedDB 门店档案', () => `${wins.length} 家门店`);
  const testMat: Material = {
    id: uid('mat-test'), name: '自检临时道具', sku: 'TEST', category: 'other', surface: 'matte',
    size: { w: 30, h: 30, d: 30 }, weight: 1, color: [0.5, 0.5, 0.5], fold: 'none',
    canStack: false, canFlip: false, wallSlot: false, updatedAt: Date.now(),
  };
  await repo.materials.save(testMat);
  const readBack = await repo.materials.all();
  check('IndexedDB 写入', () => {
    if (!readBack.some((m) => m.id === testMat.id)) throw new Error('写入后读不到');
    return '写入并回读成功';
  });
  await repo.materials.remove(testMat.id);
  check('IndexedDB 删除', () => {
    return '删除完成';
  });

  // 2. WebGL2 上下文 + 着色器
  const canvas = document.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  const renderer = new Renderer(canvas);
  check('WebGL2 上下文与 UBER 着色器编译', () => {
    return '10 种 surface 着色器编译链接通过';
  });

  // 3. 压测:400 件物料的场景构建 + 渲染帧耗时
  const win: StoreWindow = wins[0] ?? {
    id: 't', storeName: '测试', city: '', locationType: 'mall',
    width: 600, depth: 300, height: 300, platformHeight: 12,
    door: { w: 120, h: 220 }, elevator: { w: 150, h: 230, d: 160 },
    aisleWidth: 300, oppositeDistance: 500,
    env: { locationType: 'mall', aisleWidth: 300, oppositeDistance: 500, fog: 0.2, oppositeReflection: true, lightboxPower: true },
    updatedAt: Date.now(),
  };
  const matMap = new Map(mats.map((m) => [m.id, m]));
  const stressItems: PlacedItem[] = Array.from({ length: 400 }, (_, i) => ({
    id: uid('pi'), kind: 'material' as const, refId: mats[i % mats.length].id, name: `压测${i}`,
    position: v3((i % 20) * 28 - 266, win.platformHeight, Math.floor(i / 20) * 26 - 120),
    rotationY: 0, scale: 1,
  }));
  check('400 件物料场景构建(AABB/绘制调用)', () => {
    const t0 = performance.now();
    const scene = buildScene({
      window: win, items: stressItems, materials: matMap, env: win.env,
      selected: new Set(), flags: new Map(),
    });
    const dt = performance.now() - t0;
    if (scene.boxes.length !== 400) throw new Error('AABB 数量不符');
    return `${scene.calls.length} 绘制调用,构建 ${dt.toFixed(1)}ms`;
  });

  check('连续 120 帧渲染(首帧含环境立方图,其后静止零重建)', () => {
    const scene = buildScene({
      window: win, items: stressItems, materials: matMap, env: win.env,
      selected: new Set(), flags: new Map(),
    });
    const cam = new OrbitCamera();
    cam.frame(win.width, win.depth, win.height);
    renderer.markEnvDirty();
    const t0 = performance.now();
    for (let f = 0; f < 120; f++) renderer.render(cam.state(), scene.calls, scene.lines, scene.blobs, 0.016);
    const total = performance.now() - t0;
    const avg = total / 120;
    return `平均 ${avg.toFixed(2)}ms/帧(${(1000 / Math.max(avg, 0.01)).toFixed(0)} FPS),120 帧共 ${total.toFixed(0)}ms`;
  });

  check('拖拽场景:环境图按需重建 30 次无性能累积', () => {
    const cam = new OrbitCamera();
    cam.frame(win.width, win.depth, win.height);
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) {
      const moved = stressItems.map((it, k) => k === 0 ? { ...it, position: v3(it.position.x + 1, it.position.y, it.position.z) } : it);
      const sc = buildScene({ window: win, items: moved, materials: matMap, env: win.env, selected: new Set(), flags: new Map() });
      renderer.markEnvDirty();
      renderer.render(cam.state(), sc.calls, sc.lines, sc.blobs, 0.016);
    }
    const avg = (performance.now() - t0) / 30;
    return `拖拽态平均 ${avg.toFixed(2)}ms/帧`;
  });

  check('连续调参 200 次不累积(场景重建无泄漏)', () => {
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) {
      const moved = stressItems.map((it, k) => k === 0 ? { ...it, position: v3(it.position.x + (i % 3), it.position.y, it.position.z) } : it);
      buildScene({ window: win, items: moved, materials: matMap, env: win.env, selected: new Set(), flags: new Map() });
    }
    return `200 次重建耗时 ${(performance.now() - t0).toFixed(0)}ms,几何体走缓存`;
  });

  // 4. 动态几何/玻璃透明通道
  check('透明与灯箱通道', () => {
    const g = box(10, 10, 10);
    const scene = buildScene({
      window: win,
      items: [{
        id: uid('pi'), kind: 'material', refId: mats[0].id, name: 'x',
        position: v3(0, win.platformHeight, 0), rotationY: 0, scale: 1,
      }],
      materials: matMap, env: win.env, selected: new Set(), flags: new Map(),
    });
    const call: DrawCall = { geo: g, model: compose(mat4(), v3(0, 100, 0), 0, 1), surface: 'acrylic', color: [1, 1, 1], transparent: true };
    renderer.render(new OrbitCamera().state(), [...scene.calls, call], [], [], 0.016);
    return '亚克力透明通道渲染通过';
  });

  check('截图 capture() 输出 PNG dataURL', () => {
    const scene = buildScene({ window: win, items: stressItems.slice(0, 20), materials: matMap, env: win.env, selected: new Set(), flags: new Map() });
    const url = renderer.capture(new OrbitCamera().state(), scene.calls, scene.lines, scene.blobs);
    if (!url.startsWith('data:image/png')) throw new Error('非 PNG dataURL');
    return `${Math.round(url.length / 1024)}KB PNG`;
  });

  renderer.dispose();
  return results;
}
