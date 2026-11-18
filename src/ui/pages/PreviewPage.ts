// 页面四：陈列预览（环境/行人视点/遮挡/截图/教学）
import { store } from '../../data/store';
import { Viewport } from '../Viewport';
import { navigate } from '../shell';
import {
  badge, btn, checkInput, clear, emptyState, field, h, modal, slider, toast,
} from '../dom';
import { buildScene, buildOcclusionLines } from '../../core/scene';
import { scoreTeaching } from '../../core/layout';
import type { TeachingScore, Viewpoint } from '../../types';
import { uid } from '../../engine/math';

const EYE_HEIGHTS = { adult: 1550, child: 1100 };

export class PreviewPage {
  private root: HTMLElement;
  private planId: string;
  private viewport: Viewport | null = null;
  private activeVpId: string | null = null;
  private unsub: (() => void) | null = null;
  private showOcclusion = true;

  constructor(root: HTMLElement, planId: string) {
    this.root = root;
    this.planId = planId;
  }

  private get plan() { return store.plans.find((p) => p.id === this.planId); }
  private get profile() {
    const p = this.plan;
    return p ? store.profileOf(p.windowProfileId) : undefined;
  }

  render(): this {
    if (!this.plan) {
      this.root.append(emptyState('方案不存在'), btn('返回', () => navigate({ page: 'plans' })));
      return this;
    }
    this.draw();
    this.unsub = store.subscribe(() => this.refresh());
    return this;
  }

  destroy(): void {
    this.unsub?.();
    this.viewport?.dispose();
  }

  private draw(): void {
    clear(this.root);
    const plan = this.plan!;
    this.viewport = new Viewport({
      onFps: (fps, ms) => {
        const chips = this.root.querySelectorAll('.vp-hud .chip');
        if (chips.length >= 2) {
          chips[0].innerHTML = `FPS <b>${fps.toFixed(0)}</b>`;
          chips[1].innerHTML = `${ms.toFixed(1)}ms`;
        }
      },
    });
    this.viewport.el.append(
      h('div', { class: 'vp-hud' },
        h('span', { class: 'chip' }, 'FPS '),
        h('span', { class: 'chip' }, '帧耗时 '),
      ),
      h('div', { class: 'vp-tools' },
        btn('正视图', () => this.viewport?.presetCamera('front'), 'btn-sm'),
        btn('侧视图', () => this.viewport?.presetCamera('side'), 'btn-sm'),
        btn('俯视图', () => this.viewport?.presetCamera('top'), 'btn-sm'),
      ),
    );

    this.root.append(
      h('div', { class: 'page-head' },
        h('div', {},
          h('h1', {}, `🎬 ${plan.name} · 陈列预览`),
          h('p', {}, '模拟顾客在通道中的真实视角，验证主推款是否被挡、玻璃发花与对面招牌反光的干扰'),
        ),
        h('div', { class: 'page-actions' },
          btn('返回配置', () => navigate({ page: 'window', planId: this.planId })),
          btn('导出带标注截图', () => this.exportShot(), 'btn-primary'),
        ),
      ),
      h('div', { class: 'workbench wide' }, this.envPanel(), this.viewport.el, this.viewpointPanel()),
    );
    this.refresh();
  }

