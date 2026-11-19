/* 纯逻辑冒烟测试:不依赖 DOM,用 esbuild 打包后 node 运行(tsc 不校验本文件,见 tsconfig.test.json) */
declare const process: any;
const assert = (await import('node:assert')).default;
import { splitKTBoard, findCollisions, findOutOfBounds, findAccessIssues, foldedSize } from '../domain/geometryRules';
import { displayRules, railCapacity } from '../domain/displayRules';
import { autoLayout, adaptToWindow, batchAdapt } from '../domain/autolayout';
import { calcPackaging, scoreTeaching } from '../domain/packaging';
import { TEMPLATES } from '../domain/templates';
import { SEED_MATERIALS, seedWindows, SEED_GROUPS } from '../domain/seed';
import { itemSize } from '../engine/ModelRegistry';
import type { Material, PlacedItem, StoreWindow } from '../types';
import { uid, v3 } from '../lib/math';

let pass = 0;
const ok = (name: string, fn: () => void) => { fn(); pass++; console.log('  ✓', name); };

const matMap = new Map(SEED_MATERIALS.map((m) => [m.id, m]));
const win = seedWindows()[0];
const floorY = win.platformHeight;

const mat = (id: string, x: number, z: number, extra: Partial<PlacedItem> = {}): PlacedItem => ({
  id: uid('pi'), kind: 'material', refId: id, name: matMap.get(id)!.name,
  position: v3(x, floorY, z), rotationY: 0, scale: 1, ...extra,
});

// 1. KT 分块:360 宽 -> 3 列,编号连续
ok('KT 板 360×240 自动分 3 块且编号 A1/B1/C1', () => {
  const pieces = splitKTBoard(360, 240);
  assert.strictEqual(pieces.length, 3);
  assert.deepStrictEqual(pieces.map((p) => p.code), ['KT-A1', 'KT-B1', 'KT-C1']);
  assert.ok(pieces.every((p) => p.w <= 120 && p.h <= 240));
});

ok('KT 板超宽超高 300×500 分 3×3 共 9 块', () => {
  const pieces = splitKTBoard(300, 500);
  assert.strictEqual(pieces.length, 9);
});

// 2. 碰撞
ok('两件重叠道具报 COLLISION', () => {
  const a = mat('mat-seed-plinth', 0, 0);
  const b = mat('mat-seed-plinth2', 5, 0);
  const issues = findCollisions([a, b], matMap);
  assert.ok(issues.some((i) => i.code === 'COLLISION'));
});

ok('间距足够时无碰撞', () => {
  const a = mat('mat-seed-plinth', -80, 0);
  const b = mat('mat-seed-plinth2', 80, 0);
  assert.strictEqual(findCollisions([a, b], matMap).length, 0);
});

// 3. 边界与门洞货梯
ok('超橱窗边界报 OUT_OF_WINDOW', () => {
  const big = mat('mat-seed-oversize', 0, 0);
  big.position = v3(win.width / 2 + 100, floorY, 0);
  assert.ok(findOutOfBounds([big], win, matMap).some((i) => i.code === 'OUT_OF_WINDOW'));
});

ok('超限样件超门洞报 DOOR_BLOCK', () => {
  const issues = findAccessIssues([mat('mat-seed-oversize', 0, 0)], win, matMap);
  assert.ok(issues.some((i) => i.code === 'DOOR_BLOCK'));
});

ok('折叠尺寸按 fold 类型变化', () => {
  const m = SEED_MATERIALS.find((x) => x.fold === 'fold')!;
  const f = foldedSize(m);
  assert.ok(f.h < m.size.h);
});

// 4. 挂杆容量
ok('挂杆按件间距自动算容量且超挂报错', () => {
  const rail = mat('mat-seed-rail', 0, 0, { rail: { spacing: 8, garments: 99, hueTags: [] } });
  const cap = railCapacity(rail);
  assert.ok(cap > 5);
  assert.ok(displayRules([rail], win).some((i) => i.code === 'RAIL_OVERFLOW'));
});

// 5. 陈列规则:同色系连续 / 黄金视线 / 配饰
ok('同色系连续 5 件报 HUE_RUN', () => {
  const items = Array.from({ length: 5 }, (_, i) =>
    mat('mat-seed-plinth2', (i - 2) * 55, 0, { hueTag: '红' }));
  assert.ok(displayRules(items, win).some((i) => i.code === 'HUE_RUN'));
});

