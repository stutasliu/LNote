/* =========================================================
 * _shots.mjs —— 软著操作说明书截图采集管线
 *
 * 用法：node tests/_shots.mjs [章节/分组名]
 *   不带参数 = 按顺序执行全部场景；
 *   传参     = 只执行文件名前缀匹配的场景（便于逐张调试）。
 *
 * 截图输出目录：screenshots/soft-v1/
 * 命名规范：shot-<章>-<序号>-<内容slug>.png
 * ========================================================= */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, evalJs, navigateAndWait } from './helpers/cdp.js';
import { startStaticServer } from './helpers/static-server.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'screenshots', 'soft-v1');
const HTTP_PORT = 8391;
const DEBUG_PORT = 9556;
const APP_URL = 'http://127.0.0.1:' + HTTP_PORT + '/app.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(s) { console.log('[step] ' + s); }
function withTimeout(promise, ms, what) {
  let timer;
  const guard = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error('超时: ' + what)), ms);
    if (timer.unref) timer.unref();
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/** 轮询页面表达式直到为真；超时返回 false */
async function waitUntil(cdp, expr, timeoutMs = 12000, stepMs = 200) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await evalJs(cdp, expr).catch(() => false);
    if (v) return true;
    if (Date.now() > deadline) return false;
    await sleep(stepMs);
  }
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

/* ---------------- 通用页面操作 ---------------- */

/** 打开指定标题的文本文档（点击侧栏条目） */
async function openDocByTitle(cdp, title) {
  const ok = await evalJs(cdp, `(() => {
    const items = document.querySelectorAll('.doc-item');
    for (const it of items) {
      const name = it.querySelector('.doc-name');
      if (name && name.textContent.trim() === ${JSON.stringify(title)}) { it.click(); return true; }
    }
    return false;
  })()`);
  await sleep(900);
  return ok;
}

/** 全窗口截图 */
async function capture(cdp, file) {
  const meta = await evalJs(cdp, `(() => ({
    innerW: window.innerWidth, innerH: window.innerHeight,
    dpr: window.devicePixelRatio,
    docW: document.documentElement.scrollWidth,
    docH: document.documentElement.scrollHeight,
    bodyBg: getComputedStyle(document.body).backgroundColor
  }))()`).catch(() => null);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT_DIR, file), Buffer.from(shot.data, 'base64'));
  log('[shot] ' + file + ' (' + shot.data.length + ' B base64) meta=' + JSON.stringify(meta));
}

/* ---------------- 文档种子（真实观感的中文示例数据） ---------------- */

function esc(v) {
  return JSON.stringify(String(v));
}

/** 构建一段可注入页面执行、用于铺满 localStorage 的脚本；docs 为含 content 的完整对象数组 */
function seedScript(docs, activeId) {
  const lines = [];
  lines.push('(() => { localStorage.clear();');
  if (docs.length) {
    const index = docs.map((d) => {
      const o = { id: d.id, title: d.title || '', updated: d.updated || Date.now() };
      for (const k of ['kind', 'lang', 'diskPath', 'encoding', 'pinned', 'favorite', 'deleted', 'deletedAt', 'tags', 'color', 'reminder', 'dueAt']) {
        if (d[k] !== undefined) o[k] = d[k];
      }
      return o;
    });
    const contents = {};
    docs.forEach((d) => {
      contents[d.id] = typeof d.content === 'string' ? d.content : JSON.stringify(d.content);
    });
    lines.push('const INDEX = ' + JSON.stringify(index) + ';');
    lines.push('localStorage.setItem("inkpad.docs.v1", JSON.stringify(INDEX));');
    lines.push('const CONTENTS = ' + JSON.stringify(contents) + ';');
    lines.push('Object.keys(CONTENTS).forEach((id) => localStorage.setItem("inkpad.content." + id, CONTENTS[id]));');
    if (activeId) lines.push('localStorage.setItem("inkpad.active.v1", ' + esc(activeId) + ');');
    lines.push('localStorage.setItem("inkpad.sortgroup", "1");');
  }
  lines.push('return ' + docs.length + '; })()');
  return lines.join('\n');
}

/** 先在"同源但不运行应用"的 404 页铺种，再进入应用：保证加载结果确定、无自动回写竞态 */
async function boot(cdp, docs, activeId, waitMs = 2200) {
  const seedUrl = 'http://127.0.0.1:' + HTTP_PORT + '/__seed_404__.html';
  await withTimeout(navigateAndWait(cdp, seedUrl), 15000, 'boot 前往同源铺种页');
  await sleep(200);
  await evalJs(cdp, seedScript(docs, activeId));
  await withTimeout(navigateAndWait(cdp, APP_URL), 15000, 'boot 应用加载');
  await sleep(waitMs);
}

/* ---------------- 假 pywebview 桥（独立页面 / 自动更新依赖 Python API） ---------------- */

/** 在每次导航前注入脚本，返回 identifier 供后续移除 */
async function installBridge(cdp, source) {
  const res = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source });
  return res && res.identifier;
}

async function removeBridge(cdp, id) {
  if (!id) return;
  try {
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: id });
  } catch { /* ignore */ }
}

/** 应用主窗口假桥：check_update 返回有更新 → 点亮「新」徽标并弹出更新提示窗 */
const BRIDGE_APP_UPDATE = `(function () {
  window.__fakeApiCalls = [];
  function ok(name) { return function () { window.__fakeApiCalls.push(name); return Promise.resolve({}); }; }
  window.pywebview = { api: {
    debug_log: function () {},
    get_pending_open_file: ok('get_pending_open_file'),
    frontend_ready: ok('frontend_ready'),
    cleanup_rich_orphans: function () { window.__fakeApiCalls.push('cleanup_rich_orphans'); return Promise.resolve({ deleted: [], skipped: [] }); },
    check_update: function () { window.__fakeApiCalls.push('check_update');
      return Promise.resolve({ ok: true, update_available: true, latest: 'v9.9.9', current: '1.0.0' }); }
  } };
})();`;

/** 应用主窗口假 AI 桥：已配置状态 + 助手/图表回调，用于采集 AI 相关界面截图 */
const BRIDGE_APP_AI = `(function () {
  window.__fakeApiCalls = [];
  var AI_CFG = {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    hasKey: true,
    keyMasked: 'sk-9f3c********c7d2'
  };
  var AI_RESULT = '一、截图采集：按章节顺序逐张采集界面截图，统一命名为 shot-章-序-内容.png。\\n'
    + '二、全文排版：统一页眉为“软件全称 + 版本号 + 页码”，正文页面不少于 60 页。\\n'
    + '三、提交前核对：确认软件全称、著作权人与开发完成日期与申请表完全一致。';
  var FLOW_STRUCT = {
    nodes: [
      { id: 'n1', type: 'start', text: '开始注册' },
      { id: 'n2', type: 'process', text: '填写邮箱与密码' },
      { id: 'n3', type: 'decision', text: '邮箱格式是否正确' },
      { id: 'n4', type: 'process', text: '发送验证码' },
      { id: 'n5', type: 'decision', text: '验证码是否正确' },
      { id: 'n6', type: 'end', text: '注册成功' }
    ],
    edges: [
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
      { from: 'n3', to: 'n4', text: '是' },
      { from: 'n4', to: 'n5' },
      { from: 'n5', to: 'n6', text: '是' }
    ]
  };
  function ok(name) { return function () { window.__fakeApiCalls.push(name); return Promise.resolve({}); }; }
  window.pywebview = { api: {
    debug_log: function () {},
    get_pending_open_file: ok('get_pending_open_file'),
    frontend_ready: ok('frontend_ready'),
    get_rich_dir: function () { window.__fakeApiCalls.push('get_rich_dir'); return Promise.resolve({ dir: '' }); },
    cleanup_rich_orphans: function () { window.__fakeApiCalls.push('cleanup_rich_orphans'); return Promise.resolve({ deleted: [], skipped: [] }); },
    check_update: function () { window.__fakeApiCalls.push('check_update'); return Promise.resolve({ ok: true, update_available: false }); },
    ai_get_config: function () { window.__fakeApiCalls.push('ai_get_config'); return Promise.resolve({ ok: true, config: AI_CFG }); },
    ai_save_config: function () { window.__fakeApiCalls.push('ai_save_config'); return Promise.resolve({ ok: true, config: AI_CFG }); },
    ai_clear_key: function () { window.__fakeApiCalls.push('ai_clear_key'); return Promise.resolve({ ok: true }); },
    ai_test: function () { window.__fakeApiCalls.push('ai_test'); return Promise.resolve({ ok: true, model: AI_CFG.model }); },
    ai_stop: ok('ai_stop'),
    ai_chat: function (payload) {
      window.__fakeApiCalls.push('ai_chat');
      var sid = payload && payload.sessionId;
      setTimeout(function () {
        if (window.__lnoteAiChatCb) window.__lnoteAiChatCb({ sessionId: sid, type: 'done', fullText: AI_RESULT });
      }, 200);
      return Promise.resolve({ ok: true });
    },
    ai_diagram: function (payload) {
      window.__fakeApiCalls.push('ai_diagram');
      var sid = payload && payload.sessionId;
      setTimeout(function () {
        if (window.__lnoteAiDiagramCb) window.__lnoteAiDiagramCb({ sessionId: sid, type: 'done', structure: FLOW_STRUCT, title: '邮箱注册流程' });
      }, 200);
      return Promise.resolve({ ok: true });
    }
  } };
})();`;

/** 图片编辑窗口假桥：get_image 返回内嵌 data URL 的图片 */
function imageBridgeSource(dataUrl, name) {
  return '(function () {\n' +
    '  window.pywebview = { api: {\n' +
    '    debug_log: function () {},\n' +
    '    get_image: function () { return Promise.resolve({ name: ' + JSON.stringify(name) + ', src: ' + JSON.stringify(dataUrl) + ' }); },\n' +
    '    close_window: function () { return Promise.resolve({}); },\n' +
    '    save_image: function () { return Promise.resolve({ ok: true }); },\n' +
    '    save_image_as: function () { return Promise.resolve({ ok: true }); }\n' +
    '  } };\n' +
    '})();';
}

/** 展开「更多」菜单并点击某个一级菜单项 */
async function clickMoreItem(cdp, ab) {
  await evalJs(cdp, `(() => { const b = document.getElementById('btn-more'); if (b) b.click(); return !!b; })()`);
  await sleep(400);
  return evalJs(cdp, `(() => {
    const m = document.querySelector('#appbar-menu [data-ab=${JSON.stringify(ab)}]');
    if (!m) return false;
    m.click();
    return true;
  })()`);
}

// CodeMirror 5 会把实例挂到 wrapper 元素上（wrapper.CodeMirror = this），
// 模块内的 cm 虽未暴露到 window，仍可经 DOM 取到同一实例，用于构造选区。
async function editorSelectionInfo(cdp) {
  return evalJs(cdp, `(() => {
    const w = document.querySelector('#editor-wrap .CodeMirror');
    return { hasWrap: !!w, hasCm: !!(w && w.CodeMirror), sel: (w && w.CodeMirror) ? (w.CodeMirror.getSelection() || '') : '' };
  })()`).catch(() => null);
}

