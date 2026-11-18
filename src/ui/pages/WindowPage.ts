// 页面二：橱窗配置（核心工作台）
import { store } from '../../data/store';
import { Viewport } from '../Viewport';
import { navigate } from '../shell';
import {
  badge, btn, checkInput, clear, confirmDialog, emptyState, field, h, modal,
  numberInput, selectInput, slider, textInput, toast,
} from '../dom';
import { buildScene, buildOcclusionLines } from '../../core/scene';
import {
  checkCollisions, checkDisplayRules, checkTransport, itemAABB, railCapacity, sliceKTPanel,
} from '../../core/rules';
import { applyTemplate, autoLayout, batchAdaptTheme } from '../../core/layout';
import { uid } from '../../engine/math';
import type {
  CollisionResult, DisplayTemplate, LayoutItem, Prop, PropKit, RuleIssue, WindowProfile,
} from '../../types';

export class WindowPage {
  private root: HTMLElement;
  private planId: string;
  private viewport: Viewport | null = null;
  private selectedId: string | null = null;
  private unsub: (() => void) | null = null;
  private collisions: CollisionResult[] = [];
  private issues: RuleIssue[] = [];
  private showOcclusion = false;
  private rafPending = false;

  constructor(root: HTMLElement, planId: string) {
    this.root = root;
    this.planId = planId;
  }

  private get plan() { return store.plans.find((p) => p.id === this.planId); }
  private get profile(): WindowProfile | undefined {
    const p = this.plan;
    return p ? store.profileOf(p.windowProfileId) : undefined;
  }

  render(): this {
    const plan = this.plan;
    if (!plan) {
      this.root.append(emptyState('方案不存在'), btn('返回方案列表', () => navigate({ page: 'plans' })));
      return this;
    }
    this.draw();
    this.unsub = store.subscribe(() => { if (!this.rafPending) {
      this.rafPending = true;
      requestAnimationFrame(() => { this.rafPending = false; this.refreshScene(); });
    } });
    return this;
  }

  destroy(): void {
    this.unsub?.();
    this.viewport?.dispose();
  }

  private draw(): void {
    clear(this.root);
    const plan = this.plan!;
    this.root.append(
      h('div', { class: 'page-head' },
        h('div', {},
          h('h1', {}, `🪟 ${plan.name}`),
          h('p', {}, '左键拖动道具/模特 · 空白处左键旋转视角 · Shift+左键或右键平移 · 滚轮缩放'),
        ),
        h('div', { class: 'page-actions' },
          btn('物料库管理', () => navigate({ page: 'library' })),
          btn('去陈列预览', () => navigate({ page: 'preview', planId: this.planId }), 'btn-primary'),
        ),
      ),
      h('div', { class: 'workbench' }, this.leftPanel(), this.centerStage(), this.rightPanel()),
    );
    this.refreshScene();
  }

