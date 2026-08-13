/* =========================================================
 * dist-web.test.js —— 构建产物（vite build 输出）浏览器运行回归
 *
 * 与 smoke/vendor 不同，本测试以 dist-web/（Vite 生产构建产物）
 * 为根目录起静态服务器，验证最终打包产物在浏览器中真实可运行：
 *   1. 页面加载无 JS 异常，文档列表 / CodeMirror / 全局库就位
 *   2. 关键资源（合并 CSS、vendor-bundle.js、app.js）可访问
 *   3. 核心交互（编辑 / 预览 / 查找替换）正常
 * 这是 file:// / pywebview 打包前最后一道产物级校验。
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
const DIST = path.join(ROOT, 'dist-web');
const HTTP_PORT = 8323;
const DEBUG_PORT = 9335;

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

beforeAll(async () => {
  // 1. 生产构建（esbuild 打包 src-app + Vite 产物）
  execSync('npx vite build', { cwd: ROOT, stdio: 'ignore' });
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('dist-web/index.html 不存在');

  // 2. 以 dist-web 为根目录起静态服务器（模拟 file:// 打包后的资源布局）
  server = await startStaticServer(DIST, HTTP_PORT);

  // 3. headless Edge + CDP
  const edge = findEdge();
  if (!edge) throw new Error('未找到 msedge.exe');
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lnote-dist-'));
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

describe('构建产物 dist-web 浏览器运行验证', () => {
  it('页面加载：文档列表、CodeMirror、全局库、合并 CSS 全部就位', async () => {
    await navigateAndWait(cdp, 'http://127.0.0.1:' + HTTP_PORT + '/');
    const r = await evalJs(
      cdp,
      `JSON.stringify({
        docItems: document.querySelectorAll('#doc-list .doc-item').length,
        codemirror: !!document.querySelector('.CodeMirror'),
        title: document.getElementById('doc-title').value,
        libs: typeof window.CodeMirror === 'function' && typeof window.marked === 'function'
          && typeof window.mermaid === 'object' && typeof window.hljs === 'object'
          && typeof window.katex === 'object' && typeof window.Diff === 'object',
        styleSheets: document.styleSheets.length,
        cssHref: document.querySelector('link[rel="stylesheet"]') ? document.querySelector('link[rel="stylesheet"]').href : ''
      })`
    ).then((s) => JSON.parse(s));
    expect(r.docItems).toBeGreaterThanOrEqual(1);
    expect(r.codemirror).toBe(true);
    expect(r.title).toBe('欢迎使用 L.Note');
    expect(r.libs).toBe(true);
    expect(r.styleSheets).toBeGreaterThanOrEqual(1);
    expect(r.cssHref).toContain('assets/index-');
  });

  it('关键产物资源可访问（合并 CSS / vendor-bundle / app.js / KaTeX 字体）', async () => {
    // 从 index.html 动态解析指纹化资源名（CSS/字体带内容哈希，避免硬编码失效）
    const r = await evalJs(
      cdp,
      `(async () => {
        var html = await (await fetch('index.html')).text();
        var assets = [];
        var reCss = /href="(?:\\.\\/)?(assets\\/[^"]+\\.css)"/g, m;
        while ((m = reCss.exec(html))) assets.push(m[1]);
        var reFont = /url\\((?:\\.\\/)?(assets\\/KaTeX_[^\\)]+\\.woff2)\\)/g;
        var body = await (await fetch(html.match(/href="(?:\\.\\/)?(assets\\/[^"]+\\.css)"/)[1])).text();
        while ((m = reFont.exec(body))) assets.push(m[1]);
        assets.push('js/vendor-bundle.js', 'js/app.js');
        var out = {};
        for (var i = 0; i < assets.length; i++) {
          try {
            var res = await fetch(assets[i], { method: 'HEAD' });
            out[assets[i]] = res.ok;
          } catch (e) { out[assets[i]] = false; }
        }
        return JSON.stringify({ cssName: assets[0], results: out });
      })()`
    ).then((s) => JSON.parse(s));
    expect(r.cssName).toMatch(/^assets\/index-.+\.css$/);
    // 所有解析出的资源（CSS、KaTeX 字体、js 产物）都必须可访问
    for (const [name, ok] of Object.entries(r.results)) {
      expect(ok, `资源不可访问: ${name}`).toBe(true);
    }
  });

  it('编辑内容：CodeMirror 值更新', async () => {
    await evalJs(
      cdp,
      `document.querySelector('.CodeMirror').CodeMirror.setValue('dist-web 产物验证内容');`
    );
    const v = await evalJs(cdp, `document.querySelector('.CodeMirror').CodeMirror.getValue()`);
    expect(v).toBe('dist-web 产物验证内容');
  });

  it('Markdown 预览可开关', async () => {
    await evalJs(cdp, `document.getElementById('btn-toggle-preview').click();`);
    const on = await evalJs(cdp, `document.getElementById('preview-pane').style.display`);
    expect(on).toBe('flex');
    await evalJs(cdp, `document.getElementById('btn-toggle-preview').click();`);
    const off = await evalJs(cdp, `document.getElementById('preview-pane').style.display`);
    expect(off).toBe('none');
  });

  it('查找替换浮层可打开/关闭', async () => {
    await evalJs(cdp, `document.getElementById('btn-find').click();`);
    const shown = await evalJs(cdp, `document.getElementById('fr-overlay').style.display`);
    expect(shown).toBe('block');
    await evalJs(cdp, `document.getElementById('fr-close').click();`);
    const hidden = await evalJs(cdp, `document.getElementById('fr-overlay').style.display`);
    expect(hidden).toBe('none');
  });

  it('file:// 直载（pywebview 打包场景）可用', async () => {
    // 打包后由 pywebview 以 file:// 加载：传统 script + 相对路径资源
    const fileUrl = 'file:///' + DIST.replace(/\\/g, '/') + '/index.html';
    await navigateAndWait(cdp, fileUrl);
    const r = await evalJs(
      cdp,
      `JSON.stringify({
        codemirror: !!document.querySelector('.CodeMirror'),
        docItems: document.querySelectorAll('#doc-list .doc-item').length,
        title: document.getElementById('doc-title').value,
        cssLoaded: !!document.querySelector('link[rel="stylesheet"]')
      })`
    ).then((s) => JSON.parse(s));
    expect(r.codemirror).toBe(true);
    expect(r.docItems).toBeGreaterThanOrEqual(1);
    expect(r.title).toBe('欢迎使用 L.Note');
    expect(r.cssLoaded).toBe(true);
  });

  it('全程无页面 JS 异常与 console 错误', async () => {
    expect(pageExceptions).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
