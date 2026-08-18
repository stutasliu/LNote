/* 临时验证：右键菜单「翻译」→ 弹窗展示选中内容（v0.21） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, evalJs, navigateAndWait } from './helpers/cdp.js';
import { startStaticServer } from './helpers/static-server.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist-web');
const HTTP_PORT = 8325;
const DEBUG_PORT = 9337;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function log(s) { console.log('[step] ' + s); }
function withTimeout(promise, ms, what) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('超时: ' + what)), ms))
  ]);
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  | ' + detail : ''));
}

function findEdge() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe')
  ];
  return candidates.find((c) => c && fs.existsSync(c));
}

async function waitForTarget(debugPort, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch('http://127.0.0.1:' + debugPort + '/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* retry */ }
    await sleep(300);
  }
  throw new Error('CDP target 超时未就绪');
}

const SEED = `
(() => {
  localStorage.clear();
  const docs = [
    { id: 'd-t', title: '翻译测试', kind: 'text', content: '第一行：你好世界，欢迎使用文本编辑器。\\nSecond line: hello world, welcome to the editor.', updated: 1000 }
  ];
  localStorage.setItem('inkpad.docs.v1', JSON.stringify(docs));
  localStorage.setItem('inkpad.active.v1', 'd-t');
  docs.forEach((d) => localStorage.setItem('inkpad.content.' + d.id, d.content));
  return true;
})()`;

const CLICK_TRANSLATE = `(() => {
  const it = document.querySelector('.ctx-item[data-cmd="translate"]');
  if (!it) return { ok: false, err: 'no item' };
  it.click();
  return { ok: true };
})()`;

const MODAL_READ = `(() => {
  const m = document.getElementById('translate-modal');
  if (!m) return { ok: false, err: 'no modal' };
  const orig = document.getElementById('translate-orig');
  const res = document.getElementById('translate-result');
  return {
    ok: true,
    display: m.style.display,
    orig: orig ? orig.textContent : '',
    res: res ? res.textContent : '',
    srcLabel: document.getElementById('translate-src-label').textContent,
    dstLabel: document.getElementById('translate-dst-label').textContent
  };
})()`;

let server, edgeProc, cdp;

