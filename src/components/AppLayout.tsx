import { type ReactNode } from 'react';

export type PageKey = 'schemes' | 'windows' | 'materials' | 'editor' | 'confirm';

const NAV: { key: PageKey; label: string; icon: string }[] = [
  { key: 'schemes', label: '方案管理', icon: '▦' },
  { key: 'windows', label: '橱窗配置', icon: '▣' },
  { key: 'materials', label: '物料库', icon: '◈' },
  { key: 'editor', label: '陈列预览', icon: '◉' },
  { key: 'confirm', label: '方案确认', icon: '✓' },
];

export function AppLayout({ page, onNav, children }: { page: PageKey; onNav: (p: PageKey) => void; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <nav style={{
        width: 168, flexShrink: 0, background: '#171920', borderRight: '1px solid var(--line)',
        display: 'flex', flexDirection: 'column', padding: '18px 12px', gap: 6,
      }}>
        <div style={{ fontWeight: 700, fontSize: 15, padding: '6px 10px 18px', lineHeight: 1.4 }}>
          橱窗陈列<br /><span style={{ color: 'var(--accent)' }}>实时设计系统</span>
        </div>
        {NAV.map((n) => (
          <button
            key={n.key}
            className={page === n.key ? 'primary' : 'ghost'}
            style={{ textAlign: 'left', display: 'flex', gap: 8, alignItems: 'center' }}
            onClick={() => onNav(n.key)}
          >
            <span style={{ fontSize: 16 }}>{n.icon}</span>{n.label}
          </button>
        ))}
        <div className="small muted" style={{ marginTop: 'auto', padding: 10, lineHeight: 1.7 }}>
          WebGL2 引擎<br />IndexedDB 本地存储<br />数据不出本机
        </div>
      </nav>
      <main style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  );
}

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', padding: '16px 22px 12px', borderBottom: '1px solid var(--line)' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
        {desc && <div className="small muted" style={{ marginTop: 4 }}>{desc}</div>}
      </div>
      <div className="row">{actions}</div>
    </div>
  );
}