/** 在编辑器中选中 fromLine~toLine 整行，返回选区中心坐标（用于右键点击） */
async function selectEditorLines(cdp, fromLine, toLine) {
  const sel = await evalJs(cdp, `(() => {
    const w = document.querySelector('#editor-wrap .CodeMirror');
    const cm = w && w.CodeMirror;
    if (!cm) return null;
    const last = ${toLine};
    cm.setSelection({ line: ${fromLine}, ch: 0 }, { line: last, ch: (cm.getLine(last) || '').length });
    cm.scrollIntoView({ line: ${fromLine}, ch: 0 }, 80);
    cm.focus();
    return cm.getSelection();
  })()`);
  if (!sel) return null;
  await sleep(350);
  const pt = await evalJs(cdp, `(() => {
    const s = document.querySelector('#editor-wrap .CodeMirror-selected');
    if (!s) return null;
    const r = s.getBoundingClientRect();
    return { x: Math.round(r.left + Math.min(r.width, 220) / 2), y: Math.round(r.top + Math.min(r.height, 24) / 2) };
  })()`);
  return { text: sel, pos: pt };
}

/** 编辑器正文区内的一个坐标点（用于「无选区」状态下右键） */
async function editorPoint(cdp, dx = 70, dy = 46) {
  return evalJs(cdp, `(() => {
    const l = document.querySelector('#editor-wrap .CodeMirror-lines');
    if (!l) return null;
    const r = l.getBoundingClientRect();
    return { x: Math.round(r.left + ${dx}), y: Math.round(r.top + ${dy}) };
  })()`);
}

/** 在页面坐标处派发右键 mousedown（capture 阶段即触发右键菜单） */
async function rightClickAt(cdp, x, y) {
  if (!x || !y) return false;
  return evalJs(cdp, `(() => {
    const el = document.elementFromPoint(${x}, ${y});
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true, cancelable: true, button: 2, buttons: 2, clientX: ${x}, clientY: ${y}
    }));
    return true;
  })()`);
}

/** 等待右键菜单展开（可附带要求某分组可见） */
async function waitCtxMenu(cdp, groupId) {
  const expr = groupId
    ? `(() => {
        const m = document.getElementById('ctx-menu');
        const g = document.getElementById(${JSON.stringify(groupId)});
        return !!(m && getComputedStyle(m).display !== 'none' && g && getComputedStyle(g).display !== 'none');
      })()`
    : `(() => { const m = document.getElementById('ctx-menu'); return !!(m && getComputedStyle(m).display !== 'none'); })()`;
  return waitUntil(cdp, expr, 6000);
}

/** 点击右键菜单中某个 data-cmd 项（走 ctxMenu 的 click 代理：closeCtxMenu + handleCtxCmd） */
async function clickCtxCmd(cdp, cmd) {
  return evalJs(cdp, `(() => {
    const it = document.querySelector('#ctx-menu .ctx-item[data-cmd=${JSON.stringify(cmd)}]');
    if (!it) return false;
    it.click();
    return true;
  })()`);
}

/** 首页欢迎文档的 Markdown 正文 */
const WELCOME_MD = [
  '# 欢迎使用 L.Note 🖋️',
  '',
  '一款纯本地的笔记编辑软件。',
  '',
  '## 它能做什么',
  '',
  '- **语法高亮** —— 支持 Markdown / JSON / XML / JS / Python 等十余种语言',
  '- **一键格式化** —— 工具栏点 `{ } JSON 格式化` 或 `< / > XML 格式化`',
  '- **画图表** —— 新建「图表文档」，用 Mermaid 画流程图、时序图、思维导图',
  '- **本地存储** —— 所有内容自动保存在浏览器里，可导入导出',
  '',
  '## 快捷键',
  '',
  '| 快捷键 | 功能 |',
  '| --- | --- |',
  '| `Ctrl + S` | 保存 |',
  '| `Ctrl + Shift + F` | 按当前语言格式化 |'
].join('\n');

/** 主界面示例：一个置顶 + 多篇近期文档（含便签、代码、JSON、流程图等） */
function mainDocs() {
  const day = 864e5;
  const docs = [
    {
      id: 'd-plan', title: '操作说明书写作计划', lang: 'markdown', pinned: true,
      updated: Date.now() - 6e6, tags: ['写作', '计划'], favorite: true,
      content: [
        '# 操作说明书写作计划',
        '',
        '面向软件著作权登记的 L.Note 操作说明书，共 21 章。',
        '',
        '## 进度安排',
        '',
        '| 阶段 | 内容 | 状态 |',
        '| --- | --- | --- |',
        '| 1 | 界面截图采集 | 进行中 |',
        '| 2 | 全文排版（页眉/页码） | 待开始 |',
        '| 3 | 转换为 Word 提交稿 | 待开始 |',
        '',
        '## 注意事项',
        '',
        '1. 截图须与文字描述对应；',
        '2. 正文页面达到 60 页以上；',
        '3. 版本号与申请表保持一致。',
        '',
        '> 提示：本软件完全离线运行，不向任何服务器上传数据。'
      ].join('\n')
    },
    {
      id: 'd-travel', title: '杭州旅行手记', lang: 'markdown', updated: Date.now() - day - 36e6,
      content: '# 杭州旅行手记\n\n## 行程\n\n- 第一天：西湖环湖，断桥残雪 → 白堤 → 苏堤\n- 第二天：灵隐寺、法喜寺、梅家坞茶园\n- 第三天：西溪湿地，慢悠悠逛一天\n\n## 备忘\n\n带好伞和防晒，假期人多，建议错峰出行。'
    },
    {
      id: 'd-script', title: '统计脚本.py', lang: 'python', updated: Date.now() - day - 4e6,
      content: 'import json\nfrom collections import Counter\n\ndef load_data(path: str) -> list:\n    with open(path, "r", encoding="utf-8") as f:\n        return json.load(f)\n\ndef top_tags(items: list, n: int = 10) -> list:\n    counter = Counter(tag for it in items for tag in it.get("tags", []))\n    return counter.most_common(n)\n\nif __name__ == "__main__":\n    items = load_data("notes.json")\n    for tag, count in top_tags(items):\n        print(f"{tag}: {count}")'
    },
    {
      id: 'd-json', title: '示例数据.json', lang: 'json', updated: Date.now() - day - 6e6,
      content: '{\n  "app": "L.Note",\n  "version": "0.21.13",\n  "settings": {\n    "theme": "light",\n    "fontSize": 15,\n    "autoSave": true,\n    "lineWrap": true\n  },\n  "recent": [\n    { "file": "操作说明书.md", "opened": "2026-08-30" },\n    { "file": "演示文档.md", "opened": "2026-08-29" }\n  ]\n}'
    },
    {
      id: 'd-flow', title: '登录流程设计', kind: 'flow', lang: 'json', updated: Date.now() - day - 8e6,
      content: {
        nodes: [
          { id: 'f1', type: 'start', x: 260, y: 80, text: '用户打开软件' },
          { id: 'f2', type: 'process', x: 260, y: 220, text: '读取本地账户信息' },
          { id: 'f3', type: 'decision', x: 260, y: 380, text: '信息是否完整' },
          { id: 'f4', type: 'process', x: 60, y: 560, text: '提示完善信息' },
          { id: 'f5', type: 'process', x: 460, y: 560, text: '进入主界面' },
          { id: 'f6', type: 'end', x: 460, y: 720, text: '完成' }
        ],
        edges: [
          { id: 'fe1', from: 'f1', to: 'f2' },
          { id: 'fe2', from: 'f2', to: 'f3' },
          { id: 'fe3', from: 'f3', to: 'f4', text: '否' },
          { id: 'fe4', from: 'f3', to: 'f5', text: '是' },
          { id: 'fe5', from: 'f4', to: 'f1', text: '重试' },
          { id: 'fe6', from: 'f5', to: 'f6' }
        ],
        lanes: []
      }
    },
    {
      id: 'd-mind', title: '年度读书计划', kind: 'mind', lang: 'json', updated: Date.now() - 3 * day,
      content: {
        themeName: 'classic', layoutDensity: 'normal', numberingStyle: 'cn',
        root: {
          id: 'root', text: '年度读书计划', collapsed: false,
          children: [
            { id: 'm1', text: '技术类', collapsed: false, children: [
              { id: 'm1a', text: '《代码整洁之道》', collapsed: false, children: [] },
              { id: 'm1b', text: '《算法图解》', collapsed: false, children: [] }
            ] },
            { id: 'm2', text: '人文类', collapsed: false, children: [
              { id: 'm2a', text: '《乡土中国》', collapsed: false, children: [] }
            ] },
            { id: 'm3', text: '工具书', collapsed: false, children: [] }
          ]
        }
      }
    },
    {
      id: 'd-mermaid', title: '项目流程图', lang: 'mermaid', updated: Date.now() - 2 * day,
      content: 'graph TD\n  A[需求评审] --> B{方案确认}\n  B -- 通过 --> C[开发实现]\n  B -- 打回 --> A\n  C --> D[测试验收]\n  D --> E[发布上线]\n  D -.发现缺陷.-> C'
    }
  ];
  return docs;
}

const mainSticky = [
  {
    id: 'stk-remind', kind: 'sticky', title: '领取快递', updated: Date.now() - 2e6,
    color: '#fff3bf', content: '丰巢柜号 A-1032，取件码 864291，记得当天取。',
    reminder: { enabled: true, type: 'once', time: '18:30', date: '2026-09-03' }
  },
  {
    id: 'stk-meeting', kind: 'sticky', title: '周会要点', updated: Date.now() - 4 * 864e5,
    color: '#d0ebff', content: '下周一上午同步软著材料进度，文档本周五前交排版稿。'
  },
  {
    id: 'stk-idea', kind: 'sticky', title: '灵感：文件树增强', updated: Date.now() - 9 * 864e5,
    color: '#b2f2bb', content: '在文档列表支持按扩展名筛选，长列表时更易定位。'
  }
];

const trashDocs = [
  {
    id: 'd-trash1', title: '旧版需求草稿.md', lang: 'markdown', deleted: true,
    deletedAt: Date.now() - 2 * 864e5, updated: Date.now() - 9 * 864e5,
    content: '# 旧版需求草稿\n\n已被新版本替代。'
  },
  {
    id: 'd-trash2', title: '临时笔记', lang: 'plaintext', deleted: true,
    deletedAt: Date.now() - 5 * 864e5, updated: Date.now() - 12 * 864e5,
    content: '临时记录，清理测试。'
  }
];

