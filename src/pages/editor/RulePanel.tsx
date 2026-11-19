import type { ID, PlacedItem, RuleIssue } from '../../types';

export function RulePanel({ issues, items, onSelect }: {
  issues: RuleIssue[];
  items: PlacedItem[];
  onSelect: (id: ID) => void;
}) {
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warning');
  const infos = issues.filter((i) => i.level === 'info');
  return (
    <div className="scroll" style={{ padding: 12 }}>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="tag pill-error">错误 {errors.length}</span>
        <span className="tag pill-warn">警告 {warns.length}</span>
        <span className="tag pill-info">提示 {infos.length}</span>
      </div>
      {!issues.length && <div className="empty small">✓ 实时规则校验通过<br />碰撞 / 准入 / 色彩 / 黄金视线 / 配饰搭配均无问题</div>}
      <div className="col" style={{ gap: 8 }}>
        {issues.map((i, k) => (
          <div key={k} className="card" style={{
            padding: 10, borderColor: i.level === 'error' ? '#5a2f33' : i.level === 'warning' ? '#5a4a28' : 'var(--line)',
            cursor: i.itemId ? 'pointer' : 'default',
          }} onClick={() => i.itemId && onSelect(i.itemId)}>
            <div className={`small pill-${i.level === 'error' ? 'error' : i.level === 'warning' ? 'warn' : 'info'}`}>
              {i.level === 'error' ? '✕' : i.level === 'warning' ? '⚠' : 'ℹ'} {i.code}
            </div>
            <div className="small" style={{ marginTop: 5, lineHeight: 1.6 }}>{i.message}</div>
          </div>
        ))}
      </div>
      <div className="small muted" style={{ marginTop: 14, lineHeight: 1.8 }}>
        校验项:道具间碰撞(净距1.5cm)、橱窗边界、门洞/货梯准入、同色系连续占位≤4、黄金视线区(80–170cm)空档、主推款配饰同组、挂杆容量、叠装塔限高。
      </div>
    </div>
  );
}
