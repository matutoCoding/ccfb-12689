import { h, clear } from './dom';
import { store } from '../data/store';
import { PlansPage } from './pages/PlansPage';
import { WindowPage } from './pages/WindowPage';
import { LibraryPage } from './pages/LibraryPage';
import { PreviewPage } from './pages/PreviewPage';
import { ConfirmPage } from './pages/ConfirmPage';

export type Route =
  | { page: 'plans' }
  | { page: 'window'; planId: string }
  | { page: 'library' }
  | { page: 'preview'; planId: string }
  | { page: 'confirm'; planId: string };

interface PageInstance {
  destroy?: () => void;
}

const NAV: [Route['page'], string, string][] = [
  ['plans', '方案管理', '📋'],
  ['window', '橱窗配置', '🪟'],
  ['library', '物料库', '📦'],
  ['preview', '陈列预览', '🎬'],
  ['confirm', '方案确认', '✅'],
];

export function parseHash(): Route {
  const hash = location.hash.replace(/^#\/?/, '');
  const [page, id] = hash.split('/');
  if (page === 'window' && id) return { page: 'window', planId: id };
  if (page === 'preview' && id) return { page: 'preview', planId: id };
  if (page === 'confirm' && id) return { page: 'confirm', planId: id };
  if (page === 'library') return { page: 'library' };
  return { page: 'plans' };
}

export function navigate(route: Route): void {
  const id = 'planId' in route ? route.planId : '';
  location.hash = id ? `/${route.page}/${id}` : `/${route.page}`;
}

export class AppShell {
  private content = h('main', { class: 'content' });
  private current: PageInstance | undefined;

  constructor(root: HTMLElement) {
    const nav = h('nav', { class: 'side-nav' },
      h('div', { class: 'brand' },
        h('div', { class: 'brand-mark' }, '橱'),
        h('div', { class: 'brand-text' },
          h('strong', {}, '橱窗陈列工作室'),
          h('small', {}, '实时设计系统'),
        ),
      ),
      h('div', { class: 'nav-list' },
        ...NAV.map(([page, name, icon]) =>
          h('a', {
            class: 'nav-item', 'data-page': page,
            onClick: () => {
              const planId = store.currentPlanId;
              if ((page === 'window' || page === 'preview' || page === 'confirm') && !planId) {
                navigate({ page: 'plans' });
              } else if (page === 'plans' || page === 'library') {
                navigate({ page });
              } else if (planId) {
                navigate({ page, planId } as Route);
              }
            },
          }, h('span', { class: 'nav-icon' }, icon), name),
        ),
      ),
      h('div', { class: 'nav-foot' }, '数据保存在本地 IndexedDB'),
    );

    root.append(h('div', { class: 'app-shell' }, nav, this.content));
    window.addEventListener('hashchange', () => this.route());
    store.subscribe(() => this.highlightNav());
  }

  start(): void {
    this.route();
  }

  private highlightNav(): void {
    const route = parseHash();
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', (el as HTMLElement).dataset.page === route.page);
    });
  }

  route(): void {
    const route = parseHash();
    if (('planId' in route) && route.planId) store.currentPlanId = route.planId;
    this.current?.destroy?.();
    clear(this.content);
    this.highlightNav();

    switch (route.page) {
      case 'plans':
        this.current = new PlansPage(this.content).render();
        break;
      case 'window':
        this.current = new WindowPage(this.content, route.planId).render();
        break;
      case 'library':
        this.current = new LibraryPage(this.content).render();
        break;
      case 'preview':
        this.current = new PreviewPage(this.content, route.planId).render();
        break;
      case 'confirm':
        this.current = new ConfirmPage(this.content, route.planId).render();
        break;
    }
  }
}