/** s3b 专用长文档：供文档地图 / 查找替换 / 预览等演示使用 */
function longGuideDoc() {
  const lines = [
    '# L.Note 软件使用说明',
    '',
    '本文介绍 L.Note 在日常写作、文档管理与导出发布中的常用操作。',
    '',
    '## 1. 快速上手',
    '',
    '### 1.1 新建文档',
    '点击左下角「＋」新建文本文档，或从模板创建流程图 / 思维导图。',
    '',
    '### 1.2 打开与切换文档',
    '在左侧列表中点击文档即可打开；置顶与收藏的文档始终排在前列。',
    '',
    '### 1.3 常用快捷键',
    '',
    '| 快捷键 | 操作 |',
    '| --- | --- |',
    '| Ctrl + S | 保存当前文档 |',
    '| Ctrl + F | 打开查找与替换 |',
    '| Ctrl + Shift + F | 按当前语言格式化 |',
    '',
    '## 2. 文档管理',
    '',
    '### 2.1 创建副本与重命名',
    '在文档条目右侧点击“⋯”按钮，可选择创建副本、重命名等操作。',
    '',
    '### 2.2 标签筛选',
    '为文档添加标签后，点击左侧标签即可快速筛选相关文档。',
    '',
    '### 2.3 收藏与置顶',
    '经常使用的文档可以收藏或置顶，便于在列表中快速访问。',
    '',
    '### 2.4 回收站',
    '删除的文档会先进入回收站，可在回收站中恢复或彻底删除。',
    '',
    '## 3. 编辑器与语言',
    '',
    '### 3.1 语言与语法高亮',
    '顶部下拉框支持十余种语言；切换语言后编辑器即时重新高亮。',
    '',
    '### 3.2 自动保存',
    '编辑内容自动保存到本地，也可以随时点击“保存”按钮手动保存。',
    '',
    '### 3.3 文档地图',
    '开启后编辑器右侧出现缩略文本纵览，点击地图可跳转到对应位置。',
    '',
    '### 3.4 查找与替换',
    '',
    '1. 按 Ctrl+F 打开查找与替换面板；',
    '2. 输入关键字，回车跳转至下一个匹配处；',
    '3. 所有匹配位置会高亮显示，可一键全部替换。',
    '',
    '替换操作同样支持区分大小写、整词匹配与正则表达式。',
    '',
    '## 4. Markdown 实时预览',
    '',
    'Markdown 文档可以开启左右分栏实时预览，支持表格、任务清单、',
    '代码块、数学公式与 mermaid 图表。',
    '',
    '- 用三个反引号包裹代码块，可自动高亮；',
    '- 用围栏块书写 mermaid 图与数学公式；',
    '- 表格使用管道符与短横线对齐；',
    '- 引用内容以大于号起始。',
    '',
    '## 5. 图表文档',
    '',
    '### 5.1 流程图',
    '新建“图表文档”并选择流程图，通过拖拽连线完成编排。',
    '',
    '### 5.2 思维导图',
    '新建思维导图文档，可快速整理大纲与灵感。',
    '',
    '## 6. 常用工具',
    '',
    '- JSON 格式化与压缩；',
    '- XML 格式化与校验；',
    '- 编码转换（UTF-8 / GBK 等）；',
    '- 文本工具；',
    '- 文件比较。',
    '',
    '## 7. 隐私与设置',
    '',
    '所有文档仅保存在本地浏览器存储中，不会上传任何服务器；',
    '可以在“设置”中调整外观、字体与导出选项。',
    '',
    '## 8. 关于软件',
    '',
    '当前版本 v0.21.13；更新与版权信息见“关于 L.Note”。'
  ];
  return {
    id: 'd-long', title: 'L.Note 软件使用说明', lang: 'markdown',
    updated: Date.now() - 3e6, tags: ['帮助'],
    content: lines.join('\n')
  };
}

/** s3b 专用：数学公式 + 代码高亮预览文档 */
function mathDemoDoc() {
  return {
    id: 'd-math', title: '数学公式与代码示例', lang: 'markdown',
    updated: Date.now() - 3e6,
    content: [
      '# 数学公式与代码示例',
      '',
      'Markdown 实时预览内置 KaTeX 与 highlight.js：',
      '',
      '- 行内公式：质能方程 $E = mc^2$；',
      '- 块级公式使用 fenced 代码块；',
      '- 代码块按语言自动高亮。',
      '',
      '## 行内公式',
      '',
      '勾股定理：$a^2 + b^2 = c^2$，正态分布写作 $X \\sim N(\\mu,\\ \\sigma^2)$。',
      '',
      '## 块级公式',
      '',
      '```math',
      '\\int_{-\\infty}^{+\\infty} e^{-x^2}\\, dx = \\sqrt{\\pi}',
      '```',
      '',
      '```math',
      'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\ e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}',
      '```',
      '',
      '## 代码高亮',
      '',
      '### Python',
      '',
      '```python',
      'def fib(n: int) -> int:',
      '    """返回第 n 个斐波那契数。"""',
      '    a, b = 0, 1',
      '    for _ in range(n):',
      '        a, b = b, a + b',
      '    return a',
      '```',
      '',
      '### JavaScript',
      '',
      '```javascript',
      '// 计算数组求和',
      'const sum = (xs) => xs.reduce((a, b) => a + b, 0);',
      'console.log("sum =", sum([1, 2, 3, 4]));',
      '```'
    ].join('\n')
  };
}

/** s3b 专用：Markdown 内嵌 mermaid 图表预览文档 */
function chartDemoDoc() {
  return {
    id: 'd-chart', title: '图表渲染示例', lang: 'markdown',
    updated: Date.now() - 3e6,
    content: [
      '# 图表渲染示例',
      '',
      '在 Markdown 文档中以 mermaid 围栏代码块直接嵌入图表，',
      '开启预览后会自动渲染为矢量图，无需单独新建图表文档。',
      '',
      '## 软件著作权申请流程',
      '',
      '```mermaid',
      'graph TD',
      '    A[完成软件登记测试] --> B{申报资料是否齐全}',
      '    B -- 是 --> C[中国版权保护中心提交申请]',
      '    B -- 否 --> D[补齐源代码与操作说明书]',
      '    D --> B',
      '    C --> E[版权中心形式审查]',
      '    E --> F{是否通过审查}',
      '    F -- 通过 --> G[颁发软件著作权登记证书]',
      '    F -- 不通过 --> H[按补正通知限期修改]',
      '    H --> C',
      '```',
      '',
      '> 提示：语言切换为 Mermaid 的文档则使用独立图表画布编辑。'
    ].join('\n')
  };
}

/** 富文本文档：供大纲面板截图使用，含 h1 / h2 / h3 多级标题 */
function richDoc() {
  const blocks = [
    { id: 'rb1', type: 'h1', text: '产品需求说明书' },
    { id: 'rb2', type: 'text', text: '本文档汇总 L.Note 本地笔记编辑软件的功能需求与验收标准。' },
    { id: 'rb3', type: 'h2', text: '1. 文档管理' },
    { id: 'rb4', type: 'text', text: '支持新建、重命名、创建副本、收藏、置顶、标签与回收站等全生命周期管理。' },
    { id: 'rb5', type: 'h3', text: '1.1 标签与筛选' },
    { id: 'rb6', type: 'text', text: '可为文档添加多个标签，并在侧栏按标签快速筛选相关文档。' },
    { id: 'rb7', type: 'h3', text: '1.2 批量操作' },
    { id: 'rb8', type: 'text', text: '进入批量模式后可多选文档，执行批量标签、导出与删除。' },
    { id: 'rb9', type: 'h2', text: '2. 编辑能力' },
    { id: 'rb10', type: 'text', text: '富文本文档支持块级编辑、拖拽排序与选中工具条。' },
    { id: 'rb11', type: 'h3', text: '2.1 语言与高亮' },
    { id: 'rb12', type: 'text', text: '内置十余种语言的语法高亮，并支持按当前语言一键格式化。' },
    { id: 'rb13', type: 'h2', text: '3. 图表与可视化' },
    { id: 'rb14', type: 'text', text: '支持流程图、泳道图、思维导图与 Mermaid 图表渲染。' }
  ];
  return { id: 'd-rich', title: '产品需求说明书', kind: 'rich', updated: Date.now() - 3e6, content: blocks };
}

/** 便利贴提醒种子：仅供提醒相关场景使用，避免污染其他截图 */
function reminderStickySeed() {
  const pad = (n) => String(n).padStart(2, '0');
  const hhmm = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const now = new Date();
  const next = new Date(now.getTime() + 60000);
  return {
    edit: {
      id: 'stk-weekly', kind: 'sticky', title: '每周复盘', updated: Date.now() - 3e6,
      color: '#ffd8e4', content: '整理本周文档变更记录，同步下周写作计划。',
      reminder: { enabled: true, type: 'weekly', days: [2, 4], time: '09:30' }
    },
    fire: [
      {
        id: 'stk-daily', kind: 'sticky', title: '每日写作提醒', updated: Date.now() - 1e6,
        color: '#fff3bf', content: '打开 L.Note 核对今日写作计划，更新进度表格。',
        reminder: { enabled: true, type: 'daily', time: hhmm(now) }
      },
      {
        id: 'stk-daily2', kind: 'sticky', title: '文档备份提醒', updated: Date.now() - 5e5,
        color: '#d0ebff', content: '把本周文档导出为 Markdown 备份到本地目录。',
        reminder: { enabled: true, type: 'daily', time: hhmm(next) }
      }
    ]
  };
}

/* ---------------- 场景定义 ---------------- */

const scenarios = [];

async function scenarioFirstRun(cdp) {
  // 全新启动：无任何存储 → 应用自动创建欢迎文档
  await boot(cdp, [], null);
  const st = await evalJs(cdp, `(() => {
    const items = [...document.querySelectorAll('.doc-item .doc-name')].map((e) => e.textContent.trim());
    const cm = document.querySelector('.CodeMirror');
    return { items, cmText: cm ? cm.innerText.slice(0, 40) : null };
  })()`);
  log('first-run 列表: ' + JSON.stringify(st.items));
  if (!st.cmText) await openDocByTitle(cdp, '欢迎使用 L.Note');
  await sleep(600);
  await capture(cdp, 'shot-03-06-first-run.png');
}

async function scenarioMain(cdp) {
  const docs = mainDocs().concat(mainSticky);
  await boot(cdp, docs, 'd-plan');
  // 确保编辑器已展示置顶文档内容
  const st = await evalJs(cdp, `(() => {
    const cm = document.querySelector('.CodeMirror');
    const cmText = cm ? cm.innerText.slice(0, 30) : null;
    const name = document.getElementById('doc-title');
    return { cmText, title: name ? name.value : null };
  })()`);
  if (!st.cmText || !st.cmText.includes('操作说明书')) await openDocByTitle(cdp, '操作说明书写作计划');
  await sleep(700);
  await capture(cdp, 'shot-04-01-main.png');
  // 视图切换截图：关闭侧栏后的宽内容区
  await evalJs(cdp, `(() => { const b = document.getElementById('btn-toggle-sidebar2') || document.querySelector('.sb-collapse-btn'); if (b) b.click(); return !!b; })()`);
  await sleep(700);
  await capture(cdp, 'shot-04-02-sidebar.png');
}

async function scenarioNewMenu(cdp) {
  const docs = mainDocs();
  await boot(cdp, docs, 'd-travel');
  await openDocByTitle(cdp, '杭州旅行手记');
  await evalJs(cdp, `(() => { const f = document.getElementById('fabNewDoc'); if (f) f.click(); return !!f; })()`);
  await sleep(500);
  await capture(cdp, 'shot-05-01-new-menu.png');
}

