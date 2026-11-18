// 应用内存状态：IndexedDB 的读模型 + 极简订阅
import { db } from './db';
import { seedProfiles, seedProps, seedSeries, seedTemplates } from './seed';
import type {
  DisplayPlan, DisplayTemplate, MannequinSeries, Prop, PropKit, WindowProfile,
} from '../types';

type Listener = () => void;

const RECYCLE_DAYS = 30;

class Store {
  plans: DisplayPlan[] = [];
  profiles: WindowProfile[] = [];
  props: Prop[] = [];
  kits: PropKit[] = [];
  series: MannequinSeries[] = [];
  templates: DisplayTemplate[] = [];
  /** 当前编辑中的方案 id */
  currentPlanId: string | null = null;
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  async init(): Promise<void> {
    this.props = await db.props.all();
    this.profiles = await db.profiles.all();
    this.series = await db.series.all();
    this.kits = await db.kits.all();
    this.templates = await db.templates.all();
    this.plans = await db.plans.all();

    if (this.props.length === 0) {
      this.props = seedProps();
      await Promise.all(this.props.map((p) => db.props.save(p)));
    }
    if (this.series.length === 0) {
      this.series = seedSeries();
      await Promise.all(this.series.map((s) => db.series.save(s)));
    }
    if (this.profiles.length === 0) {
      this.profiles = seedProfiles();
      await Promise.all(this.profiles.map((p) => db.profiles.save(p)));
    }
    if (this.templates.length === 0) {
      this.templates = seedTemplates(this.props);
      await Promise.all(this.templates.map((t) => db.templates.save(t)));
    }
    this.purgeRecycleBin();
    this.emit();
  }

  // ---- 方案 ----
  async savePlan(plan: DisplayPlan): Promise<void> {
    plan.updatedAt = Date.now();
    await db.plans.save(plan);
    const idx = this.plans.findIndex((p) => p.id === plan.id);
    if (idx >= 0) this.plans[idx] = plan;
    else this.plans.push(plan);
    this.emit();
  }

  async duplicatePlan(id: string): Promise<DisplayPlan | null> {
    const src = this.plans.find((p) => p.id === id);
    if (!src) return null;
    const copy: DisplayPlan = structuredClone(src);
    copy.id = 'plan_' + Math.random().toString(36).slice(2, 10);
    copy.name = src.name + ' 副本';
    copy.status = 'draft';
    copy.confirmedAt = undefined;
    copy.items = src.items.map((it) => ({ ...it, id: 'item_' + Math.random().toString(36).slice(2, 10) }));
    copy.viewpoints = src.viewpoints.map((v) => ({ ...v, id: 'vp_' + Math.random().toString(36).slice(2, 8) }));
    copy.changeLog = [{ at: Date.now(), text: `从方案「${src.name}」复制` }];
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();
    copy.deletedAt = undefined;
    await db.plans.save(copy);
    this.plans.push(copy);
    this.emit();
    return copy;
  }

  async softDeletePlan(id: string): Promise<void> {
    const plan = this.plans.find((p) => p.id === id);
    if (!plan) return;
    plan.deletedAt = Date.now();
    await db.plans.save(plan);
    if (this.currentPlanId === id) this.currentPlanId = null;
    this.emit();
  }

  async restorePlan(id: string): Promise<void> {
    const plan = this.plans.find((p) => p.id === id);
    if (!plan) return;
    plan.deletedAt = undefined;
    await db.plans.save(plan);
    this.emit();
  }

  async hardDeletePlan(id: string): Promise<void> {
    await db.plans.remove(id);
    this.plans = this.plans.filter((p) => p.id !== id);
    this.emit();
  }

  /** 回收站：超 30 天彻底删除 */
  purgeRecycleBin(): void {
    const limit = Date.now() - RECYCLE_DAYS * 86400000;
    for (const p of this.plans) {
      if (p.deletedAt && p.deletedAt < limit) {
        db.plans.remove(p.id);
      }
    }
    this.plans = this.plans.filter((p) => !p.deletedAt || p.deletedAt >= limit);
  }

  get activePlans(): DisplayPlan[] {
    return this.plans.filter((p) => !p.deletedAt);
  }

  get recycledPlans(): DisplayPlan[] {
    return this.plans.filter((p) => p.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
  }

  currentPlan(): DisplayPlan | undefined {
    return this.plans.find((p) => p.id === this.currentPlanId);
  }

  // ---- 基础资料 ----
  async saveProp(prop: Prop): Promise<void> {
    await db.props.save(prop);
    const idx = this.props.findIndex((p) => p.id === prop.id);
    if (idx >= 0) this.props[idx] = prop; else this.props.push(prop);
    this.emit();
  }

  async deleteProp(id: string): Promise<void> {
    await db.props.remove(id);
    this.props = this.props.filter((p) => p.id !== id);
    this.emit();
  }

  async saveProfile(profile: WindowProfile): Promise<void> {
    await db.profiles.save(profile);
    const idx = this.profiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) this.profiles[idx] = profile; else this.profiles.push(profile);
    this.emit();
  }

  async deleteProfile(id: string): Promise<void> {
    await db.profiles.remove(id);
    this.profiles = this.profiles.filter((p) => p.id !== id);
    this.emit();
  }

  async saveSeries(s: MannequinSeries): Promise<void> {
    await db.series.save(s);
    const idx = this.series.findIndex((x) => x.id === s.id);
    if (idx >= 0) this.series[idx] = s; else this.series.push(s);
    this.emit();
  }

  async deleteSeries(id: string): Promise<void> {
    await db.series.remove(id);
    this.series = this.series.filter((s) => s.id !== id);
    this.emit();
  }

  async saveKit(kit: PropKit): Promise<void> {
    await db.kits.save(kit);
    const idx = this.kits.findIndex((k) => k.id === kit.id);
    if (idx >= 0) this.kits[idx] = kit; else this.kits.push(kit);
    this.emit();
  }

  async deleteKit(id: string): Promise<void> {
    await db.kits.remove(id);
    this.kits = this.kits.filter((k) => k.id !== id);
    this.emit();
  }

  propOf = (id: string): Prop | undefined => this.props.find((p) => p.id === id);
  profileOf = (id: string): WindowProfile | undefined => this.profiles.find((p) => p.id === id);
  seriesOf = (id: string): MannequinSeries | undefined => this.series.find((s) => s.id === id);
  confirmations = {
    all: () => db.confirmations.all(),
    save: (d: import('../types').ConfirmationDoc) => db.confirmations.save(d),
  };
}

export const store = new Store();
