import { useState } from 'react';
import type { EnvSettings, LocationType, StoreWindow } from '../types';
import { appStore, refreshWindows } from '../state/app';
import { repo } from '../db/repo';
import { PageHeader } from '../components/AppLayout';
import { Modal, useToast } from '../components/ui';
import { uid, nowTs } from '../lib/math';

const blank = (): StoreWindow => ({
  id: uid('win'), storeName: '', city: '', locationType: 'mall',
  width: 360, depth: 160, height: 260, platformHeight: 12,
  door: { w: 120, h: 220 }, elevator: { w: 150, h: 230, d: 160 },
  aisleWidth: 320, oppositeDistance: 450,
  env: { locationType: 'mall', aisleWidth: 320, oppositeDistance: 450, fog: 0.15, oppositeReflection: true, lightboxPower: true },
  updatedAt: nowTs(),
});

const LOC: [LocationType, string][] = [['mall', '商场内铺'], ['street', '临街店'], ['island', '中庭岛柜']];

export function WindowsPage() {
  const state = appStore.useStore((s) => s);
  const toast = useToast();
  const [editing, setEditing] = useState<StoreWindow | null>(null);

  async function save() {
    if (!editing) return;
    if (!editing.storeName.trim()) { toast.push('请填写门店名称'); return; }
    const env: EnvSettings = { ...editing.env, locationType: editing.locationType, aisleWidth: editing.aisleWidth, oppositeDistance: editing.oppositeDistance };
    await repo.windows.save({ ...editing, env });
    await refreshWindows();
    setEditing(null);
    toast.push('橱窗档案已保存');
  }
  async function del(w: StoreWindow) {
    if (!confirm(`删除「${w.storeName}」档案?`)) return;
    await repo.windows.remove(w.id);
    await refreshWindows();
  }

  return (
    <>
      <PageHeader title="橱窗配置" desc="按门店实测尺寸建档:开间 / 进深 / 地台 / 门洞 / 货梯,陈列时自动碰撞与准入校验"
        actions={<button className="primary" onClick={() => setEditing(blank())}>＋ 新建门店档案</button>} />
      <div className="scroll" style={{ padding: 22, flex: 1 }}>
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>门店</th><th>城市</th><th>站位</th><th>开间×进深×高</th><th>地台</th><th>门洞</th><th>货梯</th><th>通道/对铺</th><th style={{ width: 130 }}>操作</th></tr>
            </thead>
            <tbody>
              {state.windows.map((w) => (
                <tr key={w.id}>
                  <td>{w.storeName}</td>
                  <td>{w.city}</td>
                  <td>{LOC.find(([k]) => k === w.locationType)?.[1]}</td>
                  <td>{w.width}×{w.depth}×{w.height} cm</td>
                  <td>{w.platformHeight} cm</td>
                  <td className="small">{w.door.w}×{w.door.h}</td>
                  <td className="small muted">{w.elevator.w}×{w.elevator.h}×{w.elevator.d}</td>
                  <td className="small muted">{w.aisleWidth} / {w.oppositeDistance} cm</td>
                  <td>
                    <button onClick={() => setEditing(structuredClone(w))}>编辑</button>
                    <button className="danger" style={{ marginLeft: 6 }} onClick={() => del(w)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="small muted" style={{ marginTop: 12, lineHeight: 1.8 }}>
          提示:门洞/货梯尺寸会在道具入橱窗时自动比对折叠后的最大边,超限道具在预览中标红并给出运输路径警告。
        </div>
      </div>

      {editing && (
        <Modal title={state.windows.some((w) => w.id === editing.id) ? '编辑橱窗档案' : '新建橱窗档案'} onClose={() => setEditing(null)} wide>
          <div className="col">
            <div className="field-grid">
              <div><label>门店名称</label><input value={editing.storeName} onChange={(e) => setEditing({ ...editing, storeName: e.target.value })} style={{ width: '100%' }} /></div>
              <div><label>城市</label><input value={editing.city} onChange={(e) => setEditing({ ...editing, city: e.target.value })} style={{ width: '100%' }} /></div>
            </div>
            <div>
              <label>站位类型</label>
              <div className="row">
                {LOC.map(([k, label]) => (
                  <button key={k} className={editing.locationType === k ? 'primary' : ''}
                    onClick={() => setEditing({ ...editing, locationType: k, env: { ...editing.env, locationType: k } })}>{label}</button>
                ))}
              </div>
            </div>
            <div className="field-grid">
              <NumField label="开间宽 (cm)" value={editing.width} onChange={(v) => setEditing({ ...editing, width: v })} />
              <NumField label="进深 (cm)" value={editing.depth} onChange={(v) => setEditing({ ...editing, depth: v })} />
              <NumField label="净高 (cm)" value={editing.height} onChange={(v) => setEditing({ ...editing, height: v })} />
              <NumField label="地台高度 (cm)" value={editing.platformHeight} onChange={(v) => setEditing({ ...editing, platformHeight: v })} />
            </div>
            <div>
              <label>门洞净尺寸 (cm)</label>
              <div className="row">
                <NumField label="宽" value={editing.door.w} onChange={(v) => setEditing({ ...editing, door: { ...editing.door, w: v } })} />
                <NumField label="高" value={editing.door.h} onChange={(v) => setEditing({ ...editing, door: { ...editing.door, h: v } })} />
              </div>
            </div>
            <div>
              <label>货梯内尺寸 (cm)</label>
              <div className="row">
                <NumField label="宽" value={editing.elevator.w} onChange={(v) => setEditing({ ...editing, elevator: { ...editing.elevator, w: v } })} />
                <NumField label="高" value={editing.elevator.h} onChange={(v) => setEditing({ ...editing, elevator: { ...editing.elevator, h: v } })} />
                <NumField label="深" value={editing.elevator.d} onChange={(v) => setEditing({ ...editing, elevator: { ...editing.elevator, d: v } })} />
              </div>
            </div>
            <div className="field-grid">
              <NumField label="门前通道宽度 (cm)" value={editing.aisleWidth} onChange={(v) => setEditing({ ...editing, aisleWidth: v, env: { ...editing.env, aisleWidth: v } })} />
              <NumField label="对铺距离 (cm)" value={editing.oppositeDistance} onChange={(v) => setEditing({ ...editing, oppositeDistance: v, env: { ...editing.env, oppositeDistance: v } })} />
            </div>
            <div className="card" style={{ background: 'var(--panel2)' }}>
              <strong className="small">店外环境(预览联动)</strong>
              <div className="col" style={{ marginTop: 10 }}>
                <div>
                  <label>玻璃起雾沾灰程度:{editing.env.fog.toFixed(2)}</label>
                  <input type="range" min={0} max={1} step={0.01} value={editing.env.fog}
                    onChange={(e) => setEditing({ ...editing, env: { ...editing.env, fog: Number(e.target.value) } })} style={{ width: '100%' }} />
                </div>
                <label className="switch"><input type="checkbox" checked={editing.env.oppositeReflection}
                  onChange={(e) => setEditing({ ...editing, env: { ...editing.env, oppositeReflection: e.target.checked } })} /> 对面灯箱招牌反光干扰</label>
                <label className="switch"><input type="checkbox" checked={editing.env.lightboxPower}
                  onChange={(e) => setEditing({ ...editing, env: { ...editing.env, lightboxPower: e.target.checked } })} /> 灯箱通电(断电时灯箱片发灰)</label>
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={() => setEditing(null)}>取消</button>
              <button className="primary" onClick={save}>保存档案</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label>{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} style={{ width: '100%' }} />
    </div>
  );
}
