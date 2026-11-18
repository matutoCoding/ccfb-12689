// 页面三：物料库管理
import { store } from '../../data/store';
import {
  badge, btn, checkInput, clear, confirmDialog, emptyState, field, h, modal, numberInput,
  selectInput, textInput, toast,
} from '../dom';
import type { MaterialCategory, PackMethod, Prop } from '../../types';
import { uid } from '../../engine/math';

const CATS: [MaterialCategory, string][] = [
  ['acrylic', '亚克力'], ['wood', '木质'], ['kt', 'KT板'], ['lightbox', '灯箱'],
  ['chrome', '镀铬'], ['velvet', '绒布'], ['fabric', '织物'],
];
const PACKS: [PackMethod, string][] = [
  ['integral', '整件运输'], ['foldable', '可折叠'], ['detachable', '可拆卸'], ['flat', '扁平打包'],
];

export class LibraryPage {
  private root: HTMLElement;
  private filterCat: MaterialCategory | '' = '';
  private keyword = '';
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
    const props = store.props.filter((p) =>
      (!this.filterCat || p.category === this.filterCat) &&
      (!this.keyword || `${p.name}${p.tags.join()}`.includes(this.keyword)));

    this.root.append(
      h('div', { class: 'page-head' },
        h('div', {},
          h('h1', {}, '📦 物料库'),
          h('p', {}, '每件道具带真实尺寸、体量、材质与折叠拆装方式，支持翻转、叠放与背板槽位挂载'),
        ),
        h('div', { class: 'page-actions' },
          btn('＋ 新建道具', () => this.editor(), 'btn-primary'),
          btn('管理模特系列', () => this.seriesEditor()),
          btn('管理自定义套件', () => this.kitEditor()),
        ),
      ),
      h('div', { class: 'panel' },
        h('div', { class: 'toolbar' },
          field('搜索名称/标签', textInput(this.keyword, (v) => { this.keyword = v; this.draw(); })),
          field('材质分类', selectInput(this.filterCat,
            [['', '全部'], ...CATS.map(([v, n]) => [v, n] as [string, string])],
            (v) => { this.filterCat = v as MaterialCategory | ''; this.draw(); })),
          h('span', { class: 'badge badge-accent' }, `命中 ${props.length} 件`),
        ),
      ),
      props.length === 0 ? emptyState('物料库为空，点击「新建道具」录入') : h('div', { class: 'cards' },
        ...props.map((p) => this.propCard(p))),
    );
  }

  private propCard(p: Prop): HTMLElement {
    return h('div', { class: 'card' },
      h('div', { class: 'card-title' },
        h('span', {}, p.name),
        badge(catName(p.category), catBadge(p.category)),
      ),
      h('div', { class: 'card-meta' },
        h('span', { class: 'mono' }, `真实尺寸 ${p.size.w}×${p.size.h}×${p.size.d}mm`),
        h('span', {}, `体量 ${'■'.repeat(p.volume)}${'□'.repeat(5 - p.volume)} · ${p.weight}kg`),
        h('span', {}, `包装 ${p.packSize.w}×${p.packSize.h}×${p.packSize.d}mm · ${packName(p.packMethod)}`),
        h('span', {}, `粗糙度 ${p.material.roughness} · 透明度 ${p.material.opacity ?? 1}`),
        p.slotMountable ? badge('可挂背板槽位', 'badge-purple') : '',
      ),
      h('div', { class: 'tag-row' }, ...p.tags.map((t) => badge(t))),
      h('div', { class: 'card-actions' },
        btn('编辑', () => this.editor(p), 'btn-sm'),
        btn('复制', async () => {
          const copy = structuredClone(p);
          copy.id = uid('prop');
          copy.name = p.name + ' 副本';
          copy.createdAt = Date.now();
          await store.saveProp(copy);
          toast('已复制道具', 'ok');
        }, 'btn-sm'),
        btn('删除', async () => {
          if (await confirmDialog(`删除道具「${p.name}」？已陈列的方案会保留引用但无法渲染该道具。`)) {
            await store.deleteProp(p.id);
            toast('已删除');
          }
        }, 'btn-sm btn-danger'),
      ),
    );
  }

  private editor(existing?: Prop): void {
    const draft: Prop = existing ? structuredClone(existing) : {
      id: uid('prop'),
      name: '新道具',
      category: 'acrylic',
      size: { w: 600, h: 600, d: 400 },
      volume: 2,
      material: { category: 'acrylic', color: [0.8, 0.85, 0.9], roughness: 0.4, opacity: 1 },
      packMethod: 'integral',
      packSize: { w: 650, h: 650, d: 450 },
      weight: 8,
      slotMountable: false,
      tags: [],
      createdAt: Date.now(),
    };
    const tagBox = textInput(draft.tags.join(','), () => undefined);
    const colorHex = rgbToHex(draft.material.color);
    const colorInput = (() => {
      const ci = document.createElement('input');
      ci.type = 'color'; ci.value = colorHex;
      ci.addEventListener('input', () => { draft.material.color = hexToRgb(ci.value); });
      return ci;
    })();

    const body = h('div', { class: 'col' },
      field('道具名称', textInput(draft.name, (v) => (draft.name = v))),
      h('div', { class: 'grid-3' },
        field('材质分类', selectInput(draft.category,
          CATS.map(([v, n]) => [v, n] as [string, string]),
          (v) => { draft.category = v as MaterialCategory; draft.material.category = draft.category; })),
        field('拆装方式', selectInput(draft.packMethod,
          PACKS.map(([v, n]) => [v, n] as [string, string]),
          (v) => (draft.packMethod = v as PackMethod))),
        field('体量 1~5', numberInput(draft.volume, (v) => (draft.volume = Math.min(5, Math.max(1, v))), 1)),
      ),
      h('h4', { style: 'margin:6px 0 0;font-size:13px' }, '真实尺寸 mm'),
      h('div', { class: 'grid-3' },
        field('宽 W', numberInput(draft.size.w, (v) => (draft.size.w = v), 10)),
        field('高 H', numberInput(draft.size.h, (v) => (draft.size.h = v), 10)),
        field('深 D', numberInput(draft.size.d, (v) => (draft.size.d = v), 10)),
      ),
      h('h4', { style: 'margin:6px 0 0;font-size:13px' }, '整箱包装尺寸 mm'),
      h('div', { class: 'grid-4' },
        field('包装宽', numberInput(draft.packSize.w, (v) => (draft.packSize.w = v), 10)),
        field('包装高', numberInput(draft.packSize.h, (v) => (draft.packSize.h = v), 10)),
        field('包装厚', numberInput(draft.packSize.d, (v) => (draft.packSize.d = v), 10)),
        field('重量 kg', numberInput(draft.weight, (v) => (draft.weight = v), 0.5)),
      ),
      h('h4', { style: 'margin:6px 0 0;font-size:13px' }, '材质渲染参数'),
      h('div', { class: 'grid-3' },
        field('基色', colorInput),
        field(`粗糙度 ${draft.material.roughness}`,
          (() => {
            const s = document.createElement('input');
            s.type = 'range'; s.min = '0.02'; s.max = '1'; s.step = '0.02'; s.value = String(draft.material.roughness);
            s.addEventListener('input', () => { draft.material.roughness = Number(s.value); });
            return s;
          })()),
        field(`不透明度 ${draft.material.opacity ?? 1}`,
          (() => {
            const s = document.createElement('input');
            s.type = 'range'; s.min = '0.1'; s.max = '1'; s.step = '0.05';
            s.value = String(draft.material.opacity ?? 1);
            s.addEventListener('input', () => { draft.material.opacity = Number(s.value); });
            return s;
          })()),
      ),
      h('div', { class: 'grid-2' },
        h('label', { class: 'switch-row' },
          h('span', { class: 'lab' }, '木纹纹理（拼接缝）'),
          checkInput(!!draft.material.texture?.woodGrain, (on) => {
            draft.material.texture = { ...draft.material.texture, woodGrain: on };
          })),
        h('label', { class: 'switch-row' },
          h('span', { class: 'lab' }, '绒布材质（掠射角绒感）'),
          checkInput(!!draft.material.texture?.velvet, (on) => {
            draft.material.texture = { ...draft.material.texture, velvet: on };
          })),
        h('label', { class: 'switch-row' },
          h('span', { class: 'lab' }, '织物纹理'),
          checkInput(!!draft.material.texture?.fabric, (on) => {
            draft.material.texture = { ...draft.material.texture, fabric: on };
          })),
        h('label', { class: 'switch-row' },
          h('span', { class: 'lab' }, '可挂背板槽位'),
          checkInput(draft.slotMountable, (on) => (draft.slotMountable = on))),
      ),
      field('标签（逗号分隔）', tagBox),
    );
    const close = modal(existing ? '编辑道具' : '新建道具', body,
      (close) => h('div', { class: 'gap8' },
        btn('取消', close, 'btn-ghost'),
        btn('保存', async () => {
          draft.tags = tagBox.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
          await store.saveProp(draft);
          close(); toast('道具已保存', 'ok');
        }, 'btn-primary'),
      ));
  }

  private seriesEditor(): void {
    const body = h('div', { class: 'col' },
      ...store.series.map((s) => h('div', { class: 'prop-row' },
        h('div', {},
          h('div', { class: 'name' }, `${s.name}（${s.colorTag}）`),
          h('div', { class: 'sub mono' }, `${s.count} 人 · 间距 ${s.spacing}mm`),
        ),
        h('div', { class: 'gap8' },
          btn('编辑', () => this.seriesForm(s.id), 'btn-sm'),
          btn('删除', async () => { await store.deleteSeries(s.id); }, 'btn-sm btn-danger'),
        ),
      )),
      btn('＋ 新建模特系列', () => this.seriesForm(), 'btn-sm'),
    );
    modal('模特系列管理', body);
  }

  private seriesForm(id?: string): void {
    const existing = store.series.find((s) => s.id === id);
    const draft: import('../../types').MannequinSeries = existing ? structuredClone(existing) : {
      id: uid('series'), name: '新系列', colorTag: '驼色', color: '#b08968',
      count: 3, spacing: 900, createdAt: Date.now(),
    };
    const colorInput = (() => {
      const ci = document.createElement('input');
      ci.type = 'color'; ci.value = draft.color;
      ci.addEventListener('input', () => (draft.color = ci.value));
      return ci;
    })();
    const close = modal(existing ? '编辑模特系列' : '新建模特系列',
      h('div', { class: 'col' },
        field('系列名称', textInput(draft.name, (v) => (draft.name = v))),
        h('div', { class: 'grid-3' },
          field('色系标签', textInput(draft.colorTag, (v) => (draft.colorTag = v))),
          field('系列色', colorInput),
          field('人数', numberInput(draft.count, (v) => (draft.count = Math.max(1, v)), 1)),
        ),
        field('站位间距 mm', numberInput(draft.spacing, (v) => (draft.spacing = v), 50)),
      ),
      (close) => h('div', { class: 'gap8' },
        btn('取消', close, 'btn-ghost'),
        btn('保存', async () => { await store.saveSeries(draft); close(); toast('已保存', 'ok'); }, 'btn-primary'),
      ));
  }

  private kitEditor(): void {
    const body = h('div', { class: 'col' },
      store.kits.length === 0 ? emptyState('还没有自定义套件，可在橱窗配置页把陈列存为套件') : '',
      ...store.kits.map((k) => h('div', { class: 'prop-row' },
        h('div', {}, h('div', { class: 'name' }, k.name), h('div', { class: 'sub' }, `${k.items.length} 件元素`)),
        btn('删除', async () => { await store.deleteKit(k.id); toast('已删除'); }, 'btn-sm btn-danger'),
      )),
    );
    modal('自定义套件', body);
  }
}

function catName(c: string): string {
  return ({ acrylic: '亚克力', wood: '木质', kt: 'KT板', lightbox: '灯箱', chrome: '镀铬', velvet: '绒布', fabric: '织物' } as Record<string, string>)[c];
}
function catBadge(c: string): string {
  return ({ acrylic: 'badge', wood: 'badge-warn', kt: 'badge-purple', lightbox: 'badge-accent', chrome: 'badge-ok', velvet: 'badge-danger', fabric: 'badge' } as Record<string, string>)[c];
}
function packName(p: string): string {
  return ({ integral: '整件运输', foldable: '可折叠', detachable: '可拆卸', flat: '扁平打包' } as Record<string, string>)[p];
}
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}
function rgbToHex(rgb: [number, number, number]): string {
  const q = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${q(rgb[0])}${q(rgb[1])}${q(rgb[2])}`;
}
