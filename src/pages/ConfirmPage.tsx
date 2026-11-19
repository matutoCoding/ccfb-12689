import { useMemo, useRef, useState } from 'react';
import type { ConfirmDoc, ID, Material, PlacedItem, StoreWindow } from '../types';
import { appStore, refreshDocs, refreshSchemes } from '../state/app';
import { repo, downloadJSON } from '../db/repo';
import { PageHeader } from '../components/AppLayout';
import { Modal, useToast } from '../components/ui';
import { Renderer } from '../engine/Renderer';
import { OrbitCamera } from '../engine/OrbitCamera';
import { buildScene } from '../engine/scene';
import { calcPackaging } from '../domain/packaging';
import { findAccessIssues, findCollisions, findOutOfBounds } from '../domain/geometryRules';
import { displayRules } from '../domain/displayRules';
import { formatTime } from '../lib/math';
import { v3 } from '../lib/math';

export function ConfirmPage({ onOpen }: { onOpen: (id: string) => void }) {
  const state = appStore.useStore((s) => s);
  const toast = useToast();
  const [generating, setGenerating] = useState<ID | null>(null);
  const [viewDoc, setViewDoc] = useState<ConfirmDoc | null>(null);
  const canvasHost = useRef<HTMLDivElement>(null);

  const candidates = useMemo(
    () => state.schemes.filter((s) => !s.deletedAt && s.items.length),
    [state.schemes],
  );
  const matMap = useMemo(() => new Map(state.materials.map((m) => [m.id, m])), [state.materials]);
  const winOf = (id: ID | null) => state.windows.find((w) => w.id === id) ?? state.windows[0] ?? null;

  // 离屏渲染三视图:正面 / 侧面 / 俯视
  async function renderThreeViews(schemeId: ID): Promise<{ front: string; side: string; top: string } | null> {
    const scheme = state.schemes.find((s) => s.id === schemeId);
    const win = winOf(scheme?.windowId ?? null);
    if (!scheme || !win) { toast.push('缺少橱窗档案'); return null; }
    setGenerating(schemeId);
    await new Promise((r) => setTimeout(r, 30));
    const host = canvasHost.current!;
    const canvas = document.createElement('canvas');
    canvas.width = 900; canvas.height = 640;
    host.appendChild(canvas);
    try {
      const renderer = new Renderer(canvas);
      const scene = buildScene({
        window: win, items: scheme.items, materials: matMap, env: scheme.env,
        selected: new Set(), flags: new Map(), showPanelLines: true,
      });
      const dist = Math.max(win.width, win.depth) * 1.7 + 200;
      const cy = win.platformHeight + win.height * 0.55;
      const shots = {
        front: { eye: v3(0, cy, dist), target: v3(0, cy, 0) },
        side: { eye: v3(dist, cy, 0), target: v3(0, cy, 0) },
        top: { eye: v3(0, win.platformHeight + win.height + dist * 0.9, 1), target: v3(0, win.platformHeight, 0) },
      };
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(shots)) {
        const cam = new OrbitCamera();
        cam.target = v.target;
        cam.setPedestrian(v.eye, v.target);
        out[k] = renderer.capture(cam.state(), scene.calls, scene.lines, scene.blobs);
      }
      renderer.dispose();
      return out as { front: string; side: string; top: string };
    } finally {
      canvas.remove();
      setGenerating(null);
    }
  }

  async function confirm(schemeId: ID) {
    const scheme = state.schemes.find((s) => s.id === schemeId)!;
    const win = winOf(scheme.windowId)!;
    const shots = await renderThreeViews(schemeId);
    if (!shots) return;
    const packaging = calcPackaging(scheme.items, matMap);
    const issues = [
      ...findCollisions(scheme.items, matMap),
      ...findOutOfBounds(scheme.items, win, matMap),
      ...findAccessIssues(scheme.items, win, matMap),
      ...displayRules(scheme.items, win),
    ];
    const signedBy = window.prompt('客户签字确认(输入确认人姓名):', '');
    if (!signedBy) { toast.push('已取消确认'); return; }
    const doc: ConfirmDoc = {
      id: `doc_${Date.now().toString(36)}`,
      schemeId, schemeName: scheme.name, brand: scheme.brand,
      shots, packaging, issues, signedBy, signedAt: Date.now(), archived: true,
    };
    await repo.docs.save(doc);
    await repo.schemes.save({ ...scheme, status: 'confirmed', confirmedAt: Date.now() });
    await Promise.all([refreshDocs(), refreshSchemes()]);
    toast.push('方案确认书已生成并存档');
    setViewDoc(doc);
  }

  function exportDoc(doc: ConfirmDoc) {
    downloadJSON({ format: 'display-studio-confirm', version: 1, ...doc }, `${doc.schemeName}-确认书.json`);
  }

  return (
    <>
      <PageHeader title="方案确认" desc="生成带三视图 / 分块拼装 / 包装用量 / 工时估算的确认书,客户签字后存档" />
      <div ref={canvasHost} hidden />
      <div className="scroll" style={{ padding: 22, flex: 1 }}>
        <h3 style={{ marginTop: 0 }}>待确认方案</h3>
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>方案</th><th>道具/分块</th><th>包装体积</th><th>运输箱</th><th>建议工时</th><th>遗留规则项</th><th style={{ width: 200 }}>操作</th></tr></thead>
            <tbody>
              {candidates.map((s) => {
                const pk = calcPackaging(s.items, matMap);
                const win = winOf(s.windowId);
                const issueCount = win
                  ? findCollisions(s.items, matMap).length + findOutOfBounds(s.items, win, matMap).length +
                    findAccessIssues(s.items, win, matMap).length + displayRules(s.items, win).length
                  : 0;
                const pieces = s.items.reduce((n, i) => n + (i.panelPieces?.length ?? 0), 0);
                return (
                  <tr key={s.id}>
                    <td>{s.name}{s.status === 'confirmed' && <span className="tag" style={{ marginLeft: 8 }}>已确认</span>}</td>
                    <td className="small">{s.items.length} 件 / KT {pieces} 块</td>
                    <td className="small">{(pk.totalVolume / 1e6).toFixed(2)} m³ / {pk.totalWeight.toFixed(0)}kg</td>
                    <td>{pk.boxCount} 箱(120×80×100)</td>
                    <td>{pk.laborHours} 工时</td>
                    <td className={issueCount ? 'pill-warn' : 'muted'}>{issueCount ? `${issueCount} 项待留意` : '无'}</td>
                    <td>
                      <button className="primary" disabled={generating === s.id} onClick={() => confirm(s.id)}>
                        {generating === s.id ? '渲染三视图…' : '生成确认书'}
                      </button>
                      <button style={{ marginLeft: 6 }} onClick={() => onOpen(s.id)}>回去调整</button>
                    </td>
                  </tr>
                );
              })}
              {!candidates.length && <tr><td colSpan={7}><div className="empty">暂无可确认的方案</div></td></tr>}
            </tbody>
          </table>
        </div>

        <h3>已存档确认书</h3>
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>方案</th><th>品牌</th><th>签字人</th><th>签字时间</th><th style={{ width: 180 }}>操作</th></tr></thead>
            <tbody>
              {state.docs.map((d) => (
                <tr key={d.id}>
                  <td>{d.schemeName}</td>
                  <td>{d.brand || '—'}</td>
                  <td>{d.signedBy}</td>
                  <td className="small muted">{formatTime(d.signedAt)}</td>
                  <td>
                    <button onClick={() => setViewDoc(d)}>查看</button>
                    <button style={{ marginLeft: 6 }} onClick={() => exportDoc(d)}>导出文件</button>
                  </td>
                </tr>
              ))}
              {!state.docs.length && <tr><td colSpan={5}><div className="empty">暂无存档</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {viewDoc && <ConfirmDocModal doc={viewDoc} items={state.schemes.find((s) => s.id === viewDoc.schemeId)?.items ?? []} matMap={matMap} onClose={() => setViewDoc(null)} />}
    </>
  );
}

