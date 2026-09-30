// Real-time headless Chrome screenshots and page checks (the sync poll makes --virtual-time-budget hang):
//   node scripts/shots.mjs <url> <outprefix> [--eval "js"] [--shots light,dark] [--w 390 --h 844] [--wait 4000] [--full]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const args = process.argv.slice(2);
const url = args[0], out = args[1];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const W = +opt('w', 390), H = +opt('h', 844), WAIT = +opt('wait', 4000);
const themes = opt('shots', 'light,dark').split(',').filter(Boolean);
const evalJs = opt('eval', '');
const script = opt('script', '');
const full = args.includes('--full');
const port = 9300 + Math.floor(Math.random() * 500);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trip-shots-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const waiters = new Map(); const logs = [];
async function connect() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/list`); const t = (await r.json()).find(x => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch { }
    await sleep(200);
  }
  throw new Error('no chrome');
}
function send(method, params = {}) {
  return new Promise((res, rej) => { const i = ++id; waiters.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
}
try {
  ws = new WebSocket(await connect());
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waiters.has(d.id)) { const w = waiters.get(d.id); waiters.delete(d.id); d.error ? w.rej(new Error(d.error.message)) : w.res(d.result); }
    if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) logs.push(d.params.type + ': ' + d.params.args.map(a => a.value ?? a.description).join(' '));
    if (d.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') logs.push('LOG: ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
  });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: W < 700 });
  for (const [ti, theme] of (themes.length ? themes : ['light']).entries()) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
    if (ti === 0) { await send('Page.navigate', { url }); await sleep(WAIT); if (script) { const r = await send('Runtime.evaluate', { expression: fs.readFileSync(script, 'utf8'), awaitPromise: true, returnByValue: true }); console.log('SCRIPT:', JSON.stringify(r.result.value ?? r.exceptionDetails?.exception?.description)); await sleep(800); } }
    else await sleep(600);
    if (evalJs && ti === 0) { const r = await send('Runtime.evaluate', { expression: evalJs, awaitPromise: true, returnByValue: true }); console.log('EVAL:', JSON.stringify(r.result.value ?? r.exceptionDetails?.exception?.description)); }
    if (themes.length) {
      let clip;
      if (full) { const m = await send('Page.getLayoutMetrics'); clip = { x: 0, y: 0, width: W, height: Math.min(m.cssContentSize.height, 12000), scale: 1 }; }
      const s = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) });
      fs.writeFileSync(`${out}-${theme}.png`, Buffer.from(s.data, 'base64'));
    }
  }
  console.log('LOGS:', logs.length ? '\n' + logs.join('\n') : 'none');
} catch (e) { console.error('ERR', e.message); }
finally { chrome.kill('SIGTERM'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } process.exit(0); }