  // ---------------- 左：物料库 + 模板 + 套件 ----------------
  private leftPanel(): HTMLElement {
    const plan = this.plan!;
    const tplSection = h('div', { class: 'section' },
      h('h4', {}, '经典模板一键套用'),
      h('div', { class: 'col' }, ...store.templates.map((t) =>
        h('div', { class: 'lib-item', onClick: () => this.applyTpl(t) },
          h('div', {},
            h('div', {}, t.name),
            h('div', { class: 'meta' }, t.description),
          ),
          h('span', { class: 'add' }, '套用'),
        ),
      )),
    );

    const propSection = h('div', { class: 'section' },
      h('h4', {}, `物料库（${store.props.length}）`),
      h('div', {}, ...store.props.map((p) =>
        h('div', { class: 'lib-item', title: '点击放入橱窗', onClick: () => this.addProp(p) },
          h('div', {},
            h('div', {}, p.name),
            h('div', { class: 'meta' },
              `${p.size.w}×${p.size.h}×${p.size.d}mm · ${catName(p.category)}`),
          ),
          h('span', { class: 'add' }, '＋'),
        ),
      )),
    );

    const seriesSection = h('div', { class: 'section' },
      h('h4', {}, '模特系列 / 挂装 / 叠装'),
      h('div', {},
        ...store.series.map((s) => h('div', { class: 'lib-item', onClick: () => this.addMannequin(s.id) },
          h('div', {}, h('div', {}, s.name), h('div', { class: 'meta' }, `${s.count} 人组 · 间距 ${s.spacing}mm`)),
          h('span', { class: 'add' }, '＋'),
        )),
        h('div', { class: 'lib-item', onClick: () => this.addRail() },
          h('div', {}, h('div', {}, '横杆挂装架'), h('div', { class: 'meta' }, '按间距自动排满')),
          h('span', { class: 'add' }, '＋'),
        ),
        h('div', { class: 'lib-item', onClick: () => this.addTower() },
          h('div', {}, h('div', {}, '叠装塔'), h('div', { class: 'meta' }, '层数/层高可调')),
          h('span', { class: 'add' }, '＋'),
        ),
      ),
    );

    const kitSection = h('div', { class: 'section' },
      h('h4', {}, `自定义套件（${store.kits.length}）`),
      h('div', {},
        btn('把当前陈列存为套件', () => this.saveKit(), 'btn-sm'),
        h('div', { style: 'margin-top:8px' }, ...store.kits.map((k) =>
          h('div', { class: 'lib-item' },
            h('div', {}, h('div', {}, k.name), h('div', { class: 'meta' }, `${k.items.length} 件元素`)),
            h('div', { class: 'gap8' },
              h('span', { class: 'add', onClick: () => this.applyKit(k) }, '放入'),
              h('span', { class: 'meta', style: 'color:var(--danger);cursor:pointer',
                onClick: async () => { await store.deleteKit(k.id); toast('套件已删除'); } }, '删'),
            ),
          ),
        )),
      ),
    );

    return h('div', { class: 'side-panel' }, tplSection, propSection, seriesSection, kitSection);
  }

  // ---------------- 中：3D 视口 ----------------
  private centerStage(): HTMLElement {
    const wrap = h('div', { style: 'position:relative;display:flex;flex-direction:column;gap:10px;min-height:0;min-width:0' });
    this.viewport = new Viewport({
      onPick: (id) => { this.selectedId = id; this.refreshScene(); this.drawRightPanel(); },
      onDrag: (id, x, z) => this.dragItem(id, x, z),
      onDragEnd: () => { void this.persist(); },
      onFps: (fps, ms, draws, inst) => this.updateHud(fps, ms, draws, inst),
    });
    this.viewport.el.style.flex = '1';
    const plan = this.plan!;
    const hud = h('div', { class: 'vp-hud' },
      h('span', { class: 'chip' }, 'FPS '),
      h('span', { class: 'chip' }, '帧耗时 '),
      h('span', { class: 'chip' }, 'DrawCall '),
      h('span', { class: 'chip' }, '实例 '),
    );
    const tools = h('div', { class: 'vp-tools' },
      btn('正视图', () => this.viewport?.presetCamera('front'), 'btn-sm'),
      btn('侧视图', () => this.viewport?.presetCamera('side'), 'btn-sm'),
      btn('俯视图', () => this.viewport?.presetCamera('top'), 'btn-sm'),
      btn('立体图', () => this.viewport?.presetCamera('iso'), 'btn-sm'),
    );
    const bottom = h('div', { class: 'vp-bottom' },
      btn('自动排版', () => this.runAutoLayout(), 'btn-sm'),
      btn('批量适配门店…', () => this.openBatch(), 'btn-sm'),
      btn(this.showOcclusion ? '关闭遮挡线' : '显示遮挡线', () => {
        this.showOcclusion = !this.showOcclusion; this.refreshScene();
      }, 'btn-sm'),
    );
    this.viewport.el.append(hud, tools, bottom);
    wrap.append(this.viewport.el);
    return wrap;
  }

