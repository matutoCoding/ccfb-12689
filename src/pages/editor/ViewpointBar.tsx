import { useState } from 'react';
import type { Viewpoint } from '../../types';

// 行人视点:成人 160cm / 儿童 120cm 眼高,机位书签一键跳转
export function ViewpointBar({ viewpoints, active, onJump, onExit, onSave }: {
  viewpoints: Viewpoint[];
  active: Viewpoint | null;
  onJump: (vp: Viewpoint) => void;
  onExit: () => void;
  onSave: (name: string, eyeHeight: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'absolute', left: 10, bottom: 10, display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: '60%' }}>
      <button style={{ padding: '5px 10px' }} onClick={() => setOpen(!open)}>👁 行人视点</button>
      {open && (
        <div className="card" style={{ padding: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => onSave(`成人机位${viewpoints.length + 1}`, 160)}>存成人(160)</button>
          <button onClick={() => onSave(`儿童机位${viewpoints.length + 1}`, 120)}>存儿童(120)</button>
        </div>
      )}
      {viewpoints.map((vp) => (
        <button key={vp.id} style={{ padding: '5px 10px', borderColor: active?.id === vp.id ? 'var(--accent)' : undefined }}
          onClick={() => onJump(vp)}>
          📍 {vp.name}({vp.eyeHeight})
        </button>
      ))}
      {active && <button style={{ padding: '5px 10px' }} className="danger" onClick={onExit}>退出视点</button>}
    </div>
  );
}
