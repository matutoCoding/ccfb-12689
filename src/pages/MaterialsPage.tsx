import { useMemo, useState } from 'react';
import type { FoldType, Kit, Material, MaterialCategory, PlacedItem, SurfaceType } from '../types';
import { appStore, refreshKits, refreshMaterials } from '../state/app';
import { repo } from '../db/repo';
import { PageHeader } from '../components/AppLayout';
import { Modal, useToast } from '../components/ui';
import { uid, nowTs } from '../lib/math';

const CATS: [MaterialCategory, string][] = [
  ['acrylic', '亚克力'], ['wood', '木质'], ['kt', 'KT板'], ['lightbox', '灯箱'],
  ['metal', '金属镀铬'], ['fabric', '布艺绒布'], ['other', '其他'],
];
const SURFACES: [SurfaceType, string][] = [
  ['matte', '亚光(KT覆膜)'], ['acrylic', '亚克力'], ['wood', '木纹'], ['chrome', '镀铬'],
  ['velvet', '绒布'], ['lightbox', '灯箱片'], ['plastic', '塑料'], ['metal', '金属'], ['glass', '玻璃'],
];
const FOLDS: [FoldType, string][] = [['none', '不可折叠'], ['fold', '折叠'], ['detach', '拆装'], ['roll', '卷收']];

const blankMat = (): Material => ({
  id: uid('mat'), name: '', sku: '', category: 'acrylic', surface: 'acrylic',
  size: { w: 40, h: 40, d: 40 }, weight: 1, color: [0.8, 0.8, 0.8],
  fold: 'none', canStack: false, canFlip: false, wallSlot: false, updatedAt: nowTs(),
});