async function scenarioBatch(cdp) {
  const docs = mainDocs();
  await boot(cdp, docs, 'd-plan');
  await evalJs(cdp, `(() => { const b = document.getElementById('btn-batch-toggle'); if (b) b.click(); return !!b; })()`);
  await sleep(600);
  await evalJs(cdp, `(() => {
    const boxes = [...document.querySelectorAll('.doc-batch-check')];
    if (boxes.length >= 3) { boxes[0].click(); boxes[2].click(); }
    return boxes.length;
  })()`);
  await sleep(500);
  await capture(cdp, 'shot-05-06-batch.png');
}

async function scenarioRecycle(cdp) {
  const docs = mainDocs().concat(trashDocs);
  await boot(cdp, docs, 'd-plan');
  await evalJs(cdp, `(() => { const n = document.getElementById('nav-trash'); if (n) n.click(); return !!n; })()`);
  await sleep(800);
  await capture(cdp, 'shot-05-07-recycle.png');
}

async function scenarioInventory(cdp) {
  // 确保应用处于已登录主界面再盘点 DOM
  await boot(cdp, mainDocs().concat(mainSticky), 'd-plan');
  // DOM 清单：输出主要交互按钮是否存在，用于后续场景编写
  const ids = [
    'btn-batch-toggle', 'btn-sort-toggle', 'btn-sb-search', 'sbSearchInput', 'fabNewDoc',
    'btn-find', 'btn-encoding', 'btn-compare', 'btn-doc-map', 'btn-preview-top', 'btn-more',
    'btn-info-panel', 'btn-style-panel', 'btn-rich-outline', 'btn-toggle-sidebar2', 'lang-select',
    'nav-recent', 'nav-my-space', 'nav-wiki', 'nav-favorites', 'nav-trash', 'nav-sticky'
  ];
  const inv = await evalJs(cdp, `(() => {
    const out = {};
    for (const id of ${JSON.stringify(ids)}) {
      const el = document.getElementById(id);
      out[id] = el ? { vis: getComputedStyle(el).display !== 'none', txt: (el.textContent || '').trim().slice(0, 16) } : null;
    }
    out.moreItems = [...document.querySelectorAll('#appbar-menu [data-ab]')].map((e) => e.getAttribute('data-ab'));
    out.docItemSample = document.querySelector('.doc-item') ? document.querySelector('.doc-item').outerHTML.slice(0, 300) : null;
    return out;
  })()`);
  console.log('INVENTORY ' + JSON.stringify(inv, null, 1));
}

/* ---------------- s3b：编辑器 / 预览 / 文档操作类场景 ---------------- */