try {
  log('启动静态服务器');
  server = await withTimeout(startStaticServer(DIST, HTTP_PORT), 5000, 'startStaticServer');
  const edge = findEdge();
  if (!edge) throw new Error('未找到 Edge');
  log('启动 Edge: ' + edge);
  const userDataDir = fs.mkdtempSync(path.join(process.env.TEMP || '.', 'edge-tv-'));
  edgeProc = spawn(edge, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + DEBUG_PORT,
    '--user-data-dir=' + userDataDir,
    '--window-size=1440,900',
    'about:blank'
  ], { stdio: 'ignore' });
  edgeProc.on('error', (e) => log('Edge spawn error: ' + e.message));

  log('等待 CDP target');
  const target = await withTimeout(waitForTarget(DEBUG_PORT), 25000, 'waitForTarget');
  log('连接 CDP: ' + target.webSocketDebuggerUrl.slice(0, 60));
  cdp = new Cdp(target.webSocketDebuggerUrl);
  await withTimeout(cdp.open(), 5000, 'cdp.open');
  await cdp.send('Page.enable');

  log('首次加载页面');
  await withTimeout(navigateAndWait(cdp, 'http://127.0.0.1:' + HTTP_PORT + '/'), 15000, '首次 navigate');
  await sleep(800);

  log('预置数据并重载');
  await evalJs(cdp, SEED);
  await withTimeout(navigateAndWait(cdp, 'http://127.0.0.1:' + HTTP_PORT + '/'), 15000, '重载 navigate');
  await sleep(1500);

  // 1. 右键菜单存在「翻译」项
  let r = await evalJs(cdp, `(() => { const it = document.querySelector('.ctx-item[data-cmd="translate"]'); return it ? { ok: true, label: it.textContent.trim() } : { ok: false, err: 'not found' }; })()`);
  check('右键菜单存在「翻译」项', r.ok, r.ok ? r.label : r.err);
  check('「翻译」项文案包含“翻译”', r.ok && (r.label || '').includes('翻译'), r.label);

  // 2. 选中中文文本 → 触发翻译 → 弹窗展示原文
  await evalJs(cdp, `(() => {
    const cm = document.querySelector('.CodeMirror').CodeMirror;
    cm.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 14 });
    cm.focus();
    return true;
  })()`);
  await sleep(300);
  r = await evalJs(cdp, CLICK_TRANSLATE);
  check('点击「翻译」菜单项', r.ok, r.err || '');
  await sleep(500);
  let m = await evalJs(cdp, MODAL_READ);
  check('翻译弹窗已打开 (display=flex)', m.ok && m.display === 'flex', m.display);
  check('原文区显示选中的中文内容', m.ok && m.orig.includes('你好世界'), JSON.stringify((m.orig || '').slice(0, 20)));
  check('源语言标签为「原文（中文）」', m.ok && m.srcLabel.includes('中文'), m.srcLabel);
  check('目标语言标签为「译文（英文）」', m.ok && m.dstLabel.includes('英文'), m.dstLabel);

  // 3. 等待翻译结果（浏览器回退直连 Google，可能受网络限制；只要求离开「翻译中…」）
  log('等待翻译结果（最长 26 秒）');
  let done = false;
  for (let i = 0; i < 26; i++) {
    await sleep(1000);
    m = await evalJs(cdp, MODAL_READ);
    if (m.ok && m.res !== '翻译中…') { done = true; break; }
  }
  check('译文区已出结果（译文或失败提示）', done, m.ok ? JSON.stringify((m.res || '').slice(0, 40)) : '');
  check('结果区非空', m.ok && m.res.length > 0, String((m.res || '').length));

  // 4. 点击「完成」关闭弹窗
  await evalJs(cdp, `document.getElementById('translate-ok').click(); true`);
  await sleep(300);
  m = await evalJs(cdp, MODAL_READ);
  check('点击「完成」后弹窗关闭', m.ok && m.display === 'none', m.display);

  // 5. 选中英文文本 → 触发 → 语言标签反向
  await evalJs(cdp, `(() => {
    const cm = document.querySelector('.CodeMirror').CodeMirror;
    cm.setSelection({ line: 1, ch: 0 }, { line: 1, ch: 25 });
    cm.focus();
    return true;
  })()`);
  await sleep(300);
  await evalJs(cdp, CLICK_TRANSLATE);
  await sleep(500);
  m = await evalJs(cdp, MODAL_READ);
  check('英文选中 → 弹窗再次打开', m.ok && m.display === 'flex', m.display);
  check('原文区显示选中的英文内容', m.ok && m.orig.includes('hello world'), JSON.stringify((m.orig || '').slice(0, 20)));
  check('源语言标签为「原文（英文）」', m.ok && m.srcLabel.includes('英文'), m.srcLabel);
  check('目标语言标签为「译文（中文）」', m.ok && m.dstLabel.includes('中文'), m.dstLabel);

  // 6. 关闭后，无选中内容触发 → 弹窗保持关闭
  await evalJs(cdp, `document.getElementById('translate-ok').click(); true`);
  await sleep(300);
  await evalJs(cdp, `(() => {
    const cm = document.querySelector('.CodeMirror').CodeMirror;
    cm.setCursor({ line: 0, ch: 0 });
    cm.focus();
    return true;
  })()`);
  await sleep(300);
  await evalJs(cdp, CLICK_TRANSLATE);
  await sleep(400);
  m = await evalJs(cdp, MODAL_READ);
  check('无选中内容时不打开弹窗', m.ok && m.display === 'none', m.display);

  const finalCount = results.filter((r) => r.ok).length;
  console.log('\n==== ' + finalCount + '/' + results.length + ' 通过 ====');
  if (finalCount !== results.length) process.exitCode = 1;
} catch (err) {
  console.error('验证脚本异常:', err.message);
  process.exitCode = 1;
} finally {
  if (cdp) cdp.close();
  if (edgeProc) { try { edgeProc.kill(); } catch {} }
  if (server) server.server.close();
}
