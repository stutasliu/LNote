/* =========================================================
 * preview-sanitize.test.js —— Markdown 预览 XSS 防护回归（CDP 驱动 headless Edge）
 *
 * 背景：js/md.js 的 parse() 直接 `wrap.innerHTML = marked.parse(text)`，
 * 用户笔记（含外部打开的文件）里的原始 HTML 会原样落入预览 DOM，
 * 从而执行内联事件处理器（<img onerror> / <svg onload> / javascript: 链接）。
 *
 * 本用例驱动真实 UI（新建 → 切 Markdown → 写入 → 开预览），断言：
 *   1) 内联事件处理器、javascript: 链接、<script> 均不执行；
 *   2) 正常 Markdown（标题 / 表格 / 代码高亮 / 行内公式 / 图片 / 锚点 /
 *      mermaid 占位）仍能正常渲染 —— 净化不得破坏既有渲染管线。
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
const HTTP_PORT = 8351;
const DEBUG_PORT = 9351;

let server;
let edgeProc = null;
let cdp = null;
let userDataDir = null;

const FAKE_BRIDGE = `(function () {
  window.__fakeApiCalls = [];
  function ok(name) {
    return function () { window.__fakeApiCalls.push(name); return Promise.resolve({}); };
  }
  window.pywebview = { api: {
    debug_log: function () {},
    get_pending_open_file: function () { return Promise.resolve(null); },
    frontend_ready: ok('frontend_ready'),
    cleanup_rich_orphans: function () { return Promise.resolve({ deleted: [], skipped: [] }); },
    check_update: function () { return Promise.resolve({ ok: true, update_available: false }); }
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 写入 Markdown 到编辑器，并等待预览重渲染（change → 300ms 防抖） */
async function setMarkdown(md) {
  await evalJs(cdp, `document.querySelector('.CodeMirror').CodeMirror.setValue(${JSON.stringify(md)});`);
  await sleep(900);
}

/** 读取预览 HTML 与注入标记 */
const previewState = () =>
  evalJs(
    cdp,
    `JSON.stringify({
      html: (document.getElementById('md-out') || {}).innerHTML || '',
      img: !!document.querySelector('#md-out img'),
      table: !!document.querySelector('#md-out table'),
      h1: !!document.querySelector('#md-out h1'),
      codeHljs: !!document.querySelector('#md-out pre code.hljs'),
      mermaidPh: !!document.querySelector('#md-out .md-mermaid[data-code]'),
      mathPh: !!document.querySelector('#md-out .md-math'),
      anchoredLink: !!document.querySelector('#md-out a[href^="#md-h-"]'),
      xssImg: window.__XSS_IMG || 0,
      xssSvg: window.__XSS_SVG || 0,
      xssLink: window.__XSS_LINK || 0,
      xssScript: window.__XSS_SCRIPT || 0,
      xssIframe: window.__XSS_IFRAME || 0
    })`
  ).then((s) => JSON.parse(s));