  private updateHud(fps: number, ms: number, draws: number, inst: number): void {
    const chips = this.root.querySelectorAll('.vp-hud .chip');
    if (chips.length >= 4) {
      chips[0].innerHTML = `FPS <b>${fps.toFixed(0)}</b>`;
      chips[1].innerHTML = `帧耗时 <b>${ms.toFixed(1)}ms</b>`;
      chips[2].innerHTML = `DrawCall <b>${draws}</b>`;
      chips[3].innerHTML = `实例 <b>${inst}</b>`;
    }
  }

  // ---------------- 右：属性 + 检测 + KT 分块 ----------------
  private rightPanel(): HTMLElement {
    const panel = h('div', { class: 'side-panel props-panel', id: 'right-panel' });
    this.renderRightInto(panel);
    return panel;
  }

  private drawRightPanel(): void {
    const panel = this.root.querySelector('#right-panel');
    if (panel) this.renderRightInto(panel as HTMLElement);
  }

  private renderRightInto(panel: HTMLElement): void {
    clear(panel);
    const plan = this.plan!;
    const selected = plan.items.find((i) => i.id === this.selectedId);

    // 橱窗档案区
    panel.append(h('div', { class: 'section' },
      h('h4', {}, '橱窗实测档案'),
      this.profileEditor(),
    ));

    // 选中元素属性
    if (selected) {
      panel.append(h('div', { class: 'section' },
        h('h4', {}, `选中：${selected.name}`),
        this.itemEditor(selected),
      ));
    }

    // 碰撞/超限
    const errorSet = new Set(this.collisions.map((c) => c.itemId));
    panel.append(h('div', { class: 'section' },
      h('h4', {}, '碰撞与运输检测',
        badge(`${this.collisions.length}`, this.collisions.length ? 'badge-danger' : 'badge-ok')),
      this.collisions.length === 0
        ? h('p', { class: 'muted', style: 'margin:4px 0' }, '✓ 无碰撞、无门洞/货梯超限')
        : h('div', { class: 'checklist' }, ...this.collisions.map((c) =>
          h('div', { class: `issue issue-${c.type === 'overlap' ? 'warn' : 'error'}` },
            h('span', { class: 'ico' }, c.type === 'overlap' ? '⚠' : '🚫'),
            h('span', {}, c.message),
          ))),
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' },
        '超限/碰撞元素在场景中以红色描边提示'),
    ));

    // 陈列规则
    panel.append(h('div', { class: 'section' },
      h('h4', {}, '陈列规则检查', badge(`${this.issues.length}`)),
      this.issues.length === 0
        ? h('p', { class: 'muted', style: 'margin:4px 0' }, '✓ 同色系占位、黄金视线区、配饰搭配均合规')
        : h('div', { class: 'checklist' }, ...this.issues.map((i) =>
          h('div', { class: `issue issue-${i.level === 'error' ? 'error' : i.level === 'warn' ? 'warn' : 'info'}` },
            h('span', { class: 'ico' }, i.level === 'error' ? '⛔' : i.level === 'warn' ? '🟡' : 'ℹ'),
            h('span', {}, i.message),
          ))),
    ));

    // KT 板裁切
    panel.append(h('div', { class: 'section' },
      h('h4', {}, 'KT 背板自动分块'),
      this.ktSection(),
    ));

