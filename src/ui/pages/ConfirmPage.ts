// 页面五：方案确认（确认书生成/签字/导出）
import { store } from '../../data/store';
import { Viewport } from '../Viewport';
import { navigate } from '../shell';
import {
  badge, btn, clear, emptyState, field, h, modal, textInput, toast,
} from '../dom';
import { buildScene } from '../../core/scene';
import { computePackages, estimateInstall, sliceKTPanel } from '../../core/rules';
import type { ConfirmationDoc } from '../../types';
import { uid } from '../../engine/math';

export class ConfirmPage {
  private root: HTMLElement;
  private planId: string;
  private viewport: Viewport | null = null;
  private unsub: (() => void) | null = null;

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
    this.unsub = store.subscribe(() => this.draw());
    return this;
  }

  destroy(): void {
    this.unsub?.();
    this.viewport?.dispose();
  }

  private draw(): void {
    clear(this.root);
    const plan = this.plan!;
    const prof = this.profile!;
    const packages = computePackages(plan.items, store.propOf);
    const totalVolume = packages.reduce((s, e) => s + e.volume, 0);
    const totalBoxes = packages.reduce((s, e) => s + e.boxes, 0);
    const totalWeight = packages.reduce((s, e) => s + e.weight, 0);
    const panels = sliceKTPanel(prof.width - 120, prof.height - 200).slices;
    const hours = estimateInstall(packages, panels.length);

    this.viewport = new Viewport({});
    this.viewport.el.style.height = '360px';
    const built = buildScene({
      profile: prof, items: plan.items, propOf: store.propOf,
      seriesOf: store.seriesOf, lightboxPowerOn: plan.env.lightboxPowerOn,
    });
    this.viewport.setScene(built.instances, built.pickMap, []);
    this.viewport.renderer.setEnv({ fog: plan.env.fogLevel, signboard: plan.env.reflectionOn, ambient: plan.env.ambient });

    this.root.append(
      h('div', { class: 'page-head' },
        h('div', {},
          h('h1', {}, `✅ ${plan.name} · 方案确认`),
          h('p', {}, '生成含三视图、KT 分块拼装图、整箱包装用量与安装工时的确认书，客户签字后存档'),
        ),
        h('div', { class: 'page-actions' },
          btn('返回预览', () => navigate({ page: 'preview', planId: this.planId })),
          btn('生成确认书', () => this.generate(), 'btn-primary'),
        ),
      ),
      h('div', { class: 'grid-2' },
        h('div', { class: 'panel' },
          h('h3', {}, '方案与门店信息'),
          h('div', { class: 'kv' },
            h('span', { class: 'k' }, '方案名称'), h('span', { class: 'v' }, plan.name),
            h('span', { class: 'k' }, '品牌/季节'), h('span', { class: 'v' }, `${plan.brand} · ${plan.season}季 · ${plan.festival}`),
            h('span', { class: 'k' }, '门店'), h('span', { class: 'v' }, `${prof.storeCode} ${prof.storeName}（${prof.city}）`),
            h('span', { class: 'k' }, '橱窗尺寸'), h('span', { class: 'v mono' }, `${prof.width}×${prof.depth}×${prof.height}mm`),
            h('span', { class: 'k' }, '地台/门洞/货梯'), h('span', { class: 'v mono' },
              `${prof.platformHeight} / ${prof.door.w}×${prof.door.h} / ${prof.elevator.w}×${prof.elevator.h}×${prof.elevator.d}mm`),
            h('span', { class: 'k' }, '方案状态'), h('span', { class: 'v' },
              plan.status === 'confirmed' ? badge('已签字确认', 'badge-ok') : badge('草稿待确认')),
          ),
        ),
        h('div', { class: 'panel' },
          h('h3', {}, '用量汇总（自动计算）'),
          h('div', { class: 'grid-3', style: 'text-align:center' },
            h('div', {}, h('div', { style: 'font-size:24px;font-weight:700;color:var(--accent)' }, totalVolume.toFixed(2)),
              h('div', { class: 'muted' }, '包装总体积 m³')),
            h('div', {}, h('div', { style: 'font-size:24px;font-weight:700;color:var(--ok)' }, String(totalBoxes)),
              h('div', { class: 'muted' }, '运输箱数（箱）')),
            h('div', {}, h('div', { style: 'font-size:24px;font-weight:700;color:var(--warn)' }, String(hours)),
              h('div', { class: 'muted' }, '建议安装工时（h）')),
          ),
          h('div', { class: 'kv', style: 'margin-top:12px' },
            h('span', { class: 'k' }, '总重量'), h('span', { class: 'v mono' }, `${totalWeight.toFixed(1)} kg`),
            h('span', { class: 'k' }, 'KT 分块'), h('span', { class: 'v' }, `${panels.length} 块（编号 KT-01 ~ KT-${String(panels.length).padStart(2, '0')}）`),
          ),
        ),
      ),
      h('div', { class: 'panel' },
        h('h3', {}, '实时效果预览（生成时自动渲染正面/侧面/俯视三张图）'),
        this.viewport.el,
        h('div', { class: 'gap8', style: 'margin-top:10px' },
          btn('正面视角', () => this.viewport?.presetCamera('front'), 'btn-sm'),
          btn('侧面视角', () => this.viewport?.presetCamera('side'), 'btn-sm'),
          btn('俯视视角', () => this.viewport?.presetCamera('top'), 'btn-sm'),
          btn('立体视角', () => this.viewport?.presetCamera('iso'), 'btn-sm'),
        ),
      ),
      h('div', { class: 'panel' },
        h('h3', {}, '物料分块拼装与整箱包装明细'),
        h('div', { class: 'table-wrap' },
          h('table', {},
            h('thead', {}, h('tr', {},
              h('th', {}, '道具'), h('th', {}, '数量'), h('th', {}, '拆装方式'),
              h('th', {}, '每箱件数'), h('th', {}, '箱数'), h('th', {}, '体积 m³'), h('th', {}, '重量 kg'),
            )),
            h('tbody', {}, ...packages.map((e) => h('tr', {},
              h('td', {}, e.name), h('td', { class: 'mono' }, String(e.count)),
              h('td', {}, packName(e.packMethod)), h('td', { class: 'mono' }, String(e.perBox)),
              h('td', { class: 'mono' }, String(e.boxes)),
              h('td', { class: 'mono' }, e.volume.toFixed(3)),
              h('td', { class: 'mono' }, e.weight.toFixed(1)),
            ))),
          ),
        ),
        h('h4', { style: 'margin:14px 0 8px' }, `KT 背板拼装图（${panels.length} 块）`),
        h('div', { class: 'slice-grid',
          style: `grid-template-columns:repeat(${sliceKTPanel(prof.width - 120, prof.height - 200).cols},1fr)` },
          ...panels.map((sl) => h('div', { class: 'slice-cell' },
            h('b', {}, `KT-${String(sl.index).padStart(2, '0')}`),
            h('span', {}, `${sl.w}×${sl.h}mm`),
            h('span', { class: 'muted' }, `第${sl.row}行${sl.col}列`),
          )),
        ),
      ),
      plan.confirmedAt ? this.signedPanel(plan.confirmedAt) : this.actionPanel(),
    );
  }

  private actionPanel(): HTMLElement {
    return h('div', { class: 'panel' },
      h('h3', {}, '客户签字确认'),
      h('p', { class: 'dim' }, '签字后方案锁定存档，门店按确认书安装；之后修改将生成新版本并留改动记录'),
      h('div', { class: 'gap8' },
        btn('预览确认书（含三视图截图）', () => this.generate(true), 'btn-sm'),
        btn('签字确认并存档', () => this.sign(), 'btn-primary'),
      ),
    );
  }

  private signedPanel(at: number): HTMLElement {
    return h('div', { class: 'panel' },
      h('h3', {}, '确认记录'),
      h('div', { class: 'kv' },
        h('span', { class: 'k' }, '确认时间'), h('span', { class: 'v' }, new Date(at).toLocaleString('zh-CN')),
        h('span', { class: 'k' }, '方案版本'), h('span', { class: 'v' }, `v${this.plan!.version}`),
      ),
      btn('查看已存档确认书', () => this.viewArchived(), 'btn-sm'),
    );
  }

  private captureThreeShots(): { front: string; side: string; top: string } {
    const vp = this.viewport!;
    vp.presetCamera('front');
    const front = vp.screenshot();
    vp.presetCamera('side');
    const side = vp.screenshot();
    vp.presetCamera('top');
    const top = vp.screenshot();
    vp.presetCamera('iso');
    return { front, side, top };
  }

  private async generate(previewOnly = false): Promise<void> {
    const plan = this.plan!;
    const prof = this.profile!;
    const shots = this.captureThreeShots();
    const packages = computePackages(plan.items, store.propOf);
    const slices = sliceKTPanel(prof.width - 120, prof.height - 200).slices;
    const doc: ConfirmationDoc = {
      id: uid('doc'),
      planId: plan.id, planName: plan.name, brand: plan.brand,
      storeName: `${prof.storeCode} ${prof.storeName}`,
      generatedAt: Date.now(),
      totalVolume: packages.reduce((s, e) => s + e.volume, 0),
      totalBoxes: packages.reduce((s, e) => s + e.boxes, 0),
      totalWeight: packages.reduce((s, e) => s + e.weight, 0),
      installHours: estimateInstall(packages, slices.length),
      packages, panels: slices, shots,
    };
    if (!previewOnly) await store.confirmations.save(doc);
    this.previewDoc(doc);
  }

  private previewDoc(doc: ConfirmationDoc): void {
    const body = h('div', {},
      h('div', { class: 'grid-3' },
        shotBlock('正面效果图', doc.shots.front),
        shotBlock('侧面效果图', doc.shots.side),
        shotBlock('俯视效果图', doc.shots.top),
      ),
      h('h4', { style: 'margin:14px 0 8px' }, '包装与工时'),
      h('div', { class: 'kv' },
        h('span', { class: 'k' }, '总体积/箱数'), h('span', { class: 'v mono' },
          `${doc.totalVolume.toFixed(2)}m³ · ${doc.totalBoxes} 箱 · ${doc.totalWeight.toFixed(1)}kg`),
        h('span', { class: 'k' }, '建议工时'), h('span', { class: 'v' }, `${doc.installHours} 小时`),
        h('span', { class: 'k' }, 'KT 分块'), h('span', { class: 'v' }, `${doc.panels.length} 块带编号拼装`),
      ),
    );
    const close = modal(`方案确认书 · ${doc.planName}`, body,
      (close) => h('div', { class: 'gap8' },
        btn('关闭', close, 'btn-ghost'),
        btn('导出 JSON 方案文件', () => this.exportFile(doc), 'btn-primary'),
      ));
  }

  private exportFile(doc: ConfirmationDoc): void {
    const plan = structuredClone(this.plan!);
    const payload = {
      type: 'WINDOW_DISPLAY_PLAN_FILE',
      version: 1,
      exportedAt: new Date().toISOString(),
      plan,
      profile: this.profile,
      confirmation: { ...doc, shots: { front: '[dataURL省略]', side: '[dataURL省略]', top: '[dataURL省略]' } },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${plan.name}-方案文件.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('方案文件已导出，可发门店照装', 'ok');
  }

  private sign(): void {
    const nameInput = textInput('', () => undefined);
    const close = modal('客户签字确认',
      h('div', { class: 'col' },
        field('客户/负责人姓名', nameInput),
        h('p', { class: 'dim' }, '确认三视图效果、分块拼装图与包装用量无误，授权按此方案生产发运'),
      ),
      (close) => h('div', { class: 'gap8' },
        btn('取消', close, 'btn-ghost'),
        btn('确认签字', async () => {
          if (!nameInput.value.trim()) { toast('请输入签字姓名', 'error'); return; }
          const plan = this.plan!;
          plan.status = 'confirmed';
          plan.confirmedAt = Date.now();
          plan.changeLog.unshift({ at: Date.now(), text: `${nameInput.value} 签字确认，方案存档` });
          plan.version += 1;
          await store.savePlan(plan);
          await this.generate(false);
          close();
          toast('方案已签字确认并存档', 'ok');
        }, 'btn-primary'),
      ));
  }

  private async viewArchived(): Promise<void> {
    const all = await store.confirmations.all();
    const doc = all.filter((d) => d.planId === this.planId).pop();
    if (!doc) { toast('未找到存档确认书', 'error'); return; }
    this.previewDoc(doc);
  }
}

function shotBlock(caption: string, src: string): HTMLElement {
  return h('div', {},
    h('img', { class: 'shot', src, alt: caption }) as HTMLImageElement,
    h('div', { class: 'shot-caption' }, caption),
  );
}
function packName(p: string): string {
  return ({ integral: '整件运输', foldable: '可折叠', detachable: '可拆卸', flat: '扁平打包' } as Record<string, string>)[p] ?? p;
}