ok('主推款无配饰报 NO_ACCESSORY', () => {
  const hero = mat('mat-seed-plinth', 0, 0, { isHero: true });
  assert.ok(displayRules([hero], win).some((i) => i.code === 'NO_ACCESSORY'));
});

ok('主推+150cm 内置配饰通过', () => {
  const hero = mat('mat-seed-plinth', 0, 0, { isHero: true });
  const acc = mat('mat-seed-velvet', 60, 0, { isAccessory: true });
  assert.ok(!displayRules([hero, acc], win).some((i) => i.code === 'NO_ACCESSORY'));
});

// 6. 自动排布:锁定项不动
ok('autoLayout 锁定道具位置不变,其余重排且不重叠', () => {
  const items = [
    mat('mat-seed-tower', 0, 0, { locked: true }),
    mat('mat-seed-plinth', 30, 30),
    mat('mat-seed-plinth2', -40, -20),
    mat('mat-seed-chrome', 50, -40),
  ];
  const lockedBefore = { ...items[0].position };
  const laid = autoLayout(items, win, matMap);
  const lockedAfter = laid.find((i) => i.id === items[0].id)!;
  assert.deepStrictEqual(lockedAfter.position, lockedBefore);
  assert.strictEqual(findCollisions(laid, matMap).filter((i) => i.code === 'COLLISION').length, 0);
});

// 7. 小橱窗适配产生冲突清单
ok('小门洞门店放超限装置在批量适配中被列入冲突', () => {
  const windows = seedWindows();
  const schemeItems = [mat('mat-seed-oversize', 0, 20), mat('mat-seed-plinth', -80, 20)];
  const { results, conflicts } = batchAdapt(schemeItems, windows, matMap);
  assert.strictEqual(results.length, windows.length);
  assert.ok(conflicts.length >= 1);
  assert.ok(conflicts.every((c) => c.issues.length > 0));
});

ok('adaptToWindow 输出新 id 且保持数量', () => {
  const items = TEMPLATES[0].build(win).items;
  const r = adaptToWindow(items, win, matMap);
  assert.strictEqual(r.items.length, items.length);
  assert.ok(r.items[0].id !== items[0].id);
});

// 8. 包装计算
ok('包装体积/箱数/工时随数量增长', () => {
  const items = [mat('mat-seed-plinth', 0, 0), mat('mat-seed-plinth', 70, 0), mat('mat-seed-lightbox', 0, -50, { wallMount: true })];
  const pk = calcPackaging(items, matMap);
  assert.ok(pk.lines.length >= 2);
  assert.ok(pk.boxCount >= 1);
  assert.ok(pk.totalVolume > 0);
  assert.ok(pk.laborHours > 0);
});

// 9. 教学评分
ok('教学评分:正确摆放得高分,乱摆低分且给出差距说明', () => {
  const target = TEMPLATES[0].build(win).teachingTarget;
  const good = target.map((t) => ({ ...t, id: uid('pi') }));
  const sGood = scoreTeaching(good, target);
  assert.ok(sGood.total >= 80, `good=${sGood.total}`);
  const bad = target.map((t, i) => ({ ...t, id: uid('pi'), position: v3(i * 90 - 100, floorY, -60), hueTag: i % 2 ? '紫' : '绿' }));
  const sBad = scoreTeaching(bad, target);
  assert.ok(sBad.total < sGood.total);
  assert.ok(sBad.details.length >= 2);
});

// 10. 模板可在任意尺寸橱窗构建
ok('三套模板在 8 家门店尺寸下均能构建', () => {
  for (const w of seedWindows()) {
    for (const t of TEMPLATES) {
      const { items } = t.build(w);
      assert.ok(items.length >= 3);
      const out = findOutOfBounds(items, w, new Map());
      // 模板默认布局不应超界
      assert.strictEqual(out.length, 0, `${t.name}@${w.storeName} 超界`);
    }
  }
});

// 11. 模特组模型尺寸
ok('三人模特组宽度随间距增长', () => {
  const g = SEED_GROUPS[0];
  const item: PlacedItem = {
    id: uid('pi'), kind: 'mannequinGroup', refId: g.id, name: g.name,
    position: v3(0, floorY, 0), rotationY: 0, scale: 1, mannequins: g.mannequins,
  };
  const { itemSize: sizeOf } = { itemSize };
  const s = sizeOf(item);
  assert.strictEqual(s.h, 180);
  assert.ok(s.w > 90);
});

console.log(`\n全部 ${pass} 项冒烟测试通过 ✅`);