export function MaterialsPage() {
  const state = appStore.useStore((s) => s);
  const toast = useToast();
  const [cat, setCat] = useState<MaterialCategory | ''>('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Material | null>(null);
  const [kitTab, setKitTab] = useState<'materials' | 'kits'>('materials');
  const [savingKit, setSavingKit] = useState<Kit | null>(null);

  const list = useMemo(() => state.materials.filter((m) =>
    (!cat || m.category === cat) && (!q || `${m.name}${m.sku}`.toLowerCase().includes(q.toLowerCase())),
  ), [state.materials, cat, q]);

  async function saveMat() {
    if (!editing) return;
    if (!editing.name.trim()) { toast.push('请填写道具名称'); return; }
    await repo.materials.save(editing);
    await refreshMaterials();
    setEditing(null);
    toast.push('物料已保存');
  }
  async function delMat(m: Material) {
    if (!confirm(`删除物料「${m.name}」?`)) return;
    await repo.materials.remove(m.id);
    await refreshMaterials();
  }
  async function saveKit() {
    if (!savingKit) return;
    if (!savingKit.name.trim()) { toast.push('请填写套件名称'); return; }
    await repo.kits.save(savingKit);
    await refreshKits();
    setSavingKit(null);
    toast.push('自定义套件已保存,可随主题复用');
  }
  async function delKit(k: Kit) {
    await repo.kits.remove(k.id);
    await refreshKits();
  }
  function makeKitFromSelected() {
    // 从当前方案无关:套件直接由物料勾选组装
    const chosen = list.filter((m) => (document.getElementById(`pick-${m.id}`) as HTMLInputElement | null)?.checked);
    if (!chosen.length) { toast.push('先勾选要组成套件的物料'); return; }
    const items: PlacedItem[] = chosen.map((m, i) => ({
      id: uid('ki'), kind: 'material', refId: m.id, name: m.name,
      position: { x: i * 60, y: 0, z: 0 }, rotationY: 0, scale: 1,
    }));
    setSavingKit({ id: uid('kit'), name: '', tags: [], items, updatedAt: nowTs() });
  }

  return (
    <>
      <PageHeader title="物料库" desc="每件道具带真实尺寸 / 体量 / 材质 / 折叠拆装方式,支持翻转、叠放、背板槽位挂载与自定义套件"
        actions={
          <>
            <button onClick={() => setKitTab(kitTab === 'materials' ? 'kits' : 'materials')}>
              {kitTab === 'materials' ? '查看自定义套件' : '返回物料列表'}
            </button>
            {kitTab === 'materials'
              ? <button className="primary" onClick={() => setEditing(blankMat())}>＋ 新物料</button>
              : <button className="primary" onClick={makeKitFromSelected}>将勾选项存为套件</button>}
          </>
        } />
      {kitTab === 'materials' ? (
        <>
          <div style={{ padding: '14px 22px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className={cat === '' ? 'primary' : ''} onClick={() => setCat('')}>全部</button>
            {CATS.map(([k, label]) => <button key={k} className={cat === k ? 'primary' : ''} onClick={() => setCat(k)}>{label}</button>)}
            <input placeholder="搜索名称/SKU" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 180, marginLeft: 'auto' }} />
          </div>
          <div className="scroll" style={{ padding: '0 22px 22px', flex: 1 }}>
            <div className="card" style={{ padding: 0 }}>
              <table>
                <thead><tr><th style={{ width: 36 }}></th><th>名称</th><th>SKU</th><th>类别</th><th>真实尺寸 W×H×D</th><th>重量</th><th>材质表现</th><th>收纳方式</th><th>能力</th><th style={{ width: 120 }}>操作</th></tr></thead>
                <tbody>
                  {list.map((m) => (
                    <tr key={m.id}>
                      <td><input id={`pick-${m.id}`} type="checkbox" /></td>
                      <td>{m.name}{m.isHero && <span className="tag hot" style={{ marginLeft: 6 }}>主推</span>}{m.isAccessory && <span className="tag" style={{ marginLeft: 6 }}>配饰</span>}</td>
                      <td className="small muted">{m.sku}</td>
                      <td>{CATS.find(([k]) => k === m.category)?.[1]}</td>
                      <td className="small">{m.size.w}×{m.size.h}×{m.size.d}</td>
                      <td className="small">{m.weight}kg</td>
                      <td className="small">{SURFACES.find(([, s]) => s === SURFACES.find(([k]) => k === m.surface)?.[0])?.[1] ?? m.surface}</td>
                      <td className="small">{FOLDS.find(([k]) => k === m.fold)?.[1]}</td>
                      <td className="small">
                        {m.canFlip && <span className="tag" style={{ marginRight: 4 }}>翻转</span>}
                        {m.canStack && <span className="tag" style={{ marginRight: 4 }}>叠放</span>}
                        {m.wallSlot && <span className="tag">背板槽位</span>}
                      </td>
                      <td>
                        <button onClick={() => setEditing(structuredClone(m))}>编辑</button>
                        <button className="danger" style={{ marginLeft: 6 }} onClick={() => delMat(m)}>删</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="scroll" style={{ padding: 22, flex: 1 }}>
          <div className="col" style={{ gap: 12 }}>
            {state.kits.map((k) => (
              <div key={k.id} className="card row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>{k.name}</strong>
                  <div className="small muted" style={{ marginTop: 6 }}>{k.items.map((i) => i.name).join(' + ')}</div>
                  <div style={{ marginTop: 6 }}>{k.tags.map((t) => <span key={t} className="tag" style={{ marginRight: 4 }}>{t}</span>)}</div>
                </div>
                <button className="danger" onClick={() => delKit(k)}>删除套件</button>
              </div>
            ))}
            {!state.kits.length && <div className="empty">还没有自定义套件,回到物料列表勾选后点击「存为套件」</div>}
          </div>
        </div>
      )}

      {editing && (
        <Modal title={state.materials.some((m) => m.id === editing.id) ? '编辑物料' : '新物料'} onClose={() => setEditing(null)} wide>
          <div className="col">
            <div className="field-grid">
              <div><label>道具名称</label><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={{ width: '100%' }} /></div>
              <div><label>SKU 编码</label><input value={editing.sku} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} style={{ width: '100%' }} /></div>
            </div>
            <div className="field-grid">
              <div><label>类别</label>
                <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value as MaterialCategory })} style={{ width: '100%' }}>
                  {CATS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
              <div><label>材质表面(决定渲染质感)</label>
                <select value={editing.surface} onChange={(e) => setEditing({ ...editing, surface: e.target.value as SurfaceType })} style={{ width: '100%' }}>
                  {SURFACES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label>实测尺寸 (cm)</label>
              <div className="row">
                <Num label="宽 W" value={editing.size.w} onChange={(v) => setEditing({ ...editing, size: { ...editing.size, w: v } })} />
                <Num label="高 H" value={editing.size.h} onChange={(v) => setEditing({ ...editing, size: { ...editing.size, h: v } })} />
                <Num label="深 D" value={editing.size.d} onChange={(v) => setEditing({ ...editing, size: { ...editing.size, d: v } })} />
                <Num label="重量 kg" value={editing.weight} onChange={(v) => setEditing({ ...editing, weight: v })} />
              </div>
            </div>
            <div>
              <label>固有色 RGB(0~255)</label>
              <div className="row">
                {[0, 1, 2].map((idx) => (
                  <input key={idx} type="number" min={0} max={255} value={Math.round(editing.color[idx] * 255)}
                    onChange={(e) => {
                      const c = [...editing.color] as Material['color'];
                      c[idx] = Number(e.target.value) / 255;
                      setEditing({ ...editing, color: c });
                    }} style={{ width: 90 }} />
                ))}
                <span style={{ width: 34, height: 34, borderRadius: 8, background: `rgb(${editing.color.map((c) => Math.round(c * 255)).join(',')})`, border: '1px solid var(--line)' }} />
              </div>
            </div>
            <div className="field-grid">
              <div><label>折叠 / 拆装方式</label>
                <select value={editing.fold} onChange={(e) => setEditing({ ...editing, fold: e.target.value as FoldType })} style={{ width: '100%' }}>
                  {FOLDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
              <div><label>陈列角色 / 色系</label>
                <div className="row">
                  <label className="switch"><input type="checkbox" checked={!!editing.isHero} onChange={(e) => setEditing({ ...editing, isHero: e.target.checked })} />主推款</label>
                  <label className="switch"><input type="checkbox" checked={!!editing.isAccessory} onChange={(e) => setEditing({ ...editing, isAccessory: e.target.checked })} />配饰</label>
                  <input placeholder="色系标签" value={editing.hueTag ?? ''} onChange={(e) => setEditing({ ...editing, hueTag: e.target.value || undefined })} style={{ width: 90 }} />
                </div>
              </div>
            </div>
            <div className="row">
              <label className="switch"><input type="checkbox" checked={editing.canFlip} onChange={(e) => setEditing({ ...editing, canFlip: e.target.checked })} />支持翻转</label>
              <label className="switch"><input type="checkbox" checked={editing.canStack} onChange={(e) => setEditing({ ...editing, canStack: e.target.checked })} />支持叠放</label>
              <label className="switch"><input type="checkbox" checked={editing.wallSlot} onChange={(e) => setEditing({ ...editing, wallSlot: e.target.checked })} />可挂背板槽位</label>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={() => setEditing(null)}>取消</button>
              <button className="primary" onClick={saveMat}>保存</button>
            </div>
          </div>
        </Modal>
      )}

      {savingKit && (
        <Modal title="保存自定义套件" onClose={() => setSavingKit(null)}>
          <div className="col">
            <div><label>套件名称</label><input value={savingKit.name} onChange={(e) => setSavingKit({ ...savingKit, name: e.target.value })} style={{ width: '100%' }} /></div>
            <div><label>标签(逗号分隔)</label><input value={savingKit.tags.join(',')} onChange={(e) => setSavingKit({ ...savingKit, tags: e.target.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean) })} style={{ width: '100%' }} /></div>
            <div className="card small" style={{ background: 'var(--panel2)' }}>包含 {savingKit.items.length} 件:{savingKit.items.map((i) => i.name).join('、')}</div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={() => setSavingKit(null)}>取消</button>
              <button className="primary" onClick={saveKit}>保存套件</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ flex: 1 }}><label>{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} style={{ width: '100%' }} />
    </div>
  );
}
