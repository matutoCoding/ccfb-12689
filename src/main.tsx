import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ToastProvider } from './components/ui';
import { bootstrap } from './state/app';
import { runSelfTest } from './test/selftest';
import './styles.css';

if (location.search.includes('selftest')) {
  document.body.style.background = '#0e1014';
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  runSelfTest().then((results) => {
    const failed = results.filter((r) => !r.ok);
    ReactDOM.createRoot(root).render(
      <div style={{ padding: 24, fontFamily: 'monospace', color: '#e8eaf0', fontSize: 14, lineHeight: 1.8 }}>
        <h2 style={{ color: failed.length ? '#ef5350' : '#36c6a0' }}>
          {failed.length ? `✗ ${failed.length} 项失败` : `✓ 全部 ${results.length} 项浏览器自检通过`}
        </h2>
        {results.map((r, i) => (
          <div key={i} style={{ color: r.ok ? '#9aa3b2' : '#ef5350' }}>
            {r.ok ? '✓' : '✕'} {r.name} —— {r.detail}
          </div>
        ))}
        <div id="selftest-done" data-failed={failed.length} />
      </div>,
    );
  }).catch((e) => {
    root.textContent = '自检异常:' + String(e?.stack ?? e);
  });
} else {
  bootstrap().catch((e) => {
    console.error(e);
    document.body.innerHTML = `<div style="padding:40px;color:#ef5350;font-family:sans-serif">
      初始化失败:${String(e?.message ?? e)}<br/>请确认浏览器支持 IndexedDB / WebGL2</div>`;
  });

  // 不使用 React.StrictMode:WebGL2 Renderer 持有命令式 GPU 上下文,
  // StrictMode 的开发期双挂载会让两个渲染器争夺同一 canvas 导致卡死(生产构建本就无双挂载)。
  // 渲染循环内部仍有 alive 守卫与显式 dispose 保证卸载安全。
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
}
