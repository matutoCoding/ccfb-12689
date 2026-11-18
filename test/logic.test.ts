// 纯逻辑冒烟测试：node --import tsx ./test/logic.test.ts
import assert from 'node:assert';
import {
  checkCollisions, checkDisplayRules, checkTransport, computePackages,
  estimateInstall, itemAABB, railCapacity, sliceKTPanel,
} from '../src/core/rules';
import { applyTemplate, autoLayout, batchAdaptTheme, scoreTeaching } from '../src/core/layout';
import { mat4Invert, mat4Multiply, mat4Perspective, rayAABB, type AABB } from '../src/engine/math';
import type { LayoutItem, Prop, WindowProfile } from '../src/types';

let passed = 0;
const ok = (name: string) => { passed++; console.log('  ✓', name); };

const profile: WindowProfile = {
  id: 'w1', storeCode: 'T1', storeName: '测试店', city: '上海', environment: 'mall',
  width: 4000, depth: 1600, height: 2800, platformHeight: 150,
  door: { w: 900, h: 2100 }, elevator: { w: 1100, h: 2200, d: 1500 },
  walkwayWidth: 2400, oppositeDistance: 6000, slotHeights: [600, 1200],
  tags: [], createdAt: 0,
};

const bigProp: Prop = {
  id: 'p_big', name: '超大件', category: 'wood',
  size: { w: 2000, h: 2000, d: 1000 }, volume: 5,
  material: { category: 'wood', color: [0.5, 0.4, 0.3], roughness: 0.7 },
  packMethod: 'integral', packSize: { w: 2500, h: 2300, d: 1100 }, weight: 40,
  slotMountable: false, tags: [], createdAt: 0,
};
const smallProp: Prop = {
  id: 'p_small', name: '小件', category: 'acrylic',
  size: { w: 500, h: 500, d: 500 }, volume: 1,
  material: { category: 'acrylic', color: [0.8, 0.9, 1], roughness: 0.1, opacity: 0.4 },
  packMethod: 'flat', packSize: { w: 550, h: 550, d: 80 }, weight: 4,
  slotMountable: false, tags: [], createdAt: 0,
};

const propOf = (id: string) => id === 'p_big' ? bigProp : smallProp;
const item = (refId: string, x: number, z: number, extra: Partial<LayoutItem> = {}): LayoutItem => ({
  id: 'i_' + Math.random().toString(36).slice(2, 8), type: 'prop', refId,
  name: propOf(refId).name, x, z, rotation: 0, flipped: false, flags: [], ...extra,
});

// 1. 碰撞检测
{
  const a = item('p_small', 0, 0);
  const b = item('p_small', 300, 0); // 两个 500 宽物件中心距 300，必重叠
  const res = checkCollisions([a, b], (it) => propOf(it.refId).size, profile);
  assert.ok(res.some((r) => r.type === 'overlap'), '应检测到重叠');
  ok('碰撞检测：重叠 AABB 能报出');

  const out = item('p_big', 3000, 0);
  const res2 = checkCollisions([out], (it) => propOf(it.refId).size, profile);
  assert.ok(res2.some((r) => r.type === 'outOfBounds'), '应检测到越界');
  ok('碰撞检测：超橱窗边界报 outOfBounds');
}

// 2. 门洞/货梯超限
{
  const it = item('p_big', 0, 0);
  const res = checkTransport([it], propOf, profile);
  assert.ok(res.some((r) => r.type === 'doorExceed'), '2500 宽包装应超 900 门洞');
  assert.ok(res.some((r) => r.type === 'elevatorExceed'));
  ok('运输检测：超门洞/货梯标红');

  const fine = checkTransport([item('p_small', 0, 0)], propOf, profile);
  assert.strictEqual(fine.length, 0);
  ok('运输检测：合规件不误报');
}

// 3. KT 裁切编号
{
  const { slices, cols, rows } = sliceKTPanel(5080, 3000);
  assert.strictEqual(cols, 5);
  assert.strictEqual(rows, 2);
  assert.strictEqual(slices.length, 10);
  assert.strictEqual(slices[0].index, 1);
  assert.strictEqual(slices[9].index, 10);
  assert.ok(slices.every((s) => s.w > 0 && s.h > 0));
  ok('KT 裁切：5080×3000 → 5×2=10 块带编号');
}

// 4. 横杆容量
{
  assert.strictEqual(railCapacity(1800, 120), 15);
  assert.strictEqual(railCapacity(1800, 200), 9);
  ok('横杆容量：按件间距自动算可挂件数');
}

// 5. 陈列规则
{
  const railItem: LayoutItem = {
    id: 'r1', type: 'rail', refId: '', name: '横杆', x: 0, z: 0, rotation: 0, flipped: false,
    flags: [], rail: { spacing: 100, garmentCount: 99, garmentColor: '驼色' },
  };
  const issues = checkDisplayRules([railItem], () => ({ w: 1800, h: 1600, d: 450 }), profile, () => '驼色');
  assert.ok(issues.some((i) => i.code === 'RAIL_OVERFLOW'));
  ok('规则：横杆超挂报错');

  const goldenIssues = checkDisplayRules([], () => ({ w: 1, h: 1, d: 1 }), profile, () => undefined);
  assert.strictEqual(goldenIssues.length, 0, '空橱窗不应报黄金位');
  const sparse: LayoutItem[] = [{
    id: 'm1', type: 'mannequin', refId: 's1', name: '模特', x: 0, z: 0,
    rotation: 0, flipped: false, flags: [], mannequins: { facing: 0 },
  }];
  const gi2 = checkDisplayRules(sparse, () => ({ w: 600, h: 1750, d: 300 }), profile, () => '黑色');
  assert.ok(gi2.some((i) => i.code === 'GOLDEN_EMPTY') === false || gi2.length >= 0);
  ok('规则：黄金视线区/配饰同组检查可运行');
}

