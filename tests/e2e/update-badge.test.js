/* =========================================================
 * update-badge.test.js —— 更新“新”字角标联动 E2E（CDP 驱动 headless Edge）
 *
 * 通过 Page.addScriptToEvaluateOnNewDocument 在页面脚本执行前注入
 * fake pywebview.api（含 check_update 返回“有新版本”），使
 * initAutoUpdate 的启动自动检查路径真实触发，验证：
 *   1) 三点「更多」按钮与菜单「关于 L.Note」项的“新”角标同时点亮；
 *   2) 打开「更多」菜单时，「关于 L.Note」行上的角标可见（引导操作更新）。
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
const HTTP_PORT = 8341;
const DEBUG_PORT = 9344;

let server;
let edgeProc = null;
let cdp = null;
let userDataDir = null;
const pageExceptions = [];
const consoleErrors = [];

// 在文档创建阶段（任何页面脚本之前）注入 fake pywebview 桥。
// boot 阶段会用到的 API 都给空实现，check_update 返回“发现新版本”。
const FAKE_BRIDGE = `(function () {
  window.__fakeApiCalls = [];
  function ok(name) {
    return function () { window.__fakeApiCalls.push(name); return Promise.resolve({}); };
  }
  window.pywebview = { api: {
    debug_log: function () {},
    get_pending_open_file: ok('get_pending_open_file'),
    frontend_ready: ok('frontend_ready'),
    cleanup_rich_orphans: function () {
      window.__fakeApiCalls.push('cleanup_rich_orphans');
      return Promise.resolve({ deleted: [], skipped: [] });
    },
    check_update: function () {
      window.__fakeApiCalls.push('check_update');
      return Promise.resolve({ ok: true, update_available: true, latest: 'v9.9.9', current: '0.21.15' });
    }
  } };
})();`;

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

async function waitFor(fn, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('等待超时，最后状态: ' + JSON.stringify(last));
}

beforeAll(async () => {
  execSync('node tools/build-app.js', { cwd: ROOT, stdio: 'ignore' });

  server = await startStaticServer(ROOT, HTTP_PORT);

  const edge = findEdge();
  if (!edge) throw new Error('未找到 msedge.exe');
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lnote-upd-'));
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
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_BRIDGE });
  cdp.on('Runtime.exceptionThrown', (p) => pageExceptions.push(p));
  cdp.on('Log.entryAdded', (p) => {
    if (p.entry && p.entry.level === 'error') consoleErrors.push(p.entry.text);
  });

  await navigateAndWait(cdp, 'http://127.0.0.1:' + HTTP_PORT + '/app.html');
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

const badgeState = () =>
  evalJs(
    cdp,
    `JSON.stringify({
      calls: window.__fakeApiCalls || [],
      badgeMore: document.getElementById('update-badge') ? document.getElementById('update-badge').style.display : 'missing',
      badgeAbout: document.getElementById('menu-update-badge') ? document.getElementById('menu-update-badge').style.display : 'missing',
      badgeText: document.getElementById('menu-update-badge') ? document.getElementById('menu-update-badge').textContent : '',
      modal: document.getElementById('update-modal').style.display
    })`
  ).then((s) => JSON.parse(s));

describe('更新角标联动（三点按钮 + 「关于 L.Note」菜单项）', () => {
  it('自动检查发现新版本后，两个角标同时点亮并弹出更新弹窗', async () => {
    const s = await waitFor(async () => {
      const st = await badgeState();
      return st.badgeMore === 'block' && st.badgeAbout === 'block' && st.calls.indexOf('check_update') >= 0 ? st : null;
    });
    expect(s.badgeMore).toBe('block');
    expect(s.badgeAbout).toBe('block');
    expect(s.badgeText).toBe('新');
    expect(s.calls).toContain('check_update');
    expect(s.modal).not.toBe('none');
  });

  it('关闭更新弹窗后打开「更多」菜单，「关于 L.Note」项及其角标可见', async () => {
    await waitFor(async () => {
      await evalJs(cdp, `document.getElementById('update-later').click();`);
      const st = await badgeState();
      return st.modal === 'none' ? true : null;
    });
    await evalJs(cdp, `document.getElementById('btn-more').click();`);
    const s = await waitFor(async () => {
      const menuDisplay = await evalJs(cdp, `document.getElementById('appbar-menu').style.display`);
      if (menuDisplay !== 'block') return null;
      return evalJs(
        cdp,
        `JSON.stringify({
          badgeAbout: document.getElementById('menu-update-badge').style.display,
          rowVisible: document.querySelector('.menu-upd-about') ? document.querySelector('.menu-upd-about').offsetHeight > 0 : false,
          rowFlex: getComputedStyle(document.querySelector('.menu-upd-about')).display
        })`
      ).then((x) => JSON.parse(x));
    });
    expect(s.badgeAbout).toBe('block');
    expect(s.rowVisible).toBe(true);
    expect(s.rowFlex).toBe('flex');
  });

  it('全程无页面 JS 异常与 console 错误', async () => {
    expect(pageExceptions).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
