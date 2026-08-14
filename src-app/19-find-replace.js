/* [esm] 导出本模块顶层绑定 */
export { frSave, frLoad, bindFindReplaceModal, syncFrStateToUi, closeFrPopups, showFrPopup, showFrEmptyPopup, escHtml, toggleFavorite, toggleFindOnly, openFindModal, closeFindModal, pushHistory, setFrStatus, makeCursor, getScopeRange, findOne, comparePos, frFindNext, clearFrMarks, applyFrHighlight, scheduleFrHighlight, frCountMatches, getReplaceInput, frDoReplace, frReplaceOne, frReplaceAll, frOpenBatchModal, frBatchRun };
/* [esm] 导入依赖模块绑定 */
import { $, state } from './01-core.js';
import { cm } from './04-editor-init.js';
import { openSingleModal } from './15-insert.js';
import { FR_BACK_MAX, FR_HL_BATCH, FR_HL_DOC_CAP, FR_HL_EST_CAP, FR_HL_HARD_CAP, FR_STORAGE, frState } from './18-bootstrap.js';

  /* ============================================================
   *  查找 / 替换 浮层  —— 仿 EverEdit「替换」面板
   * ============================================================ */
  var FR_VERSION = 2;
  function frSave() {
    frState._ver = FR_VERSION;
    try { localStorage.setItem(FR_STORAGE, JSON.stringify(frState)); } catch (_) {}
  }
  function frLoad() {
    try {
      var s = JSON.parse(localStorage.getItem(FR_STORAGE) || '{}');
      if (s._ver !== FR_VERSION) {
        s.collapsed = true;
        s._ver = FR_VERSION;
      }
      if (typeof s.expand === 'undefined') s.expand = true;
      if (typeof s.collapsed === 'undefined') s.collapsed = true;
      Object.assign(frState, s);
    } catch (_) {}
  }

  /** 初始化：加载状态、绑定 UI、默认勾选同步 */
  function bindFindReplaceModal() {
    frLoad();
    syncFrStateToUi();

    // 选择变化时同步收藏星标
    cm.on && cm.on('change', function () {
      clearTimeout(window.__frStarT);
      window.__frStarT = setTimeout(function () {
        var q = $('fr-find').value;
        var has = frState.favorites.some(function (f) { return f.find === q; });
        $('fr-fav').classList.toggle('on', has);
      }, 200);
    });

    // 关闭
    $('fr-close').addEventListener('click', closeFindModal);
    $('fr-overlay').addEventListener('mousedown', function (e) {
      if (e.target.id === 'fr-overlay') closeFindModal();
    });

    // 拖拽标题栏移动弹窗
    (function () {
      var card = $('fr-card');
      var header = card.querySelector('.fr-header');
      var dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
      header.addEventListener('mousedown', function (e) {
        if (e.target.closest('.fr-close-btn')) return;  // 点关闭按钮不触发拖拽
        dragging = true;
        sx = e.clientX; sy = e.clientY;
        var rect = card.getBoundingClientRect();
        sl = rect.left; st = rect.top;
        card.style.left = sl + 'px';
        card.style.top = st + 'px';
        card.style.right = 'auto';
        e.preventDefault();
      });
      document.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        var nl = sl + (e.clientX - sx);
        var nt = st + (e.clientY - sy);
        // 限制不超出视口
        nl = Math.max(0, Math.min(window.innerWidth - 100, nl));
        nt = Math.max(0, Math.min(window.innerHeight - 40, nt));
        card.style.left = nl + 'px';
        card.style.top = nt + 'px';
      });
      document.addEventListener('mouseup', function () {
        if (!dragging) return;
        dragging = false;
        var rect = card.getBoundingClientRect();
        frState.pos = { left: rect.left, top: rect.top };
        frSave();
      });
    })();

    // 关闭面板外的点击也关掉可能打开的 history popup
    document.addEventListener('mousedown', function (e) {
      if (!e.target.closest('.fr-popup') && !e.target.closest('.fr-btn-icon')) {
        closeFrPopups();
      }
    });

    // 查找 / 替换输入回车 = 下一个/替换
    $('fr-find').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) frFindNext(true); else frFindNext(false);
      } else if (e.key === 'Escape') {
        closeFindModal();
      }
    });
    $('fr-find').addEventListener('input', function () {
      var has = frState.favorites.some(function (f) { return f.find === this.value; });
      $('fr-fav').classList.toggle('on', has);
    });
    $('fr-replace').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) frReplaceAll(); else frReplaceOne();
      } else if (e.key === 'Escape') {
        closeFindModal();
      }
    });

    // 主按钮
    $('fr-next').addEventListener('click', function () { frFindNext(false); });
    $('fr-find-arrow').addEventListener('click', function () { frFindNext(false); });
    var prevBtn = $('fr-find-prev');
    if (prevBtn) prevBtn.addEventListener('click', function () { frFindNext(true); });
    $('fr-replace-one').addEventListener('click', frReplaceOne);
    $('fr-replace-all').addEventListener('click', frReplaceAll);
    $('fr-batch').addEventListener('click', frOpenBatchModal);
    $('fr-collapse').addEventListener('click', toggleFindOnly);

    // 历史 / 收藏 / 更多
    $('fr-find-hist').addEventListener('click', function (e) {
      e.stopPropagation();
      showFrPopup('find');
    });
    $('fr-replace-hist').addEventListener('click', function (e) {
      e.stopPropagation();
      showFrPopup('replace');
    });
    $('fr-fav').addEventListener('click', toggleFavorite);
    $('fr-more').addEventListener('click', function (e) {
      e.stopPropagation();
      showFrPopup('more');
    });

    // 选项 checkbox
    ['case', 'whole', 'regex', 'cycle', 'expand', 'continue', 'highlight', 'fast'].forEach(function (k) {
      var el = $('fr-' + k);
      el.checked = !!frState[k === 'case' ? 'caseSens'
        : k === 'whole' ? 'wholeWord'
        : k === 'regex' ? 'regex'
        : k === 'cycle' ? 'cycle'
        : k === 'expand' ? 'expand'
        : k === 'continue' ? 'continueNext'
        : k === 'highlight' ? 'highlight'
        : 'fast'];
      el.addEventListener('change', function () {
        frState[k === 'case' ? 'caseSens'
          : k === 'whole' ? 'wholeWord'
          : k === 'regex' ? 'regex'
          : k === 'cycle' ? 'cycle'
          : k === 'expand' ? 'expand'
          : k === 'continue' ? 'continueNext'
          : k === 'highlight' ? 'highlight'
          : 'fast'] = el.checked;
        frSave();
        applyFrHighlight();
      });
    });

    // 范围单选
    var scopeRadios = document.querySelectorAll('input[name="fr-scope"]');
    scopeRadios.forEach(function (r) {
      if (r.value === frState.scope) r.checked = true;
      r.addEventListener('change', function () {
        if (r.checked) { frState.scope = r.value; frSave(); }
      });
    });

    // 全局快捷键 Esc 关
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('fr-overlay').style.display !== 'none') {
        var open = document.querySelector('.modal-overlay[style*="flex"]')
                 || document.querySelector('.modal-overlay[style*="block"]');
        if (!open) closeFindModal();
      }
    });

    // 批量替换弹窗
    $('fr-batch-close').addEventListener('click', function () { $('fr-batch-modal').style.display = 'none'; });
    $('fr-batch-clear').addEventListener('click', function () { $('fr-batch-text').value = ''; });
    $('fr-batch-from-find').addEventListener('click', function () {
      var lines = frState.findHistory.slice(0, 20).map(function (s) { return s + ' ⇨ '; });
      $('fr-batch-text').value = lines.join('\n');
      $('fr-batch-text').focus();
    });
    $('fr-batch-ok').addEventListener('click', frBatchRun);
    $('fr-batch-text').addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); frBatchRun(); }
    });
  }

  /** 把 frState 同步到界面 */
  function syncFrStateToUi() {
    var replaceRow = $('fr-replace-row');
    var replaceAllBtn = $('fr-replace-all');
    var batchBtn = $('fr-batch');
    var collapseBtn = $('fr-collapse');
    var headerTitle = $('fr-header-title');

    if (frState.collapsed) {
      // 仅查找模式
      replaceRow.style.display = 'none';
      replaceAllBtn.style.display = 'none';
      batchBtn.style.display = 'none';
      collapseBtn.textContent = '≪ 替换';
      if (headerTitle) headerTitle.textContent = '查找';
    } else {
      // 查找+替换模式
      replaceRow.style.display = '';
      replaceAllBtn.style.display = '';
      batchBtn.style.display = '';
      collapseBtn.textContent = '≪ 查找';
      if (headerTitle) headerTitle.textContent = '替换';
    }
  }

  /** 关闭所有 fr-popup */
  function closeFrPopups() {
    document.querySelectorAll('.fr-popup').forEach(function (n) { n.remove(); });
  }

  /** 显示历史 / 收藏 / 更多面板 */
  function showFrPopup(which) {
    closeFrPopups();
    var anchor, items;
    if (which === 'find') {
      anchor = $('fr-find-hist');
      items = frState.findHistory.slice(0, 30).map(function (s) {
        return { kind: 'find', label: s, val: s };
      });
      if (frState.findHistory.length === 0) {
        return showFrEmptyPopup(anchor, '暂无查找历史');
      }
    } else if (which === 'replace') {
      anchor = $('fr-replace-hist');
      items = frState.replaceHistory.slice(0, 30).map(function (s) {
        return { kind: 'replace', label: s || '(空)', val: s };
      });
      if (frState.replaceHistory.length === 0) {
        return showFrEmptyPopup(anchor, '暂无替换历史');
      }
    } else {
      anchor = $('fr-more');
      items = [];
      // 收藏
      (frState.favorites || []).forEach(function (f, i) {
        items.push({ kind: 'fav', label: f.find + '  ⇨  ' + (f.replace || ''), val: i });
      });
      // 操作
      items.push({ kind: 'op', label: '清空查找历史', val: 'clear-find' });
      items.push({ kind: 'op', label: '清空替换历史', val: 'clear-replace' });
      items.push({ kind: 'op', label: '清空收藏', val: 'clear-fav' });
      if (!frState.favorites || frState.favorites.length === 0) items.unshift({ kind: 'empty', label: '（暂无收藏，★ 输入查找词可收藏）', val: '' });
    }
    var popup = document.createElement('div');
    popup.className = 'fr-popup';
    items.forEach(function (it) {
      var row = document.createElement('div');
      row.className = 'fr-popup-item';
      if (it.kind === 'fav') row.innerHTML = '<span class="fav-star">★</span>' + escHtml(it.label);
      else if (it.kind === 'op') row.textContent = it.label;
      else if (it.kind === 'empty') { row.textContent = it.label; row.style.color = 'var(--text-secondary)'; row.style.cursor = 'default'; }
      else row.textContent = it.label;

      if (it.kind !== 'empty') {
        row.addEventListener('click', function () {
          if (it.kind === 'find') {
            $('fr-find').value = it.val;
            frFindNext(false);
            closeFrPopups();
          } else if (it.kind === 'replace') {
            $('fr-replace').value = it.val;
            closeFrPopups();
          } else if (it.kind === 'fav') {
            var fav = frState.favorites[it.val];
            $('fr-find').value = fav.find;
            $('fr-replace').value = fav.replace || '';
            closeFrPopups();
            frFindNext(false);
          } else if (it.kind === 'op') {
            if (it.val === 'clear-find') frState.findHistory = [];
            else if (it.val === 'clear-replace') frState.replaceHistory = [];
            else if (it.val === 'clear-fav') frState.favorites = [];
            frSave();
            closeFrPopups();
            setFrStatus('已清理', 'ok');
          }
        });
        // delete btn for history
        if (it.kind === 'find' || it.kind === 'replace') {
          var del = document.createElement('button');
          del.className = 'del';
          del.textContent = '✕';
          del.title = '从历史删除';
          del.addEventListener('click', function (e) {
            e.stopPropagation();
            if (it.kind === 'find') frState.findHistory = frState.findHistory.filter(function (x) { return x !== it.val; });
            else frState.replaceHistory = frState.replaceHistory.filter(function (x) { return x !== it.val; });
            frSave();
            row.remove();
          });
          row.appendChild(del);
        }
      }
      popup.appendChild(row);
    });
    document.body.appendChild(popup);
    // 定位：查找/替换历史 → 对齐对应输入框左边缘、宽度一致；更多菜单 → 右对齐按钮
    var posAnchor = anchor;
    var alignMode = 'anchor';
    if (which === 'find') {
      posAnchor = $('fr-find').closest('.fr-input-wrap');
      alignMode = 'input';
    } else if (which === 'replace') {
      posAnchor = $('fr-replace').closest('.fr-input-wrap');
      alignMode = 'input';
    } else if (which === 'more') {
      alignMode = 'right';
    }
    var r = posAnchor.getBoundingClientRect();
    popup.style.top  = (r.bottom + window.scrollY + 4) + 'px';
    if (alignMode === 'input') {
      popup.style.left = (r.left + window.scrollX) + 'px';
      popup.style.minWidth = r.width + 'px';
    } else if (alignMode === 'right') {
      // 右对齐：弹窗右边缘 = 按钮右边缘
      var popupW = popup.offsetWidth;
      popup.style.left = (r.right - popupW + window.scrollX) + 'px';
    } else {
      popup.style.left = (r.left + window.scrollX) + 'px';
    }
    var popupR = popup.getBoundingClientRect();
    if (alignMode === 'right') {
      // 右对齐时防止超出左边
      if (popupR.left < 8) {
        popup.style.left = (8 + window.scrollX) + 'px';
      }
    } else if (popupR.right > window.innerWidth - 8) {
      popup.style.left = Math.max(8, window.innerWidth - popupR.width - 8 + window.scrollX) + 'px';
    }
  }
  function showFrEmptyPopup(anchor, text) {
    closeFrPopups();
    var popup = document.createElement('div');
    popup.className = 'fr-popup';
    var row = document.createElement('div');
    row.className = 'fr-popup-empty';
    row.textContent = text;
    popup.appendChild(row);
    document.body.appendChild(popup);
    // 空弹窗也对齐输入框（通过 anchor 的父级输入框）
    var posAnchor = anchor.closest('.fr-input-wrap') || anchor;
    var r = posAnchor.getBoundingClientRect();
    popup.style.left = (r.left + window.scrollX) + 'px';
    popup.style.top  = (r.bottom + window.scrollY + 4) + 'px';
    popup.style.minWidth = r.width + 'px';
  }

  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** 收藏 / 取消收藏 */
  function toggleFavorite() {
    var q = $('fr-find').value;
    if (!q) { setFrStatus('先输入查找词再收藏', 'error'); return; }
    var r = $('fr-replace').value;
    var idx = -1;
    frState.favorites.forEach(function (f, i) {
      if (f.find === q) idx = i;
    });
    if (idx >= 0) {
      frState.favorites.splice(idx, 1);
      $('fr-fav').classList.remove('on');
      setFrStatus('已取消收藏', 'ok');
    } else {
      frState.favorites.unshift({ find: q, replace: r });
      $('fr-fav').classList.add('on');
      setFrStatus('已收藏 ★', 'ok');
    }
    frSave();
  }

  /** 仅查找 / 替换面板 折叠 */
  function toggleFindOnly() {
    frState.collapsed = !frState.collapsed;
    frSave();
    syncFrStateToUi();
  }

  /** 打开/关闭主面板 */
  function openFindModal(replaceMode) {
    openSingleModal('fr-overlay');
    // 如果是替换模式 (Ctrl+H)，确保展开
    if (replaceMode) {
      frState.collapsed = false;
    }
    // 恢复上次的位置（位置越界——窗口缩小/分辨率变化/旧数据——时回退到默认居中，避免弹窗跑到屏幕外）
    if (frState.pos) {
      var card = $('fr-card');
      var cw = card.offsetWidth || 520;
      var ch = card.offsetHeight || 340;
      var vw = window.innerWidth, vh = window.innerHeight;
      var left = frState.pos.left, top = frState.pos.top;
      if (left + cw < 0 || left > vw - 40 || top + ch < 0 || top > vh - 20) {
        left = Math.max(8, Math.round((vw - cw) / 2));
        top = Math.max(8, Math.round(vh / 3));
      }
      card.style.left = left + 'px';
      card.style.top = top + 'px';
      card.style.right = 'auto';
    }
    syncFrStateToUi();

    // 自动用当前选区填充
    var sel = cm.getSelection();
    if (sel && !$('fr-find').value) $('fr-find').value = sel;

    // 收藏指示
    var q = $('fr-find').value;
    var has = frState.favorites.some(function (f) { return f.find === q; });
    $('fr-fav').classList.toggle('on', has);

    setTimeout(function () {
      $('fr-find').focus();
      $('fr-find').select();
    }, 0);
    applyFrHighlight();
  }
  function closeFindModal() {
    $('fr-overlay').style.display = 'none';
    closeFrPopups();
    clearCurrentMatchMark();
    clearFrMarks();
    state.frLastQuery = null;
    cm.focus();
  }

  /** 把查找词加入历史（去重，最新在前，最多 30 条） */
  function pushHistory(list, val) {
    if (!val) return list;
    list = list.filter(function (x) { return x !== val; });
    list.unshift(val);
    if (list.length > 30) list = list.slice(0, 30);
    return list;
  }

  /** 把状态条文本 */
  function setFrStatus(msg, cls) {
    var el = $('fr-status');
    el.textContent = msg || '';
    el.className = 'fr-status' + (cls ? ' ' + cls : '');
  }

  /** 计算 CodeMirror SearchCursor */
  function makeCursor(fromPos, query) {
    var opts = {
      caseFold: !frState.caseSens,
      wholeWord: frState.wholeWord,
      multiline: true
    };
    if (frState.expand) {
      // \n \t \r 等扩展转义
      // 简单替换：\n → \n, \t → \t
      query = query.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r');
    }
    // 【关键】CodeMirror SearchCursor 仅在 query 是 RegExp 对象时才走正则匹配；
    // 传字符串时即便 opts.regexp=true 也无效，会被当成字面字符串查找——这就是
    // 用户反馈「勾了正则但 ^ 没匹配」的根本原因。把字符串 query 包成 RegExp。
    if (frState.regex) {
      try {
        query = new RegExp(query, frState.caseSens ? '' : 'i');
      } catch (e) {
        setFrStatus('正则无效: ' + e.message, 'error');
        return null;
      }
    }
    return cm.getSearchCursor(query, fromPos, opts);
  }

  function getScopeRange() {
    if (frState.scope === 'selection') {
      var sel = cm.listSelections()[0];
      if (sel) {
        var a = cm.getCursor('from'), b = cm.getCursor('to');
        if (a.line !== b.line || a.ch !== b.ch) return { from: a, to: b };
        setFrStatus('没有选中范围，已切换到当前文件', '');
        return null;
      }
    } else if (frState.scope === 'all') {
      // 单 tab 应用：等同全文
      setFrStatus('「所有打开的文件」暂退化为当前文件', '');
      return null;
    }
    return null;
  }

  /** 计算从 fromPos 起，第一个匹配 */
  function findOne(fromPos, backward) {
    var q = $('fr-find').value;
    if (!q) { setFrStatus('请输入查找内容', 'error'); return null; }
    if (frState.regex) {
      try { new RegExp(q); } catch (e) { setFrStatus('正则错误: ' + e.message, 'error'); return null; }
    }
    function advancePos(p) {
      var line = cm.getLine(p.line);
      if (line == null) return { line: p.line, ch: p.ch + 1 };
      if (p.ch < line.length) return { line: p.line, ch: p.ch + 1 };
      return { line: p.line + 1, ch: 0 };
    }
    function posKey(p) { return p.line + ',' + p.ch; }
    // CodeMirror 的 multiline 路径有个隐蔽约定：把 startPos.ch 当作 regexp.lastIndex。
    // 但 zero-width 锚点（^ $ \b）只在 ch=0 或 \n 之后才合法——ch>0 时永远不命中。
    // 解法：正则 + 锚点时手算首个匹配（从 startPos.line 开始逐行扫，每行重置 lastIndex=0），
    // 跳过「起点位置 ≤ fromPos」的命中点，给「下一个」按钮正确推进感。
    if (frState.regex && /[\^$]|\\b/.test(q)) {
      var re;
      try { re = new RegExp(q, frState.caseSens ? 'gm' : 'gim'); }
      catch (e) { setFrStatus('正则错误: ' + e.message, 'error'); return null; }
      var totalLines = cm.lineCount();
      var startLine = backward ? Math.max(0, fromPos.line) : fromPos.line;
      if (backward) {
        // 反向：从 fromPos.line 往 0 逐行找最近的空匹配
        for (var l = startLine; l >= 0; l--) {
          re.lastIndex = 0;
          var m = re.exec(cm.getLine(l));
          if (m && m.index === 0) {
            // 同一行有 ^ 匹配
            if (comparePos({ line: l, ch: 0 }, fromPos) <= 0) return { from: { line: l, ch: 0 }, to: { line: l, ch: 0 } };
            // 否则这一行 ^ 在 fromPos 之后，但反向不返回
          }
        }
        return null;
      } else {
        // 正向：先看当前行起点 (ch=0) 是不是 < fromPos，是则跳到下一行
        for (var l = startLine; l < totalLines; l++) {
          re.lastIndex = 0;
          var m = re.exec(cm.getLine(l));
          if (m && m.index === 0) {
            var hitPos = { line: l, ch: 0 };
            // 只有「当前位置严格 > hitPos」才算下一个（避免重复选中同一 ^）
            if (comparePos(hitPos, fromPos) > 0) return { from: hitPos, to: hitPos };
          }
        }
        // 文档内没下一个 ^，但 cycle 模式会让 frFindNext 回环重查
        return null;
      }
    }
    var cursor = makeCursor(fromPos, q);
    if (!cursor) return null;
    var hit;
    if (backward) {
      // 反向：使用正向遍历选最近一个 < fromPos
      hit = null;
      var iter = 0;
      var c2 = makeCursor({ line: 0, ch: 0 }, q);
      var prevK = '';
      while (c2.findNext()) {
        if (++iter > FR_BACK_MAX) {
          setFrStatus('反向查找迭代超过 ' + FR_BACK_MAX + ' 步，请缩小范围或改用「下一个」', 'error');
          return hit;
        }
        var p = c2.from(), k = posKey(p) + '-' + posKey(c2.to());
        if (k === prevK) break;  // 防空匹配原地循环
        prevK = k;
        if (comparePos(p, fromPos) < 0) hit = { from: p, to: c2.to() };
        else break;
      }
    } else {
      // 正向：也用迭代方式，更可靠（避免 SearchCursor 内部 multiline bug）
      hit = null;
      var iterF = 0;
      var prevKF = '';
      while (cursor.findNext()) {
        if (++iterF > FR_BACK_MAX) break;
        var pF = cursor.from(), kF = posKey(pF) + '-' + posKey(cursor.to());
        if (kF === prevKF) break;
        prevKF = kF;
        if (comparePos(pF, fromPos) > 0) { hit = { from: pF, to: cursor.to() }; break; }
      }
    }
    return hit;
  }
  function comparePos(a, b) {
    if (a.line !== b.line) return a.line - b.line;
    return a.ch - b.ch;
  }

  function frFindNext(backward) {
    var q = $('fr-find').value;
    if (!q) { setFrStatus('请输入查找内容', 'error'); return; }
    frState.findHistory = pushHistory(frState.findHistory, q);
    frSave();

    var cur = cm.getCursor('from');
    var hit = findOne(cur, backward);
    if (!hit) {
      // 没开循环也做一次回环尝试，确保不会因为光标位置在文档末尾而找不到
      var restart = backward ? { line: cm.lineCount() - 1, ch: cm.getLine(cm.lineCount() - 1).length } : { line: 0, ch: 0 };
      hit = findOne(restart, backward);
      if (hit && frState.cycle) {
        setFrStatus('已从文件' + (backward ? '末尾' : '开头') + '回环查找', 'ok');
      }
    }
    if (!hit) {
      setFrStatus('未找到匹配项', 'error');
      cm.focus();
      return;
    }
    // 范围内裁剪
    var scope = getScopeRange();
    if (scope) {
      if (comparePos(hit.from, scope.from) < 0 || comparePos(hit.to, scope.to) > 0) {
        // 超出范围：取范围内第一个（include 空匹配）
        var cursor = makeCursor(scope.from, q);
        var inside = null;
        var prevK = '';
        function posKey2(p) { return p.line + ',' + p.ch; }
        function advancePos2(p) {
          var line = cm.getLine(p.line);
          if (line == null) return { line: p.line, ch: p.ch + 1 };
          if (p.ch < line.length) return { line: p.line, ch: p.ch + 1 };
          return { line: p.line + 1, ch: 0 };
        }
        while (cursor && cursor.findNext()) {
          var f = cursor.from(), t = cursor.to();
          var k = posKey2(f) + '-' + posKey2(t);
          if (k === prevK) break;  // 防空匹配原地循环
          prevK = k;
          if (comparePos(f, scope.to) > 0) break;
          if (comparePos(f, hit.from) >= 0) { inside = { from: f, to: t }; break; }
          cursor = makeCursor(advancePos2(t), q);
        }
        if (!inside) { setFrStatus('范围内已无可匹配项', 'error'); return; }
        hit = inside;
      }
    }
    cm.setSelection(hit.from, hit.to);
    cm.scrollIntoView({ from: hit.from, to: hit.to }, 80);
    // 设置当前匹配的醒目高亮（即便"高亮"没开也生效）
    setCurrentMatchMark(hit.from, hit.to);
    // 聚焦编辑器，让选区蓝色可见
    cm.focus();
    // 仅在查询词变化时才重新统计+高亮，避免每次跳转都全文档扫描
    if (state.frLastQuery !== q) {
      state.frLastQuery = q;
      setTimeout(function () {
        frCountMatches(q);
        applyFrHighlight();
      }, 0);
    }
  }

  /** 清除所有查找高亮 */
  function clearFrMarks() {
    for (var i = 0; i < state.frMarks.length; i++) {
      try { state.frMarks[i].clear(); } catch (_) {}
    }
    state.frMarks = [];
  }

  /** 清除当前匹配的单独高亮 */
  function clearCurrentMatchMark() {
    if (state.frCurrentMark) {
      try { state.frCurrentMark.clear(); } catch (_) {}
      state.frCurrentMark = null;
    }
  }
  /** 设置当前匹配的单独高亮（蓝色边框醒目版，即便"高亮"没开也生效） */
  function setCurrentMatchMark(from, to) {
    clearCurrentMatchMark();
    if (!from || !to) return;
    try {
      state.frCurrentMark = cm.markText(from, to, {
        className: 'cm-fr-current',
        clearWhenEmpty: false
      });
    } catch (_) {}
  }

  /** 高亮匹配开关（手动 markText，分批异步，避免单次同步创建几百个 mark 卡死 UI） */
  function applyFrHighlight() {
    // 每次调用自增 token；正在分批运行的旧任务检查 token 不一致就主动放弃
    var myToken = ++state.frHlToken;
    state.frHlRunning = true;

    function finish() { state.frHlRunning = false; }
    function aborted() { return myToken !== state.frHlToken; }

    try {
      clearFrMarks();
      if (!frState.highlight) return finish();
      var q = $('fr-find').value;
      if (!q) return finish();

      // 1. 文档过大直接放弃全文档高亮（仍保留查找下一个 / 替换）
      var docLen = cm.getValue().length;
      if (docLen > FR_HL_DOC_CAP) {
        setFrStatus('文档较大（>' + Math.round(FR_HL_DOC_CAP / 1024) + 'KB），已跳过全文档高亮（查找/替换仍可用）', '');
        return finish();
      }

      // 2. 正则预编译失败则跳过
      if (frState.regex) {
        try { new RegExp(q); } catch (_) { return finish(); }
      }

      // 3. 快速估算匹配数（非正则 + 非全词 + 不开启 \n\t 扩展 时有效）。
      //    超过估算上限直接放弃全文档高亮，避免创建几千/几万 markText 阻塞 UI。
      if (!frState.regex && !frState.wholeWord && !frState.expand) {
        var text0 = cm.getValue();
        var count = 0, idx = 0;
        if (!frState.caseSens) {
          var lt = text0.toLowerCase();
          var lq = q.toLowerCase();
          while ((idx = lt.indexOf(lq, idx)) !== -1) {
            count++;
            idx += lq.length || 1;
            if (count > FR_HL_EST_CAP) break;
          }
        } else {
          count = text0.split(q).length - 1;
        }
        if (count > FR_HL_EST_CAP) {
          setFrStatus('匹配过多（>' + FR_HL_EST_CAP + '），已跳过全文档高亮（查找/替换仍可用）', '');
          return finish();
        }
      }

      // zero-width 锚点（^ $ \b）走手算路径，绕开 CodeMirror multiline 路径
      // `regexp.lastIndex = start.ch` 导致的 ch=1 永远不命中 bug。
      var useAnchorShortcut = frState.regex && /[\^$]|\\b/.test(q);
      if (useAnchorShortcut) {
        var reHl;
        try { reHl = new RegExp(q, frState.caseSens ? 'gm' : 'gim'); }
        catch (_) { return finish(); }
        var totalLinesHl = cm.lineCount();
        for (var lh = 0; lh < totalLinesHl && n < FR_HL_HARD_CAP; lh++) {
          reHl.lastIndex = 0;
          var lineStrHl = cm.getLine(lh);
          var mmh;
          while ((mmh = reHl.exec(lineStrHl)) !== null) {
            var f2 = { line: lh, ch: mmh.index };
            var t2 = { line: lh, ch: mmh.index + mmh[0].length };
            // 空匹配（^ $ \b 几乎都是）只高亮位置（避免无效 mark）— 0 宽 markText
            // 在 CodeMirror 里会画一条光标状细线，视觉效果可接受
            try {
              var m2 = cm.markText(f2, t2, {
                className: 'cm-fr-searching',
                clearWhenEmpty: false
              });
              state.frMarks.push(m2);
              n++;
            } catch (_) {}
            if (n >= FR_HL_HARD_CAP) { truncated = true; break; }
            if (mmh[0].length === 0) reHl.lastIndex++;
          }
        }
        if (aborted()) return;
        if (truncated) setFrStatus('匹配过多（>' + FR_HL_HARD_CAP + '），仅高亮前 ' + FR_HL_HARD_CAP + ' 个。点击「下一个」仍可逐个定位', '');
        finish();
        return;
      }

      var cursor = makeCursor({ line: 0, ch: 0 }, q);
      if (!cursor) return finish();

      var n = 0;
      var prevHlKey = '';
      function hlPosKey(p) { return p.line + ',' + p.ch; }
      function hlAdvance(p) {
        var line = cm.getLine(p.line);
        if (line == null) return { line: p.line, ch: p.ch + 1 };
        if (p.ch < line.length) return { line: p.line, ch: p.ch + 1 };
        return { line: p.line + 1, ch: 0 };
      }

      // 4. 分批 + setTimeout 让出主线程。注意：让出后旧 token 一致才继续；
      //    用户连续输入会触发 scheduleFrHighlight 把 token 顶替，旧批自动放弃。
      function step() {
        if (aborted()) return;
        var done = false, truncated = false;
        try {
          for (var k = 0; k < FR_HL_BATCH; k++) {
            if (!cursor.findNext()) { done = true; break; }
            var f = cursor.from(), t = cursor.to();
            var key = hlPosKey(f) + '-' + hlPosKey(t);
            // 哨兵：相同位置 → 表明 CM 内部 afterEmptyMatch 重置后回到原点 → break
            if (key === prevHlKey) { done = true; break; }
            prevHlKey = key;
            // 空匹配（^/$/\b）：markText 创建 0 宽 mark 无显示意义，跳过创建但计入但不计数
            if (comparePos(f, t) !== 0) {
              try {
                var m = cm.markText(f, t, {
                  className: 'cm-fr-searching',
                  clearWhenEmpty: false
                });
                state.frMarks.push(m);
              } catch (_) {}
              n++;
              if (n >= FR_HL_HARD_CAP) { truncated = true; break; }
            }
            // 必须从 t+1 推进 cursor——避免空匹配原地循环
            cursor = makeCursor(hlAdvance(t), q);
            if (!cursor) { done = true; break; }
          }
        } catch (e) { done = true; }
        if (aborted()) return;
        if (done) {
          finish();
          return;
        }
        if (truncated) {
          setFrStatus('匹配过多（>' + FR_HL_HARD_CAP + '），仅高亮前 ' + FR_HL_HARD_CAP + ' 个。点击「下一个」仍可逐个定位', '');
          finish();
          return;
        }
        setTimeout(step, 0);
      }
      step();
    } catch (e) {
      finish();
    }
  }

  /** 防抖调度高亮（按键停下 200ms 才刷新；递增 token 顶替旧批） */
  function scheduleFrHighlight() {
    if (state.frHlTimer) clearTimeout(state.frHlTimer);
    state.frHlTimer = setTimeout(function () {
      state.frHlTimer = null;
      // 如果旧批还在跑，applyFrHighlight 里 ++frHlToken 会让其 step 主动放弃
      applyFrHighlight();
    }, 200);
  }

  /** 统计匹配数（显示用，不要求绝对精确；非正则用 split 估算极快） */
  function frCountMatches(q) {
    if (!q) return setFrStatus('', '');
    var n;
    // 非正则 + 不开启全字匹配 + 不开启扩展：用字符串 split 一次完成（比逐次 findNext 快几十倍）
    if (!frState.regex && !frState.wholeWord && !frState.expand) {
      var text = cm.getValue();
      if (!frState.caseSens) {
        var lowerText = text.toLowerCase();
        var lowerQ = q.toLowerCase();
        var idx = 0, cnt = 0;
        while ((idx = lowerText.indexOf(lowerQ, idx)) !== -1) { cnt++; idx += lowerQ.length || 1; if (cnt > 99999) break; }
        n = cnt;
      } else {
        n = text.split(q).length - 1;
        if (n > 100000) n = 100000;
      }
    } else if (frState.regex && /[\^$]|\\b/.test(q)) {
      // zero-width 锚点（^ $ \b）：绕开 CodeMirror multiline 路径的 ch=lastIndex bug，
      // 用 re.exec(getLine(l)) 在每行重置 lastIndex=0 手算匹配数。
      var reCount;
      try { reCount = new RegExp(q, frState.caseSens ? 'gm' : 'gim'); }
      catch (_) { return setFrStatus('正则无效', 'error'); }
      var totalLines = cm.lineCount();
      n = 0;
      for (var l = 0; l < totalLines && n < 99999; l++) {
        reCount.lastIndex = 0;
        var lineStr = cm.getLine(l);
        var mm;
        while ((mm = reCount.exec(lineStr)) !== null) {
          n++;
          // \b 边界有可能匹配多次，零宽要 advance 防止原地
          if (mm[0].length === 0) reCount.lastIndex++;
          else if (reCount.lastIndex === mm.index) reCount.lastIndex++;
          if (n >= 99999) break;
        }
      }
    } else {
      // 一般正则（消耗型字符）：用 cursor + advancePos + 哨兵 break
      var cursor = makeCursor({ line: 0, ch: 0 }, q);
      if (!cursor) return setFrStatus('正则无效', 'error');
      n = 0;
      var prevKey = '';
      var HARD = 9999;
      function posKey(p) { return p.line + ',' + p.ch; }
      function advancePos(p) {
        var line = cm.getLine(p.line);
        if (line == null) return { line: p.line, ch: p.ch + 1 };
        if (p.ch < line.length) return { line: p.line, ch: p.ch + 1 };
        return { line: p.line + 1, ch: 0 };
      }
      while (cursor.findNext()) {
        var f = cursor.from(), t = cursor.to();
        var key = posKey(f) + '-' + posKey(t);
        if (key === prevKey) break;
        prevKey = key;
        n++;
        if (n > HARD) break;
        cursor = makeCursor(advancePos(t), q);
      }
    }
    if (n === 0) setFrStatus('未找到', 'error');
    else if (n >= 99999) setFrStatus('匹配数 ≥ 100000（仅估算）', '');
    else setFrStatus('共 ' + n + ' 处匹配 · 当前已选中', 'ok');
  }

  function getReplaceInput() {
    var r = $('fr-replace').value;
    // 始终把替换框里的 \n / \t / \r 解析为真实换行/Tab/回车。
    // 符合 sed / perl / VS Code 等所有主流编辑器的惯例，与是否勾选「扩展」无关——
    // 用户勾正则预期就是这套语义，不再让用户操心隐藏的副选项。
    // 想输出字面 \n？请在替换框里写 \\n（与 sed 一致）。
    r = r.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r');
    frState.replaceHistory = pushHistory(frState.replaceHistory, r);
    frSave();
    return r;
  }

  /** 执行一次替换：把 from..to 处的匹配替换为 replacement（支持正则 $1 捕获组） */
  function frDoReplace(from, to, q, replacement) {
    var text;
    if (frState.regex) {
      try {
        var re = new RegExp(q, frState.caseSens ? '' : 'i');
        text = cm.getRange(from, to).replace(re, replacement);
      } catch (e) { setFrStatus('正则错误: ' + e.message, 'error'); return false; }
    } else {
      text = replacement;
    }
    cm.replaceRange(text, from, to);
    return true;
  }

  /** 单次替换：若当前已选中一个匹配则替换并跳下一个；否则先查找选中 */
  function frReplaceOne() {
    var q = $('fr-find').value;
    if (!q) { setFrStatus('请输入查找内容', 'error'); return; }
    var replacement = getReplaceInput();

    // 判断当前选区是否正好是一个匹配
    var sel = cm.listSelections()[0];
    var isMatch = false;
    if (sel && (sel.anchor.line !== sel.head.line || sel.anchor.ch !== sel.head.ch)) {
      var hit = findOne(sel.anchor, false);
      if (hit && comparePos(hit.from, sel.anchor) === 0 && comparePos(hit.to, sel.head) === 0) {
        isMatch = true;
      }
    }

    if (isMatch) {
      // 当前已选中匹配 → 直接替换，并刷新高亮后跳到下一个
      frDoReplace(sel.anchor, sel.head, q, replacement);
      setFrStatus('已替换 1 处', 'ok');
      state.frLastQuery = null;  // 文档已变，强制下次跳转时重新统计+高亮
      setTimeout(function () { frFindNext(false); }, 0);
    } else {
      // 未选中匹配 → 先查找下一个并选中（不替换），符合「查找→替换」两步习惯
      frFindNext(false);
      setFrStatus('已选中匹配项，再次点击「替换」进行替换', '');
    }
  }

  /** 全部替换 */
  function frReplaceAll() {
    var q = $('fr-find').value;
    if (!q) { setFrStatus('请输入查找内容', 'error'); return; }
    var replacement = getReplaceInput();
    var scope = getScopeRange();
    var from = scope ? scope.from : { line: 0, ch: 0 };
    var to = scope ? scope.to : { line: cm.lineCount() - 1, ch: cm.getLine(cm.lineCount() - 1).length };

    // 正则模式下预编译一次，replaceRange 输入用（捕获组 $1 / $& 等仍生效）
    var regex;
    if (frState.regex) {
      try { regex = new RegExp(q, frState.caseSens ? 'g' : 'gi'); }
      catch (e) { setFrStatus('正则错误: ' + e.message, 'error'); return; }
    }

    // 【v0.16.25 修复】所有分支共用 collect→commit 模式，先声明 edits/count/HARD
    // 否则 anchor shortcut 分支会 ReferenceError，整个函数挂掉、文档不动一根毛。
    var edits = [];
    var count = 0;
    var HARD = 50000;  // 单次全部替换上限（sed 默认）
    function posKey(p) { return p.line + ',' + p.ch; }
    function advancePos(p) {
      var line = cm.getLine(p.line);
      if (line == null) return { line: p.line, ch: p.ch + 1 };
      if (p.ch < line.length) return { line: p.line, ch: p.ch + 1 };
      return { line: p.line + 1, ch: 0 };
    }

    var cursor;
    var useAnchorShortcut = frState.regex && /[\^$]|\\b/.test(q);
    if (useAnchorShortcut) {
      // zero-width 锚点（^ $ \b）：绕开 CodeMirror multiline 路径 ch=lastIndex bug，
      // 手算每行匹配并直接生成 edits（不依赖 SearchCursor）。
      try { regex = new RegExp(q, frState.caseSens ? 'gm' : 'gim'); }
      catch (e) { setFrStatus('正则错误: ' + e.message, 'error'); return; }
      var totalLines = cm.lineCount();
      for (var l = 0; l < totalLines; l++) {
        regex.lastIndex = 0;
        var lineStr = cm.getLine(l);
        var mm;
        while ((mm = regex.exec(lineStr)) !== null) {
          // 在该行匹配位置 mm.index 处插入 replacement（从 to 不消耗字符的场景）
          var hitFrom = { line: l, ch: mm.index };
          var hitTo = { line: l, ch: mm.index + mm[0].length };
          if (scope && comparePos(hitFrom, scope.to) >= 0) break;
          if (scope && comparePos(hitTo, scope.from) <= 0) {
            // 跳过范围前
          } else {
            var text = hitFrom.ch === hitTo.ch ? replacement : cm.getRange(hitFrom, hitTo).replace(regex, replacement);
            edits.push({ from: hitFrom, to: hitTo, text: text });
            count++;
            if (count >= HARD) break;
          }
          // 零宽必须推进，否则死循环
          if (mm[0].length === 0) regex.lastIndex++;
        }
        if (count >= HARD) break;
      }
    } else {
      cursor = makeCursor(from, q);
      if (!cursor) return;
      var prevKey = '';
      while (cursor.findNext()) {
        var f = cursor.from(), t = cursor.to();
        if (scope && comparePos(t, scope.to) > 0) break;
        if (scope && comparePos(f, scope.from) < 0) {
          cursor = makeCursor(advancePos(f), q);
          continue;
        }
        var curKey = posKey(f) + '-' + posKey(t);
        if (curKey === prevKey) break;
        prevKey = curKey;
        var text;
        if (frState.regex) {
          text = cm.getRange(f, t).replace(regex, replacement);
        } else {
          text = replacement;
        }
        edits.push({ from: f, to: t, text: text });
        count++;
        if (count >= HARD) break;
        cursor = makeCursor(advancePos(t), q);
      }
    }
    if (count === 0) { setFrStatus('未找到匹配项', 'error'); return; }
    // 倒序替换，避免前面替换破坏后面位置；
    // 分批 cm.operation 让 UI 有机会重绘（>200 时 200/yield）
    cm.operation(function () {
      var B = 200;
      for (var i = edits.length - 1; i >= 0; i -= B) {
        var from2 = Math.max(0, i - B + 1);
        for (var j = i; j >= from2; j--) {
          var ed = edits[j];
          cm.replaceRange(ed.text, ed.from, ed.to);
        }
        if (from2 > 0) {
          // 让出主线程一帧（用 setTimeout 0 让 ui 看到进度）
          // 但 operation 不能跨 yield；这里仅在最后一包前让
        }
      }
    });
    setFrStatus('共替换 ' + count + (count >= HARD ? '+（达到上限）' : '') + ' 处', 'ok');
    state.frLastQuery = null;
    applyFrHighlight();
  }

  /** 打开批量替换弹窗 */
  function frOpenBatchModal() {
    openSingleModal('fr-batch-modal');
    setTimeout(function () { $('fr-batch-text').focus(); }, 0);
  }

  /** 执行批量替换（每行：old ⇨ new） */
  function frBatchRun() {
    var txt = $('fr-batch-text').value;
    if (!txt.trim()) { setFrStatus('批量替换内容为空', 'error'); return; }
    var pairs = [];
    txt.split(/\r?\n/).forEach(function (line) {
      var m = line.match(/^(.*?)\s*(?:⇨|=>|=>|->|=|⇨|⇢)\s*(.*)$/);
      if (m) {
        var f = m[1], r = m[2];
        if (f) pairs.push({ find: f, replace: r });
      }
    });
    if (pairs.length === 0) {
      setFrStatus('未解析到有效规则（格式：old ⇨ new）', 'error');
      return;
    }
    var ok = 0;
    cm.operation(function () {
      pairs.forEach(function (p) {
        var cursor = makeCursor({ line: 0, ch: 0 }, p.find);
        var edits = [];
        while (cursor.findNext()) {
          var f = cursor.from(), t = cursor.to();
          var text;
          if (frState.regex) {
            try {
              var re = new RegExp(p.find, frState.caseSens ? 'g' : 'gi');
              text = cm.getRange(f, t).replace(re, p.replace);
            } catch (_) { continue; }
          } else {
            text = p.replace;
          }
          edits.push({ from: f, to: t, text: text });
          if (edits.length > 50000) break;
        }
        for (var i = edits.length - 1; i >= 0; i--) {
          cm.replaceRange(edits[i].text, edits[i].from, edits[i].to);
        }
        ok += edits.length;
      });
    });
    setFrStatus('批量完成：' + pairs.length + ' 条规则，共替换 ' + ok + ' 处', 'ok');
    $('fr-batch-modal').style.display = 'none';
    applyFrHighlight();
  }
