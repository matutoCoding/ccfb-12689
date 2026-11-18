// 页面一：方案管理
import { store } from '../../data/store';
import { navigate } from '../shell';
import {
  badge, btn, clear, confirmDialog, emptyState, field, fmtDate, h, modal,
  numberInput, selectInput, textInput, toast,
} from '../dom';
import type { DisplayPlan } from '../../types';
import { uid } from '../../engine/math';

export class PlansPage {
  private root: HTMLElement;
  private filters = { brand: '', season: '', festival: '', tag: '', minW: 0, maxW: 0, keyword: '' };
  private unsub: (() => void) | null = null;

  constructor(root: HTMLElement) { this.root = root; }

  render(): this {
    this.draw();
    this.unsub = store.subscribe(() => this.draw());
    return this;
  }

  destroy(): void { this.unsub?.(); }

  private draw(): void {
    clear(this.root);
    const plans = store.activePlans;
    const brands = [...new Set(plans.map((p) => p.brand).filter(Boolean))];
    const seasons = ['春', '夏', '秋', '冬'];
    const festivals = [...new Set(plans.map((p) => p.festival).filter(Boolean))];
    const allTags = [...new Set(plans.flatMap((p) => p.tags))];

    const filtered = plans.filter((p) => {
      const profile = store.profileOf(p.windowProfileId);
      const w = profile?.width ?? 0;
      if (this.filters.brand && p.brand !== this.filters.brand) return false;
      if (this.filters.season && p.season !== this.filters.season) return false;
      if (this.filters.festival && p.festival !== this.filters.festival) return false;
      if (this.filters.tag && !p.tags.includes(this.filters.tag)) return false;
      if (this.filters.minW && w < this.filters.minW) return false;
      if (this.filters.maxW && w > this.filters.maxW) return false;
      if (this.filters.keyword && !`${p.name}${p.brand}`.includes(this.filters.keyword)) return false;
      return true;
    });

    this.root.append(
      h('div', { class: 'page-head' },
        h('div', {},
          h('h1', {}, '方案管理'),
          h('p', {}, `共 ${plans.length} 套方案 · 按品牌/季节/档期与橱窗尺寸检索，复制后改稿，删除进回收站保留 30 天`),
        ),
        h('div', { class: 'page-actions' },
          btn('♻ 回收站', () => this.openRecycleBin()),
          btn('＋ 新建方案', () => this.openEditor(), 'btn-primary'),
        ),
      ),
      h('div', { class: 'panel' },
        h('div', { class: 'toolbar' },
          field('关键字', textInput(this.filters.keyword, (v) => { this.filters.keyword = v; this.draw(); })),
          field('品牌', selectInput(this.filters.brand, [['', '全部'], ...brands.map((b) => [b, b] as [string, string])],
            (v) => { this.filters.brand = v; this.draw(); })),
          field('季节', selectInput(this.filters.season, [['', '全部'], ...seasons.map((s) => [s, s] as [string, string])],
            (v) => { this.filters.season = v; this.draw(); })),
          field('档期', selectInput(this.filters.festival, [['', '全部'], ...festivals.map((s) => [s, s] as [string, string])],
            (v) => { this.filters.festival = v; this.draw(); })),
          field('标签', selectInput(this.filters.tag, [['', '全部'], ...allTags.map((s) => [s, s] as [string, string])],
            (v) => { this.filters.tag = v; this.draw(); })),
          field('开间 ≥ mm', numberInput(this.filters.minW, (v) => { this.filters.minW = v; this.draw(); }, 100)),
          field('开间 ≤ mm', numberInput(this.filters.maxW, (v) => { this.filters.maxW = v; this.draw(); }, 100)),
          btn('重置', () => {
            this.filters = { brand: '', season: '', festival: '', tag: '', minW: 0, maxW: 0, keyword: '' };
            this.draw();
          }, 'btn-ghost'),
        ),
      ),
      filtered.length === 0
        ? emptyState('没有匹配的方案，点击右上角「新建方案」开始设计')
        : h('div', { class: 'cards' }, ...filtered.map((p) => this.planCard(p))),
    );
  }

