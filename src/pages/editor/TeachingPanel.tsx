import { useMemo, useState } from 'react';
import type { PlacedItem } from '../../types';
import { scoreTeaching, type TeachingScore } from '../../domain/packaging';

export function TeachingPanel({ items, target, onExit }: {
  items: PlacedItem[];
  target: PlacedItem[];
  onExit: () => void;
}) {
  const [score, setScore] = useState<TeachingScore | null>(null);
  const ready = useMemo(() => items.length >= target.length && target.length > 0, [items.length, target.length]);

  return (
    <div className="scroll" style={{ padding: 12 }}>
      <div className="card" style={{ background: 'var(--panel2)' }}>
        <strong>教学模式</strong>
        <div className="small muted" style={{ margin: '8px 0', lineHeight: 1.7 }}>
          目标陈列已隐藏,请凭要求在橱窗中自行摆放 {target.length} 件道具(含主推焦点、色系节奏与疏密关系)。
          完成后点击评分,系统会指出差距。
        </div>
        <div className="small">当前已摆 {items.length} 件</div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="primary" disabled={!ready} onClick={() => setScore(scoreTeaching(items, target))}>
            {ready ? '提交评分' : `继续摆放(还差 ${Math.max(0, target.length - items.length)} 件)`}
          </button>
          <button className="danger ghost" onClick={onExit}>退出教学</button>
        </div>
      </div>

      {score && (
        <div className="col" style={{ marginTop: 12, gap: 10 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="kpi" style={{ color: score.total >= 80 ? 'var(--accent2)' : score.total >= 60 ? 'var(--warn)' : 'var(--error)' }}>
              {score.total} 分
            </div>
            <div className="small muted">综合得分</div>
          </div>
          <ScoreBar label="主推焦点位置(权重45%)" value={score.focus} />
          <ScoreBar label="色彩节奏(权重30%)" value={score.color} />
          <ScoreBar label="道具疏密搭配(权重25%)" value={score.density} />
          <div className="card small" style={{ background: 'var(--panel2)', lineHeight: 1.9 }}>
            {score.details.map((d, i) => <div key={i}>· {d}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="row small" style={{ justifyContent: 'space-between' }}>
        <span>{label}</span><span>{value}</span>
      </div>
      <div style={{ height: 8, background: 'var(--panel2)', borderRadius: 4, marginTop: 4, overflow: 'hidden' }}>
        <div style={{
          width: `${value}%`, height: '100%',
          background: value >= 80 ? 'var(--accent2)' : value >= 60 ? 'var(--warn)' : 'var(--error)',
        }} />
      </div>
    </div>
  );
}
