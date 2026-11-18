import './styles.css';
import { AppShell } from './ui/shell';
import { store } from './data/store';

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app 根节点缺失');

  // 弹层/提示挂载点
  const toastRoot = document.createElement('div');
  toastRoot.id = 'toast-root';
  const modalRoot = document.createElement('div');
  modalRoot.id = 'modal-root';
  document.body.append(toastRoot, modalRoot);

  try {
    await store.init();
  } catch (e) {
    root.innerHTML = `<div style="padding:40px;color:#ff6b6b;font-family:sans-serif">
      初始化失败（IndexedDB 不可用？）：${(e as Error).message}</div>`;
    return;
  }

  if (!location.hash) location.hash = '/plans';
  const shell = new AppShell(root);
  shell.start();
}

void bootstrap();
