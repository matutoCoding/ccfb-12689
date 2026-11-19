import { useMemo, useState } from 'react';
import type { AdaptConflict, Scheme, StoreWindow } from '../types';
import { Modal, useToast } from '../components/ui';
import { appStore, refreshSchemes } from '../state/app';
import { repo } from '../db/repo';
import { batchAdapt, type AdaptResult } from '../domain/autolayout';
import { formatTime } from '../lib/math';

export function BatchAdaptDialog({ scheme, onClose }: { scheme: Scheme; onClose: () => void }) {
  const state = appStore.useStore((s) => s);
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set(state.windows.map((w) => w.id)));
  const [results, setResults] = useState<AdaptResult[] | null>(null);
  const [conflicts, setConflicts] = useState<AdaptConflict[]>([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'pick' | 'result'>('pick');

  const matMap = useMemo(() => new Map(state.materials.map((m) => [m.id, m])), [state.materials]);
  const targets: StoreWindow[] = state.windows.filter((w) => selected.has(w.id));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  async function run() {
    setBusy(true);
    // 让出一帧渲染 loading,大批量门店时不卡 UI
    await new Promise((r) => setTimeout(r, 30));
    const { results: r, conflicts: c } = batchAdapt(scheme.items, targets, matMap);
    setResults(r);
    setConflicts(c);
    setTab('result');
    setBusy(false);
  }

  async function applyAll() {
    if (!results) return;
    const layouts = new Map(results.map((r) => [r.windowId, r.items]));
    const updated: Scheme = {
      ...scheme,
      boundStoreIds: targets.map((w) => w.id),
      changeLog: [
        { at: Date.now(), desc: `批量适配到 ${targets.length} 家门店,锁定主推道具 ${scheme.items.filter((i) => i.locked).length} 件未参与重排` },
        ...scheme.changeLog,
      ],
    };
    await repo.schemes.save(updated);
    // 各店布局快照存到 window 记录的扩展字段(通过 meta 表保存,避免改模型)
    const prev = (await repo.schemes.get(scheme.id))!;
    void prev;
    const snapshots = JSON.parse(localStorage.getItem('adapt-snapshots') ?? '{}');
    for (const [winId, items] of layouts) snapshots[`${scheme.id}:${winId}`] = items;
    localStorage.setItem('adapt-snapshots', JSON.stringify(snapshots));
    await refreshSchemes();
    toast.push(`已挂到 ${targets.length} 家门店,${conflicts.length} 家存在待修冲突`);
    onClose();
  }

  // 联动更新:主题改道具后,对所有挂主题门店重跑适配并保留锁定项
  async function linkedRefresh() {
    if (!results) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    const next = batchAdapt(scheme.items, targets, matMap);
    setResults(next.results);
    setConflicts(next.conflicts);
    const s = await repo.schemes.get(scheme.id);
    if (s) {
      await repo.schemes.save({
        ...s,
        changeLog: [{ at: Date.now(), desc: `主题物料联动更新,重跑 ${targets.length} 店适配` }, ...s.changeLog],
      });
      await refreshSchemes();
    }
    setBusy(false);
    toast.push('联动更新完成,已留改动记录');
  }

  return (
    <Modal title={`批量适配 —— ${scheme.name}`} onClose={onClose} wide>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={tab === 'pick' ? 'primary' : ''} onClick={() => setTab('pick')}>① 选择门店</button>
        <button className={tab === 'result' ? 'primary' : ''} onClick={() => results && setTab('result')}>② 冲突清单</button>
        <div className="small muted" style={{ marginLeft: 'auto' }}>
          已选 {targets.length} 家 · 锁定道具不参与自动排
        </div>
      </div>

      {tab === 'pick' && (
        <>
          <div className="card scroll" style={{ maxHeight: 380, padding: 0 }}>
            <table>
              <thead><tr><th style={{ width: 40 }}></th><th>门店</th><th>城市</th><th>站位</th><th>橱窗尺寸(cm)</th><th>门洞/货梯(cm)</th></tr></thead>
              <tbody>
                {state.windows.map((w) => (
                  <tr key={w.id}>
                    <td><input type="checkbox" checked={selected.has(w.id)} onChange={() => toggle(w.id)} /></td>
                    <td>{w.storeName}</td>
                    <td>{w.city}</td>
                    <td>{w.locationType === 'mall' ? '商场内铺' : w.locationType === 'street' ? '临街店' : '中庭岛柜'}</td>
                    <td className="small">{w.width}×{w.depth}×{w.height} 地台{w.platformHeight}</td>
                    <td className="small muted">门{w.door.w}×{w.door.h} / 梯{w.elevator.w}×{w.elevator.h}×{w.elevator.d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button onClick={() => setSelected(new Set(state.windows.map((w) => w.id)))}>全选</button>
            <button onClick={() => setSelected(new Set())}>清空</button>
            <button className="primary" disabled={!targets.length || busy} onClick={run}>{busy ? '重排计算中…' : `按各店尺寸自动重排(${targets.length})`}</button>
          </div>
        </>
      )}

      {tab === 'result' && results && (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <div className="kpi">{results.length}</div><div className="small muted">适配门店</div>
            </div>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <div className="kpi pill-error">{conflicts.length}</div><div className="small muted">待修门店</div>
            </div>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <div className="kpi pill-warn">{conflicts.reduce((n, c) => n + c.issues.filter((i) => i.level !== 'error').length, 0)}</div>
              <div className="small muted">规则警告</div>
            </div>
          </div>
          <div className="card scroll" style={{ maxHeight: 320, padding: 0 }}>
            <table>
              <thead><tr><th>门店</th><th>问题</th><th>级别</th></tr></thead>
              <tbody>
                {conflicts.length === 0 && <tr><td colSpan={3}><div className="empty">全部门店适配通过,无超界与规则冲突</div></td></tr>}
                {conflicts.map((c) => (
                  <tr key={c.windowId}>
                    <td style={{ verticalAlign: 'top' }}>{c.storeName}</td>
                    <td>
                      {c.issues.map((i, k) => (
                        <div key={k} className={`small pill-${i.level === 'error' ? 'error' : i.level === 'warning' ? 'warn' : 'info'}`} style={{ marginBottom: 3 }}>
                          {i.level === 'error' ? '✕' : i.level === 'warning' ? '⚠' : 'ℹ'} {i.message}
                        </div>
                      ))}
                    </td>
                    <td className="small">{c.issues.some((i) => i.level === 'error') ? <span className="pill-error">超界/碰撞</span> : '规则提示'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="small muted" style={{ margin: '10px 0' }}>
            最近改动:{scheme.changeLog.slice(0, 3).map((l) => `${formatTime(l.at)} ${l.desc}`).join(' · ') || '无'}
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={linkedRefresh} disabled={busy}>主题改动后联动重跑</button>
            <button className="primary" onClick={applyAll}>确认挂载并保存各店布局</button>
          </div>
        </>
      )}
    </Modal>
  );
}
