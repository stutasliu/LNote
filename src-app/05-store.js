/* [esm] 导出本模块顶层绑定 */
export { loadDocs, persist, uid, activeDoc, saveCursorPos, loadCursorPos, clampCursorPos };
/* [esm] 导入依赖模块绑定 */
import { ACTIVE_KEY, STORAGE_KEY, state } from './01-core.js';

  /* ---------------- 便签模块存储键 ---------------- */
  var TAGMETA_KEY = 'inkpad.tagmeta.v1';
  /* ---------------- 数据层 ---------------- */
  function loadDocs() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    var had = (raw != null);
    try {
      state.docs = JSON.parse(raw) || [];
    } catch (e) { state.docs = []; }
    if (!Array.isArray(state.docs)) state.docs = [];
    // 载入正文（新格式：content 单独存储；旧格式：content 已内联在索引里）
    state.docs.forEach(function (d) {
      if (!d || !d.id) return;
      try {
        var c = localStorage.getItem('inkpad.content.' + d.id);
        if (c != null) d.content = c;
      } catch (e) {}
    });
    state.activeId = null;
    try { state.activeId = localStorage.getItem(ACTIVE_KEY); } catch (e) {}
    if (!state.docs.length && !had) {
      var welcome = {
        id: uid(),
        title: '欢迎使用 L.Note',
        lang: 'markdown',
        content: '# 欢迎使用 L.Note 🖋️\n\n' +
          '一个纯本地的 Notion 风文本编辑器。\n\n' +
          '## 它能做什么\n\n' +
          '- **语法高亮** —— 支持 Markdown / JSON / XML / JS / Python 等十余种语言\n' +
          '- **一键格式化** —— 工具栏点 `{ } JSON 格式化` 或 `< / > XML 格式化`\n' +
          '- **画图表** —— 新建「图表文档」，用 Mermaid 画流程图、时序图、思维导图\n' +
          '- **本地存储** —— 所有内容自动保存在浏览器里，可导入导出\n\n' +
          '## 快捷键\n\n' +
          '| 快捷键 | 功能 |\n| --- | --- |\n' +
          '| `Ctrl + S` | 保存 |\n| `Ctrl + Shift + F` | 按当前语言格式化 |\n',
        updated: Date.now()
      };
      state.docs.push(welcome);
      state.activeId = welcome.id;
      persist();
    }
    if (state.activeId && !state.docs.some(function (d) { return d.id === state.activeId && !d.deleted; })) {
      var firstAlive = null;
      for (var i = 0; i < state.docs.length; i++) { if (!state.docs[i].deleted) { firstAlive = state.docs[i]; break; } }
      state.activeId = firstAlive ? firstAlive.id : null;
    }
    // 载入标签过期时间元数据
    state.tagMeta = {};
    try {
      var traw = localStorage.getItem(TAGMETA_KEY);
      if (traw) {
        var tparsed = JSON.parse(traw);
        if (tparsed && typeof tparsed === 'object') state.tagMeta = tparsed;
      }
    } catch (e) { state.tagMeta = {}; }
  }

  /* 持久化：把「轻量索引」与「正文内容」分开存储。
   * 富文档可能内嵌多张 base64 图片，正文可达数 MB，远超 localStorage 的 ~5MB 上限；
   * 若把正文塞进同一个 STORAGE_KEY，一旦超限 setItem 会抛错，可能导致整个文档列表丢失。
   * 因此索引（不含 content）始终可写，正文逐文档单独存，任一项超限都不影响列表。 */
  function persist() {
    // 1) 轻量索引（不含正文）—— 保证「我的文档」列表永不被大内容拖垮
    try {
      var index = state.docs.map(function (d) {
        var o = { id: d.id, title: d.title || '', updated: d.updated || Date.now() };
        if (d.kind) o.kind = d.kind;
        if (d.lang) o.lang = d.lang;
        if (d.diskPath) o.diskPath = d.diskPath;
        if (d.encoding) o.encoding = d.encoding;
        if (d.pinned) o.pinned = true;
        if (d.favorite) o.favorite = true;
        if (d.deleted) { o.deleted = true; if (d.deletedAt) o.deletedAt = d.deletedAt; }
        // 便签模块字段
        if (d.tags && d.tags.length) o.tags = d.tags.slice();
        if (d.color) o.color = d.color;
        if (d.reminder && d.reminder.enabled) o.reminder = d.reminder;
        if (d.dueAt) o.dueAt = d.dueAt;
        return o;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(index));
    } catch (e) { console.warn('[inkpad] 索引持久化失败', e); }
    // 标签过期时间元数据持久化
    try {
      localStorage.setItem(TAGMETA_KEY, JSON.stringify(state.tagMeta || {}));
    } catch (e) { console.warn('[inkpad] 标签元数据持久化失败', e); }
    // 2) 正文逐文档存储（单个超限不影响列表；富文档大正文改为依赖磁盘文件）
    var seen = {};
    state.docs.forEach(function (d) {
      if (!d.id) return;
      seen[d.id] = true;
      try { localStorage.setItem('inkpad.content.' + d.id, d.content || ''); }
      catch (e) { /* 超出本地存储上限，内容改由磁盘文件保存 */ }
    });
    // 3) 清理已删除文档遗留的正文 / 光标位置
    try {
      var toRemove = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && (k.indexOf('inkpad.content.') === 0 || k.indexOf('inkpad.cursor.') === 0)) {
          var cid = k.indexOf('inkpad.content.') === 0
            ? k.slice('inkpad.content.'.length)
            : k.slice('inkpad.cursor.'.length);
          if (!seen[cid]) toRemove.push(k);
        }
      }
      toRemove.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    } catch (e) {}
    try { localStorage.setItem(ACTIVE_KEY, state.activeId || ''); } catch (e) {}
  }

  function uid() {
    return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function activeDoc() {
    for (var i = 0; i < state.docs.length; i++) {
      if (state.docs[i].id === state.activeId) return state.docs[i];
    }
    return null;
  }

  /* ---------------- 光标位置记忆 ----------------
   * 每个文本文档独立保存最后一次光标位置（inkpad.cursor.<docId>），
   * 重新打开文档 / 应用重启后恢复到该位置，而不是回到文档开头。 */
  function saveCursorPos(id, pos) {
    if (!id || !pos) return;
    try {
      localStorage.setItem('inkpad.cursor.' + id, JSON.stringify({ line: pos.line | 0, ch: pos.ch | 0 }));
    } catch (e) {}
  }

  function loadCursorPos(id) {
    if (!id) return null;
    try {
      var raw = localStorage.getItem('inkpad.cursor.' + id);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (p && typeof p.line === 'number' && typeof p.ch === 'number') return { line: p.line, ch: p.ch };
    } catch (e) {}
    return null;
  }

  // 把记忆的光标位置钳制在文档实际行/列范围内（文档可能已被外部改短）
  function clampCursorPos(pos, text) {
    if (!pos) return null;
    var lines = String(text == null ? '' : text).split('\n');
    var line = Math.max(0, Math.min(pos.line | 0, lines.length - 1));
    var ch = Math.max(0, Math.min(pos.ch | 0, lines[line].length));
    return { line: line, ch: ch };
  }