/** 点击侧栏中指定标题文档条目上的“⋯”，弹出 .doc-menu */
async function openDocMoreMenu(cdp, title) {
  return evalJs(cdp, `(() => {
    const items = [...document.querySelectorAll('.doc-item')];
    const it = items.find((e) => { const n = e.querySelector('.doc-name'); return n && n.textContent.trim() === ${JSON.stringify(title)}; });
    const btn = it && it.querySelector('.doc-more-btn');
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
}

/** 等待顶部预览按钮对当前文档可见并点击（markdown/html 才显示） */
async function clickPreviewTop(cdp) {
  const ok = await waitUntil(cdp, `(() => { const b = document.getElementById('btn-preview-top'); return b && getComputedStyle(b).display !== 'none'; })()`, 6000);
  await evalJs(cdp, `(() => { const b = document.getElementById('btn-preview-top'); if (b) b.click(); return !!b; })()`);
  return ok;
}

/** 05-02 更多菜单：含导出文档 / 另存为 / 设置 / 关于 */
async function scenarioExportMenu(cdp) {
  await boot(cdp, mainDocs(), 'd-plan');
  const more = await evalJs(cdp, `(() => { const b = document.getElementById('btn-more'); if (b) b.click(); return !!b; })()`);
  log('btn-more 点击: ' + more);
  await sleep(500);
  const mvis = await evalJs(cdp, `(() => {
    const m = document.querySelector('#appbar-menu');
    const p = document.querySelector('.ab-more-wrap .dropdown, #appbar-menu .dropdown');
    const el = m && getComputedStyle(m).display !== 'none' ? m : p;
    return el ? { cls: el.className, disp: getComputedStyle(el).display, items: [...el.querySelectorAll('[data-ab], .menu-item')].map((e) => (e.getAttribute('data-ab') || e.textContent || '').trim()).filter(Boolean).slice(0, 12).join(',') } : null;
  })()`).catch(() => null);
  log('appbar 菜单状态: ' + JSON.stringify(mvis));
  await capture(cdp, 'shot-05-02-export-menu.png');
}

/** 05-03 文档三点点菜单：创建副本 / 重命名 / 收藏 / 置顶 / 编辑标签 / 导出 / 删除 */
async function scenarioDocMenu(cdp) {
  await boot(cdp, mainDocs(), 'd-plan');
  const opened = await openDocMoreMenu(cdp, '操作说明书写作计划');
  log('doc-more 打开: ' + opened);
  await sleep(400);
  const cmds = await evalJs(cdp, `(() => [...document.querySelectorAll('.doc-menu .doc-menu-item')].map((e) => e.getAttribute('data-cmd')).join(','))()`).catch(() => null);
  log('doc-menu 命令: ' + cmds);
  await capture(cdp, 'shot-05-03-doc-menu.png');
}

/** 05-04 编辑标签弹窗：展示当前文档标签与标签库 */
async function scenarioTagModal(cdp) {
  const docs = mainDocs().concat([longGuideDoc()]);
  await boot(cdp, docs, 'd-plan');
  await openDocMoreMenu(cdp, '操作说明书写作计划');
  await sleep(300);
  const tagCmd = await evalJs(cdp, `(() => {
    const mi = document.querySelector('.doc-menu .doc-menu-item[data-cmd="tag"]');
    if (mi) { mi.click(); return true; }
    return false;
  })()`);
  log('点击编辑标签: ' + tagCmd);
  await waitUntil(cdp, `(() => { const m = document.getElementById('tag-edit-modal'); return m && getComputedStyle(m).display !== 'none'; })()`, 5000);
  await sleep(500);
  const chips = await evalJs(cdp, `(() => { const c = document.getElementById('tag-edit-chips'); return c ? c.innerText.trim().slice(0, 120) : null; })()`).catch(() => null);
  log('标签弹窗 chips: ' + chips);
  await capture(cdp, 'shot-05-04-tag-modal.png');
}

/** 05-05 便利贴视图：侧栏卡片列表 + 主编辑区同屏 */
async function scenarioStickyView(cdp) {
  const docs = mainDocs().concat(mainSticky);
  await boot(cdp, docs, 'd-plan');
  const nav = await evalJs(cdp, `(() => { const n = document.getElementById('nav-sticky'); if (n) n.click(); return !!n; })()`);
  log('nav-sticky 点击: ' + nav);
  const hasSticky = await waitUntil(cdp, `document.querySelectorAll('.sticky-card').length >= 3`, 6000);
  log('sticky-card 数量达标: ' + hasSticky);
  const sc = await evalJs(cdp, `(() => ({
    cards: document.querySelectorAll('.sticky-card').length,
    items: [...document.querySelectorAll('.doc-list .doc-item, #docList .doc-item')].length,
    sample: (document.querySelector('.sticky-card-title, .sticky-card-head') || { textContent: '' }).textContent.trim().slice(0, 20)
  }))()`).catch(() => null);
  log('sticky 视图状态: ' + JSON.stringify(sc));
  await sleep(500);
  await capture(cdp, 'shot-05-05-sticky.png');
}

/** 06-01 语言 / 语法高亮：Python 文档着色展示 */
async function scenarioLangPython(cdp) {
  await boot(cdp, mainDocs(), 'd-script');
  await openDocByTitle(cdp, '统计脚本.py');
  const hl = await waitUntil(cdp, `document.querySelectorAll('.CodeMirror .cm-keyword').length > 0`, 8000);
  log('python 语法高亮出现: ' + hl);
  await sleep(400);
  await capture(cdp, 'shot-06-01-lang-highlight.png');
}

/** 06-02 文档地图：右侧代码全景缩略图 */
async function scenarioDocMap(cdp) {
  const docs = [longGuideDoc()].concat(mainDocs()).concat(mainSticky);
  await boot(cdp, docs, 'd-long');
  await openDocByTitle(cdp, 'L.Note 软件使用说明');
  const btnVis = await waitUntil(cdp, `(() => { const b = document.getElementById('btn-doc-map'); return b && getComputedStyle(b).display !== 'none'; })()`, 6000);
  log('btn-doc-map 可见: ' + btnVis);
  await evalJs(cdp, `(() => { const b = document.getElementById('btn-doc-map'); if (b) b.click(); return !!b; })()`);
  const drawn = await waitUntil(cdp, `(() => {
    const m = document.getElementById('doc-map');
    const ct = document.getElementById('doc-map-content');
    if (!m || getComputedStyle(m).display === 'none') return false;
    const h = ct ? parseInt(ct.style.height, 10) : 0;
    return !!h && h > 0;
  })()`, 8000);
  log('doc-map 已绘制: ' + drawn);
  await sleep(500);
  await capture(cdp, 'shot-06-02-doc-map.png');
}

/** 07-01 查找与替换：输入关键字回车后全文高亮 */
async function scenarioFindReplace(cdp) {
  const docs = [longGuideDoc()].concat(mainDocs()).concat(mainSticky);
  await boot(cdp, docs, 'd-long');
  await openDocByTitle(cdp, 'L.Note 软件使用说明');
  await evalJs(cdp, `(() => { const b = document.getElementById('btn-find'); if (b) b.click(); return !!b; })()`);
  await waitUntil(cdp, `(() => { const o = document.getElementById('fr-overlay'); return o && getComputedStyle(o).display !== 'none'; })()`, 5000);
  await sleep(300);
  await evalJs(cdp, `(() => {
    const el = document.getElementById('fr-find');
    if (!el) return false;
    el.value = '文档';
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    return true;
  })()`);
  const marked = await waitUntil(cdp, `document.querySelectorAll('.cm-fr-current').length > 0 || document.querySelectorAll('.cm-fr-searching').length > 0`, 6000);
  log('find 高亮出现: ' + marked);
  await sleep(700);
  const info = await evalJs(cdp, `(() => ({
    cur: document.querySelectorAll('.cm-fr-current').length,
    all: document.querySelectorAll('.cm-fr-searching').length,
    status: ((document.getElementById('fr-status') || {}).innerText || '').trim()
  }))()`).catch(() => null);
  log('find marks: ' + JSON.stringify(info));
  await capture(cdp, 'shot-07-01-find-replace.png');
}

/** 08-01 Markdown 实时预览：左右分栏 + 渲染正文 */
async function scenarioPreviewMd(cdp) {
  const docs = [longGuideDoc()].concat(mainDocs()).concat(mainSticky);
  await boot(cdp, docs, 'd-long');
  await openDocByTitle(cdp, 'L.Note 软件使用说明');
  await clickPreviewTop(cdp);
  const rendered = await waitUntil(cdp, `(() => {
    const out = document.getElementById('md-out');
    return out && getComputedStyle(out).display !== 'none' && !!out.querySelector('h1');
  })()`, 10000);
  log('md 预览渲染: ' + rendered);
  await sleep(600);
  await capture(cdp, 'shot-08-01-md-preview.png');
}

/** 08-02 公式与代码预览：KaTeX 公式 + highlight 代码块 */
async function scenarioPreviewMath(cdp) {
  const docs = [mathDemoDoc()].concat(mainDocs()).concat(mainSticky);
  await boot(cdp, docs, 'd-math');
  await openDocByTitle(cdp, '数学公式与代码示例');
  await clickPreviewTop(cdp);
  const rendered = await waitUntil(cdp, `(() => {
    const out = document.getElementById('md-out');
    return out && out.querySelectorAll('.katex-display').length >= 1 && out.querySelectorAll('.katex').length >= 2;
  })()`, 15000);
  log('KaTeX 渲染: ' + rendered);
  await sleep(600);
  await capture(cdp, 'shot-08-02-math-code.png');
}

/** 08-03 Markdown 内嵌 mermaid 图表预览 */
async function scenarioPreviewMermaid(cdp) {
  const docs = [chartDemoDoc()].concat(mainDocs()).concat(mainSticky);
  await boot(cdp, docs, 'd-chart');
  await openDocByTitle(cdp, '图表渲染示例');
  await clickPreviewTop(cdp);
  const rendered = await waitUntil(cdp, `(() => {
    const out = document.getElementById('md-out');
    return out && !!out.querySelector('.md-mermaid svg');
  })()`, 25000);
  log('mermaid svg 渲染: ' + rendered);
  await sleep(800);
  await capture(cdp, 'shot-08-03-mermaid.png');
}

/* ---------------- ch9+：流程图 / 可视化画布截图场景 ---------------- */

/** 关闭左侧文档栏，获得完整画布视野 */
async function collapseSidebar(cdp) {
  const ok = await evalJs(cdp, `(() => { const b = document.getElementById('btn-toggle-sidebar2') || document.querySelector('.sb-collapse-btn'); if (b) b.click(); return !!b; })()`);
  await sleep(700);
  return ok;
}

/** 泳道演示文档：3 条水平泳道（客户 / 销售中心 / 仓储物流）内的订单处理流程 */
function flowLaneDoc() {
  return {
    id: 'd-flow-lane', title: '订单处理泳道', kind: 'flow', lang: 'json',
    updated: Date.now() - 864e5,
    content: {
      nodes: [
        { id: 'c1', type: 'process', x: 260, y: 195, text: '提交订单' },
        { id: 'c2', type: 'process', x: 900, y: 195, text: '确认收货' },
        { id: 's1', type: 'process', x: 260, y: 410, text: '受理订单' },
        { id: 's2', type: 'decision', x: 620, y: 410, text: '库存校验' },
        { id: 's3', type: 'process', x: 1000, y: 410, text: '通知客户缺货' },
        { id: 'w1', type: 'process', x: 620, y: 635, text: '拣货出库' },
        { id: 'w2', type: 'process', x: 900, y: 635, text: '发货配送' }
      ],
      edges: [
        { id: 'e1', from: 'c1', to: 's1' },
        { id: 'e2', from: 's1', to: 's2' },
        { id: 'e3', from: 's2', to: 's3', text: '缺货' },
        { id: 'e4', from: 's2', to: 'w1', text: '有货' },
        { id: 'e5', from: 'w1', to: 'w2' },
        { id: 'e6', from: 'w2', to: 'c2' }
      ],
      lanes: [
        { id: 'l-cust', title: '客户', dir: 'h', y: 100, h: 190, style: { bodyFill: '#fff4e0', headerFill: '#ffe8bf' } },
        { id: 'l-sale', title: '销售中心', dir: 'h', y: 315, h: 190, style: { bodyFill: '#eaf7ee', headerFill: '#d3ecdb' } },
        { id: 'l-wh', title: '仓储物流', dir: 'h', y: 530, h: 210, style: { bodyFill: '#e9f2fc', headerFill: '#d0e4f8' } }
      ]
    }
  };
}

/** 09-01 流程图画布：打开流程图文档，显示画布与可视化工具栏 */
async function scenarioFlowCanvas(cdp) {
  const docs = mainDocs().concat(mainSticky);
  await boot(cdp, docs, 'd-flow');
  // 无桥环境不自动打开文档，须点击侧栏条目触发 openDoc → openVisual
  const opened = await openDocByTitle(cdp, '登录流程设计');
  log('打开流程图文档: ' + opened);
  const ok = await waitUntil(cdp, `document.querySelectorAll('.flow-svg .flow-node').length >= 6`, 15000);
  log('flow 节点渲染: ' + ok);
  await collapseSidebar(cdp);
  const st = await evalJs(cdp, `(() => ({
    nodes: document.querySelectorAll('.flow-svg .flow-node').length,
    edges: document.querySelectorAll('.flow-svg .flow-edge').length,
    lanes: document.querySelectorAll('.flow-svg .flow-lane').length,
    toolbar: ((document.getElementById('visual-toolbar') || {}).innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 90),
    styleBtn: (() => { const b = document.getElementById('btn-style-panel'); return b ? getComputedStyle(b).display !== 'none' : false; })()
  }))()`).catch(() => null);
  log('flow 画布: ' + JSON.stringify(st));
  await capture(cdp, 'shot-09-01-flow-canvas.png');
}

/** 09-02 泳道效果：水平泳道分区 + 跨泳道连线 */
async function scenarioFlowLanes(cdp) {
  const docs = [flowLaneDoc()].concat(mainDocs()).concat(mainSticky);
  await boot(cdp, docs, 'd-flow-lane');
  const opened = await openDocByTitle(cdp, '订单处理泳道');
  log('打开泳道文档: ' + opened);
  const ok = await waitUntil(cdp, `(() => {
    const c = document.querySelector('#visual-canvas');
    return c && document.querySelectorAll('.flow-svg .flow-node').length >= 7 && document.querySelectorAll('.flow-svg .flow-lane.lane-h').length >= 3;
  })()`, 15000);
  log('flow 泳道渲染: ' + ok);
  await collapseSidebar(cdp);
  const st = await evalJs(cdp, `(() => ({
    lanes: [...document.querySelectorAll('.flow-svg .flow-lane.lane-h')].map((g) => g.getAttribute('data-id')),
    nodes: document.querySelectorAll('.flow-svg .flow-node').length,
    edges: document.querySelectorAll('.flow-svg .flow-edge').length
  }))()`).catch(() => null);
  log('flow 泳道: ' + JSON.stringify(st));
  await capture(cdp, 'shot-09-02-flow-lanes.png');
}

/** 09-03 样式设置面板：选中节点后面板展示节点样式分区 */
async function scenarioFlowStyle(cdp) {
  await boot(cdp, mainDocs(), 'd-flow');
  const opened = await openDocByTitle(cdp, '登录流程设计');
  log('打开流程图文档: ' + opened);
  const ok = await waitUntil(cdp, `document.querySelectorAll('.flow-svg .flow-node').length >= 6`, 15000);
  log('flow 节点渲染: ' + ok);
  const btnOk = await evalJs(cdp, `(() => { const b = document.getElementById('btn-style-panel'); if (!b || getComputedStyle(b).display === 'none') return false; b.click(); return true; })()`);
  log('样式按钮点击: ' + btnOk);
  const panelOpen = await waitUntil(cdp, `(() => { const p = document.querySelector('.flow-style-bar'); return p && getComputedStyle(p).display === 'flex'; })()`, 6000);
  log('样式面板展开: ' + panelOpen);
  await sleep(300);
  const sel = await evalJs(cdp, `(() => {
    const g = document.querySelector('.flow-node[data-id="f1"]');
    if (!g) return false;
    const r = g.getBoundingClientRect();
    g.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    return true;
  })()`);
  log('选中节点 f1: ' + sel);
  const nodeSec = await waitUntil(cdp, `(() => {
    const s = document.querySelector('.flow-style-bar .fsb-sec.fsb-node');
    const g = document.querySelector('.flow-node[data-id="f1"]');
    return s && getComputedStyle(s).display === 'flex' && g && g.classList.contains('selected');
  })()`, 6000);
  log('fsb-node 分区显示: ' + nodeSec);
  await sleep(400);
  await capture(cdp, 'shot-09-03-style-panel.png');
}

/** 10-01 思维导图右键菜单：在节点上点击右键弹出节点操作上下文菜单 */
async function scenarioMindCtx(cdp) {
  await boot(cdp, mainDocs(), 'd-mind');
  const opened = await openDocByTitle(cdp, '年度读书计划');
  log('打开思维导图文档: ' + opened);
  const ok = await waitUntil(cdp, `document.querySelectorAll('.mind-svg .mind-node').length >= 7`, 15000);
  log('mind 节点渲染: ' + ok);
  await collapseSidebar(cdp);
  const fired = await evalJs(cdp, `(() => {
    const g = document.querySelector('.mind-svg .mind-node[data-id="m1"]');
    if (!g) return false;
    const r = g.getBoundingClientRect();
    const sp = Event.prototype.stopPropagation;
    const sip = Event.prototype.stopImmediatePropagation;
    Event.prototype.stopPropagation = function () {};
    Event.prototype.stopImmediatePropagation = function () {};
    try {
      g.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, button: 2,
        clientX: r.x + r.width / 2, clientY: r.y + r.height / 2
      }));
    } finally {
      Event.prototype.stopPropagation = sp;
      Event.prototype.stopImmediatePropagation = sip;
    }
    return true;
  })()`);
  log('节点右键触发: ' + fired);
  const menuOpen = await waitUntil(cdp, `(() => {
    const m = document.querySelector('.mind-ctx-menu');
    return m && getComputedStyle(m).display === 'block' && m.querySelectorAll('.mcm-item').length === 11;
  })()`, 6000);
  log('右键菜单展开: ' + menuOpen);
  await sleep(300);
  const st = await evalJs(cdp, `(() => {
    const items = [...document.querySelectorAll('.mind-ctx-menu .mcm-item')].map((e) => (e.querySelector('.mcm-label') || {}).textContent || '');
    const sel = document.querySelector('.mind-svg .mind-node.selected');
    return {
      nodes: document.querySelectorAll('.mind-svg .mind-node').length,
      selected: sel ? sel.getAttribute('data-id') : null,
      itemCount: items.length,
      firstItems: items.slice(0, 3).join(' / '),
      lastItems: items.slice(-3).join(' / ')
    };
  })()`).catch(() => null);
  log('mind 右键菜单: ' + JSON.stringify(st));
  await capture(cdp, 'shot-10-01-mind-ctx.png');
}

/** 10-02 主题网格：样式面板「页面」页签展示布局密度与 12 套预设主题 */
async function scenarioMindTheme(cdp) {
  await boot(cdp, mainDocs(), 'd-mind');
  const opened = await openDocByTitle(cdp, '年度读书计划');
  log('打开思维导图文档: ' + opened);
  const ok = await waitUntil(cdp, `document.querySelectorAll('.mind-svg .mind-node').length >= 7`, 15000);
  log('mind 节点渲染: ' + ok);
  const btnOk = await evalJs(cdp, `(() => { const b = document.getElementById('btn-style-panel'); if (!b || getComputedStyle(b).display === 'none') return false; b.click(); return true; })()`);
  log('样式按钮点击: ' + btnOk);
  const panelOpen = await waitUntil(cdp, `(() => { const p = document.querySelector('.mind-style-bar'); return p && getComputedStyle(p).display === 'flex'; })()`, 6000);
  log('样式面板展开: ' + panelOpen);
  await sleep(300);
  const tabOk = await evalJs(cdp, `(() => { const t = document.querySelector('.mind-style-bar .fsb-tab[data-tab="page"]'); if (!t) return false; t.click(); return true; })()`);
  log('页面页签点击: ' + tabOk);
  const pageOpen = await waitUntil(cdp, `(() => {
    const s = document.querySelector('.mind-style-bar .fsb-sec.fsb-page');
    return s && getComputedStyle(s).display === 'flex' && document.querySelectorAll('.mind-style-bar .fsb-theme').length === 12;
  })()`, 6000);
  log('主题网格渲染: ' + pageOpen);
  await sleep(300);
  const st = await evalJs(cdp, `(() => {
    const box = document.querySelector('.mind-style-bar .fsb-themes');
    const names = box ? [...box.querySelectorAll('.fsb-theme .fth-name')].map((e) => e.textContent.trim()) : [];
    const active = box ? box.querySelector('.fsb-theme.active') : null;
    return {
      themeCount: names.length,
      names: names.join('/'),
      active: active ? active.getAttribute('data-theme') : null,
      density: (() => { const d = document.querySelector('.mind-style-bar .fsb-layout .fsb-seg-btn.active'); return d ? d.textContent.trim() : null; })(),
      numbering: (() => { const n = document.querySelector('.mind-style-bar .fsb-numbering .fsb-seg-btn.active'); return n ? n.textContent.trim() : null; })()
    };
  })()`).catch(() => null);
  log('主题网格: ' + JSON.stringify(st));
  await capture(cdp, 'shot-10-02-mind-theme.png');
}

/** [调试] 诊断流程图文档打开路径（点击侧栏条目前后对比） */
async function scenarioDbgFlow(cdp) {
  const docs = mainDocs().concat(mainSticky);
  await boot(cdp, docs, 'd-flow');
  const before = await evalJs(cdp, `(() => {
    const vis = (id) => { const e = document.getElementById(id); return e ? getComputedStyle(e).display : '(none-elem)'; };
    const items = [...document.querySelectorAll('.doc-item .doc-name')].map((e) => e.textContent.trim()).slice(0, 20);
    const active = localStorage.getItem('inkpad.active.v1');
    return {
      active, items,
      titleVal: (document.getElementById('doc-title') || {}).value,
      visualPane: vis('visual-pane'), editorPane: vis('editor-pane'),
      visualCanvasHtml: (document.getElementById('visual-canvas') || {}).innerHTML ? document.getElementById('visual-canvas').innerHTML.slice(0, 60) : null,
      codeMirror: !!document.querySelector('.CodeMirror')
    };
  })()`).catch((e) => ({ err: e.message }));
  console.log('DBG-BEFORE ' + JSON.stringify(before, null, 1));
  const opened = await openDocByTitle(cdp, '登录流程设计');
  await sleep(1200);
  const after = await evalJs(cdp, `(() => {
    const vis = (id) => { const e = document.getElementById(id); return e ? getComputedStyle(e).display : '(none-elem)'; };
    return {
      flowSvg: !!document.querySelector('.flow-svg'),
      flowNodes: document.querySelectorAll('.flow-svg .flow-node').length,
      flowEdges: document.querySelectorAll('.flow-svg .flow-edge').length,
      flowLanes: document.querySelectorAll('.flow-svg .flow-lane').length,
      visualPane: vis('visual-pane'), editorPane: vis('editor-pane'),
      titleVal: (document.getElementById('doc-title') || {}).value,
      styleBtn: (() => { const b = document.getElementById('btn-style-panel'); return b ? getComputedStyle(b).display : '?'; })()
    };
  })()`).catch((e) => ({ err: e.message }));
  console.log('DBG-AFTER ' + JSON.stringify(after, null, 1));
}

/* ---------------- s3c：11~17 章应用侧界面场景 ---------------- */

/** 11-01 大纲面板：富文档标题结构 + 左侧大纲树 */
async function scenarioRichOutline(cdp) {
  const docs = mainDocs().concat([richDoc()]);
  await boot(cdp, docs, 'd-plan');
  const opened = await openDocByTitle(cdp, '产品需求说明书');
  log('打开富文本文档: ' + opened);
  const blocksOk = await waitUntil(cdp, `document.querySelectorAll('#rich-canvas .ink-block').length >= 6`, 10000);
  log('富文本块渲染: ' + blocksOk);
  const btnOk = await evalJs(cdp, `(() => {
    const b = document.getElementById('btn-rich-outline');
    if (!b || getComputedStyle(b).display === 'none') return false;
    b.click();
    return true;
  })()`);
  log('大纲按钮点击: ' + btnOk);
  const outlineOk = await waitUntil(cdp, `(() => {
    const items = document.querySelectorAll('#outline-list .outline-item');
    return items.length >= 6 && getComputedStyle(document.getElementById('rich-outline')).display !== 'none';
  })()`, 8000);
  log('大纲条目渲染: ' + outlineOk);
  const st = await evalJs(cdp, `(() => ({
    items: document.querySelectorAll('#outline-list .outline-item').length,
    count: (document.getElementById('outline-count') || {}).textContent,
    types: [...document.querySelectorAll('#outline-list .outline-item')].map((e) => e.getAttribute('data-type')).join(',')
  }))()`).catch(() => null);
  log('大纲状态: ' + JSON.stringify(st));
  await sleep(400);
  await capture(cdp, 'shot-11-01-outline.png');
}

/** 12-01 提醒设置：便利贴编辑浮层中的定时提醒配置（每周 / 时分） */
async function scenarioReminderEdit(cdp) {
  const docs = mainDocs().concat(mainSticky).concat([reminderStickySeed().edit]);
  await boot(cdp, docs, 'd-plan');
  const nav = await evalJs(cdp, `(() => { const n = document.getElementById('nav-sticky'); if (n) n.click(); return !!n; })()`);
  log('nav-sticky 点击: ' + nav);
  const hasCards = await waitUntil(cdp, `document.querySelectorAll('.sticky-card').length >= 4`, 8000);
  log('便利贴卡片数量达标: ' + hasCards);
  const clicked = await evalJs(cdp, `(() => {
    const cards = [...document.querySelectorAll('.sticky-card')];
    const t = cards.find((c) => {
      const el = c.querySelector('.sticky-card-title');
      return el && el.textContent.trim() === '每周复盘';
    });
    if (!t) return false;
    t.click();
    return true;
  })()`);
  log('打开提醒便利贴: ' + clicked);
  const modalOk = await waitUntil(cdp, `(() => {
    const m = document.getElementById('sticky-edit-modal');
    const row = document.getElementById('sticky-rem-row');
    return m && getComputedStyle(m).display !== 'none' && row && row.style.display !== 'none';
  })()`, 8000);
  log('提醒设置浮层展开: ' + modalOk);
  const st = await evalJs(cdp, `(() => ({
    enabled: (document.getElementById('sticky-edit-rem-enabled') || {}).checked,
    type: (document.getElementById('sticky-edit-rem-type') || {}).value,
    time: (document.getElementById('sticky-edit-rem-time') || {}).value,
    weeklyChecked: document.querySelectorAll('#sticky-rem-weekly input[type=checkbox]:checked').length
  }))()`).catch(() => null);
  log('提醒字段状态: ' + JSON.stringify(st));
  await sleep(400);
  await capture(cdp, 'shot-12-01-reminder-edit.png');
}

/** 12-02 提醒弹窗：启动时命中当分钟提醒 → 自动弹出 */
async function scenarioReminderPopup(cdp) {
  const docs = mainDocs().concat(mainSticky).concat(reminderStickySeed().fire);
  await boot(cdp, docs, 'd-plan', 2600);
  const visible = `(() => {
    const m = document.getElementById('sticky-reminder-modal');
    return m && getComputedStyle(m).display !== 'none';
  })()`;
  let ok = await waitUntil(cdp, visible, 3000);
  if (!ok) {
    log('启动未命中，等待 30s 轮询周期…');
    ok = await waitUntil(cdp, visible, 36000);
  }
  log('提醒弹窗出现: ' + ok);
  const st = await evalJs(cdp, `(() => ({
    title: (document.getElementById('sticky-reminder-title') || {}).textContent,
    content: (document.getElementById('sticky-reminder-content') || {}).textContent
  }))()`).catch(() => null);
  log('提醒弹窗内容: ' + JSON.stringify(st));
  await sleep(400);
  await capture(cdp, 'shot-12-02-reminder-popup.png');
}

/** 13-01 图片编辑窗口：独立页面 image_viewer.html（假桥注入图片数据） */
async function scenarioImageEditor(cdp) {
  const png = fs.readFileSync(path.join(ROOT, 'screenshots', 'rich.png'));
  const dataUrl = 'data:image/png;base64,' + png.toString('base64');
  const bridgeId = await installBridge(cdp, imageBridgeSource(dataUrl, '界面截图.png'));
  try {
    await withTimeout(navigateAndWait(cdp, 'http://127.0.0.1:' + HTTP_PORT + '/image_viewer.html'), 15000, '打开图片编辑窗口');
    await sleep(400);
    await evalJs(cdp, `(() => { window.dispatchEvent(new Event('pywebviewready')); return true; })()`);
    const imgOk = await waitUntil(cdp, `(() => { const i = document.getElementById('iv-img'); return !!(i && i.getAttribute('src') && i.complete && i.naturalWidth > 0); })()`, 10000);
    log('图片加载完成: ' + imgOk);
    const loadingHidden = await waitUntil(cdp, `(() => { const l = document.getElementById('iv-loading'); return l && getComputedStyle(l).display === 'none'; })()`, 6000);
    log('加载提示已隐藏: ' + loadingHidden);
    await sleep(300);
    const editOk = await evalJs(cdp, `(() => { const b = document.getElementById('iv-edit-toggle'); if (!b) return false; b.click(); return true; })()`);
    log('进入编辑模式: ' + editOk);
    const editUi = await waitUntil(cdp, `(() => {
      const bar = document.getElementById('iv-editbar');
      const fb = document.getElementById('iv-filterbox');
      return bar && bar.classList.contains('show') && fb && fb.classList.contains('show');
    })()`, 6000);
    log('编辑工具栏展开: ' + editUi);
    const st = await evalJs(cdp, `(() => ({
      title: (document.getElementById('iv-title') || {}).textContent,
      zoom: (document.getElementById('iv-zoom') || {}).textContent,
      tools: [...document.querySelectorAll('#iv-editbar .iv-btn')].map((e) => e.textContent.trim()).join(' / ')
    }))()`).catch(() => null);
    log('图片编辑窗口状态: ' + JSON.stringify(st));
    await sleep(400);
    await capture(cdp, 'shot-13-01-image-editor.png');
  } finally {
    await removeBridge(cdp, bridgeId);
  }
}

/** 14-01 JSON 工具面板：「更多 → JSON 工具」子菜单就地展开 */
async function scenarioJsonTools(cdp) {
  await boot(cdp, mainDocs(), 'd-json');
  await openDocByTitle(cdp, '示例数据.json');
  await sleep(500);
  const more = await evalJs(cdp, `(() => { const b = document.getElementById('btn-more'); if (b) b.click(); return !!b; })()`);
  log('btn-more 点击: ' + more);
  await sleep(400);
  const trig = await evalJs(cdp, `(() => {
    const t = document.querySelector('#appbar-menu .ab-trigger[data-ab="json"]');
    if (!t || t.offsetParent === null) return false;
    t.click();
    return true;
  })()`);
  log('JSON 工具子菜单展开: ' + trig);
  const subOk = await waitUntil(cdp, `(() => {
    const s = document.querySelector('#appbar-menu .ab-sub[data-ab-sub="json"]');
    return s && getComputedStyle(s).display !== 'none';
  })()`, 6000);
  log('JSON 子项可见: ' + subOk);
  const st = await evalJs(cdp, `(() => ({
    items: [...document.querySelectorAll('#appbar-menu .ab-sub[data-ab-sub="json"] .ab-sub-item')].map((e) => e.textContent.trim()).join(' / '),
    topItems: [...document.querySelectorAll('#appbar-menu > [data-ab]')].filter((e) => e.offsetParent !== null).map((e) => (e.getAttribute('data-ab') || '')).join(',')
  }))()`).catch(() => null);
  log('JSON 工具项: ' + JSON.stringify(st));
  await sleep(400);
  await capture(cdp, 'shot-14-01-json-tools.png');
}

/** 15-01 文件比较窗口：独立页面 compare.html，按行差异高亮 */
async function scenarioCompare(cdp) {
  await withTimeout(navigateAndWait(cdp, 'http://127.0.0.1:' + HTTP_PORT + '/compare.html'), 15000, '打开文件比较窗口');
  await sleep(700);
  const textA = [
    'app: L.Note',
    'version: 0.21.13',
    'theme: light',
    'fontSize: 15',
    'autoSave: true',
    'lineWrap: true',
    'recentLimit: 10'
  ].join('\n');
  const textB = [
    'app: L.Note',
    'version: 1.0.0',
    'theme: light',
    'fontSize: 16',
    'autoSave: true',
    'recentLimit: 20'
  ].join('\n');
  const filled = await evalJs(cdp, `(() => {
    const a = document.getElementById('ta-a');
    const b = document.getElementById('ta-b');
    if (!a || !b) return false;
    a.value = ${JSON.stringify(textA)};
    b.value = ${JSON.stringify(textB)};
    a.dispatchEvent(new Event('input', { bubbles: true }));
    b.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  log('填充比较内容: ' + filled);
  const diffOk = await waitUntil(cdp, `(() => {
    const removed = document.querySelectorAll('#cmp-col-a .cmp-line.removed').length;
    const added = document.querySelectorAll('#cmp-col-b .cmp-line.added').length;
    return removed > 0 && added > 0;
  })()`, 10000);
  log('按行差异高亮: ' + diffOk);
  const st = await evalJs(cdp, `(() => ({
    summary: (document.getElementById('cmp-summary') || {}).textContent,
    headA: (document.getElementById('cmp-head-a') || {}).textContent,
    headB: (document.getElementById('cmp-head-b') || {}).textContent,
    lines: document.querySelectorAll('#cmp-col-a .cmp-line').length
  }))()`).catch(() => null);
  log('比较结果: ' + JSON.stringify(st));
  await sleep(400);
  await capture(cdp, 'shot-15-01-compare.png');
}

/** 16-01 设置-通用：字体大小滑杆 / 行号 / 自动换行 */
async function scenarioSettingsGeneral(cdp) {
  await boot(cdp, mainDocs(), 'd-plan');
  const ok = await clickMoreItem(cdp, 'settings');
  log('打开设置: ' + ok);
  const modalOk = await waitUntil(cdp, `(() => {
    const m = document.getElementById('settings-modal');
    const p = document.getElementById('settings-pane-general');
    return m && getComputedStyle(m).display !== 'none' && p && getComputedStyle(p).display !== 'none';
  })()`, 6000);
  log('设置-通用页签展示: ' + modalOk);
  const st = await evalJs(cdp, `(() => ({
    fontSize: (document.getElementById('settings-fontsize') || {}).value,
    fontSizeVal: (document.getElementById('settings-fontsize-val') || {}).textContent,
    lineNum: (document.getElementById('settings-linenum') || {}).checked,
    wrap: (document.getElementById('settings-wrap') || {}).checked
  }))()`).catch(() => null);
  log('通用设置状态: ' + JSON.stringify(st));
  await sleep(400);
  await capture(cdp, 'shot-16-01-settings-general.png');
}

/** 16-02 设置-快捷键：快捷键列表与录制按钮 */
async function scenarioSettingsKeys(cdp) {
  await boot(cdp, mainDocs(), 'd-plan');
  const ok = await clickMoreItem(cdp, 'settings');
  log('打开设置: ' + ok);
  await waitUntil(cdp, `(() => { const m = document.getElementById('settings-modal'); return m && getComputedStyle(m).display !== 'none'; })()`, 6000);
  const tabOk = await evalJs(cdp, `(() => {
    const t = document.querySelector('.settings-tabs [data-settings-tab="keys"]');
    if (!t) return false;
    t.click();
    return true;
  })()`);
  log('切换到快捷键页签: ' + tabOk);
  const paneOk = await waitUntil(cdp, `(() => {
    const p = document.getElementById('settings-pane-keys');
    return p && getComputedStyle(p).display !== 'none' && p.querySelectorAll('.sk-row').length > 0;
  })()`, 6000);
  log('快捷键列表渲染: ' + paneOk);
  const st = await evalJs(cdp, `(() => ({
    rows: document.querySelectorAll('#settings-keys-list .sk-row').length,
    sample: [...document.querySelectorAll('#settings-keys-list .sk-row')].slice(0, 3).map((r) => r.innerText.replace(/\\s+/g, ' ').trim()).join(' | ')
  }))()`).catch(() => null);
  log('快捷键列表状态: ' + JSON.stringify(st));
  await sleep(400);
  await capture(cdp, 'shot-16-02-settings-keys.png');
}

/** 17-01 关于窗口：图标 / 名称 / 版本号 / 简介与检查更新入口 */
async function scenarioAbout(cdp) {
  await boot(cdp, mainDocs(), 'd-plan');
  const ok = await clickMoreItem(cdp, 'about');
  log('打开关于: ' + ok);
  const modalOk = await waitUntil(cdp, `(() => { const m = document.getElementById('about-modal'); return m && getComputedStyle(m).display !== 'none'; })()`, 6000);
  log('关于窗口展示: ' + modalOk);
  const st = await evalJs(cdp, `(() => ({
    name: (document.querySelector('#about-modal .about-name') || {}).textContent,
    version: (document.getElementById('about-version') || {}).textContent,
    desc: (document.querySelector('#about-modal .about-desc') || {}).textContent,
    status: (document.getElementById('about-status') || {}).textContent
  }))()`).catch(() => null);
  log('关于窗口状态: ' + JSON.stringify(st));
  await sleep(400);
  await capture(cdp, 'shot-18-01-about.png');
}

/** 17-02 更新提示窗：假桥返回有更新 → 启动自动检查后弹出 */
async function scenarioUpdateModal(cdp) {
  const bridgeId = await installBridge(cdp, BRIDGE_APP_UPDATE);
  try {
    await boot(cdp, mainDocs(), 'd-plan', 1400);
    const modalOk = await waitUntil(cdp, `(() => { const m = document.getElementById('update-modal'); return m && getComputedStyle(m).display !== 'none'; })()`, 15000);
    log('更新提示窗出现: ' + modalOk);
    const badge = await evalJs(cdp, `(() => {
      const b = document.getElementById('update-badge');
      const m = document.getElementById('menu-update-badge');
      return {
        badge: b ? getComputedStyle(b).display : null,
        menuBadge: m ? getComputedStyle(m).display : null,
        title: (document.getElementById('update-title') || {}).textContent,
        versions: (document.getElementById('update-versions') || {}).textContent
      };
    })()`).catch(() => null);
    log('更新提示窗状态: ' + JSON.stringify(badge));
    await sleep(500);
    await capture(cdp, 'shot-18-02-update.png');
  } finally {
    await removeBridge(cdp, bridgeId);
  }
}

/** 16-03 设置-AI：服务商预设 / Base URL / 模型名 / 密钥掩码与保存按钮 */
async function scenarioSettingsAi(cdp) {
  const bridgeId = await installBridge(cdp, BRIDGE_APP_AI);
  try {
    await boot(cdp, mainDocs(), 'd-plan', 1600);
    const ok = await clickMoreItem(cdp, 'settings');
    log('打开设置: ' + ok);
    await waitUntil(cdp, `(() => { const m = document.getElementById('settings-modal'); return m && getComputedStyle(m).display !== 'none'; })()`, 6000);
    const tabOk = await evalJs(cdp, `(() => {
      const t = document.querySelector('[data-settings-tab="ai"]');
      if (!t) return false;
      t.click();
      return true;
    })()`);
    log('切换到 AI 页签: ' + tabOk);
    const paneOk = await waitUntil(cdp, `(() => {
      const p = document.getElementById('settings-pane-ai');
      const b = document.getElementById('settings-ai-baseurl');
      return !!(p && getComputedStyle(p).display !== 'none' && b && b.value);
    })()`, 8000);
    log('AI 配置回填: ' + paneOk);
    const st = await evalJs(cdp, `(() => ({
      preset: (document.getElementById('settings-ai-preset') || {}).value,
      baseUrl: (document.getElementById('settings-ai-baseurl') || {}).value,
      model: (document.getElementById('settings-ai-model') || {}).value,
      keyPlaceholder: (document.getElementById('settings-ai-key') || {}).placeholder,
      status: (document.getElementById('settings-ai-status') || {}).textContent,
      rows: document.querySelectorAll('#settings-pane-ai .ts-row').length,
      apiCalls: (window.__fakeApiCalls || []).slice()
    }))()`).catch(() => null);
    log('AI 设置状态: ' + JSON.stringify(st));
    await sleep(400);
    await capture(cdp, 'shot-16-03-settings-ai.png');
  } finally {
    await removeBridge(cdp, bridgeId);
  }
}

/** 17-01 AI 助手入口菜单：文本选区右键 → 「AI 助手」「AI 图表」分组 */
async function scenarioAiCtxMenu(cdp) {
  const bridgeId = await installBridge(cdp, BRIDGE_APP_AI);
  try {
    await boot(cdp, mainDocs(), 'd-plan', 1600);
    const info = await editorSelectionInfo(cdp);
    log('编辑器实例: ' + JSON.stringify(info));
    const sel = await selectEditorLines(cdp, 14, 16);
    log('选中文本: ' + JSON.stringify(sel && sel.text));
    const fired = await rightClickAt(cdp, sel && sel.pos && sel.pos.x, sel && sel.pos && sel.pos.y);
    log('右键触发: ' + fired);
    const menuOk = await waitCtxMenu(cdp, 'ctx-group-ai');
    log('AI 助手分组展示: ' + menuOk);
    const st = await evalJs(cdp, `(() => ({
      aiItems: [...document.querySelectorAll('#ctx-group-ai .ctx-item')].map((i) => i.innerText.replace(/\\s+/g, ' ').trim()),
      aiDisabled: document.querySelectorAll('#ctx-group-ai .ctx-item-disabled').length,
      diagItems: [...document.querySelectorAll('#ctx-group-ai-diagram .ctx-item')].map((i) => i.innerText.replace(/\\s+/g, ' ').trim()),
      diagDisabled: document.querySelectorAll('#ctx-group-ai-diagram .ctx-item-disabled').length
    }))()`).catch(() => null);
    log('右键菜单状态: ' + JSON.stringify(st));
    await sleep(400);
    await capture(cdp, 'shot-17-01-ai-ctx-menu.png');
  } finally {
    await removeBridge(cdp, bridgeId);
  }
}

/** 17-02 AI 助手面板：润色结果预览与复制 / 插入 / 替换操作 */
async function scenarioAiPanel(cdp) {
  const bridgeId = await installBridge(cdp, BRIDGE_APP_AI);
  try {
    await boot(cdp, mainDocs(), 'd-plan', 1600);
    const sel = await selectEditorLines(cdp, 14, 16);
    log('选中文本: ' + JSON.stringify(sel && sel.text));
    await rightClickAt(cdp, sel && sel.pos && sel.pos.x, sel && sel.pos && sel.pos.y);
    await waitCtxMenu(cdp, 'ctx-group-ai');
    const clicked = await clickCtxCmd(cdp, 'ai-polish');
    log('点击「润色」: ' + clicked);
    const panelOk = await waitUntil(cdp, `(() => {
      const p = document.getElementById('ai-panel');
      const b = document.getElementById('ai-panel-body');
      return !!(p && getComputedStyle(p).display !== 'none' && b && b.textContent.length > 20);
    })()`, 10000);
    log('AI 助手面板就绪: ' + panelOk);
    const st = await evalJs(cdp, `(() => ({
      title: (document.getElementById('ai-panel-title') || {}).textContent,
      meta: (document.getElementById('ai-panel-meta') || {}).textContent,
      chars: ((document.getElementById('ai-panel-body') || {}).textContent || '').length,
      copyDisabled: (document.getElementById('ai-copy') || {}).disabled,
      insertDisabled: (document.getElementById('ai-apply-insert') || {}).disabled,
      replaceDisabled: (document.getElementById('ai-apply-replace') || {}).disabled,
      apiCalls: (window.__fakeApiCalls || []).slice()
    }))()`).catch(() => null);
    log('AI 助手面板状态: ' + JSON.stringify(st));
    await sleep(400);
    await capture(cdp, 'shot-17-02-ai-panel.png');
  } finally {
    await removeBridge(cdp, bridgeId);
  }
}

/** 17-03 AI 图表描述输入框：未选中文本时右键「生成流程图」弹出的描述框 */
async function scenarioAiDiagramPrompt(cdp) {
  const bridgeId = await installBridge(cdp, BRIDGE_APP_AI);
  try {
    await boot(cdp, mainDocs(), 'd-plan', 1600);
    const pt = await editorPoint(cdp);
    const fired = await rightClickAt(cdp, pt && pt.x, pt && pt.y);
    log('无选区右键触发: ' + fired);
    const menuOk = await waitCtxMenu(cdp, 'ctx-group-ai-diagram');
    log('AI 图表分组展示: ' + menuOk);
    const hidden = await evalJs(cdp, `(() => {
      const g = document.getElementById('ctx-group-ai');
      return g ? getComputedStyle(g).display : null;
    })()`);
    log('无选区时 AI 助手分组 display: ' + hidden);
    const clicked = await clickCtxCmd(cdp, 'ai-diagram-flow');
    log('点击「生成流程图」: ' + clicked);
    const promptOk = await waitUntil(cdp, `(() => {
      const m = document.getElementById('ai-diagram-prompt');
      const t = document.getElementById('ai-diagram-prompt-text');
      return !!(m && getComputedStyle(m).display !== 'none' && t);
    })()`, 6000);
    log('描述输入框展示: ' + promptOk);
    await evalJs(cdp, `(() => {
      const t = document.getElementById('ai-diagram-prompt-text');
      if (t) { t.value = '邮箱注册流程：填写邮箱与密码 → 校验邮箱格式 → 发送验证码 → 校验验证码 → 注册成功'; }
      return true;
    })()`);
    const st = await evalJs(cdp, `(() => ({
      title: (document.getElementById('ai-diagram-prompt-title') || {}).textContent,
      value: (document.getElementById('ai-diagram-prompt-text') || {}).value
    }))()`).catch(() => null);
    log('描述输入框状态: ' + JSON.stringify(st));
    await sleep(400);
    await capture(cdp, 'shot-17-03-ai-diagram-prompt.png');
  } finally {
    await removeBridge(cdp, bridgeId);
  }
}

/** 17-04 AI 图表面板：结构预览（节点 / 连线）与新建按钮 */
async function scenarioAiDiagramPanel(cdp) {
  const bridgeId = await installBridge(cdp, BRIDGE_APP_AI);
  try {
    await boot(cdp, mainDocs(), 'd-plan', 1600);
    const sel = await selectEditorLines(cdp, 14, 16);
    log('选中文本: ' + JSON.stringify(sel && sel.text));
    await rightClickAt(cdp, sel && sel.pos && sel.pos.x, sel && sel.pos && sel.pos.y);
    await waitCtxMenu(cdp, 'ctx-group-ai-diagram');
    const clicked = await clickCtxCmd(cdp, 'ai-diagram-flow');
    log('点击「生成流程图」: ' + clicked);
    const panelOk = await waitUntil(cdp, `(() => {
      const p = document.getElementById('ai-diagram-panel');
      const b = document.getElementById('ai-diagram-body');
      return !!(p && getComputedStyle(p).display !== 'none' && b && b.textContent.indexOf('节点') >= 0);
    })()`, 10000);
    log('AI 图表面板就绪: ' + panelOk);
    const st = await evalJs(cdp, `(() => ({
      title: (document.getElementById('ai-diagram-title') || {}).textContent,
      meta: (document.getElementById('ai-diagram-meta') || {}).textContent,
      createText: (document.getElementById('ai-diagram-create') || {}).textContent,
      createDisabled: (document.getElementById('ai-diagram-create') || {}).disabled,
      body: ((document.getElementById('ai-diagram-body') || {}).textContent || '').slice(0, 120),
      apiCalls: (window.__fakeApiCalls || []).slice()
    }))()`).catch(() => null);
    log('AI 图表面板状态: ' + JSON.stringify(st));
    await sleep(400);
    await capture(cdp, 'shot-17-04-ai-diagram-panel.png');
  } finally {
    await removeBridge(cdp, bridgeId);
  }
}

scenarios.push(['first-run', scenarioFirstRun]);
scenarios.push(['main', scenarioMain]);
scenarios.push(['new-menu', scenarioNewMenu]);
scenarios.push(['batch', scenarioBatch]);
scenarios.push(['recycle', scenarioRecycle]);
scenarios.push(['inventory', scenarioInventory]);
scenarios.push(['export-menu', scenarioExportMenu]);
scenarios.push(['doc-menu', scenarioDocMenu]);
scenarios.push(['tag-modal', scenarioTagModal]);
scenarios.push(['stickyview', scenarioStickyView]);
scenarios.push(['lang-python', scenarioLangPython]);
scenarios.push(['docmap', scenarioDocMap]);
scenarios.push(['find-replace', scenarioFindReplace]);
scenarios.push(['preview-md', scenarioPreviewMd]);
scenarios.push(['preview-math', scenarioPreviewMath]);
scenarios.push(['preview-chart', scenarioPreviewMermaid]);
scenarios.push(['shot-09-flow-canvas', scenarioFlowCanvas]);
scenarios.push(['shot-09-flow-lanes', scenarioFlowLanes]);
scenarios.push(['shot-09-style-panel', scenarioFlowStyle]);
scenarios.push(['shot-10-mind-ctx', scenarioMindCtx]);
scenarios.push(['shot-10-mind-theme', scenarioMindTheme]);

scenarios.push(['shot-11-outline', scenarioRichOutline]);
scenarios.push(['shot-12-reminder-edit', scenarioReminderEdit]);
scenarios.push(['shot-12-reminder-popup', scenarioReminderPopup]);
scenarios.push(['shot-13-image-editor', scenarioImageEditor]);
scenarios.push(['shot-14-json-tools', scenarioJsonTools]);
scenarios.push(['shot-15-compare', scenarioCompare]);
scenarios.push(['shot-16-settings-general', scenarioSettingsGeneral]);
scenarios.push(['shot-16-settings-keys', scenarioSettingsKeys]);
scenarios.push(['shot-16-settings-ai', scenarioSettingsAi]);
scenarios.push(['shot-17-ai-ctx-menu', scenarioAiCtxMenu]);
scenarios.push(['shot-17-ai-panel', scenarioAiPanel]);
scenarios.push(['shot-17-ai-diagram-prompt', scenarioAiDiagramPrompt]);
scenarios.push(['shot-17-ai-diagram-panel', scenarioAiDiagramPanel]);
scenarios.push(['shot-18-about', scenarioAbout]);
scenarios.push(['shot-18-update', scenarioUpdateModal]);

/* ---------------- 主流程 ---------------- */

let server, edgeProc, cdp;
let failed = false;
const only = process.argv[2];

try {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  log('输出目录: ' + OUT_DIR);
  log('启动静态服务器');
  server = await withTimeout(startStaticServer(ROOT, HTTP_PORT), 5000, 'startStaticServer');
  const edge = findEdge();
  if (!edge) throw new Error('未找到 Edge');
  log('启动 Edge: ' + edge);
  const userDataDir = fs.mkdtempSync(path.join(process.env.TEMP || '.', 'edge-shots-'));
  edgeProc = spawn(edge, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars',
    '--remote-debugging-port=' + DEBUG_PORT,
    '--user-data-dir=' + userDataDir,
    '--window-size=1440,900',
    'about:blank'
  ], { stdio: 'ignore' });
  edgeProc.on('error', (e) => log('Edge spawn error: ' + e.message));

  log('等待 CDP target');
  const target = await withTimeout(waitForTarget(DEBUG_PORT), 25000, 'waitForTarget');
  log('连接 CDP');
  cdp = new Cdp(target.webSocketDebuggerUrl);
  await withTimeout(cdp.open(), 5000, 'cdp.open');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false
  });

  for (const [name, fn] of scenarios) {
    if (only && !name.includes(only)) continue;
    log('==== 场景: ' + name + ' ====');
    try {
      await withTimeout(fn(cdp), 60000, '场景执行 ' + name);
    } catch (e) {
      failed = true;
      console.error('场景失败 [' + name + ']: ' + e.message);
    }
  }
  if (failed) process.exitCode = 1;
} catch (err) {
  console.error('截图脚本异常:', err.message);
  process.exitCode = 1;
} finally {
  if (cdp) cdp.close();
  if (edgeProc) { try { edgeProc.kill(); } catch {} }
  if (server) server.server.close();
}
