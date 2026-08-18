/* 临时验证：打开文档时恢复上次光标位置（而不是回到文档开头） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, evalJs, navigateAndWait } from './helpers/cdp.js';
import { startStaticServer } from './helpers/static-server.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist-web');
const HTTP_PORT = 8324;
const DEBUG_PORT = 9336;
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
  const aContent = Array.from({ length: 60 }, (_, i) => '第 ' + (i + 1) + ' 行内容，用于测试打开文档时恢复上次光标位置。').join('\\n');
  const docs = [
    { id: 'd-a', title: '长文测试', kind: 'text', content: aContent, updated: 1000 },
    { id: 'd-b', title: '短文测试', kind: 'text', content: 'b 第一行\\nb 第二行\\nb 第三行', updated: 2000 }
  ];
  localStorage.setItem('inkpad.docs.v1', JSON.stringify(docs));
  localStorage.setItem('inkpad.active.v1', 'd-a');
  docs.forEach((d) => localStorage.setItem('inkpad.content.' + d.id, d.content));
  return true;
})()`;

// 读取 CodeMirror 实例（CM 会将实例挂在 .CodeMirror 包装元素上）
const CM_READ = `(() => {
  const el = document.querySelector('.CodeMirror');
  const cm = el ? el.CodeMirror : null;
  if (!cm) return { ok: false };
  const cur = cm.getCursor();
  const c = cm.cursorCoords(true, 'window');
  const scroller = document.querySelector('.CodeMirror-scroll');
  const stat = (document.getElementById('stat-cursor') || {}).textContent || '';
  const active = document.querySelector('.doc-item.active, .doc-item.sel');
  return {
    ok: true,
    line: cur.line,
    ch: cur.ch,
    top: Math.round(c.top),
    bottom: Math.round(c.bottom),
    innerH: window.innerHeight,
    scrollTop: scroller ? scroller.scrollTop : 0,
    stat,
    activeTitle: active ? active.textContent.trim().slice(0, 10) : null
  };
})()`;

let server, edgeProc, cdp;

try {
  log('启动静态服务器');
  server = await withTimeout(startStaticServer(DIST, HTTP_PORT), 5000, 'startStaticServer');
  const edge = findEdge();
  if (!edge) throw new Error('未找到 Edge');
  log('启动 Edge: ' + edge);
  const userDataDir = fs.mkdtempSync(path.join(process.env.TEMP || '.', 'edge-cv-'));
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

  // 1. 预置数据后重载
  log('预置数据并重载');
  await evalJs(cdp, SEED);
  await withTimeout(navigateAndWait(cdp, 'http://127.0.0.1:' + HTTP_PORT + '/'), 15000, '重载 navigate');
  await sleep(1500);

  // 2. 首次打开 d-a：无已存光标 → 位于 0,0
  let s = await evalJs(cdp, CM_READ);
  check('首次打开 d-a（活动文档）', s.ok && (s.activeTitle || '').includes('长文测试'), JSON.stringify({ activeTitle: s.activeTitle }));
  check('首次打开无已存光标 → 位于 0,0', s.ok && s.line === 0 && s.ch === 0, JSON.stringify({ line: s.line, ch: s.ch }));
  check('无已存光标时 cursor key 为 0,0（非恢复旧位置）', (await evalJs(cdp, `localStorage.getItem('inkpad.cursor.d-a')`)) === '{"line":0,"ch":0}');

  // 3. 在 d-a 把光标移到第 49 行（line=48），等待防抖保存
  await evalJs(cdp, `(() => {
    const cm = document.querySelector('.CodeMirror').CodeMirror;
    cm.setCursor({ line: 48, ch: 5 });
    cm.focus();
    return true;
  })()`);
  await sleep(800);
  const savedA = await evalJs(cdp, `localStorage.getItem('inkpad.cursor.d-a')`);
  s = await evalJs(cdp, CM_READ);
  check('移动光标后已保存 d-a 位置 (48,5)', savedA === '{"line":48,"ch":5}', String(savedA));
  check('状态栏显示「行 49, 列 6」', s.stat.includes('行 49') && s.stat.includes('列 6'), s.stat);

  // 4. 切换到 d-b：d-a 的位置保持，d-b 首次打开位于开头
  await evalJs(cdp, `(() => { const items = document.querySelectorAll('.doc-item'); for (const it of items) { if (it.textContent.includes('短文测试')) { it.click(); return true; } } return false; })()`);
  await sleep(900);
  s = await evalJs(cdp, CM_READ);
  const savedA2 = await evalJs(cdp, `localStorage.getItem('inkpad.cursor.d-a')`);
  const savedB = await evalJs(cdp, `localStorage.getItem('inkpad.cursor.d-b')`);
  check('已切换到 d-b', s.ok && (s.activeTitle || '').includes('短文测试'), s.activeTitle);
  check('切走后 d-a 位置仍为 (48,5)', savedA2 === '{"line":48,"ch":5}', String(savedA2));
  check('d-b 首次打开位于 0,0', s.ok && s.line === 0 && s.ch === 0, JSON.stringify({ line: s.line, ch: s.ch }));
  check('d-b 已记录光标 (0,0)', savedB === '{"line":0,"ch":0}', String(savedB));

  // 5. 在 d-b 移动光标到第 3 行（line=2），等待防抖保存
  await evalJs(cdp, `(() => {
    const cm = document.querySelector('.CodeMirror').CodeMirror;
    cm.setCursor({ line: 2, ch: 0 });
    cm.focus();
    return true;
  })()`);
  await sleep(800);
  const savedB2 = await evalJs(cdp, `localStorage.getItem('inkpad.cursor.d-b')`);
  check('移动光标后已保存 d-b 位置 (2,0)', savedB2 === '{"line":2,"ch":0}', String(savedB2));

  // 6. 切回 d-a：应恢复到第 49 行并滚动到可见处
  await evalJs(cdp, `(() => { const items = document.querySelectorAll('.doc-item'); for (const it of items) { if (it.textContent.includes('长文测试')) { it.click(); return true; } } return false; })()`);
  await sleep(900);
  s = await evalJs(cdp, CM_READ);
  check('切回 d-a（活动文档）', s.ok && (s.activeTitle || '').includes('长文测试'), s.activeTitle);
  check('切回 d-a 后光标恢复到第 49 行 (48,5)', s.ok && s.line === 48 && s.ch === 5, JSON.stringify({ line: s.line, ch: s.ch }));
  check('切回后状态栏「行 49, 列 6」', s.stat.includes('行 49') && s.stat.includes('列 6'), s.stat);
  check('光标已滚动到可见区域（视口内）', s.ok && s.top >= 0 && s.bottom <= s.innerH, JSON.stringify({ top: s.top, bottom: s.bottom, innerH: s.innerH }));
  check('编辑器已向下滚动（scrollTop > 0）', s.scrollTop > 0, 'scrollTop=' + s.scrollTop);

  // 7. 重载页面：d-a 仍应从 localStorage 恢复到第 49 行
  log('重载页面验证跨刷新恢复');
  await withTimeout(navigateAndWait(cdp, 'http://127.0.0.1:' + HTTP_PORT + '/'), 15000, '重载 navigate(恢复)');
  await sleep(1500);
  s = await evalJs(cdp, CM_READ);
  check('重载后活动文档为 d-a', s.ok && (s.activeTitle || '').includes('长文测试'), s.activeTitle);
  check('重载后光标恢复到第 49 行 (48,5)', s.ok && s.line === 48 && s.ch === 5, JSON.stringify({ line: s.line, ch: s.ch }));
  check('重载后状态栏「行 49, 列 6」', s.stat.includes('行 49') && s.stat.includes('列 6'), s.stat);
  check('重载后光标在可见区域内', s.ok && s.top >= 0 && s.bottom <= s.innerH, JSON.stringify({ top: s.top, bottom: s.bottom, innerH: s.innerH }));
  check('重载后已向下滚动（scrollTop > 0）', s.scrollTop > 0, 'scrollTop=' + s.scrollTop);

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