    // 元素清单
    panel.append(h('div', { class: 'section' },
      h('h4', {}, `陈列元素（${plan.items.length}）`),
      h('div', { class: 'checklist' }, ...plan.items.map((it) =>
        h('div', { class: `prop-row ${it.id === this.selectedId ? 'active' : ''}`,
          onClick: () => { this.selectedId = it.id; this.refreshScene(); this.drawRightPanel(); } },
          h('div', {},
            h('div', { class: 'name' }, `${typeIcon(it.type)} ${it.name}`),
            h('div', { class: 'sub' },
              `x:${it.x.toFixed(0)} z:${it.z.toFixed(0)} rot:${it.rotation}°`,
              errorSet.has(it.id) ? ' · 🔴异常' : '',
            ),
          ),
          h('span', { class: 'meta', style: 'color:var(--danger);cursor:pointer',
            onClick: (e) => { e.stopPropagation(); this.removeItem(it.id); } }, '删除'),
        ),
      )),
    ));
  }

  private profileEditor(): HTMLElement {
    const prof = this.profile!;
    const edit = (patch: Partial<WindowProfile>): void => {
      Object.assign(prof, patch);
      void store.saveProfile(prof);
    };
    return h('div', { class: 'col' },
      h('div', { class: 'grid-2' },
        field('开间 mm', numberInput(prof.width, (v) => edit({ width: v }), 50)),
        field('进深 mm', numberInput(prof.depth, (v) => edit({ depth: v }), 50)),
        field('净高 mm', numberInput(prof.height, (v) => edit({ height: v }), 50)),
        field('地台高度 mm', numberInput(prof.platformHeight, (v) => edit({ platformHeight: v }), 10)),
        field('门洞宽 mm', numberInput(prof.door.w, (v) => edit({ door: { ...prof.door, w: v } }), 10)),
        field('门洞高 mm', numberInput(prof.door.h, (v) => edit({ door: { ...prof.door, h: v } }), 10)),
        field('货梯宽 mm', numberInput(prof.elevator.w, (v) => edit({ elevator: { ...prof.elevator, w: v } }), 10)),
        field('货梯高 mm', numberInput(prof.elevator.h, (v) => edit({ elevator: { ...prof.elevator, h: v } }), 10)),
        field('通道宽度 mm', numberInput(prof.walkwayWidth, (v) => edit({ walkwayWidth: v }), 50)),
        field('对铺距离 mm', numberInput(prof.oppositeDistance, (v) => edit({ oppositeDistance: v }), 100)),
      ),
      field('店外站位', selectInput(prof.environment,
        [['mall', '商场内铺'], ['street', '临街店'], ['atrium', '中庭岛柜']] as [string, string][],
        (v) => edit({ environment: v as WindowProfile['environment'] }))),
    );
  }

  private itemEditor(it: LayoutItem): HTMLElement {
    const plan = this.plan!;
    const update = (patch: Partial<LayoutItem>): void => {
      Object.assign(it, patch);
      void this.persist();
      this.drawRightPanel();
    };
    const sizeOf = (x: LayoutItem) => this.itemSize(x);
    const s = sizeOf(it);
    const box = itemAABB(it, s, this.profile!.platformHeight);

    const flagRow = h('div', { class: 'gap8' },
      ...([['main', '主推款'], ['accessory', '配饰'], ['locked', '锁定(不参与自动排)']] as const).map(([f, name]) =>
        h('label', { class: 'switch-row', style: 'flex:1' },
          h('span', { class: 'lab' }, name),
          checkInput(it.flags.includes(f), (on) => {
            const set = new Set(it.flags);
            on ? set.add(f) : set.delete(f);
            update({ flags: [...set] });
          }),
        )),
    );

    const children: HTMLElement[] = [
      h('div', { class: 'grid-2' },
        field('X 坐标 mm', numberInput(it.x, (v) => update({ x: v }), 10)),
        field('Z 坐标 mm', numberInput(it.z, (v) => update({ z: v }), 10)),
        field('旋转角度°', slider(it.rotation, 0, 359, 1, (v) => update({ rotation: v }))),
      ),
      h('label', { class: 'switch-row' },
        h('span', { class: 'lab' }, '水平翻转'),
        checkInput(it.flipped, (on) => update({ flipped: on })),
      ),
      flagRow,
      h('div', { class: 'kv' },
        h('span', { class: 'k' }, '占地尺寸'), h('span', { class: 'v mono' }, `${s.w}×${s.d}mm`),
        h('span', { class: 'k' }, '包围盒 Y'), h('span', { class: 'v mono' },
          `${box.min[1].toFixed(0)} ~ ${box.max[1].toFixed(0)}mm`),
      ),
    ];

    if (it.type === 'prop') {
      const prop = store.propOf(it.refId);
      children.push(h('label', { class: 'switch-row' },
        h('span', { class: 'lab' }, '挂到背板槽位'),
        checkInput(!!it.slotY, (on) => update({ slotY: on ? (this.profile!.slotHeights[0] ?? 600) : undefined })),
      ));
      if (it.slotY !== undefined) {
        children.push(field('槽位高度 mm', selectInput(String(it.slotY),
          this.profile!.slotHeights.map((sh) => [String(sh), `${sh}mm`] as [string, string]),
          (v) => update({ slotY: Number(v) }))));
      }
      if (prop) children.push(h('div', { class: 'kv' },
        h('span', { class: 'k' }, '包装尺寸'), h('span', { class: 'v mono' },
          `${prop.packSize.w}×${prop.packSize.h}×${prop.packSize.d}mm`),
        h('span', { class: 'k' }, '拆装方式'), h('span', { class: 'v' }, packName(prop.packMethod)),
      ));
    }
    if (it.type === 'rail' && it.rail) {
      const cap = railCapacity(s.w, it.rail.spacing);
      children.push(h('div', { class: 'grid-2' },
        field('件间距 mm', numberInput(it.rail.spacing, (v) =>
          update({ rail: { ...it.rail!, spacing: Math.max(40, v) } }), 10)),
        field('挂件数量', numberInput(it.rail.garmentCount, (v) =>
          update({ rail: { ...it.rail!, garmentCount: Math.max(0, v) } }), 1)),
        field('衣物颜色', (() => {
          const ci = document.createElement('input');
          ci.type = 'color'; ci.value = it.rail!.garmentColor;
          ci.addEventListener('input', () => update({ rail: { ...it.rail!, garmentColor: ci.value } }));
          return ci;
        })()),
        field('自动容量', h('span', { class: 'badge badge-accent' }, `可挂 ${cap} 件`)),
      ));
    }
    if (it.type === 'foldTower' && it.tower) {
      children.push(h('div', { class: 'grid-2' },
        field('层数', slider(it.tower.layers, 2, 10, 1, (v) =>
          update({ tower: { ...it.tower!, layers: v } }))),
        field('层高 mm', numberInput(it.tower.layerHeight, (v) =>
          update({ tower: { ...it.tower!, layerHeight: Math.max(60, v) } }), 10)),
      ));
    }
    if (it.type === 'mannequin') {
      const series = store.seriesOf(it.refId);
      children.push(field('朝向偏移°',
        slider(it.mannequins?.facing ?? 0, -180, 180, 5, (v) =>
          update({ mannequins: { facing: v } }))));
      if (series) children.push(h('div', { class: 'kv' },
        h('span', { class: 'k' }, '系列'), h('span', { class: 'v' }, `${series.name}（${series.colorTag}）`),
        h('span', { class: 'k' }, '人数/间距'), h('span', { class: 'v mono' }, `${series.count} 人 · ${series.spacing}mm`),
      ));
    }
    return h('div', { class: 'col' }, ...children);
  }

  private ktSection(): HTMLElement {
    const prof = this.profile!;
    const boardW = prof.width - 120;
    const boardH = prof.height - 200;
    const { slices, cols, rows } = sliceKTPanel(boardW, boardH);
    const grid = h('div', {
      class: 'slice-grid',
      style: `grid-template-columns:repeat(${cols},1fr)`,
    }, ...slices.map((sl) => h('div', { class: 'slice-cell' },
      h('b', {}, `KT-${String(sl.index).padStart(2, '0')}`),
      h('span', {}, `${sl.w}×${sl.h}`),
      h('span', { class: 'muted' }, `第${sl.row}行${sl.col}列`),
    )));
    return h('div', {},
      h('p', { class: 'muted', style: 'margin:0 0 8px;font-size:12px' },
        `背板 ${boardW}×${boardH}mm 按标准 KT 板 1200×2400mm 自动裁切为 ${cols}×${rows}=${slices.length} 块，带编号供门店拼装`),
      grid,
    );
  }

  // ---------------- 场景/数据 ----------------
  private itemSize(it: LayoutItem): { w: number; h: number; d: number } {
    if (it.type === 'prop') {
      const p = store.propOf(it.refId);
      if (p) return p.size;
    }
    if (it.type === 'rail') return { w: 1800, h: 1600, d: 450 };
    if (it.type === 'foldTower') {
      const layers = it.tower?.layers ?? 5;
      const lh = it.tower?.layerHeight ?? 120;
      return { w: 900, h: 400 + layers * lh, d: 700 };
    }
    const series = store.seriesOf(it.refId);
    return { w: (series?.count ?? 1) * (series?.spacing ?? 900), h: 1750, d: 300 };
  }

  private refreshScene(): void {
    if (!this.viewport || !this.plan || !this.profile) return;
    const plan = this.plan;
    const built = buildScene({
      profile: this.profile,
      items: plan.items,
      propOf: store.propOf,
      seriesOf: store.seriesOf,
      selectedId: this.selectedId ?? undefined,
      lightboxPowerOn: plan.env.lightboxPowerOn,
    });
    // 碰撞标红：把异常元素对应实例改成红色描边风格（matKind 5 + 红）
    this.collisions = [
      ...checkCollisions(plan.items, (it) => this.itemSize(it), this.profile),
      ...checkTransport(plan.items, store.propOf, this.profile),
    ];
    const errorItemIds = new Set(this.collisions.map((c) => c.itemId));
    for (const inst of built.instances) {
      const itemId = built.pickMap.get(inst.pickId);
      if (itemId && errorItemIds.has(itemId) && inst.matKind !== 5) {
        // 加一层红色半透明罩：复制实例并改为红色自绘件
        built.instances.push({
          ...inst,
          pickId: 0,
          matKind: 5,
          color: [1.0, 0.25, 0.2],
          alpha: 0.28,
          transparent: true,
          scale: [inst.scale[0] * 1.02, inst.scale[1] * 1.02, inst.scale[2] * 1.02],
        });
      }
    }
    this.issues = checkDisplayRules(plan.items, (it) => this.itemSize(it), this.profile,
      (id) => store.seriesOf(id)?.colorTag);

    const lines = this.showOcclusion
      ? buildOcclusionLines(plan.viewpoints, plan.viewpoints[0], plan.items, built.itemCenters,
        this.profile, (it) => this.itemSize(it))
      : [];
    this.viewport.setScene(built.instances, built.pickMap, lines);
    this.viewport.setEnvFog(plan.env.fogLevel);
  }

  private dragItem(id: string, x: number, z: number): void {
    const it = this.plan?.items.find((i) => i.id === id);
    const prof = this.profile;
    if (!it || !prof) return;
    const s = this.itemSize(it);
    it.x = Math.max(-prof.width / 2 + s.w / 2, Math.min(prof.width / 2 - s.w / 2, x));
    it.z = Math.max(-prof.depth / 2 + s.d / 2, Math.min(prof.depth / 2 - s.d / 2, z));
    this.refreshScene();
  }

  private async persist(): Promise<void> {
    const plan = this.plan;
    if (!plan) return;
    plan.changeLog.unshift({ at: Date.now(), text: '拖动调整陈列位置' });
    if (plan.changeLog.length > 30) plan.changeLog.length = 30;
    await store.savePlan(plan);
  }

  private addProp(prop: Prop): void {
    const plan = this.plan!;
    const item: LayoutItem = {
      id: uid('item'), type: 'prop', refId: prop.id, name: prop.name,
      x: 0, z: -this.profile!.depth / 4, rotation: 0, flipped: false, flags: [],
    };
    plan.items.push(item);
    this.selectedId = item.id;
    void store.savePlan(plan);
  }

  private addMannequin(seriesId: string): void {
    const s = store.seriesOf(seriesId)!;
    const plan = this.plan!;
    const item: LayoutItem = {
      id: uid('item'), type: 'mannequin', refId: s.id, name: s.name,
      x: 0, z: 0, rotation: 0, flipped: false, flags: [],
      mannequins: { facing: 0 },
    };
    plan.items.push(item);
    this.selectedId = item.id;
    void store.savePlan(plan);
  }

  private addRail(): void {
    const plan = this.plan!;
    const item: LayoutItem = {
      id: uid('item'), type: 'rail', refId: '', name: '横杆挂装架',
      x: 0, z: 0, rotation: 0, flipped: false, flags: [],
      rail: { spacing: 120, garmentCount: 10, garmentColor: '#8a6f52' },
    };
    plan.items.push(item);
    this.selectedId = item.id;
    void store.savePlan(plan);
  }

  private addTower(): void {
    const plan = this.plan!;
    const item: LayoutItem = {
      id: uid('item'), type: 'foldTower', refId: '', name: '叠装塔',
      x: 0, z: 0, rotation: 0, flipped: false, flags: [],
      tower: { layers: 5, layerHeight: 120 },
    };
    plan.items.push(item);
    this.selectedId = item.id;
    void store.savePlan(plan);
  }

  private removeItem(id: string): void {
    const plan = this.plan!;
    plan.items = plan.items.filter((i) => i.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    void store.savePlan(plan);
  }

  private applyTpl(t: DisplayTemplate): void {
    const plan = this.plan!;
    if (plan.items.length > 0 && !confirm('套用模板将替换当前陈列，是否继续？')) return;
    plan.items = applyTemplate(t, this.profile!);
    plan.templateId = t.id;
    plan.changeLog.unshift({ at: Date.now(), text: `套用模板「${t.name}」` });
    void store.savePlan(plan);
    toast(`已套用「${t.name}」，可继续微调`, 'ok');
  }

  private saveKit(): void {
    const plan = this.plan!;
    if (plan.items.length === 0) { toast('当前橱窗没有元素', 'error'); return; }
    const nameInput = textInput('我的陈列套件', () => undefined);
    const close = modal('保存自定义套件',
      field('套件名称', nameInput),
      (close) => h('div', { class: 'gap8' },
        btn('取消', () => close(), 'btn-ghost'),
        btn('保存', async () => {
          await store.saveKit({
            id: uid('kit'), name: nameInput.value || '未命名套件',
            tags: plan.tags, items: structuredClone(plan.items), createdAt: Date.now(),
          });
          close(); toast('套件已保存，可在任意方案复用', 'ok');
        }, 'btn-primary'),
      ));
  }

  private applyKit(kit: PropKit): void {
    const plan = this.plan!;
    for (const it of kit.items) {
      plan.items.push({
        ...structuredClone(it), id: uid('item'),
        x: it.x + (Math.random() - 0.5) * 200,
      });
    }
    plan.changeLog.unshift({ at: Date.now(), text: `放入套件「${kit.name}」` });
    void store.savePlan(plan);
  }

  private runAutoLayout(): void {
    const plan = this.plan!;
    const { items, collisions, issues } = autoLayout({
      items: plan.items, source: this.profile!, target: this.profile!,
      propOf: store.propOf, seriesColor: (id) => store.seriesOf(id)?.colorTag,
    });
    plan.items = items;
    void store.savePlan(plan);
    this.collisions = collisions;
    this.issues = issues;
    const errCount = collisions.filter((c) => c.type !== 'overlap').length + issues.filter((i) => i.level === 'error').length;
    toast(errCount ? `自动排版完成，${errCount} 项冲突待处理` : '自动排版完成，无冲突', errCount ? 'error' : 'ok');
  }

  private openBatch(): void {
    const plan = this.plan!;
    if (!plan.isTheme) {
      toast('只有主题正本可以批量挂接门店，可在方案信息中开启主题标记', 'error');
      return;
    }
    const targets = store.profiles.filter((p) => p.id !== plan.windowProfileId);
    if (targets.length === 0) { toast('没有其他门店档案', 'error'); return; }
    const selected = new Set<string>(targets.map((t) => t.id));
    const rows = targets.map((t) => {
      const cb = checkInput(true, (on) => on ? selected.add(t.id) : selected.delete(t.id));
      return h('div', { class: 'prop-row' },
        h('div', {},
          h('div', { class: 'name' }, `${t.storeCode} ${t.storeName}`),
          h('div', { class: 'sub' }, `${t.width}×${t.depth}×${t.height}mm · ${envName(t.environment)}`),
        ),
        cb,
      );
    });
    const close = modal(`批量适配（${targets.length} 家门店）`,
      h('div', {},
        h('p', { class: 'dim' }, '按各店橱窗尺寸自动重排，锁定的主推道具保持原位，超界/冲突门店单列处理'),
        h('div', { class: 'checklist', style: 'max-height:340px' }, ...rows),
      ),
      (close) => h('div', { class: 'gap8' },
        btn('取消', close, 'btn-ghost'),
        btn('开始批量适配', async () => {
          const chosen = targets.filter((t) => selected.has(t.id));
          const { planByStore, results } = batchAdaptTheme({
            theme: plan, sourceProfile: this.profile!, targets: chosen,
            propOf: store.propOf, seriesColor: (id) => store.seriesOf(id)?.colorTag,
          });
          for (const sp of planByStore.values()) await store.savePlan(sp);
          plan.linkedStoreIds = [...(plan.linkedStoreIds ?? []), ...chosen.map((c) => c.id)];
          await store.savePlan(plan);
          close();
          this.showBatchResults(results);
        }, 'btn-primary'),
      ));
  }

  private showBatchResults(results: { profileId: string; storeName: string; ok: boolean; issues: RuleIssue[]; collisions: CollisionResult[] }[]): void {
    const failed = results.filter((r) => !r.ok);
    const body = h('div', {},
      h('p', { class: 'dim' },
        `共适配 ${results.length} 家：成功 ${results.length - failed.length} 家，需人工处理 ${failed.length} 家`),
      h('div', { class: 'checklist', style: 'max-height:420px' },
        ...results.map((r) => h('div', { class: `issue issue-${r.ok ? 'info' : 'error'}` },
          h('span', { class: 'ico' }, r.ok ? '✅' : '🔴'),
          h('div', {},
            h('div', { style: 'font-weight:600;margin-bottom:4px' }, r.storeName),
            ...[...r.collisions, ...r.issues].slice(0, 4).map((x) =>
              h('div', { class: 'muted', style: 'font-size:11px' }, x.message)),
          ),
        )),
      ),
    );
    modal('批量适配结果（锁定道具未参与重排）', body);
  }
}

function catName(c: string): string {
  return ({ acrylic: '亚克力', wood: '木质', kt: 'KT板', lightbox: '灯箱', chrome: '镀铬', velvet: '绒布', fabric: '织物' } as Record<string, string>)[c] ?? c;
}
function packName(p: string): string {
  return ({ integral: '整件运输', foldable: '可折叠', detachable: '可拆卸', flat: '扁平打包' } as Record<string, string>)[p] ?? p;
}
function typeIcon(t: string): string {
  return ({ prop: '📦', mannequin: '🧍', rail: '🥋', foldTower: '👕' } as Record<string, string>)[t] ?? '•';
}
function envName(e: string): string {
  return ({ mall: '商场内铺', street: '临街店', atrium: '中庭岛柜' } as Record<string, string>)[e] ?? e;
}
