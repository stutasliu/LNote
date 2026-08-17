/* 临时验证：反向链接新功能（编辑器高亮 / 自动展开 / 徽标 / 点击跳转） */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, evalJs, navigateAndWait } from './helpers/cdp.js';
import { startStaticServer } from './helpers/static-server.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist-web');
const HTTP_PORT = 8323;
const DEBUG_PORT = 9335;
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
    { id: 'd-cur', title: 'Obsidian 教程', kind: 'text', content: '这是当前文档的内容，等待被引用。', updated: 1000 },
    { id: 'd-b', title: '读书笔记', kind: 'text', content: '今天学习了 [[Obsidian 教程]] 的用法，非常顺手。', updated: 2000 },
    { id: 'd-m', title: '会议纪要', kind: 'text', content: '大家在会议上讨论了 Obsidian 教程 的相关安排。', updated: 3000 }
  ];
  localStorage.setItem('inkpad.docs.v1', JSON.stringify(docs));
  localStorage.setItem('inkpad.active.v1', 'd-cur');
  docs.forEach((d) => localStorage.setItem('inkpad.content.' + d.id, d.content));
  return true;
})()`;

let server, edgeProc, cdp;

try {
  log('启动静态服务器');
  server = await withTimeout(startStaticServer(DIST, HTTP_PORT), 5000, 'startStaticServer');
  const edge = findEdge();
  if (!edge) throw new Error('未找到 Edge');
  log('启动 Edge: ' + edge);
  const userDataDir = fs.mkdtempSync(path.join(process.env.TEMP || '.', 'edge-blv-'));
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

  // 2. 打开 d-cur：验证徽标 + 自动展开 + 面板内容
  const panelState = await evalJs(cdp, `(() => {
    const badge = document.getElementById('info-badge');
    const panel = document.getElementById('info-panel');
    const card = document.getElementById('backlinksCard');
    const content = document.getElementById('bl-content');
    const active = document.querySelector('.doc-item.active, .doc-item.sel');
    return {
      activeTitle: active ? active.textContent.trim().slice(0, 20) : null,
      badgeText: badge ? badge.textContent : null,
      badgeShown: badge ? getComputedStyle(badge).display !== 'none' : null,
      panelCollapsed: panel ? panel.classList.contains('collapsed') : null,
      cardShown: card ? getComputedStyle(card).display !== 'none' : null,
      html: content ? content.textContent : null
    };
  })()`);
  check('徽标显示 2（1 链接 + 1 提及）', panelState.badgeText === '2' && panelState.badgeShown === true, JSON.stringify(panelState.badgeText));
  check('信息面板自动展开（无 collapsed）', panelState.panelCollapsed === false, 'collapsed=' + panelState.panelCollapsed);
  check('反向链接卡片可见', panelState.cardShown === true);
  check('面板含「链接当前文件」', panelState.html && panelState.html.includes('链接当前文件'), panelState.html);
  check('面板含「提到当前文件名」', panelState.html && panelState.html.includes('提到当前文件名'));
  check('面板含「读书笔记」来源', panelState.html && panelState.html.includes('读书笔记'));
  check('面板含「会议纪要」来源', panelState.html && panelState.html.includes('会议纪要'));

  // 截图1：反向链接面板（指南步骤2）
  let shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ROOT, 'site', 'screenshots', 'blink-1.png'), Buffer.from(shot.data, 'base64'));
  console.log('  [shot] site/screenshots/blink-1.png');

  // 3. 打开 d-b：验证编辑器内 [[...]] 高亮
  await evalJs(cdp, `(() => { const items = document.querySelectorAll('.doc-item'); for (const it of items) { if (it.textContent.includes('读书笔记')) { it.click(); return true; } } return false; })()`);
  await sleep(800);
  const highlight = await evalJs(cdp, `(() => {
    const wl = document.querySelectorAll('.CodeMirror .cm-wikilink');
    return { count: wl.length, text: wl.length ? wl[0].textContent : null };
  })()`);
  check('编辑器内 [[...]] 高亮（.cm-wikilink）', highlight.count >= 1 && highlight.text === '[[Obsidian 教程]]', JSON.stringify(highlight));

  // 截图2：编辑器内 [[...]] 高亮（指南步骤1）
  shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ROOT, 'site', 'screenshots', 'blink-2.png'), Buffer.from(shot.data, 'base64'));
  console.log('  [shot] site/screenshots/blink-2.png');

  // 4. 模拟真实点击 [[链接]] → 应跳转到 d-cur
  const linkPos = await evalJs(cdp, `(() => {
    const el = document.querySelector('.CodeMirror .cm-wikilink');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (linkPos) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: linkPos.x, y: linkPos.y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: linkPos.x, y: linkPos.y, button: 'left', clickCount: 1 });
    await sleep(900);
    const afterClick = await evalJs(cdp, `(() => {
      const h = document.querySelector('.md3-head h1, #editor-title, .doc-title-active');
      const active = document.querySelector('.doc-item.active, .doc-item.sel');
      return { title: h ? h.textContent.trim().slice(0, 20) : null, active: active ? active.textContent.trim().slice(0, 20) : null };
    })()`);
    check('点击 [[链接]] 跳转到目标文档', (afterClick.title || afterClick.active || '').includes('Obsidian 教程'), JSON.stringify(afterClick));
    // 截图3：点击链接跳转后（指南步骤3）
  shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ROOT, 'site', 'screenshots', 'blink-3.png'), Buffer.from(shot.data, 'base64'));
  console.log('  [shot] site/screenshots/blink-3.png');
  } else {
    check('点击 [[链接]] 跳转到目标文档', false, '未找到 .cm-wikilink 位置');
  }

  // 5. 空状态教学文案：新建一个无引用的文档后重载，列表才会包含它
  await evalJs(cdp, `(() => {
    const docs = JSON.parse(localStorage.getItem('inkpad.docs.v1'));
    docs.push({ id: 'd-new', title: '孤立文档', kind: 'text', content: '没有任何人引用我。', updated: 4000 });
    localStorage.setItem('inkpad.docs.v1', JSON.stringify(docs));
    localStorage.setItem('inkpad.content.d-new', '没有任何人引用我。');
    return true;
  })()`);
  await withTimeout(navigateAndWait(cdp, 'http://127.0.0.1:' + HTTP_PORT + '/'), 15000, '重载 navigate(空状态)');
  await sleep(1200);
  await evalJs(cdp, `(() => { const items = document.querySelectorAll('.doc-item'); for (const it of items) { if (it.textContent.includes('孤立文档')) { it.click(); return true; } } return false; })()`);
  await sleep(800);
  const emptyState = await evalJs(cdp, `(() => {
    const content = document.getElementById('bl-content');
    const card = document.getElementById('backlinksCard');
    const badge = document.getElementById('info-badge');
    return { text: content ? content.textContent : null, cardShown: card ? getComputedStyle(card).display !== 'none' : null, badgeShown: badge ? getComputedStyle(badge).display : null };
  })()`);
  check('空状态教学文案（含 [[孤立文档]] 引导）', emptyState.text && emptyState.text.includes('[[') && emptyState.text.includes('孤立文档'), emptyState.text);
  check('无反向链接时卡片仍显示（教学引导）', emptyState.cardShown === true);
  check('无反向链接时徽标隐藏', emptyState.badgeShown === 'none');

  // 6. 实时刷新：切回 d-cur，点击「转为链接」→ turnToLink → docs:changed → redraw
  await evalJs(cdp, `(() => { const items = document.querySelectorAll('.doc-item'); for (const it of items) { if (it.textContent.includes('Obsidian 教程')) { it.click(); return true; } } return false; })()`);
  await sleep(800);
  const before = await evalJs(cdp, `(() => {
    const btns = document.querySelectorAll('#bl-content [data-act="link"]');
    const badge = document.getElementById('info-badge');
    return { linkBtns: btns.length, badge: badge ? badge.textContent : null };
  })()`);
  check('切回 d-cur 徽标为 2、有 1 个「转为链接」', before.badge === '2' && before.linkBtns === 1, JSON.stringify(before));
  await evalJs(cdp, `(() => {
    const btns = document.querySelectorAll('#bl-content [data-act="link"]');
    for (const b of btns) {
      const item = b.closest('.bl-item');
      if (item && item.textContent.includes('会议纪要')) { b.click(); return true; }
    }
    return false;
  })()`);
  await sleep(600);
  const after = await evalJs(cdp, `(() => {
    const btns = document.querySelectorAll('#bl-content [data-act="link"]').length;
    const badge = document.getElementById('info-badge');
    const mContent = localStorage.getItem('inkpad.content.d-m');
    return { linkBtns: btns, badge: badge ? badge.textContent : null, mContent: mContent };
  })()`);
  check('转为链接后无「转为链接」按钮（提及 → 链接）', after.linkBtns === 0, JSON.stringify(after));
  check('会议纪要正文已写入 [[Obsidian 教程]]', typeof after.mContent === 'string' && after.mContent.includes('[[Obsidian 教程]]'), after.mContent);
  check('实时刷新后徽标仍为 2（总数不变）', after.badge === '2');

  // 截图4：转为链接后（指南步骤4）
  shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ROOT, 'site', 'screenshots', 'blink-4.png'), Buffer.from(shot.data, 'base64'));
  console.log('  [shot] site/screenshots/blink-4.png');

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
