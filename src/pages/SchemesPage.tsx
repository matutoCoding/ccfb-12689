import { useMemo, useState } from 'react';
import type { Material, Scheme, Season, Slot } from '../types';
import { appStore, refreshSchemes } from '../state/app';
import { repo, exportSchemeFile, downloadJSON, readJSONFile } from '../db/repo';
import { PageHeader } from '../components/AppLayout';
import { Modal, useToast } from '../components/ui';
import { formatTime, uid, DAY_MS } from '../lib/math';
import { BatchAdaptDialog } from './BatchAdaptDialog';
import type { PageKey } from '../components/AppLayout';

const SEASONS: Season[] = ['春', '夏', '秋', '冬', '全季'];
const SLOTS: Slot[] = ['常规', '春节', '情人节', '五一', '母亲节', '618', '七夕', '中秋', '国庆', '双11', '圣诞', '元旦'];

export function SchemesPage({ onOpen, onNav }: { onOpen: (schemeId: string) => void; onNav: (p: PageKey) => void }) {
  const state = appStore.useStore((s) => s);
  const toast = useToast();
  const [tab, setTab] = useState<'active' | 'recycle'>('active');
  const [q, setQ] = useState('');
  const [fSeason, setFSeason] = useState('');
  const [fSlot, setFSlot] = useState('');
  const [wMin, setWMin] = useState('');
  const [wMax, setWMax] = useState('');
  const [editing, setEditing] = useState<Scheme | null>(null);
  const [batchFor, setBatchFor] = useState<Scheme | null>(null);

  const winMap = useMemo(() => new Map(state.windows.map((w) => [w.id, w])), [state.windows]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return state.schemes.filter((s) => {
      const deleted = !!s.deletedAt;
      if (tab === 'recycle' && !deleted) return false;
      if (tab === 'active' && deleted) return false;
      if (tab === 'recycle') return true;
      if (q && !`${s.name}${s.brand}${s.tags.join('')}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (fSeason && s.season !== fSeason) return false;
      if (fSlot && s.slot !== fSlot) return false;
      const win = s.windowId ? winMap.get(s.windowId) : null;
      if (wMin && (!win || win.width < Number(wMin))) return false;
      if (wMax && (!win || win.width > Number(wMax))) return false;
      void now;
      return true;
    }).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [state.schemes, tab, q, fSeason, fSlot, wMin, wMax, winMap]);

  async function createScheme() {
    const win = state.windows[0];
    const s: Scheme = {
      id: uid('sch'), name: '未命名主题方案', brand: '', season: '全季', slot: '常规',
      tags: [], status: 'draft', windowId: win?.id ?? null, items: [],
      env: win?.env ?? { locationType: 'mall', aisleWidth: 320, oppositeDistance: 450, fog: 0.15, oppositeReflection: true, lightboxPower: true },
      viewpoints: [], boundStoreIds: [], changeLog: [{ at: Date.now(), desc: '创建方案' }],
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    await repo.schemes.save(s);
    await refreshSchemes();
    onOpen(s.id);
  }

  async function saveMeta() {
    if (!editing) return;
    await repo.schemes.save(editing);
    setEditing(null);
    await refreshSchemes();
    toast.push('方案信息已保存');
  }

  async function doDelete(s: Scheme) {
    await repo.schemes.softDelete(s);
    await refreshSchemes();
    toast.push('已移入回收站,保留 30 天可恢复');
  }
  async function doRestore(s: Scheme) {
    await repo.schemes.restore(s);
    await refreshSchemes();
    toast.push('方案已恢复');
  }
  async function doPurge(s: Scheme) {
    if (!confirm(`彻底删除「${s.name}」?该操作不可恢复`)) return;
    await repo.schemes.hardDelete(s.id);
    await refreshSchemes();
  }
  async function doDuplicate(s: Scheme) {
    const copy = await repo.schemes.duplicate(s);
    await refreshSchemes();
    toast.push(`已创建副本「${copy.name}」`);
  }
  function doExport(s: Scheme) {
    const mats = state.materials.filter((m) => s.items.some((i) => i.refId === m.id));
    const win = s.windowId ? winMap.get(s.windowId) ?? null : null;
    downloadJSON(exportSchemeFile(s, win, mats), `${s.name}.display-scheme.json`);
  }
  async function doImport(file: File) {
    const data = await readJSONFile(file) as { format?: string; scheme?: Scheme; materials?: Material[] };
    if (data.format !== 'display-studio-scheme' || !data.scheme) {
      toast.push('文件格式不正确'); return;
    }
    const s: Scheme = { ...data.scheme, id: uid('sch'), name: `${data.scheme.name}(导入)`, createdAt: Date.now(), updatedAt: Date.now(), deletedAt: undefined };
    s.items.forEach((i) => { i.id = uid('pi'); });
    if (data.materials?.length) {
      for (const m of data.materials) {
        if (!state.materials.some((x) => x.id === m.id)) await repo.materials.save(m);
      }
    }
    await repo.schemes.save(s);
    await Promise.all([refreshSchemes(), appStore.patch({ materials: await repo.materials.all() })]);
    toast.push('方案已导入');
  }

  return (
    <>
      <PageHeader
        title="方案管理"
        desc="按品牌 / 季节 / 节日档期管理主题方案,支持标签与橱窗尺寸范围搜索"
        actions={
          <>
            <label className="switch" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}>
              导入方案
              <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
            </label>
            <button className="primary" onClick={createScheme}>＋ 新建方案</button>
          </>
        }
      />
      <div style={{ padding: '14px 22px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="row">
          <button className={tab === 'active' ? 'primary' : ''} onClick={() => setTab('active')}>在用方案</button>
          <button className={tab === 'recycle' ? 'primary' : ''} onClick={() => setTab('recycle')}>
            回收站 {state.schemes.some((s) => s.deletedAt) && <span className="badge" style={{ marginLeft: 6 }}>{state.schemes.filter((s) => s.deletedAt).length}</span>}
          </button>
        </div>
        {tab === 'active' && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <input placeholder="搜索方案名 / 品牌 / 标签" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
            <select value={fSeason} onChange={(e) => setFSeason(e.target.value)}>
              <option value="">全部季节</option>
              {SEASONS.map((x) => <option key={x}>{x}</option>)}
            </select>
            <select value={fSlot} onChange={(e) => setFSlot(e.target.value)}>
              <option value="">全部档期</option>
              {SLOTS.map((x) => <option key={x}>{x}</option>)}
            </select>
            <div className="row small muted">
              橱窗开间
              <input type="number" placeholder="最小" value={wMin} onChange={(e) => setWMin(e.target.value)} style={{ width: 78 }} />
              ~
              <input type="number" placeholder="最大" value={wMax} onChange={(e) => setWMax(e.target.value)} style={{ width: 78 }} />
              cm
            </div>
          </div>
        )}
      </div>
      <div className="scroll" style={{ padding: '0 22px 22px', flex: 1 }}>
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>方案名称</th><th>品牌</th><th>季节/档期</th><th>标签</th><th>绑定橱窗</th>
                <th>道具数</th><th>状态</th><th>更新时间</th><th style={{ width: tab === 'recycle' ? 180 : 280 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const win = s.windowId ? winMap.get(s.windowId) : null;
                return (
                  <tr key={s.id}>
                    <td className="ellipsis" style={{ maxWidth: 180 }}>
                      {s.name}
                      {s.deletedAt && <span className="tag" style={{ marginLeft: 8 }}>剩余 {30 - Math.floor((Date.now() - s.deletedAt) / DAY_MS)} 天</span>}
                    </td>
                    <td>{s.brand || '—'}</td>
                    <td>{s.season} · {s.slot}</td>
                    <td className="ellipsis" style={{ maxWidth: 140 }}>{s.tags.map((t) => <span key={t} className="tag" style={{ marginRight: 4 }}>{t}</span>)}</td>
                    <td className="small">{win ? `${win.storeName} ${win.width}×${win.depth}` : '未绑定'}</td>
                    <td>{s.items.length}</td>
                    <td>{s.status === 'confirmed' ? <span className="pill-info">已确认</span> : s.status === 'archived' ? '已归档' : <span className="muted">草稿</span>}</td>
                    <td className="small muted">{formatTime(s.updatedAt)}</td>
                    <td>
                      {tab === 'active' ? (
                        <div className="row" style={{ gap: 6 }}>
                          <button onClick={() => onOpen(s.id)}>打开设计</button>
                          <button onClick={() => setEditing(s)}>信息</button>
                          <button onClick={() => doDuplicate(s)}>复制</button>
                          <button onClick={() => setBatchFor(s)}>批量适配</button>
                          <button onClick={() => doExport(s)}>导出</button>
                          <button className="danger" onClick={() => doDelete(s)}>删除</button>
                        </div>
                      ) : (
                        <div className="row" style={{ gap: 6 }}>
                          <button onClick={() => doRestore(s)}>恢复</button>
                          <button className="danger" onClick={() => doPurge(s)}>彻底删除</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr><td colSpan={9}><div className="empty">{tab === 'recycle' ? '回收站为空' : '暂无方案,点击右上角新建'}<br /><button className="ghost" style={{ marginTop: 12 }} onClick={() => onNav('windows')}>先去建立门店橱窗档案 →</button></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal title="方案信息" onClose={() => setEditing(null)}>
          <div className="col">
            <div><label>方案名称</label><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={{ width: '100%' }} /></div>
            <div><label>品牌</label><input value={editing.brand} onChange={(e) => setEditing({ ...editing, brand: e.target.value })} style={{ width: '100%' }} /></div>
            <div className="field-grid">
              <div><label>季节</label>
                <select value={editing.season} onChange={(e) => setEditing({ ...editing, season: e.target.value as Season })} style={{ width: '100%' }}>
                  {SEASONS.map((x) => <option key={x}>{x}</option>)}
                </select>
              </div>
              <div><label>节日档期</label>
                <select value={editing.slot} onChange={(e) => setEditing({ ...editing, slot: e.target.value as Slot })} style={{ width: '100%' }}>
                  {SLOTS.map((x) => <option key={x}>{x}</option>)}
                </select>
              </div>
            </div>
            <div><label>标签(逗号分隔)</label>
              <input value={editing.tags.join(',')} onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean) })} style={{ width: '100%' }} />
            </div>
            <div><label>绑定橱窗</label>
              <select value={editing.windowId ?? ''} onChange={(e) => setEditing({ ...editing, windowId: e.target.value || null })} style={{ width: '100%' }}>
                <option value="">未绑定</option>
                {state.windows.map((w) => <option key={w.id} value={w.id}>{w.storeName}({w.width}×{w.depth}×{w.height}cm)</option>)}
              </select>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={() => setEditing(null)}>取消</button>
              <button className="primary" onClick={saveMeta}>保存</button>
            </div>
          </div>
        </Modal>
      )}
      {batchFor && <BatchAdaptDialog scheme={batchFor} onClose={() => setBatchFor(null)} />}
    </>
  );
}
