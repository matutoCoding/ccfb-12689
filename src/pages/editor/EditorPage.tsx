import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  EnvSettings, ID, Material, PlacedItem, RuleIssue, Vec3, Viewpoint,
} from '../../types';
import { appStore, refreshSchemes } from '../../state/app';
import { repo } from '../../db/repo';
import { PageHeader } from '../../components/AppLayout';
import { useToast } from '../../components/ui';
import { uid, v3, rad, clamp } from '../../lib/math';
import { EditorViewport, type ViewportApi } from './EditorViewport';
import { OrbitCamera } from '../../engine/OrbitCamera';
import { itemSize } from '../../engine/ModelRegistry';
import { findAccessIssues, findCollisions, findOutOfBounds, splitKTBoard, getAABB } from '../../domain/geometryRules';
import { displayRules, railCapacity } from '../../domain/displayRules';
import { autoLayout } from '../../domain/autolayout';
import { TEMPLATES } from '../../domain/templates';
import { RulePanel } from './RulePanel';
import { ViewpointBar } from './ViewpointBar';
import { ScreenshotTool } from './ScreenshotTool';
import { TeachingPanel } from './TeachingPanel';

export function EditorPage({ schemeId, onBack }: { schemeId: string | null; onBack: () => void }) {
  const state = appStore.useStore((s) => s);
  const toast = useToast();
  const scheme = state.schemes.find((s) => s.id === schemeId) ?? null;
  const win = useMemo(
    () => state.windows.find((w) => w.id === scheme?.windowId) ?? state.windows[0] ?? null,
    [state.windows, scheme?.windowId],
  );
  const matMap = useMemo(() => new Map(state.materials.map((m) => [m.id, m])), [state.materials]);

  const [items, setItems] = useState<PlacedItem[]>([]);
  const [selected, setSelected] = useState<Set<ID>>(new Set());
  const [activeVp, setActiveVp] = useState<Viewpoint | null>(null);
  const [showPanelLines, setShowPanelLines] = useState(true);
  const [dragMode, setDragMode] = useState<'move' | 'rotate' | 'height'>('move');
  const [env, setEnv] = useState<EnvSettings | null>(null);
  const [teaching, setTeaching] = useState(false);
  const [leftTab, setLeftTab] = useState<'materials' | 'items' | 'env' | 'template'>('materials');
  const apiRef = useRef<ViewportApi | null>(null);
  const fpsRef = useRef(60);
  const labelsRef = useRef<{ id: string; text: string; x: number; y: number; color: string }[]>([]);
  const [, forceTick] = useState(0);
  const saveTimer = useRef<number | undefined>(undefined);

  // 切换方案时载入
  useEffect(() => {
    if (scheme) {
      setItems(structuredClone(scheme.items));
      setSelected(new Set());
      setEnv(structuredClone(scheme.env));
      setActiveVp(null);
      setTeaching(false);
    }
  }, [schemeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 自动持久化:拖拽结束(commit)后防抖 600ms 落库,连续调参不产生堆积
  const scheduleSave = (next: PlacedItem[], nextEnv?: EnvSettings) => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      if (!scheme) return;
      await repo.schemes.save({
        ...scheme,
        items: structuredClone(next),
        env: nextEnv ? structuredClone(nextEnv) : scheme.env,
        changeLog: scheme.changeLog,
      });
      await refreshSchemes();
    }, 600);
  };

  if (!scheme || !win) {
    return <div className="empty">请先在方案管理中创建方案,并在橱窗配置中建立门店档案<br /><button style={{ marginTop: 12 }} onClick={onBack}>返回方案管理</button></div>;
  }
  const currentEnv = env ?? scheme.env;

  // ---- 规则实时校验 ----
  const issues: RuleIssue[] = useMemo(() => [
    ...findCollisions(items, matMap),
    ...findOutOfBounds(items, win, matMap),
    ...findAccessIssues(items, win, matMap),
    ...displayRules(items, win),
  ], [items, win, matMap]);

  const flags = useMemo(() => {
    const m = new Map<ID, 'error' | 'warn'>();
    for (const i of issues) {
      if (!i.itemId) continue;
      m.set(i.itemId, i.level === 'error' ? 'error' : 'warn');
    }
    return m;
  }, [issues]);

  function updateItems(next: PlacedItem[], persist = true) {
    setItems(next);
    if (persist) scheduleSave(next);
  }

  function handlePick(id: ID | null, additive: boolean) {
    setSelected((prev) => {
      const next = new Set(additive ? prev : []);
      if (id) {
        if (next.has(id)) next.delete(id); else next.add(id);
      }
      return next;
    });
  }

  function handleMove(id: ID, pos: Vec3, rotY: number, commit: boolean) {
    const next = items.map((i) => (i.id === id ? { ...i, position: pos, rotationY: rotY } : i));
    updateItems(next, commit);
  }

  function addMaterial(m: Material) {
    const floorY = win.platformHeight;
    const item: PlacedItem = {
      id: uid('pi'), kind: 'material', refId: m.id, name: m.name,
      position: v3(clamp((Math.random() - 0.5) * win.width * 0.4, -win.width / 2 + 20, win.width / 2 - 20), floorY, win.depth / 2 - 60),
      rotationY: 0, scale: 1, color: m.color, hueTag: m.hueTag, isHero: m.isHero, isAccessory: m.isAccessory,
      wallMount: m.wallSlot,
    };
    if (m.category === 'kt') {
      item.panelPieces = splitKTBoard(m.size.w, m.size.h);
      item.position = v3(0, floorY + 20, -win.depth / 2 + 6);
      item.wallMount = true;
    }
    updateItems([...items, item]);
    setSelected(new Set([item.id]));
  }

  function addGroup(mannequins: PlacedItem['mannequins'], name: string, refId: string) {
    const item: PlacedItem = {
      id: uid('pi'), kind: 'mannequinGroup', refId, name,
      position: v3(0, win.platformHeight, win.depth / 2 - 80),
      rotationY: 0, scale: 1,
      mannequins: structuredClone(mannequins),
    };
    updateItems([...items, item]);
    setSelected(new Set([item.id]));
  }

  function addRail() {
    const item: PlacedItem = {
      id: uid('pi'), kind: 'material', refId: 'mat-seed-rail', name: '横杆挂装',
      position: v3(0, win.platformHeight, -win.depth / 2 + 40), rotationY: 0, scale: 1,
      rail: { spacing: 8, garments: 10, hueTags: ['米白', '米白', '灰', '米白', '灰', '灰', '驼', '米白', '驼', '灰'] },
    };
    updateItems([...items, item]);
    setSelected(new Set([item.id]));
  }
  function addTower() {
    const item: PlacedItem = {
      id: uid('pi'), kind: 'material', refId: 'mat-seed-tower', name: '叠装塔',
      position: v3(win.width * 0.25, win.platformHeight, win.depth / 2 - 70), rotationY: 0, scale: 1,
      tower: { levels: 4, levelHeight: 28 },
    };
    updateItems([...items, item]);
    setSelected(new Set([item.id]));
  }

  function addKit(kitId: string) {
    const kit = state.kits.find((k) => k.id === kitId);
    if (!kit) return;
    const baseX = -win.width / 2 + 80;
    const expanded = kit.items.map((i) => ({
      ...structuredClone(i), id: uid('pi'),
      position: v3(i.position.x + baseX, win.platformHeight, i.position.z + win.depth / 2 - 80),
      mannequins: i.mannequins?.map((mn) => ({ ...mn })),
    }));
    updateItems([...items, ...expanded]);
    setSelected(new Set(expanded.map((i) => i.id)));
    toast.push(`套件「${kit.name}」已放入`);
  }

  function removeSelected() {
    const next = items.filter((i) => !selected.has(i.id));
    updateItems(next);
    setSelected(new Set());
  }

  function patchSelected(patch: Partial<PlacedItem>) {
    const next = items.map((i) => (selected.has(i.id) ? { ...i, ...patch } : i));
    updateItems(next);
  }

  function patchItem(id: ID, patch: Partial<PlacedItem>) {
    updateItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function runAutoLayout() {
    const next = autoLayout(items, win, matMap);
    updateItems(next);
    toast.push('已按橱窗尺寸自动重排,锁定道具保持原位');
  }

  function applyTemplate(tplId: string) {
    const tpl = TEMPLATES.find((t) => t.id === tplId)!;
    const { items: tplItems, teachingTarget } = tpl.build(win);
    updateItems(tplItems);
    if (scheme) {
      scheduleSave(tplItems);
    }
    void teachingTarget;
    toast.push(`已套用「${tpl.name}」模板,可继续微调`);
  }

  function startTeaching() {
    const tpl = TEMPLATES[0];
    const { teachingTarget } = tpl.build(win);
    updateItems([], false);
    setTeaching(true);
    setSelected(new Set());
    // 目标阵暂存到 scheme(不直接展示)
    if (scheme) {
      repo.schemes.save({ ...scheme, teachingTarget }).then(refreshSchemes);
    }
    toast.push('教学模式:按目标陈列自行摆放,完成后查看评分');
  }

  function updateEnv(patch: Partial<EnvSettings>) {
    const next = { ...currentEnv, ...patch };
    setEnv(next);
    scheduleSave(items, next);
  }

  function saveVpBookmark(name: string, eyeHeight: number) {
    const vp = apiRef.current!.saveViewpoint(name, eyeHeight);
    const cur = scheme!;
    const next = [...(cur.viewpoints ?? []), vp];
    repo.schemes.save({ ...cur, viewpoints: next, items }).then(refreshSchemes);
    toast.push(`机位「${name}」已存为书签`);
  }

  const selItem = items.find((i) => selected.has(i.id)) ?? null;

  return (
    <>
      <PageHeader title={`陈列预览 —— ${scheme.name}`}
        desc={`${win.storeName} · 橱窗 ${win.width}×${win.depth}×${win.height}cm · 地台 ${win.platformHeight}cm`}
        actions={
          <>
            <button onClick={onBack}>← 返回列表</button>
            <button onClick={runAutoLayout}>自动重排</button>
            <button className="danger" onClick={removeSelected} disabled={!selected.size}>删除选中</button>
          </>
        } />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 左栏 */}
        <div style={{ width: 268, flexShrink: 0, borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: 'var(--panel)' }}>
          <div className="row" style={{ padding: 8, gap: 4, flexWrap: 'wrap' }}>
            {([['materials', '物料'], ['items', '阵位'], ['env', '环境'], ['template', '模板']] as const).map(([k, label]) => (
              <button key={k} className={leftTab === k ? 'primary' : 'ghost'} style={{ padding: '6px 10px' }} onClick={() => setLeftTab(k)}>{label}</button>
            ))}
          </div>
          <div className="scroll" style={{ flex: 1, padding: 10 }}>
            {leftTab === 'materials' && (
              <div className="col" style={{ gap: 8 }}>
                <button onClick={addRail}>＋ 横杆挂装(自动算容量)</button>
                <button onClick={addTower}>＋ 叠装塔(层数可调)</button>
                <div className="small muted" style={{ margin: '4px 0' }}>模特组</div>
                {state.groups.map((g) => (
                  <button key={g.id} className="ghost" style={{ textAlign: 'left' }} onClick={() => addGroup(g.mannequins, g.name, g.id)}>
                    👤 {g.name}({g.mannequins.length}人)
                  </button>
                ))}
                <div className="small muted" style={{ margin: '4px 0' }}>自定义套件</div>
                {state.kits.map((k) => (
                  <button key={k.id} className="ghost" style={{ textAlign: 'left' }} onClick={() => addKit(k.id)}>🧩 {k.name}</button>
                ))}
                <div className="small muted" style={{ margin: '4px 0' }}>物料({state.materials.length})</div>
                {state.materials.map((m) => (
                  <button key={m.id} className="ghost" style={{ textAlign: 'left', display: 'block' }} onClick={() => addMaterial(m)}>
                    {m.name}
                    <span className="small muted" style={{ float: 'right' }}>{m.size.w}×{m.size.h}×{m.size.d}</span>
                  </button>
                ))}
              </div>
            )}
            {leftTab === 'items' && (
              <div className="col" style={{ gap: 6 }}>
                {items.map((i) => (
                  <div key={i.id} className="card" style={{
                    padding: 8, cursor: 'pointer',
                    borderColor: selected.has(i.id) ? 'var(--accent)' : 'var(--line)',
                  }} onClick={() => handlePick(i.id, false)}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong className="small ellipsis" style={{ maxWidth: 130 }}>{i.name}</strong>
                      {i.locked && <span className="tag hot">锁定</span>}
                    </div>
                    <div className="small muted">
                      x:{i.position.x.toFixed(0)} y:{i.position.y.toFixed(0)} z:{i.position.z.toFixed(0)}
                      {i.isHero && ' · 主推'}{i.isAccessory && ' · 配饰'}
                    </div>
                  </div>
                ))}
                {!items.length && <div className="empty small">空橱窗,从物料栏开始摆放</div>}
              </div>
            )}
            {leftTab === 'env' && (
              <EnvPanel env={currentEnv} onChange={updateEnv} />
            )}
            {leftTab === 'template' && (
              <div className="col">
                {TEMPLATES.map((t) => (
                  <button key={t.id} className="card" style={{ textAlign: 'left' }} onClick={() => applyTemplate(t.id)}>
                    <strong>{t.name}</strong>
                    <div className="small muted" style={{ marginTop: 6 }}>{t.desc}</div>
                  </button>
                ))}
                <div className="card" style={{ background: 'var(--panel2)' }}>
                  <strong className="small">教学模式</strong>
                  <div className="small muted" style={{ margin: '8px 0' }}>给定目标陈列,学员自行摆放后按焦点位置 / 色彩节奏 / 疏密打分</div>
                  <button className="primary" onClick={startTeaching}>开始练习</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 中间视口 */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0, background: '#0f1115' }}>
          <EditorViewport
            win={win} items={items} materials={matMap} selected={selected} flags={flags}
            activeViewpoint={activeVp} showPanelLines={showPanelLines}
            fog={currentEnv.fog} lightboxPower={currentEnv.lightboxPower}
            onPick={handlePick} onMove={handleMove}
            onCamera={() => forceTick((n) => n + 1)}
            registerApi={(api) => { apiRef.current = api; }}
            fpsRef={fpsRef} labelsRef={labelsRef}
          />
          {/* KT 编号 HTML 标签层 */}
          {labelsRef.current.map((l) => (
            <div key={l.id} style={{
              position: 'absolute', left: l.x, top: l.y, transform: 'translate(-50%,-50%)',
              fontSize: 11, color: l.color, background: 'rgba(0,0,0,.55)', padding: '1px 6px',
              borderRadius: 6, pointerEvents: 'none', whiteSpace: 'nowrap',
            }}>{l.text}</div>
          ))}
          {/* 顶部工具条 */}
          <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}>
            {([['move', '↔ 移动'], ['rotate', '⟳ 旋转'], ['height', '↕ 高度']] as const).map(([m, label]) => (
              <button key={m} className={dragMode === m ? 'primary' : ''} style={{ padding: '5px 10px' }}
                onClick={() => { setDragMode(m); apiRef.current?.setMode(m); }}>{label}</button>
            ))}
            <label className="switch small" style={{ background: 'rgba(0,0,0,.5)', padding: '6px 10px', borderRadius: 8 }}>
              <input type="checkbox" checked={showPanelLines} onChange={(e) => setShowPanelLines(e.target.checked)} /> KT分块
            </label>
          </div>
          <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,.55)', padding: '5px 12px', borderRadius: 8, fontSize: 12 }}>
            <span style={{ color: fpsRef.current >= 55 ? 'var(--accent2)' : 'var(--warn)' }}>{fpsRef.current} FPS</span>
            <span className="muted" style={{ marginLeft: 10 }}>{items.length} 件 · 左键拖动 / 右键或空白处转视角 / 滚轮缩放 / Shift平移</span>
          </div>
          <ViewpointBar
            viewpoints={scheme.viewpoints ?? []}
            active={activeVp}
            onJump={(vp) => { setActiveVp(vp); apiRef.current?.jumpViewpoint(vp); }}
            onExit={() => { setActiveVp(null); apiRef.current?.clearViewpoint(); }}
            onSave={saveVpBookmark}
          />
          <ScreenshotTool
            getShot={() => apiRef.current?.screenshot() ?? ''}
            win={win} items={items}
          />
        </div>

        {/* 右栏 */}
        <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: 'var(--panel)' }}>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {teaching ? (
              <TeachingPanel items={items} target={scheme.teachingTarget ?? []} onExit={() => setTeaching(false)} />
            ) : (
              <RulePanel issues={issues} items={items} onSelect={(id) => setSelected(new Set([id]))} />
            )}
          </div>
          {selItem && !teaching && (
            <PropertyPanel
              key={selItem.id}
              item={selItem} mat={matMap.get(selItem.refId)}
              onPatch={(p) => patchSelected(p)}
              onPatchItem={(p) => patchItem(selItem.id, p)}
              onSplitKT={() => {
                const m = matMap.get(selItem.refId);
                if (!m) return;
                patchItem(selItem.id, { panelPieces: splitKTBoard(m.size.w, m.size.h) });
                toast.push('KT 板已按标准板材自动分块并编号');
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}

function EnvPanel({ env, onChange }: { env: EnvSettings; onChange: (p: Partial<EnvSettings>) => void }) {
  return (
    <div className="col">
      <div>
        <label>店外站位</label>
        <div className="row">
          {([['mall', '商场内铺'], ['street', '临街店'], ['island', '中庭岛柜']] as const).map(([k, l]) => (
            <button key={k} className={env.locationType === k ? 'primary' : ''} onClick={() => onChange({ locationType: k })}>{l}</button>
          ))}
        </div>
      </div>
      <div><label>门前通道宽度:{env.aisleWidth} cm</label>
        <input type="range" min={120} max={600} value={env.aisleWidth} onChange={(e) => onChange({ aisleWidth: Number(e.target.value) })} style={{ width: '100%' }} /></div>
      <div><label>对铺距离:{env.oppositeDistance} cm</label>
        <input type="range" min={150} max={1500} value={env.oppositeDistance} onChange={(e) => onChange({ oppositeDistance: Number(e.target.value) })} style={{ width: '100%' }} /></div>
      <div><label>玻璃起雾沾灰:{env.fog.toFixed(2)}(表面发花)</label>
        <input type="range" min={0} max={1} step={0.01} value={env.fog} onChange={(e) => onChange({ fog: Number(e.target.value) })} style={{ width: '100%' }} /></div>
      <label className="switch"><input type="checkbox" checked={env.oppositeReflection} onChange={(e) => onChange({ oppositeReflection: e.target.checked })} /> 对面灯箱招牌反光</label>
      <label className="switch"><input type="checkbox" checked={env.lightboxPower} onChange={(e) => onChange({ lightboxPower: e.target.checked })} /> 灯箱通电(关闭=断电发灰)</label>
    </div>
  );
}

function PropertyPanel({ item, mat, onPatch, onPatchItem, onSplitKT }: {
  item: PlacedItem; mat?: Material;
  onPatch: (p: Partial<PlacedItem>) => void;
  onPatchItem: (p: Partial<PlacedItem>) => void;
  onSplitKT: () => void;
}) {
  const size = mat?.size ?? itemSize(item);
  const box = getAABB(item, mat);
  return (
    <div className="card scroll" style={{ borderLeft: 'none', borderRight: 'none', borderBottom: 'none', borderRadius: 0, maxHeight: '46%' }}>
      <strong className="small">{item.name}</strong>
      <div className="col" style={{ marginTop: 10, gap: 8 }}>
        <div className="field-grid">
          <Num label="X 位置" value={item.position.x} onChange={(v) => onPatch({ position: { ...item.position, x: v } })} />
          <Num label="Z 位置" value={item.position.z} onChange={(v) => onPatch({ position: { ...item.position, z: v } })} />
          <Num label="Y 高度" value={item.position.y} onChange={(v) => onPatch({ position: { ...item.position, y: v } })} />
          <Num label="旋转°" value={Math.round(item.rotationY * 180 / Math.PI)} onChange={(v) => onPatch({ rotationY: rad(v) })} />
          <Num label="缩放×" value={item.scale} step={0.05} onChange={(v) => onPatch({ scale: clamp(v, 0.2, 4) })} />
        </div>
        <div className="small muted">实际占地 {size.w}×{size.d}cm,顶高 {(box.max.y).toFixed(0)}cm</div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <label className="switch"><input type="checkbox" checked={!!item.locked} onChange={(e) => onPatch({ locked: e.target.checked })} /> 锁定(不参与自动排)</label>
          <label className="switch"><input type="checkbox" checked={!!item.isHero} onChange={(e) => onPatch({ isHero: e.target.checked })} /> 主推款</label>
          <label className="switch"><input type="checkbox" checked={!!item.isAccessory} onChange={(e) => onPatch({ isAccessory: e.target.checked })} /> 配饰</label>
          {mat?.canFlip && <label className="switch"><input type="checkbox" checked={!!item.flipY} onChange={(e) => onPatch({ flipY: e.target.checked })} /> 翻转</label>}
          {mat?.wallSlot && <label className="switch"><input type="checkbox" checked={!!item.wallMount} onChange={(e) => onPatch({ wallMount: e.target.checked })} /> 挂背板槽位</label>}
        </div>
        <input placeholder="色系标签,如 米白/红/驼" value={item.hueTag ?? ''} onChange={(e) => onPatch({ hueTag: e.target.value || undefined })} />
        {mat?.category === 'kt' && <button onClick={onSplitKT}>按墙面自动分块裁切(KT 标准板 120×240)</button>}
        {item.panelPieces && (
          <div className="card small" style={{ background: 'var(--panel2)', padding: 8 }}>
            分块 {item.panelPieces.length} 块:
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {item.panelPieces.map((p) => <span key={p.code} className="tag">{p.code} {p.w.toFixed(0)}×{p.h.toFixed(0)}</span>)}
            </div>
          </div>
        )}
        {item.rail && (
          <div className="card small" style={{ background: 'var(--panel2)', padding: 8 }}>
            <label>件间距 {item.rail.spacing} cm(容量 {railCapacity(item)} 件)</label>
            <input type="range" min={4} max={20} value={item.rail.spacing}
              onChange={(e) => onPatchItem({ rail: { ...item.rail!, spacing: Number(e.target.value) } })} style={{ width: '100%' }} />
            <label>挂装件数 {item.rail.garments}</label>
            <input type="range" min={1} max={Math.max(20, railCapacity(item))} value={item.rail.garments}
              onChange={(e) => onPatchItem({ rail: { ...item.rail!, garments: Number(e.target.value) } })} style={{ width: '100%' }} />
          </div>
        )}
        {item.tower && (
          <div className="card small" style={{ background: 'var(--panel2)', padding: 8 }}>
            <label>层数 {item.tower.levels}</label>
            <input type="range" min={2} max={8} value={item.tower.levels}
              onChange={(e) => onPatchItem({ tower: { ...item.tower!, levels: Number(e.target.value) } })} style={{ width: '100%' }} />
            <label>每层高度 {item.tower.levelHeight} cm</label>
            <input type="range" min={18} max={40} value={item.tower.levelHeight}
              onChange={(e) => onPatchItem({ tower: { ...item.tower!, levelHeight: Number(e.target.value) } })} style={{ width: '100%' }} />
          </div>
        )}
      </div>
    </div>
  );
}

function Num({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div><label>{label}</label>
      <input type="number" step={step} value={Number(value.toFixed(2))} onChange={(e) => onChange(Number(e.target.value) || 0)} style={{ width: '100%' }} />
    </div>
  );
}
