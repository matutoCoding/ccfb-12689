/* 零依赖 CDP 驱动:连接无头 Chrome,等待 selftest 完成,采集结果与 console */
const BASE = process.argv[2] || 'http://127.0.0.1:5180/?selftest';
const PORT = 9222;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTabs() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`);
  return res.json();
}

async function main() {
  // 每次开全新 target,避免残留调试会话导致命令无响应
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    }
    if (msg.method === 'Runtime.consoleAPICalled' || msg.method === 'Log.entryAdded') {
      const text = msg.params?.args?.map((a) => a.value ?? a.description ?? a.text).join(' ')
        ?? msg.params?.entry?.text;
      if (text) logs.push(text);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      logs.push('EXCEPTION: ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
    }
  };
  const send = (method, params) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: BASE });

  const deadline = Date.now() + 45000;
  let outcome = null;
  while (Date.now() < deadline) {
    await sleep(500);
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const done = document.getElementById('selftest-done');
        if (!done) return null;
        return { failed: done.dataset.failed, text: document.body.innerText };
      })()`,
      returnByValue: true,
    });
    if (r.result?.value) { outcome = r.result.value; break; }
  }
  console.log('--- CONSOLE ---');
  console.log(logs.join('\n') || '(无 console 输出)');
  console.log('--- SELFTEST ---');
  if (!outcome) {
    console.log('超时未完成');
    const dom = await send('Runtime.evaluate', { expression: 'document.body.innerText.slice(0,800)', returnByValue: true });
    console.log(dom.result?.value);
    process.exit(2);
  }
  console.log(outcome.text);
  ws.close();
  process.exit(Number(outcome.failed) > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(3); });