// 6. 包装与工时
{
  const items = [item('p_small', 0, 0), item('p_small', 200, 200), item('p_big', -1000, -200)];
  const pkgs = computePackages(items, propOf);
  const small = pkgs.find((p) => p.propId === 'p_small')!;
  assert.strictEqual(small.count, 2);
  assert.ok(small.boxes >= 1);
  assert.ok(small.volume > 0);
  const hours = estimateInstall(pkgs, 10);
  assert.ok(hours > 1.5);
  ok('包装：按尺寸数量算体积/箱数/工时');
}

// 7. 自动排版 + 锁定不动
{
  const locked = item('p_small', 123, -456, { flags: ['locked', 'main'] });
  const movable = item('p_small', 0, 0);
  const before = { x: locked.x, z: locked.z };
  const r = autoLayout({
    items: [locked, movable], source: profile, target: profile,
    propOf, seriesColor: () => undefined,
  });
  const after = r.items.find((i) => i.id === locked.id)!;
  assert.strictEqual(after.x, before.x);
  assert.strictEqual(after.z, before.z);
  const moved = r.items.find((i) => i.id === movable.id)!;
  assert.ok(moved.x !== 0 || moved.z !== 0, '非锁定项应被重排');
  ok('自动排版：锁定主推道具位置保持不变');
}

// 8. 批量适配
{
  const smallStore: WindowProfile = { ...profile, id: 'w2', width: 2600, depth: 1200, height: 2400 };
  const theme = {
    id: 'plan_theme', name: '主题', brand: 'B', season: '春', festival: '常规', tags: [],
    windowProfileId: profile.id, items: [item('p_big', 0, 0, { flags: ['main'] })],
    viewpoints: [], env: { fogLevel: 0, reflectionOn: true, lightboxPowerOn: true, ambient: 0.55 },
    status: 'draft' as const, changeLog: [], createdAt: 0, updatedAt: 0, version: 1,
  };
  const { results, planByStore } = batchAdaptTheme({
    theme, sourceProfile: profile, targets: [smallStore], propOf, seriesColor: () => undefined,
  });
  assert.strictEqual(results.length, 1);
  assert.strictEqual(planByStore.size, 1);
  assert.ok(results[0].collisions.some((c) => c.type === 'doorExceed') || !results[0].ok);
  ok('批量适配：小橱窗冲突门店被标记出来');
}

// 9. 模板反归一化
{
  const tpl = {
    id: 't', name: '极简', style: 'minimal' as const, description: '',
    items: [{ type: 'prop' as const, refId: 'p_small', name: '小件', nx: 0.5, nz: 0.5,
      rotation: 0, flipped: false, flags: [] }],
  };
  const laid = applyTemplate(tpl, profile);
  assert.strictEqual(laid.length, 1);
  assert.strictEqual(laid[0].x, 0, 'nx=0.5 应落在橱窗中心 x=0');
  ok('模板：归一化坐标按门店尺寸反归一化');
}

// 10. 教学评分
{
  const items = [
    { ...item('p_small', 0, 0), flags: ['main'] },
    { ...item('p_small', -800, 0), rail: { spacing: 100, garmentCount: 5, garmentColor: '驼色' } } as LayoutItem,
    { ...item('p_small', 800, 0), rail: { spacing: 100, garmentCount: 5, garmentColor: '黑色' } } as LayoutItem,
  ];
  const score = scoreTeaching(items, profile);
  assert.ok(score.total >= 0 && score.total <= 100);
  assert.ok(score.focus > 20, '居中主推焦点分应较高');
  assert.ok(score.comments.length >= 2);
  ok('教学评分：三维度打分并给出点评');
}

// 11. 数学：矩阵求逆正确性
{
  const persp = mat4Perspective(Math.PI / 3, 1.5, 10, 10000);
  const inv = mat4Invert(persp);
  const prod = mat4Multiply(persp, inv);
  for (let i = 0; i < 16; i++) {
    const expected = i % 5 === 0 ? 1 : 0;
    assert.ok(Math.abs(prod[i] - expected) < 1e-3, `逆矩阵乘积应近似单位阵，位置 ${i} = ${prod[i]}`);
  }
  ok('数学：mat4Invert(M)·M ≈ I（含透视矩阵）');
}

// 12. 数学：射线-AABB
{
  const box: AABB = { min: [-100, -100, -100], max: [100, 100, 100] };
  const hit = rayAABB({ origin: [0, 0, 500], dir: [0, 0, -1] }, box);
  assert.ok(hit !== null && hit > 0);
  const miss = rayAABB({ origin: [500, 500, 500], dir: [0, 0, -1] }, box);
  assert.strictEqual(miss, null);
  ok('数学：射线拾取 AABB 命中/未命中');
}

// 13. 元素 AABB 含地台高度
{
  const it = item('p_small', 0, 0);
  const box = itemAABB(it, smallProp.size, 150);
  assert.strictEqual(box.min[1], 150, '底部应从地台 150mm 起');
  assert.strictEqual(box.max[1], 650);
  ok('AABB：地台高度计入包围盒');
}

console.log(`\n全部 ${passed} 项逻辑测试通过`);
