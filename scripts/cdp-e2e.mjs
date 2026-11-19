/* 端到端交互:每次开全新 target,CDP 模拟点击走通主流程并截图 */
import fs from 'node:fs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9222;
const APP = 'http://127.0.0.1:5180/';

async function main() {
  // 全新 target,避免与残留调试会话冲突
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(APP)}`, { method: 'PUT' })).json();
  await sleep(2500);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result ?? msg);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      logs.push('EXCEPTION: ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      logs.push('CONSOLE.ERROR: ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const send = (method, params) => new Promise((resolve, reject) => {
    const mid = ++id;
    const timer = setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error(method + ' 超时')); } }, 10000);
    pending.set(mid, (v) => { clearTimeout(timer); resolve(v); });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJs = (expression) => send('Runtime.evaluate', { expression, returnByValue: true });
  const clickByText = async (text) => (await evalJs(`(() => {
    const el = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)} || b.textContent.includes(${JSON.stringify(text)}));
    if (!el) return 'MISSING';
    el.click(); return 'OK';
  })()`)).result?.value;
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`test-out/${name}.png`, Buffer.from(r.data, 'base64'));
  };

  await send('Runtime.enable');
  await send('Page.enable');
  const steps = [];

  // 1. 新建方案
  steps.push(['新建方案', await clickByText('＋ 新建方案')]);
  await sleep(1600);
  const inEditor = await evalJs(`!!document.querySelector('canvas') && document.body.innerText.includes('陈列预览 ——')`);
  steps.push(['进入编辑器(canvas 挂载)', inEditor.result?.value ? 'OK' : 'FAIL']);
  await shot('e2e-1-editor-empty');

  // 2. 放物料
  steps.push(['加横杆挂装', await clickByText('＋ 横杆挂装(自动算容量)')]);
  await sleep(400);
  await clickByText('静谧系列三人组');
  await sleep(400);
  await clickByText('亚克力悬浮展台 A');
  await sleep(500);
  const itemCount = await evalJs(`document.body.innerText.match(/\\d+ 件/)?.[0]`);
  steps.push(['物料投放计数', itemCount.result?.value ? 'OK:' + itemCount.result.value : 'FAIL']);
  await shot('e2e-2-items-placed');

  // 在编辑器左栏(排除 nav)内按精确文本点 tab,避免误触主导航
  const clickTab = async (text) => evalJs(`(() => {
    const el = [...document.querySelectorAll('button')].find(b => !b.closest('nav') && b.textContent.trim() === ${JSON.stringify(text)});
    if (!el) return 'MISSING';
    el.click(); return 'OK';
  })()`).then((r) => r.result?.value);

  // 3. 环境面板调雾
  await clickTab('环境');
  await sleep(300);
  await evalJs(`(() => {
    const range = document.querySelector('input[type=range]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(range, '0.7');
    range.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(300);
  await shot('e2e-3-foggy');

  // 4. 放超限样件,验证规则报警(先回编辑器物料 tab)
  await clickTab('物料');
  await sleep(300);
  await clickByText('超大异形装置');
  await sleep(700);
  const ruleText = await evalJs(`document.body.innerText`);
  const hasRule = /DOOR_BLOCK|超门洞|COLLISION|OUT_OF_WINDOW|ELEVATOR|无法进店/.test(ruleText.result?.value ?? '');
  steps.push(['规则引擎实时报警', hasRule ? 'OK' : 'FAIL']);
  await shot('e2e-4-rule-alert');

  // 5. 套节庆模板
  await clickTab('模板');
  await sleep(300);
  await clickByText('节庆');
  await sleep(800);
  await shot('e2e-5-festive-template');
  const tplOk = await evalJs(`document.querySelector('canvas') !== null`);
  steps.push(['模板套用后场景仍渲染', tplOk.result?.value ? 'OK' : 'FAIL']);

  // 6. 回方案管理验证持久化
  await evalJs(`[...document.querySelectorAll('nav button')].find(b => b.textContent.includes('方案管理'))?.click()`);
  await sleep(1200);
  const persisted = await evalJs(`document.body.innerText.includes('未命名主题方案')`);
  steps.push(['方案持久化到 IndexedDB', persisted.result?.value ? 'OK' : 'FAIL']);
  await shot('e2e-6-schemes-list');

  console.log('--- E2E 步骤 ---');
  for (const [n, r] of steps) console.log(`${String(r).startsWith('OK') ? '✓' : '✗'} ${n}: ${r}`);
  console.log('--- JS 异常 ---');
  console.log(logs.length ? logs.join('\n') : '无');
  ws.close();
  const failed = steps.filter(([, r]) => !String(r).startsWith('OK')).length;
  process.exit(failed || logs.length ? 1 : 0);
}
main().catch((e) => { console.error('E2E 异常:', e); process.exit(3); });