  // 左：店外环境
  private envPanel(): HTMLElement {
    const plan = this.plan!;
    const prof = this.profile!;
    const env = plan.env;
    const update = (patch: Partial<typeof env>): void => {
      Object.assign(env, patch);
      void store.savePlan(plan);
      this.refresh();
    };

    return h('div', { class: 'side-panel' },
      h('div', { class: 'section' },
        h('h4', {}, '店外环境（来自门店档案）'),
        h('div', { class: 'kv' },
          h('span', { class: 'k' }, '站位类型'), h('span', { class: 'v' }, envText(prof.environment)),
          h('span', { class: 'k' }, '门前通道'), h('span', { class: 'v mono' }, `${prof.walkwayWidth}mm`),
          h('span', { class: 'k' }, '对铺距离'), h('span', { class: 'v mono' }, `${prof.oppositeDistance}mm`),
        ),
      ),
      h('div', { class: 'section' },
        h('h4', {}, '玻璃与光照'),
        h('label', { class: 'switch-row' },
          h('span', { class: 'lab' }, '对面灯箱招牌反光'),
          checkInput(env.reflectionOn, (on) => update({ reflectionOn: on })),
        ),
        h('label', { class: 'switch-row' },
          h('span', { class: 'lab' }, '灯箱通电（关闭=断电发灰）'),
          checkInput(env.lightboxPowerOn, (on) => update({ lightboxPowerOn: on })),
        ),
        field(`玻璃起雾/沾灰发花：${(env.fogLevel * 100).toFixed(0)}%`,
          slider(env.fogLevel, 0, 1, 0.05, (v) => update({ fogLevel: v }))),
        field(`环境光强度：${env.ambient.toFixed(2)}`,
          slider(env.ambient, 0.2, 1, 0.05, (v) => update({ ambient: v }))),
      ),
      h('div', { class: 'section' },
        h('h4', {}, '教学模式'),
        h('p', { class: 'muted', style: 'font-size:12px' },
          '系统按内置目标陈列（主推焦点/色彩节奏/疏密）给学员打分并指出差距'),
        btn('开始评分', () => this.teach(), 'btn-sm'),
      ),
      h('div', { class: 'section' },
        h('h4', {}, '主题联动'),
        plan.themeSourceId
          ? h('p', { class: 'dim', style: 'font-size:12px' }, '本方案挂接自主题，主题正本改动会联动更新并记录')
          : h('p', { class: 'muted', style: 'font-size:12px' }, '当前为独立方案/主题正本'),
      ),
    );
  }

  // 右：行人视点/机位书签
  private viewpointPanel(): HTMLElement {
    const panel = h('div', { class: 'side-panel', id: 'vp-panel' });
    const plan = this.plan!;
    const prof = this.profile!;

    const makeVp = (kind: 'adult' | 'child', xRatio: number): void => {
      const x = xRatio * prof.width * 0.35;
      const vp: Viewpoint = {
        id: uid('vp'),
        name: `${kind === 'adult' ? '成人' : '儿童'}视点 ${plan.viewpoints.length + 1}`,
        eyeHeight: EYE_HEIGHTS[kind],
        x,
        distance: Math.min(1500, prof.walkwayWidth * 0.6),
        target: { x: 0, y: 1300, z: 0 },
      };
      plan.viewpoints.push(vp);
      this.activeVpId = vp.id;
      void store.savePlan(plan);
      this.jump(vp);
    };

    const list = h('div', { class: 'checklist' },
      ...plan.viewpoints.map((vp) => h('div', {
        class: `prop-row ${vp.id === this.activeVpId ? 'active' : ''}`,
        onClick: () => { this.activeVpId = vp.id; this.jump(vp); },
      },
        h('div', {},
          h('div', { class: 'name' }, `📍 ${vp.name}`),
          h('div', { class: 'sub' },
            `眼高 ${vp.eyeHeight}mm · 站位 x:${vp.x.toFixed(0)} 距玻璃 ${vp.distance}mm`),
        ),
        h('span', { class: 'meta', style: 'color:var(--danger);cursor:pointer',
          onClick: (e) => {
            e.stopPropagation();
            plan.viewpoints = plan.viewpoints.filter((v) => v.id !== vp.id);
            void store.savePlan(plan);
          } }, '删'),
      )),
    );

    panel.append(
      h('div', { class: 'section' },
        h('h4', {}, '行人视点机位书签'),
        h('p', { class: 'muted', style: 'font-size:12px' },
          `成人眼高 ${EYE_HEIGHTS.adult}mm / 儿童眼高 ${EYE_HEIGHTS.child}mm，从通道关键位置看橱窗`),
        h('div', { class: 'gap8', style: 'margin-bottom:10px' },
          btn('＋成人视点（左）', () => makeVp('adult', -1), 'btn-sm'),
          btn('＋成人视点（中）', () => makeVp('adult', 0), 'btn-sm'),
          btn('＋儿童视点', () => makeVp('child', 0), 'btn-sm'),
        ),
        list,
      ),
      h('div', { class: 'section' },
        h('h4', {}, '视线遮挡分析'),
        h('label', { class: 'switch-row' },
          h('span', { class: 'lab' }, '显示主推款遮挡线'),
          checkInput(this.showOcclusion, (on) => { this.showOcclusion = on; this.refresh(); }),
        ),
        h('p', { class: 'muted', style: 'font-size:12px' },
          '红线为行人→主推款视线；被中间道具挡住时，主推中心出现红色十字警示'),
      ),
    );
    return panel;
  }