function ConfirmDocModal({ doc, items, matMap, onClose }: {
  doc: ConfirmDoc; items: PlacedItem[]; matMap: Map<ID, Material>; onClose: () => void;
}) {
  const pieces = items.filter((i) => i.panelPieces?.length).flatMap((i) => i.panelPieces!.map((p) => ({ item: i.name, p })));
  return (
    <Modal title={`确认书 —— ${doc.schemeName}`} onClose={onClose} wide>
      <div className="col">
        <div className="row small muted">
          品牌 {doc.brand || '—'} · 签字人 {doc.signedBy} · {formatTime(doc.signedAt)}
        </div>
        <div>
          <strong className="small">正面 / 侧面 / 俯视效果图</strong>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
            {(['front', 'side', 'top'] as const).map((k) => (
              <div key={k} className="card" style={{ padding: 6 }}>
                <img src={doc.shots[k]} style={{ width: '100%', borderRadius: 6 }} alt={k} />
                <div className="small muted" style={{ textAlign: 'center', marginTop: 4 }}>
                  {k === 'front' ? '正面' : k === 'side' ? '侧面' : '俯视'}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <strong className="small">物料分块拼装图(KT 板编号)</strong>
          <div className="card small" style={{ background: 'var(--panel2)', marginTop: 8, lineHeight: 2 }}>
            {pieces.length ? pieces.map(({ item, p }) => (
              <span key={p.code} className="tag" style={{ marginRight: 6 }}>{item} / {p.code}({p.w.toFixed(0)}×{p.h.toFixed(0)})</span>
            )) : <span className="muted">无 KT 分块物料</span>}
          </div>
        </div>
        <div>
          <strong className="small">整箱包装用量汇总</strong>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>物料</th><th>数量</th><th>折叠尺寸</th><th>总体积</th><th>重量</th></tr></thead>
            <tbody>
              {doc.packaging.lines.map((l) => (
                <tr key={l.materialId}>
                  <td>{l.name}</td><td>{l.count}</td>
                  <td className="small muted">{l.foldedSize.w.toFixed(0)}×{l.foldedSize.h.toFixed(0)}×{l.foldedSize.d.toFixed(0)}</td>
                  <td className="small">{(l.totalVolume / 1e6).toFixed(3)} m³</td>
                  <td className="small">{l.weight.toFixed(1)} kg</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row small" style={{ marginTop: 10, gap: 18 }}>
            <span>合计体积 <strong>{(doc.packaging.totalVolume / 1e6).toFixed(2)} m³</strong></span>
            <span>总重 <strong>{doc.packaging.totalWeight.toFixed(1)} kg</strong></span>
            <span>运输箱 <strong>{doc.packaging.boxCount}</strong> 箱</span>
            <span>建议安装工时 <strong>{doc.packaging.laborHours} h</strong></span>
          </div>
        </div>
        {doc.issues.length > 0 && (
          <div className="card small" style={{ borderColor: '#5a4a28' }}>
            <strong>安装留意事项({doc.issues.length})</strong>
            {doc.issues.slice(0, 8).map((i, k) => (
              <div key={k} className={`pill-${i.level === 'error' ? 'error' : i.level === 'warning' ? 'warn' : 'info'}`} style={{ marginTop: 4 }}>· {i.message}</div>
            ))}
          </div>
        )}
        <div className="card" style={{ background: 'var(--panel2)' }}>
          客户签字:<strong style={{ marginLeft: 12, textDecoration: 'underline' }}>{doc.signedBy}</strong>
          <span className="muted small" style={{ marginLeft: 16 }}>确认日期 {formatTime(doc.signedAt)}</span>
        </div>
      </div>
    </Modal>
  );
}
