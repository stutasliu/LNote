/* [esm] 导出本模块顶层绑定 */
export { renderBacklinks, forceRecompute, docText, scanBacklinks, replaceTitleToLink, linkTargetAt, findDocByTitle };
/* [esm] 导入依赖模块绑定 */
import { bus, els, state } from './01-core.js';
import { cm } from './04-editor-init.js';
import { persist } from './05-store.js';
import { openDoc } from './07-doc-open.js';
  /* =========================================================
   * 21-backlinks.js —— Obsidian 风格反向链接面板
   *
   * 「链接当前文件」：其他文档正文出现 [[当前标题]]（或 [[当前标题|别名]]）
   * 「提到当前文件名」：其他文档正文出现当前标题文字但未建链接（潜在链接）
   * 工具栏：折叠 / 上下文 / 排序 / 筛选；支持一键「转为链接」
   * 编辑器联动：正文中的 [[链接]] 实时高亮，点击直接跳转目标文档
   * ========================================================= */

  // 面板工具栏状态
  var blState = { fold: false, ctx: true, sortDesc: true, filter: '' };
  var _currentId = null;
  var _bound = false;
  // 编辑器联动状态：overlay 是否已挂载 / 点击是否已绑定 / 面板是否已由用户手动接管
  var _overlayOn = false;
  var _clickBound = false;
  var _autoOpened = false;

  /* ---------------- 文本提取 ---------------- */
  function docText(doc) {
    if (!doc) return '';
    if (doc.kind === 'rich') {
      var arr = doc.content;
      if (Array.isArray(arr)) {
        return arr.map(function (b) { return (b && b.text) || ''; }).join('\n');
      }
      return '';
    }
    return typeof doc.content === 'string' ? doc.content : '';
  }

  // 取匹配处上下文（前后各约 40 字符，含行边界）
  function contextOf(text, start, len) {
    var before = 40, after = 60;
    var s = Math.max(0, start - before);
    var e = Math.min(text.length, start + len + after);
    return (s > 0 ? '…' : '') + text.slice(s, e).replace(/\s+/g, ' ') + (e < text.length ? '…' : '');
  }

  /* ---------------- 扫描 ---------------- */
  // 找出正文中所有 [[...]] 链接区间
  function linkRangesOf(text) {
    var out = [];
    var re = /\[\[([^\[\]]*)\]\]/g, m;
    while ((m = re.exec(text))) {
      out.push({ s: m.index, e: m.index + m[0].length, inner: m[1] });
    }
    return out;
  }

  function scanBacklinks(d, docs) {
    var linked = [], mentioned = [];
    if (!d || !d.title) return { linked: linked, mentioned: mentioned };
    var title = d.title.trim();
    if (!title) return { linked: linked, mentioned: mentioned };

    (docs || []).forEach(function (doc) {
      if (!doc || doc.id === d.id || doc.deleted) return;
      var text = docText(doc);
      if (!text) return;
      var ranges = linkRangesOf(text);

      // 明确链接：[[标题]] 或 [[标题|别名]]
      var explicit = ranges.filter(function (r) {
        var inner = r.inner.trim();
        return inner === title || inner.indexOf(title + '|') === 0;
      });
      if (explicit.length) {
        linked.push({
          docId: doc.id, title: doc.title, updated: doc.updated || 0,
          matches: explicit.map(function (r) { return { start: r.s, len: r.e - r.s, ctx: contextOf(text, r.s, r.e - r.s) }; })
        });
      }

      // 提到：标题字面出现且不落在任何 [[...]] 区间内
      var mentions = [];
      var idx = 0;
      while ((idx = text.indexOf(title, idx)) >= 0) {
        var inside = ranges.some(function (r) { return idx >= r.s && idx < r.e; });
        if (!inside) mentions.push({ start: idx, len: title.length, ctx: contextOf(text, idx, title.length) });
        idx += title.length;
      }
      if (mentions.length) {
        mentioned.push({ docId: doc.id, title: doc.title, updated: doc.updated || 0, matches: mentions });
      }
    });
    return { linked: linked, mentioned: mentioned };
  }

  /* ---------------- 编辑器联动：[[链接]] 高亮 + 点击跳转 ---------------- */
  // overlay token：把 [[...]] 染成链接色（叠加在任意语言模式之上）
  function wikiToken(stream) {
    if (stream.match(/^\[\[/)) {
      stream.match(/[^\[\]\n]*/);
      stream.match(/\]\]/);
      return 'wikilink';
    }
    stream.next();
    return null;
  }

  function ensureWikiOverlay() {
    if (_overlayOn || !cm || !cm.addOverlay) return;
    _overlayOn = true;
    try { cm.addOverlay({ token: wikiToken }); } catch (e) { console.warn('[inkpad] wikilink overlay failed', e); }
  }

  // 光标 ch 落在哪段 [[...]] 区间内 → 返回 inner（「标题」或「标题|别名」）；不在任何区间则 null
  function linkTargetAt(text, ch) {
    if (!text) return null;
    var re = /\[\[([^\[\]]*)\]\]/g, m;
    while ((m = re.exec(text))) {
      if (ch >= m.index && ch < m.index + m[0].length) return m[1];
    }
    return null;
  }

  // 按链接文本（含「标题|别名」形式）反查目标文档
  function findDocByTitle(inner) {
    var primary = String(inner || '').split('|')[0].trim();
    if (!primary) return null;
    for (var i = 0; i < state.docs.length; i++) {
      var d = state.docs[i];
      if (!d || d.deleted) continue;
      if (d.title && d.title.trim() === primary) return d;
    }
    return null;
  }

  // 点击编辑器内的 [[链接]] → 打开目标文档（Ctrl/Cmd/Alt/Shift 点击不拦截，保留编辑能力）
  function bindWikiClick() {
    if (_clickBound || !cm) return;
    _clickBound = true;
    cm.on('mousedown', function (cm2, e) {
      if (!e || e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      var pos = cm2.coordsChar({ left: e.clientX, top: e.clientY });
      var line = pos.line, ch = pos.ch;
      if (line < 0 || line >= cm2.lineCount()) return;
      var inner = linkTargetAt(cm2.getLine(line), ch);
      if (!inner) return;
      var target = findDocByTitle(inner);
      if (!target) return;
      e.preventDefault();
      openDoc(target.id);
    });
  }

  /* ---------------- 排序 / 筛选 ---------------- */
  function sortGroup(list) {
    var dir = blState.sortDesc ? -1 : 1;
    return list.slice().sort(function (a, b) { return (a.updated - b.updated) * dir; });
  }
  function matchFilter(list) {
    var f = blState.filter.trim().toLowerCase();
    if (!f) return list;
    return list.filter(function (it) {
      var kw = f.split(/\s+/).every(function (k) { return it.title.toLowerCase().indexOf(k) >= 0; });
      return kw;
    });
  }

  /* ---------------- 渲染 ---------------- */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function renderGroup(list, label, kind, title) {
    var rows = sortGroup(matchFilter(list));
    if (!rows.length) return '';
    var html = '<div class="bl-group"><div class="bl-group-title">' + label + ' <span class="bl-group-n">' + rows.length + '</span></div>';
    rows.forEach(function (it) {
      html += '<div class="bl-item" data-docid="' + it.docId + '" data-kind="' + kind + '" title="打开 ' + esc(it.title) + '">';
      html += '<div class="bl-item-title">' + (it.title || '(未命名)') +
        (blState.fold ? '' : ' <span class="bl-item-n">' + it.matches.length + '</span>') + '</div>';
      if (!blState.fold && (blState.ctx || kind === 'linked')) {
        // 链接组默认展示上下文；提到组由「上下文」开关控制
        it.matches.slice(0, 2).forEach(function (mm, i) {
          html += '<div class="bl-item-ctx">' + esc(mm.ctx) + '</div>';
        });
      }
      if (kind === 'mentioned') {
        html += '<button class="bl-link-btn" data-act="link" data-docid="' + it.docId + '" title="把正文中的「' + esc(title) + '」转为 [[' + esc(title) + ']] 链接">转为链接</button>';
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  // 顶栏「文档信息」按钮上的反向链接计数徽标
  function syncBadge(total) {
    var badge = document.getElementById('info-badge');
    if (!badge) return;
    badge.textContent = total > 99 ? '99+' : (total || '');
    badge.style.display = total ? '' : 'none';
  }

  // 当前文档有反向链接且信息面板仍折叠 → 自动展开一次，让用户第一眼就能看到结果
  function autoOpenPanel(total) {
    if (total <= 0 || _autoOpened) return;
    var panel = document.getElementById('info-panel');
    if (!panel || !panel.classList.contains('collapsed')) return;
    _autoOpened = true;
    panel.classList.remove('collapsed');
    var infoBtn = document.getElementById('btn-info-panel');
    if (infoBtn) infoBtn.classList.add('active');
  }

  function render(d) {
    var card = document.getElementById('backlinksCard');
    var content = document.getElementById('bl-content');
    var countEl = document.getElementById('bl-count');
    if (!card || !content) return;
    if (!d || !d.title) { card.style.display = 'none'; content.innerHTML = ''; syncBadge(0); return; }

    var res = scanBacklinks(d, state.docs);
    var total = res.linked.length + res.mentioned.length;
    card.style.display = '';
    if (countEl) countEl.textContent = total ? '（' + total + '）' : '';
    syncBadge(total);
    autoOpenPanel(total);

    var html = '';
    if (!total) {
      html = '<div class="bl-empty">暂无反向链接<br><small>在其他文档中输入 <code>[[' + esc(d.title) + ']]</code> 建立链接<br>编辑器会高亮链接，点击可直接跳转</small></div>';
    } else {
      html += renderGroup(res.linked, '链接当前文件', 'linked', d.title);
      html += renderGroup(res.mentioned, '提到当前文件名', 'mentioned', d.title);
      if (!matchFilter(res.linked).length && !matchFilter(res.mentioned).length) {
        html = '<div class="bl-empty">没有符合筛选条件的结果</div>';
      }
    }
    content.innerHTML = html;
  }

  /* ---------------- 转为链接 ---------------- */
  function replaceTitleToLink(text, title) {
    // 保护已有 [[...]] 区间（占位为数字索引，不含 title 字面），
    // 仅把区间外的标题字面替换为 [[标题]]
    var saved = [];
    var i = 0;
    var re = /\[\[([^\[\]]*)\]\]/g;
    var masked = text.replace(re, function (m) { saved.push(m); return '\u0000' + (i++) + '\u0000'; });
    masked = masked.split(title).join('[[' + title + ']]');
    return masked.replace(/\u0000(\d+)\u0000/g, function (_, n) { return saved[+n]; });
  }

  function turnToLink(docId, title) {
    var doc = null;
    for (var i = 0; i < state.docs.length; i++) { if (state.docs[i].id === docId) { doc = state.docs[i]; break; } }
    if (!doc) return;
    if (doc.kind === 'rich' && Array.isArray(doc.content)) {
      doc.content.forEach(function (b) {
        if (b && typeof b.text === 'string') b.text = replaceTitleToLink(b.text, title);
      });
    } else if (typeof doc.content === 'string') {
      doc.content = replaceTitleToLink(doc.content, title);
    } else {
      return;
    }
    doc.updated = Date.now();
    persist();
    bus.emit('docs:changed');
  }

  /* ---------------- 事件绑定（一次性） ---------------- */
  function bindEvents() {
    if (_bound) return;
    _bound = true;
    var fold = document.getElementById('bl-fold');
    var ctx = document.getElementById('bl-ctx');
    var sort = document.getElementById('bl-sort');
    var filter = document.getElementById('bl-filter');
    var content = document.getElementById('bl-content');
    if (fold) fold.addEventListener('click', function () { blState.fold = !blState.fold; redraw(); });
    if (ctx) ctx.addEventListener('click', function () { blState.ctx = !blState.ctx; redraw(); });
    if (sort) sort.addEventListener('click', function () { blState.sortDesc = !blState.sortDesc; redraw(); });
    if (filter) filter.addEventListener('input', function () { blState.filter = filter.value; redraw(); });
    if (content) {
      content.addEventListener('click', function (e) {
        var linkBtn = e.target.closest('[data-act="link"]');
        if (linkBtn) {
          e.stopPropagation();
          turnToLink(linkBtn.getAttribute('data-docid'), currentTitle());
          redraw();
          return;
        }
        var item = e.target.closest('.bl-item');
        if (item) {
          var docId = item.getAttribute('data-docid');
          if (docId) openDoc(docId);
        }
      });
    }
    // 用户手动点击过「文档信息」按钮 → 面板状态由用户接管，不再自动展开
    var infoBtn = document.getElementById('btn-info-panel');
    if (infoBtn) infoBtn.addEventListener('click', function () { _autoOpened = true; });
    // 任何文档保存/变更（docs:changed）后实时刷新当前文档的反向链接
    bus.on('docs:changed', function () { redraw(); });
  }

  function currentTitle() {
    for (var i = 0; i < state.docs.length; i++) {
      if (state.docs[i].id === _currentId) return state.docs[i].title || '';
    }
    return '';
  }

  function redraw() {
    var d = null;
    for (var i = 0; i < state.docs.length; i++) { if (state.docs[i].id === _currentId) { d = state.docs[i]; break; } }
    render(d);
  }

  /* ---------------- 对外入口 ---------------- */
  function renderBacklinks(d) {
    ensureWikiOverlay();
    bindWikiClick();
    bindEvents();
    _currentId = d ? d.id : null;
    render(d);
  }
  // 供测试/强制刷新
  function forceRecompute() { redraw(); }
