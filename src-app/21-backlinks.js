/* [esm] 导出本模块顶层绑定 */
export { renderBacklinks, forceRecompute, docText, scanBacklinks, replaceTitleToLink };
/* [esm] 导入依赖模块绑定 */
import { bus, els, state } from './01-core.js';
import { persist } from './05-store.js';
import { openDoc } from './07-doc-open.js';
  /* =========================================================
   * 21-backlinks.js —— Obsidian 风格反向链接面板
   *
   * 「链接当前文件」：其他文档正文出现 [[当前标题]]（或 [[当前标题|别名]]）
   * 「提到当前文件名」：其他文档正文出现当前标题文字但未建链接（潜在链接）
   * 工具栏：折叠 / 上下文 / 排序 / 筛选；支持一键「转为链接」
   * ========================================================= */

  // 面板工具栏状态
  var blState = { fold: false, ctx: true, sortDesc: true, filter: '' };
  var _currentId = null;
  var _bound = false;

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

  function render(d) {
    var card = document.getElementById('backlinksCard');
    var content = document.getElementById('bl-content');
    var countEl = document.getElementById('bl-count');
    if (!card || !content) return;
    if (!d || !d.title) { card.style.display = 'none'; content.innerHTML = ''; return; }

    var res = scanBacklinks(d, state.docs);
    var total = res.linked.length + res.mentioned.length;
    card.style.display = '';
    if (countEl) countEl.textContent = total ? '（' + total + '）' : '';

    var html = '';
    if (!total) {
      html = '<div class="bl-empty">暂无反向链接<br><small>其他文档「提到」或「[[链接]]」本标题后会显示在这里</small></div>';
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
    bindEvents();
    _currentId = d ? d.id : null;
    render(d);
  }
  // 供测试/强制刷新
  function forceRecompute() { redraw(); }
