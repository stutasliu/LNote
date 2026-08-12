/* =========================================================
 * vendor.test.js —— npm 依赖迁移回归测试（CDP 驱动 headless Edge）
 *
 * vendor/ 下的全局脚本库已迁移为 npm 依赖（esbuild 打包为
 * js/vendor-bundle.js）。本测试验证迁移后全局变量、真实渲染路径
 * （mermaid.render / marked / katex / hljs / Diff.diffLines）
 * 均与迁移前行为一致。
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
const HTTP_PORT = 8322;
const DEBUG_PORT = 9334;

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
  // 1. 确保 js/app.js 为最新拼接产物
  execSync('node tools/build-app.js', { cwd: ROOT, stdio: 'ignore' });

  // 2. 静态服务器
  server = await startStaticServer(ROOT, HTTP_PORT);

  // 3. headless Edge + CDP
  const edge = findEdge();
  if (!edge) throw new Error('未找到 msedge.exe');
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lnote-vendor-'));
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

describe('vendor 库迁移回归测试', () => {
  it('index.html：六个全局库与 CodeMirror 关键 mode 就位', async () => {
    await navigateAndWait(cdp, 'http://127.0.0.1:' + HTTP_PORT + '/');
    const r = await evalJs(
      cdp,
      `JSON.stringify({
        CodeMirror: typeof window.CodeMirror === 'function',
        marked: typeof window.marked === 'function',
        mermaid: typeof window.mermaid === 'object' && typeof window.mermaid.render === 'function',
        hljs: typeof window.hljs === 'object' && typeof window.hljs.highlight === 'function',
        katex: typeof window.katex === 'object' && typeof window.katex.render === 'function',
        Diff: typeof window.Diff === 'object' && typeof window.Diff.diffLines === 'function',
        cmModes: ['xml','javascript','markdown','clike','htmlmixed','python','sql','shell','yaml','css']
          .every((m) => window.CodeMirror.modes[m] !== undefined)
      })`
    ).then((s) => JSON.parse(s));
    expect(r.CodeMirror).toBe(true);
    expect(r.marked).toBe(true);
    expect(r.mermaid).toBe(true);
    expect(r.hljs).toBe(true);
    expect(r.katex).toBe(true);
    expect(r.Diff).toBe(true);
    expect(r.cmModes).toBe(true);
  });

  it('marked 渲染 Markdown（与 app 用法一致）', async () => {
    const html = await evalJs(
      cdp,
      "window.marked.parse('# 标题\\n\\n**加粗** 与 `code`')"
    );
    expect(html).toContain('<h1');
    expect(html).toContain('<strong>加粗</strong>');
    expect(html).toContain('<code>code</code>');
  });

  it('katex 渲染数学公式', async () => {
    const html = await evalJs(
      cdp,
      "window.katex.renderToString('E = mc^2')"
    );
    expect(html).toContain('katex');
    expect(html).toContain('E');
  });

  it('highlight.js 代码高亮', async () => {
    const r = await evalJs(
      cdp,
      "JSON.stringify({ v: window.hljs.versionString, html: window.hljs.highlight('var a = 1;', { language: 'javascript' }).value })"
    ).then((s) => JSON.parse(s));
    expect(r.v).toMatch(/^11\./);
    expect(r.html).toContain('hljs-keyword');
  });

  it('mermaid 异步渲染流程图（awaitPromise）', async () => {
    const r = await evalJs(
      cdp,
      "(async () => { window.mermaid.initialize({ startOnLoad: false, theme: 'default' }); const res = await window.mermaid.render('mmd-vendor-1', 'graph TD;\\n  A[开始] --> B[结束];'); return JSON.stringify({ svgLen: res.svg.length, hasSvg: res.svg.indexOf('<svg') === 0 }); })()"
    ).then((s) => JSON.parse(s));
    expect(r.hasSvg).toBe(true);
    expect(r.svgLen).toBeGreaterThan(200);
  });

  it('Diff.diffLines 行级比较（与 compare.html 用法一致）', async () => {
    const r = await evalJs(
      cdp,
      "JSON.stringify(window.Diff.diffLines('a\\nb\\nc', 'a\\nb\\nd').map((p) => ({ added: !!p.added, removed: !!p.removed })))"
    ).then((s) => JSON.parse(s));
    const flags = JSON.stringify(r);
    expect(flags).toContain('"removed":true');
    expect(flags).toContain('"added":true');
  });

  it('compare.html：加载正常且 diff 可运行', async () => {
    await navigateAndWait(cdp, 'http://127.0.0.1:' + HTTP_PORT + '/compare.html');
    const r = await evalJs(
      cdp,
      "(function () { var taA = document.getElementById('ta-a'); var taB = document.getElementById('ta-b'); if (!taA || !taB) return JSON.stringify({ ok: false, reason: '元素缺失' }); taA.value = 'line1\\nline2'; taB.value = 'line1\\nline3'; var parts = window.Diff.diffLines(taA.value, taB.value); return JSON.stringify({ ok: true, cmpTop: !!document.querySelector('.cmp-top'), hasRemoved: parts.some(function (p) { return p.removed; }), hasAdded: parts.some(function (p) { return p.added; }) }); })()"
    ).then((s) => JSON.parse(s));
    expect(r.ok).toBe(true);
    expect(r.cmpTop).toBe(true);
    expect(r.hasRemoved).toBe(true);
    expect(r.hasAdded).toBe(true);
  });

  it('全程无页面 JS 异常与 console 错误', async () => {
    expect(pageExceptions).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