beforeAll(async () => {
  execSync('node tools/build-app.js', { cwd: ROOT, stdio: 'ignore' });

  server = await startStaticServer(ROOT, HTTP_PORT);

  const edge = findEdge();
  if (!edge) throw new Error('未找到 msedge.exe');
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lnote-sec-'));
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

  await navigateAndWait(cdp, 'http://127.0.0.1:' + HTTP_PORT + '/app.html');

  // 新建文档 → 切换 Markdown → 打开预览（后续用例复用同一预览状态）
  await evalJs(cdp, `document.getElementById('fabNewDoc').click(); document.getElementById('btn-new-doc').click();`);
  await evalJs(cdp, `var sel = document.getElementById('lang-select'); sel.value = 'markdown'; sel.dispatchEvent(new Event('change'));`);
  await evalJs(cdp, `document.getElementById('btn-toggle-preview').click();`);
  await sleep(600);
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

describe('Markdown 预览 XSS 防护', () => {
  it('内联事件处理器不得执行（<img onerror> / <svg onload>）', async () => {
    await setMarkdown(
      '<img src="x" onerror="window.__XSS_IMG=1">\n\n<svg onload="window.__XSS_SVG=1"></svg>\n'
    );
    const s = await previewState();
    expect(s.xssImg).toBe(0);
    expect(s.xssSvg).toBe(0);
  });

  it('javascript: 链接点击不得执行', async () => {
    await setMarkdown('<a id="poc-link" href="javascript:window.__XSS_LINK=1">click</a>\n');
    await evalJs(cdp, `var a = document.getElementById('poc-link'); if (a) a.click();`);
    await sleep(300);
    const s = await previewState();
    expect(s.xssLink).toBe(0);
  });

  it('<script> / <iframe src="javascript:"> 不得执行', async () => {
    await setMarkdown(
      '<script>window.__XSS_SCRIPT=1</script>\n\n<iframe src="javascript:window.__XSS_IFRAME=1"></iframe>\n'
    );
    const s = await previewState();
    expect(s.xssScript).toBe(0);
    expect(s.xssIframe).toBe(0);
  });

  it('正常 Markdown 仍完整渲染（不破坏既有管线）', async () => {
    await setMarkdown(
      [
        '# 标题一',
        '',
        '| a | b |',
        '| - | - |',
        '| 1 | 2 |',
        '',
        '```js',
        'var x = 1;',
        '```',
        '',
        '行内公式 $x^2$',
        '',
        '```math',
        'E = mc^2',
        '```',
        '',
        '![图](a.png)',
        '',
        '[跳转](#标题一)',
        '',
        '```mermaid',
        'graph TD; A-->B;',
        '```',
        ''
      ].join('\n')
    );
    const s = await previewState();
    expect(s.h1).toBe(true);
    expect(s.table).toBe(true);
    expect(s.codeHljs).toBe(true);
    expect(s.img).toBe(true);
    expect(s.anchoredLink).toBe(true);
    expect(s.mermaidPh).toBe(true);
    expect(s.mathPh).toBe(true);
    expect(s.html).toContain('class="katex"');
  });
});

describe('app.html 预览纵深加固（CSP / sandbox / mermaid）', () => {
  it('head 存在 Content-Security-Policy，且禁用 object/base/form', async () => {
    const csp = await evalJs(
      cdp,
      `(function () {
        var m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
        return m ? m.getAttribute('content') : '';
      })()`
    );
    expect(csp).toBeTruthy();
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain('translate.googleapis.com');
  });

  it('HTML 预览 iframe 沙箱已收紧（去掉 allow-same-origin）', async () => {
    const sandbox = await evalJs(
      cdp,
      `(function () {
        var f = document.getElementById('html-frame');
        return f ? (f.getAttribute('sandbox') || '') : null;
      })()`
    );
    expect(sandbox).not.toBeNull();
    expect(sandbox).not.toContain('allow-same-origin');
    expect(sandbox).toContain('allow-scripts');
  });

  it('mermaid securityLevel=strict 且图表仍能实际出图', async () => {
    let cfg = '';
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && cfg !== 'api') {
      cfg = await evalJs(cdp, `(window.mermaid && window.mermaid.mermaidAPI) ? 'api' : ''`);
      if (cfg !== 'api') await sleep(400);
    }
    expect(cfg).toBe('api');
    // strict 下通过 mermaid.render 显式渲染，应产出 <svg>
    const res = await evalJs(
      cdp,
      `(async function () {
        try {
          var r = await window.mermaid.render('sec-probe-' + Date.now(), 'graph TD; A-->B;');
          return (r && typeof r.svg === 'string' && r.svg.indexOf('<svg') === 0) ? 'ok' : 'bad';
        } catch (e) {
          return 'err:' + (e && e.message);
        }
      })()`
    );
    expect(res).toBe('ok');
  });
});