  private planCard(p: DisplayPlan): HTMLElement {
    const profile = store.profileOf(p.windowProfileId);
    return h('div', { class: 'card' },
      h('div', { class: 'card-title' },
        h('span', {}, p.name),
        p.status === 'confirmed' ? badge('已确认', 'badge-ok') : badge('草稿'),
      ),
      h('div', { class: 'card-meta' },
        h('span', {}, `${p.brand} · ${p.season}季 · ${p.festival}`),
        h('span', {}, profile
          ? `橱窗：${profile.storeCode} ${profile.storeName}（${profile.width}×${profile.depth}×${profile.height}mm）`
          : '未绑定橱窗档案'),
        h('span', {}, `元素 ${p.items.length} 件 · 视点 ${p.viewpoints.length} 个 · v${p.version}`),
        h('span', { class: 'muted' }, `更新于 ${fmtDate(p.updatedAt)}`),
      ),
      h('div', { class: 'tag-row' }, ...p.tags.map((t) => badge(t))),
      h('div', { class: 'card-actions' },
        btn('打开设计', () => { store.currentPlanId = p.id; navigate({ page: 'window', planId: p.id }); }, 'btn-sm btn-primary'),
        btn('复制副本', async () => {
          const c = await store.duplicatePlan(p.id);
          if (c) toast(`已创建「${c.name}」`, 'ok');
        }, 'btn-sm'),
        btn('删除', async () => {
          if (await confirmDialog(`确认把「${p.name}」放入回收站？30 天内可恢复。`)) {
            await store.softDeletePlan(p.id);
            toast('已移入回收站');
          }
        }, 'btn-sm btn-danger'),
      ),
    );
  }

  private openEditor(existing?: DisplayPlan): void {
    if (store.profiles.length === 0) {
      toast('请先在橱窗配置中建立门店档案', 'error');
      return;
    }
    const draft: DisplayPlan = existing ?? {
      id: uid('plan'),
      name: '未命名方案',
      brand: '主品牌',
      season: ['春', '夏', '秋', '冬'][new Date().getMonth() % 4],
      festival: '常规',
      tags: [],
      windowProfileId: store.profiles[0].id,
      items: [],
      viewpoints: [],
      env: { fogLevel: 0, reflectionOn: true, lightboxPowerOn: true, ambient: 0.55 },
      status: 'draft',
      changeLog: [{ at: Date.now(), text: '创建方案' }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    };
    const tagInput = textInput(draft.tags.join(','), () => undefined);
    const body = h('div', { class: 'col' },
      field('方案名称', textInput(draft.name, (v) => (draft.name = v))),
      h('div', { class: 'grid-3' },
        field('品牌', textInput(draft.brand, (v) => (draft.brand = v))),
        field('季节', selectInput(draft.season,
          [['春', '春'], ['夏', '夏'], ['秋', '秋'], ['冬', '冬']] as [string, string][],
          (v) => (draft.season = v))),
        field('档期', textInput(draft.festival, (v) => (draft.festival = v))),
      ),
      field('绑定橱窗档案', selectInput(draft.windowProfileId,
        store.profiles.map((p) => [p.id, `${p.storeCode} ${p.storeName}（${p.width}mm）`] as [string, string]),
        (v) => (draft.windowProfileId = v))),
      field('标签（逗号分隔）', tagInput),
      h('label', { class: 'switch-row' },
        h('span', { class: 'lab' }, '作为主题正本（可批量挂接门店联动更新）'),
        (() => {
          const c = document.createElement('input');
          c.type = 'checkbox'; c.checked = !!draft.isTheme;
          c.addEventListener('change', () => (draft.isTheme = c.checked));
          return c;
        })(),
      ),
    );
    const close = modal(existing ? '编辑方案信息' : '新建方案', body,
      (close) => h('div', { class: 'gap8' },
        btn('取消', close, 'btn-ghost'),
        btn('保存并进入设计', async () => {
          draft.tags = tagInput.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
          await store.savePlan(draft);
          store.currentPlanId = draft.id;
          close();
          toast('方案已保存', 'ok');
          navigate({ page: 'window', planId: draft.id });
        }, 'btn-primary'),
      ));
  }

  private openRecycleBin(): void {
    const list = store.recycledPlans;
    const body = h('div', {},
      list.length === 0 ? emptyState('回收站为空') : h('div', { class: 'col' },
        ...list.map((p) => h('div', { class: 'prop-row' },
          h('div', {},
            h('div', { class: 'name' }, p.name),
            h('div', { class: 'sub' },
              `删除于 ${fmtDate(p.deletedAt!)} · 到期 ${fmtDate(p.deletedAt! + 30 * 86400000)}`),
          ),
          h('div', { class: 'gap8' },
            btn('恢复', async () => { await store.restorePlan(p.id); toast('已恢复', 'ok'); this.openRecycleBin(); }, 'btn-sm'),
            btn('彻底删除', async () => {
              if (await confirmDialog(`彻底删除「${p.name}」？不可恢复`)) {
                await store.hardDeletePlan(p.id);
                this.openRecycleBin();
              }
            }, 'btn-sm btn-danger'),
          ),
        )),
      ),
    );
    modal('回收站（保留 30 天）', body);
  }
}
