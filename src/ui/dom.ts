// 极简 DOM 构建工具 + 通用控件
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | EventListener | undefined> = {},
  ...children: (Node | string | undefined | null | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      el.className = String(v);
    } else {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === undefined || c === null || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function clear(el: HTMLElement): void {
  el.replaceChildren();
}

export function label(text: string, cls = 'field-label'): HTMLLabelElement {
  return h('label', { class: cls }, text);
}

export function numberInput(value: number, onInput: (v: number) => void, step = 10): HTMLInputElement {
  const input = h('input', { type: 'number', step, value: Math.round(value) }) as HTMLInputElement;
  input.addEventListener('input', () => onInput(Number(input.value) || 0));
  return input;
}

export function textInput(value: string, onInput: (v: string) => void): HTMLInputElement {
  const input = h('input', { type: 'text', value }) as HTMLInputElement;
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

export function selectInput<T extends string>(
  value: T, options: [T, string][], onChange: (v: T) => void,
): HTMLSelectElement {
  const sel = h('select') as HTMLSelectElement;
  for (const [v, name] of options) {
    sel.append(h('option', { value: v, selected: v === value }, name));
  }
  sel.addEventListener('change', () => onChange(sel.value as T));
  return sel;
}

export function checkInput(checked: boolean, onChange: (v: boolean) => void): HTMLInputElement {
  const c = h('input', { type: 'checkbox' }) as HTMLInputElement;
  c.checked = checked;
  c.addEventListener('change', () => onChange(c.checked));
  return c;
}

export function slider(value: number, min: number, max: number, step: number, onInput: (v: number) => void): HTMLInputElement {
  const s = h('input', { type: 'range', min, max, step, value }) as HTMLInputElement;
  s.addEventListener('input', () => onInput(Number(s.value)));
  return s;
}

export function btn(text: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  return h('button', { class: cls, onClick }, text);
}

export function field(labelText: string, control: HTMLElement, hint?: string): HTMLDivElement {
  return h('div', { class: 'field' },
    label(labelText),
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : undefined,
  );
}

export function badge(text: string, cls = 'badge'): HTMLSpanElement {
  return h('span', { class: cls }, text);
}

export function toast(msg: string, kind: 'info' | 'error' | 'ok' = 'info'): void {
  const t = h('div', { class: `toast toast-${kind}` }, msg);
  document.getElementById('toast-root')?.append(t);
  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, 2600);
}

export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = h('div', { class: 'modal-overlay' });
    const dialog = h('div', { class: 'modal' },
      h('p', { class: 'modal-text' }, message),
      h('div', { class: 'modal-actions' },
        btn('取消', () => { overlay.remove(); resolve(false); }, 'btn btn-ghost'),
        btn('确认', () => { overlay.remove(); resolve(true); }, 'btn btn-danger'),
      ),
    );
    overlay.append(dialog);
    document.getElementById('modal-root')?.append(overlay);
  });
}

export function modal(
  title: string,
  body: HTMLElement,
  footer?: HTMLElement | ((close: () => void) => HTMLElement),
  onClose?: () => void,
): () => void {
  const overlay = h('div', { class: 'modal-overlay', onClick: (e) => {
    if (e.target === overlay) close();
  } });
  const close = (): void => {
    overlay.remove();
    onClose?.();
  };
  const footerEl = typeof footer === 'function' ? footer(close) : footer;
  const dialog = h('div', { class: 'modal modal-lg' },
    h('div', { class: 'modal-head' },
      h('h3', {}, title),
      h('button', { class: 'modal-close', onClick: close }, '×'),
    ),
    h('div', { class: 'modal-body' }, body),
    footerEl ? h('div', { style: 'padding:14px 20px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:10px' }, footerEl) : undefined,
  );
  overlay.append(dialog);
  document.getElementById('modal-root')?.append(overlay);
  return close;
}

export function emptyState(text: string): HTMLDivElement {
  return h('div', { class: 'empty-state' }, text);
}

export function fmtDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
