/* =========================================================
 * smoke.test.js —— E2E 冒烟测试（Vitest + CDP 驱动 headless Edge）
 *
 * 验证核心用户流程：加载 → 新建 → 编辑 → 信息面板 → 预览 → 删除，
 * 并全程收集页面 JS 异常与 console 错误（回归保护）。
 * 使用独立的临时 user-data-dir，保证 localStorage 干净。
 * ========================================================= */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, evalJs, navigateAndWait } from '../helpers/cdp.js';
import { startStaticServer } from '../helpers/static-server.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTTP_PORT = 8321;
const DEBUG_PORT = 9333;

let server;
let edgeProc = null;
let cdp = null;
let userDataDir = null;
const pageExceptions = [];
const consoleErrors = [];

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

const pageState = () =>
  evalJs(
    cdp,
    `JSON.stringify({
      docItems: document.querySelectorAll('#doc-list .doc-item').length,
      codemirror: !!document.querySelector('.CodeMirror'),
      title: document.getElementById('doc-title').value,
      infoCollapsed: document.getElementById('info-panel').classList.contains('collapsed'),
      previewDisplay: document.getElementById('preview-pane').style.display,
      lang: document.getElementById('lang-select').value
    })`
  ).then((s) => JSON.parse(s));

beforeAll(async () => {
  // 1. 确保 js/app.js 为最新拼接产物
  execSync('node tools/build-app.js', { cwd: ROOT, stdio: 'ignore' });

  // 2. 静态服务器
  server = await startStaticServer(ROOT, HTTP_PORT);

  // 3. headless Edge + CDP
  const edge = findEdge();
  if (!edge) throw new Error('未找到 msedge.exe');
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lnote-e2e-'));
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
  await cdp.send('Log.enable');
  cdp.on('Runtime.exceptionThrown', (p) => pageExceptions.push(p));
  cdp.on('Log.entryAdded', (p) => {
    if (p.entry && p.entry.level === 'error') consoleErrors.push(p.entry.text);
  });

  await navigateAndWait(cdp, 'http://127.0.0.1:' + HTTP_PORT + '/');
});

afterAll(async () => {
  if (cdp) cdp.close();
  if (edgeProc) {
    try { edgeProc.kill(); } catch { /* ignore */ }
  }
  if (server) await new Promise((r) => server.server.close(r));
  if (userDataDir) {
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe('E2E 冒烟测试', () => {
  it('页面加载：文档列表与 CodeMirror 就绪', async () => {
    const s = await pageState();
    expect(s.docItems).toBeGreaterThanOrEqual(1);
    expect(s.codemirror).toBe(true);
    expect(s.title).toBe('欢迎使用 L.Note');
  });

  it('新建文档：列表 +1，语言为纯文本', async () => {
    const before = (await pageState()).docItems;
    await evalJs(
      cdp,
      `document.getElementById('fabNewDoc').click(); document.getElementById('btn-new-doc').click();`
    );
    const after = await pageState();
    expect(after.docItems).toBe(before + 1);
    expect(after.lang).toBe('plaintext');
  });

  it('编辑内容：CodeMirror 值更新', async () => {
    await evalJs(
      cdp,
      `document.querySelector('.CodeMirror').CodeMirror.setValue('e2e 冒烟测试内容');`
    );
    const v = await evalJs(cdp, `document.querySelector('.CodeMirror').CodeMirror.getValue()`);
    expect(v).toBe('e2e 冒烟测试内容');
  });

  it('信息面板可开关', async () => {
    const before = (await pageState()).infoCollapsed; // false
    await evalJs(cdp, `document.getElementById('btn-info-panel').click();`);
    const after = await pageState();
    expect(after.infoCollapsed).toBe(!before);
    await evalJs(cdp, `document.getElementById('btn-info-panel').click();`); // 恢复
  });

  it('Markdown 预览可开关', async () => {
    // 新建文档默认纯文本，预览仅对 Markdown / HTML 生效，先切到 Markdown
    await evalJs(
      cdp,
      `var sel = document.getElementById('lang-select'); sel.value = 'markdown'; sel.dispatchEvent(new Event('change'));`
    );
    await evalJs(cdp, `document.getElementById('btn-toggle-preview').click();`);
    const on = await pageState();
    expect(on.previewDisplay).toBe('flex');
    await evalJs(cdp, `document.getElementById('btn-toggle-preview').click();`);
    const off = await pageState();
    expect(off.previewDisplay).toBe('none');
  });

  it('查找替换浮层可打开/查找/关闭（FR 状态收拢回归）', async () => {
    await evalJs(cdp, `document.getElementById('btn-find').click();`);
    const shown = await evalJs(cdp, `document.getElementById('fr-overlay').style.display`);
    expect(shown).toBe('block');
    // 输入查找词并触发查找（验证 frState 收拢进 state 后 frFindNext 正常）
    await evalJs(
      cdp,
      `var fi = document.getElementById('fr-find'); fi.value = '冒烟'; fi.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));`
    );
    await evalJs(cdp, `document.getElementById('fr-close').click();`);
    const hidden = await evalJs(cdp, `document.getElementById('fr-overlay').style.display`);
    expect(hidden).toBe('none');
  });

  it('删除文档：列表 -1', async () => {
    const before = (await pageState()).docItems;
    await evalJs(
      cdp,
      `document.getElementById('btn-delete').click(); document.getElementById('doc-del-confirm').click();`
    );
    const after = await pageState();
    expect(after.docItems).toBe(before - 1);
  });

  it('全程无页面 JS 异常与 console 错误', async () => {
    // 前序用例可能已触发错误；这里断言相对初始为 0（若 >0 会列出来）
    expect(pageExceptions).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