  private jump(vp: Viewpoint): void {
    const prof = this.profile!;
    this.viewport?.jumpViewpoint(vp, prof.depth);
    this.refresh();
  }

  private refresh(): void {
    if (!this.viewport || !this.plan || !this.profile) return;
    const plan = this.plan;
    const built = buildScene({
      profile: this.profile,
      items: plan.items,
      propOf: store.propOf,
      seriesOf: store.seriesOf,
      lightboxPowerOn: plan.env.lightboxPowerOn,
    });
    const active = plan.viewpoints.find((v) => v.id === this.activeVpId);
    const lines = this.showOcclusion
      ? buildOcclusionLines(plan.viewpoints, active, plan.items, built.itemCenters,
        this.profile, (it) => this.sizeOf(it))
      : [];
    this.viewport.setScene(built.instances, built.pickMap, lines);
    this.viewport.renderer.setEnv({
      fog: plan.env.fogLevel,
      signboard: plan.env.reflectionOn,
      ambient: plan.env.ambient,
    });
  }

  private sizeOf(it: { type: string } & { id?: string }): { w: number; h: number; d: number } {
    if (it.type === 'prop') {
      const p = store.props.find((x) => x.id === (it as { refId?: string }).refId);
      if (p) return p.size;
    }
    if (it.type === 'rail') return { w: 1800, h: 1600, d: 450 };
    if (it.type === 'foldTower') return { w: 900, h: 1200, d: 700 };
    return { w: 1000, h: 1750, d: 300 };
  }

  private exportShot(): void {
    if (!this.viewport) return;
    const dataUrl = this.viewport.screenshot();
    const plan = this.plan!;
    const prof = this.profile!;
    const body = h('div', {},
      h('p', { class: 'dim' }, '截图已叠加橱窗实测尺寸，可直接发门店作安装参照'),
      h('img', { class: 'shot', src: dataUrl, alt: '截图' }) as HTMLImageElement,
      h('div', { class: 'kv', style: 'margin-top:12px' },
        h('span', { class: 'k' }, '橱窗尺寸'), h('span', { class: 'v mono' },
          `${prof.width}(开间)×${prof.depth}(进深)×${prof.height}(净高)mm`),
        h('span', { class: 'k' }, '地台/门洞'), h('span', { class: 'v mono' },
          `地台 ${prof.platformHeight}mm · 门洞 ${prof.door.w}×${prof.door.h}mm`),
        h('span', { class: 'k' }, '方案版本'), h('span', { class: 'v' }, `v${plan.version} · ${plan.name}`),
      ),
    );
    const close = modal('带尺寸标注截图', body,
      (close) => h('div', { class: 'gap8' },
        btn('关闭', close, 'btn-ghost'),
        btn('下载 PNG', () => {
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = `${plan.name}-陈列截图.png`;
          a.click();
          toast('截图已下载', 'ok');
        }, 'btn-primary'),
      ));
  }

  private teach(): void {
    const plan = this.plan!;
    const score = scoreTeaching(plan.items, this.profile!);
    const body = h('div', {},
      h('div', { class: 'score-ring', style: `--s:${score.total}` }, h('div', {}, String(score.total))),
      h('div', { class: 'score-bars' },
        scoreBar('主推款焦点位置', score.focus, 40),
        scoreBar('色彩节奏', score.colorRhythm, 30),
        scoreBar('道具疏密搭配', score.density, 30),
      ),
      h('div', { style: 'margin-top:16px' },
        h('h4', {}, '点评'),
        ...score.comments.map((c) => h('div', { class: 'issue issue-info' }, h('span', {}, '•'), h('span', {}, c))),
      ),
    );
    modal('教学模式评分（对照目标陈列照片）', body);
  }
}

function scoreBar(label: string, value: number, max: number): HTMLElement {
  return h('div', { class: 'score-bar' },
    h('div', { class: 'lab' }, h('span', {}, label), h('span', { class: 'mono' }, `${value}/${max}`)),
    h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${(value / max) * 100}%` })),
  );
}

function envText(e: string): string {
  return ({ mall: '商场内铺', street: '临街店', atrium: '中庭岛柜' } as Record<string, string>)[e] ?? e;
}
