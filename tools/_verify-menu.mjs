import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, evalJs } from '../tests/helpers/cdp.js';
import { startStaticServer } from '../tests/helpers/static-server.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTTP_PORT = 8327;
const DEBUG_PORT = 9337;
const pageExceptions = [];

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
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('CDP target 超时未就绪');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitEval(cdp, expr, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const v = await evalJs(cdp, expr);
      if (v) return v;
    } catch (e) { lastErr = e; }
    await sleep(400);
  }
  throw lastErr || new Error('waitEval 超时: ' + expr);
}

let server;
let edgeProc = null;
let cdp = null;
let userDataDir = null;

try {
  server = await startStaticServer(ROOT, HTTP_PORT);
  const edge = findEdge();
  if (!edge) throw new Error('未找到 msedge.exe');
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lnote-menu-'));
  edgeProc = spawn(
    edge,
    [
      '--headless=new',
      '--remote-debugging-port=' + DEBUG_PORT,
      '--user-data-dir=' + userDataDir,
      '--no-first-run',
      '--disable-gpu',
      'about:blank'
    ],
    { stdio: 'ignore' }
  );

  const target = await waitForTarget(DEBUG_PORT);
  cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  cdp.on('Runtime.exceptionThrown', (p) => pageExceptions.push(p));

  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP_PORT + '/app.html' });
  await waitEval(cdp, `!!document.querySelector('.CodeMirror') && !!document.getElementById('btn-more')`);

  const boot = await evalJs(cdp, `JSON.stringify({
    title: document.getElementById('doc-title').value,
    topItems: document.querySelectorAll('#appbar-menu > .menu-item').length,
    triggers: document.querySelectorAll('#appbar-menu > .ab-trigger').length,
    subs: document.querySelectorAll('#appbar-menu > .ab-sub').length,
    subItems: document.querySelectorAll('#appbar-menu .ab-sub-item').length
  })`);
  console.log('[boot]', boot);

  // 1) 打开菜单
  await evalJs(cdp, `document.getElementById('btn-more').click()`);
  const opened = await evalJs(cdp, `JSON.stringify({
    menuDisplay: document.getElementById('appbar-menu').style.display,
    groupLabel: getComputedStyle(document.querySelector('#appbar-menu > .ab-group-label')).display,
    jsonTrigger: document.querySelector('.ab-trigger[data-ab="json"]').style.display,
    insertTrigger: document.querySelector('.ab-trigger[data-ab="insert"]').style.display,
    previewItem: document.querySelector('[data-ab="preview"]').style.display,
    settingsItem: document.querySelector('[data-ab="settings"]').style.display
  })`);
  console.log('[open]', opened);
  if (JSON.parse(opened).menuDisplay !== 'block') throw new Error('菜单未展开');

  // 2) 展开 JSON 子菜单
  await evalJs(cdp, `document.querySelector('.ab-trigger[data-ab="json"]').click()`);
  const jsonSub = await evalJs(cdp, `JSON.stringify({
    jsonSub: document.querySelector('.ab-sub[data-ab-sub="json"]').style.display,
    aria: document.querySelector('.ab-trigger[data-ab="json"]').getAttribute('aria-expanded'),
    convertSub: document.querySelector('.ab-sub[data-ab-sub="convert"]').style.display,
    bg: getComputedStyle(document.querySelector('.ab-sub[data-ab-sub="json"]')).backgroundColor
  })`);
  console.log('[json-sub]', jsonSub);
  const j = JSON.parse(jsonSub);
  if (j.jsonSub === 'none' || j.aria !== 'true') throw new Error('JSON 子菜单未展开');

  // 3) 切到转换子菜单：互斥展开
  await evalJs(cdp, `document.querySelector('.ab-trigger[data-ab="convert"]').click()`);
  const convertSub = await evalJs(cdp, `JSON.stringify({
    convertSub: document.querySelector('.ab-sub[data-ab-sub="convert"]').style.display,
    jsonSub: document.querySelector('.ab-sub[data-ab-sub="json"]').style.display
  })`);
  console.log('[convert-sub]', convertSub);
  const c2 = JSON.parse(convertSub);
  if (c2.convertSub === 'none' || c2.jsonSub !== 'none') throw new Error('子菜单互斥展开失败');

  // 4) 一级普通项直调：设置弹窗
  await evalJs(cdp, `document.querySelector('[data-ab="settings"]').click()`);
  const settings = await evalJs(cdp, `JSON.stringify({
    menuGone: document.getElementById('appbar-menu').style.display,
    settingsOpen: !!document.getElementById('settings-modal') && document.getElementById('settings-modal').style.display !== 'none'
  })`);
  console.log('[settings]', settings);
  const s = JSON.parse(settings);
  if (s.menuGone !== 'none' || !s.settingsOpen) throw new Error('设置直调失败');

  // 5) 关闭弹窗再验证类型过滤：新建/切换到一个纯文本(kind=text, lang=plaintext)仍显示工具；
  //    由于无后端不便造 rich/flow 文档，这里仅回归文本态 + 空态切换
  await evalJs(cdp, `var m=document.getElementById('settings-modal'); if(m) m.style.display='none'; document.getElementById('btn-more').click(); document.getElementById('btn-more').click();`);
  const filtered = await evalJs(cdp, `JSON.stringify({
    texttoolsDisplay: document.querySelector('.ab-trigger[data-ab="texttools"]').style.display,
    exportDisplay: document.querySelector('[data-ab="export"]').style.display
  })`);
  console.log('[filtered]', filtered);

  console.log('[exceptions]', pageExceptions.length === 0 ? '无' : JSON.stringify(pageExceptions).slice(0, 1000));
  if (pageExceptions.length) throw new Error('存在页面 JS 异常');
  console.log('[PASS] 更多菜单分组/直调冒烟验证通过');
} finally {
  if (cdp) cdp.close();
  if (edgeProc) { try { edgeProc.kill(); } catch { /* ignore */ } }
  if (server) await new Promise((r) => server.server.close(r));
  if (userDataDir) { try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ } }
}
