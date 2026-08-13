/* [esm] 导出本模块顶层绑定 */
export { initEvents, toolMenu, convertMenu, pb, splitDrag, MIN_PANE, sideDrag, SIDE_MIN, SIDE_MAX, syncSideWidth, ttMenu, ctxMenu, docCtxMenu, docCtxId, ctxDebug, __ctxLast, paintCtxDebug, isPlainEditorTarget, openCtxMenu, openDocCtxMenu, closeCtxMenu, handleCtxCmd, handleDocCtxCmd, initCtxMenu, fontSize, applyFontSize };
/* [esm] 导入依赖模块绑定 */
import { $, LANGS, SAMPLE_DIAGRAM, SAMPLE_MINDMAP, els, state } from './01-core.js';
import { cm } from './04-editor-init.js';
import { activeDoc } from './05-store.js';
import { closeDocDelConfirm, deleteDoc, openDocDelConfirm, pendingDelId, openTagEditModal } from './06-doc-list.js';
import { openDoc } from './07-doc-open.js';
import { onVisualChange } from './08-visual.js';
import { newRichDoc, newVisualDoc, saveDoc, syncFromEditor } from './09-rich-save.js';
import { applyZoom, panState, scheduleRender, svgNatural, updatePreviewVisibility, updateStatus } from './10-status-preview.js';
import { clearJSONErrorHighlight, copyToClipboard, execEditorCmd, formatXML, runTextTool, runTool } from './11-format-tools.js';
import { CLIP_KEY, openSnippetModal, recordClip, renderClipList } from './12-snippet-clip.js';
import { getApi, hasApi } from './13-api-path.js';
import { applyImgZoom, closeImageModal, fitImage, openFolder, switchSideTab } from './14-filetree-image.js';
import { closeAllToolMenus, closeCalloutModal, closeCodeModal, closeIconModal, closeInsertMenu, closeTableModal, filterIcons, handlePastedImage, insertCallout, insertCode, insertImageFile, insertTable, openInsertMenu, openSingleModal, routeInsert, scheduleFoldDataUris, showMenuAtMoreBtn } from './15-insert.js';
import { exportDoc, importFile, newDoc, openCompareWindow, openEncModal, setLang, toast } from './16-doc-ops.js';
import { openFindModal } from './19-find-replace.js';
  /* ---------------- 事件绑定 ----------------
   * Phase ESM：直接操作 cm 的绑定收敛为 initEvents()，由入口模块
   * 装配调用（此时 04 已完成 CodeMirror 初始化），消除 ESM 环内
   * 求值顺序不确定性；其余事件绑定只依赖 DOM/函数回调，保留在顶层。 */
  function initEvents() {
    cm.on('change', function () {
      syncFromEditor();
      updateStatus();
      scheduleRender();
      clearJSONErrorHighlight();
      scheduleFoldDataUris();
    });
    cm.on('swapDoc', function () { scheduleFoldDataUris(); });
    cm.on('cursorActivity', updateStatus);
  }

  els.title.addEventListener('input', function () {
    if (state.currentVisual) onVisualChange(); else syncFromEditor();
  });

  els.langSelect.addEventListener('change', function () {
    setLang(els.langSelect.value);
  });

  $('btn-new-doc').addEventListener('click', function () { newDoc('plaintext'); });
  $('btn-new-rich').addEventListener('click', function () { newRichDoc(); });
  $('btn-new-flow').addEventListener('click', function () { newVisualDoc('flow'); });
  $('btn-new-mind').addEventListener('click', function () { newVisualDoc('mind'); });
  $('btn-new-note').addEventListener('click', function () { newVisualDoc('note'); });
  $('btn-import').addEventListener('click', function () { els.fileInput.click(); });
  els.fileInput.addEventListener('change', function () {
    if (els.fileInput.files[0]) importFile(els.fileInput.files[0]);
    els.fileInput.value = '';
  });

  $('btn-format-xml').addEventListener('click', formatXML);

  // 工具下拉菜单
  var toolMenu = $('tool-menu');
  $('btn-tools').addEventListener('click', function (e) {
    e.stopPropagation();
    var willOpen = toolMenu.style.display === 'none';
    if (willOpen) closeAllToolMenus();   // 展开前先关掉文本工具/插入菜单
    if (willOpen) showMenuAtMoreBtn(toolMenu); else toolMenu.style.display = 'none';
  });
  document.addEventListener('click', function () {
    closeAllToolMenus();
  });
  toolMenu.addEventListener('click', function (e) {
    var btn = e.target.closest('.menu-item');
    if (!btn) return;
    toolMenu.style.display = 'none';
    runTool(btn.getAttribute('data-tool'));
  });

  // 🔄 转换工具菜单（编码 / 转义 / 时间戳）
  var convertMenu = $('convert-menu');
  $('btn-convert').addEventListener('click', function (e) {
    e.stopPropagation();
    var willOpen = convertMenu.style.display === 'none';
    if (willOpen) closeAllToolMenus();   // 展开前先关掉其它菜单
    if (willOpen) showMenuAtMoreBtn(convertMenu); else convertMenu.style.display = 'none';
  });
  convertMenu.addEventListener('click', function (e) {
    var btn = e.target.closest('.menu-item');
    if (!btn) return;
    convertMenu.style.display = 'none';
    runTool(btn.getAttribute('data-tool'));
  });
  $('btn-export').addEventListener('click', exportDoc);
  // 💾 保存 / 另存为
  els.btnSave.addEventListener('click', function () { saveDoc(false); });
  els.btnSaveAs.addEventListener('click', function () { saveDoc(true); });
  // 全局 Ctrl/Cmd+S：无论焦点在哪都能保存，并阻止浏览器默认"保存网页"
  window.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      saveDoc(false);
    }
    // Ctrl/Cmd+N：直接新建纯文本文档（阻止浏览器默认"新建窗口"）
    if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      newDoc('plaintext');
    }
  });
  $('btn-delete').addEventListener('click', function () {
    var d = activeDoc();
    if (!d) { toast('没有可删除的文档', 'error'); return; }
    openDocDelConfirm(d.id);
  });

  els.btnTogglePreview.addEventListener('click', function () {
    state.previewOn = !state.previewOn;
    updatePreviewVisibility();
  });

  // 顶栏右上角预览按钮：点击预览 / 再点击关闭预览
  els.btnPreviewTop.addEventListener('click', function () {
    state.previewOn = !state.previewOn;
    updatePreviewVisibility();
  });

  $('btn-insert-sample').addEventListener('click', function () {
    cm.setValue(SAMPLE_DIAGRAM + '\n\n' + SAMPLE_MINDMAP);
    scheduleRender();
  });

  // 预览区拖拽平移 / Ctrl+滚轮缩放 / 双击复位
  var pb = document.getElementById('preview-body');
  pb.addEventListener('mousedown', function (e) {
    // Markdown / HTML 预览时允许正常选择文字，不做拖拽平移
    if (els.mdOut.style.display !== 'none' || els.htmlOut.style.display !== 'none') return;
    if (e.button !== 0) return;
    panState.down = true;
    panState.startX = e.clientX;
    panState.startY = e.clientY;
    panState.scrollLeft = pb.scrollLeft;
    panState.scrollTop = pb.scrollTop;
    pb.classList.add('panning');
    e.preventDefault();
  });
  window.addEventListener('mousemove', function (e) {
    if (!panState.down) return;
    pb.scrollLeft = panState.scrollLeft - (e.clientX - panState.startX);
    pb.scrollTop = panState.scrollTop - (e.clientY - panState.startY);
  });
  window.addEventListener('mouseup', function () {
    panState.down = false;
    pb.classList.remove('panning');
  });
  pb.addEventListener('wheel', function (e) {
    if (!e.ctrlKey || !svgNatural || els.mdOut.style.display !== 'none') return;
    e.preventDefault();
    state.zoomLevel = Math.min(4, Math.max(0.2, state.zoomLevel * (e.deltaY < 0 ? 1.1 : 0.9)));
    applyZoom();
  }, { passive: false });
  pb.addEventListener('dblclick', function () {
    state.zoomLevel = 1;
    applyZoom();
  });

  /* ---------------- 编辑区 / 预览区 分割线拖动 ---------------- */
  var splitDrag = { down: false, startX: 0, startW: 0 };
  var MIN_PANE = 260; // 两侧最小像素宽度
  els.splitter.addEventListener('mousedown', function (e) {
    if (els.previewPane.style.display === 'none') return;
    splitDrag.down = true;
    splitDrag.startX = e.clientX;
    var curW = els.previewPane.getBoundingClientRect().width;
    splitDrag.startW = curW;
    els.splitter.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    if (els.htmlFrame) els.htmlFrame.style.pointerEvents = 'none'; // 避免拖动经过 iframe 时丢事件
    e.preventDefault();
  });
  window.addEventListener('mousemove', function (e) {
    if (!splitDrag.down) return;
    var wrapRect = els.editorPane.parentNode.getBoundingClientRect();
    // 新预览宽度 = 起始宽度 + (起始鼠标X - 当前鼠标X)
    var delta = splitDrag.startX - e.clientX;
    var newW = splitDrag.startW + delta;
    var maxW = wrapRect.width - MIN_PANE - els.splitter.offsetWidth;
    if (newW < MIN_PANE) newW = MIN_PANE;
    if (newW > maxW) newW = maxW;
    els.previewPane.style.width = newW + 'px';
    if (cm) cm.refresh();
  });
  window.addEventListener('mouseup', function () {
    if (!splitDrag.down) return;
    splitDrag.down = false;
    els.splitter.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (els.htmlFrame) els.htmlFrame.style.pointerEvents = '';
    if (cm) cm.refresh();
  });

  /* ---- 侧栏宽度拖动（让长文件名可见） ---- */
  var sideDrag = { down: false, startX: 0, startW: 0 };
  var SIDE_MIN = 200, SIDE_MAX = 620;
  function syncSideWidth(w) {
    els.sidebar.style.width = w + 'px';
    els.sidebar.style.minWidth = w + 'px';
    els.sidebar.style.flex = '0 0 ' + w + 'px';
    if (cm) cm.refresh();
  }
  els.sideSplitter.addEventListener('mousedown', function (e) {
    if (els.sidebar.classList.contains('collapsed')) return;
    sideDrag.down = true;
    sideDrag.startX = e.clientX;
    sideDrag.startW = els.sidebar.getBoundingClientRect().width;
    els.sideSplitter.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  window.addEventListener('mousemove', function (e) {
    if (!sideDrag.down) return;
    var delta = e.clientX - sideDrag.startX;
    var newW = sideDrag.startW + delta;
    if (newW < SIDE_MIN) newW = SIDE_MIN;
    if (newW > SIDE_MAX) newW = SIDE_MAX;
    syncSideWidth(newW);
  });
  window.addEventListener('mouseup', function () {
    if (!sideDrag.down) return;
    sideDrag.down = false;
    els.sideSplitter.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  // 侧栏折叠/展开由 20-craft-init.js 单按钮统一处理

  // 🔍 查找替换（Ctrl+F）—— 打开仿 EverEdit 浮层
  $('btn-find').addEventListener('click', function () {
    openFindModal(false);
  });

  // 🧰 文本工具菜单
  var ttMenu = $('texttool-menu');
  $('btn-texttools').addEventListener('click', function (e) {
    e.stopPropagation();
    var willOpen = ttMenu.style.display === 'none';
    if (willOpen) closeAllToolMenus();   // 展开前先关掉 JSON 工具/插入菜单
    if (willOpen) showMenuAtMoreBtn(ttMenu); else ttMenu.style.display = 'none';
  });
  ttMenu.addEventListener('click', function (e) {
    var mi = e.target.closest('.menu-item');
    if (!mi) return;
    var tt = mi.getAttribute('data-tt');
    // v0.20.27：分组项（submenu-trigger）无 data-tt，点击只切换子菜单 hover 态，不关闭菜单、不执行
    if (!tt) return;
    ttMenu.style.display = 'none';
    if (tt === 'snippet') openSnippetModal();
    else if (tt === 'clipboard') { renderClipList(); openSingleModal('clip-modal'); }
    else runTextTool(tt);
  });

  /* ---- v0.20.1 / v0.20.3 纯文本框右键上下文菜单 ---- */
  var ctxMenu = null;                // v0.20.10：延迟到 DOMContentLoaded 后获取（见 initCtxMenu），避免脚本先于 #ctx-menu 解析时取到 null
  var docCtxMenu = null;             // v0.20.29：侧边栏「我的文档」右键菜单
  var docCtxId = null;               // 右键命中的文档 id（供 doc-ctx-menu 使用）
  var ctxDebug = null;               // 调试显示：最近一次右键事件（同上，延迟获取）
  var __ctxLast = { target: '', match: '?', opened: false, time: '', src: '' };
  function paintCtxDebug() {
    if (!ctxDebug) return;
    var c = __ctxLast;
    var status = c.opened ? '🟢 弹' : '🔴 未弹';
    var src = c.src ? ' · src=' + c.src : '';
    ctxDebug.textContent = '🖱 ' + status + ' · target=' + c.target + ' · in=' + c.match + src + (c.time ? ' @' + c.time : '');
    // 未弹的情况下用红色，已弹用绿色（直接改 style）
    ctxDebug.style.color = c.opened ? '#1aaa55' : '#d33';
  }
  function isPlainEditorTarget(node) {
    if (!node || typeof node.closest !== 'function') return false;
    // v0.20.3 放宽判定：#editor-wrap / #editor / .CodeMirror / .CodeMirror-line / .CodeMirror-gutter 任一祖先匹配即视为纯文本编辑区
    // 目的：CodeMirror 内部点击时 target 形态多变（line / span / sizer / gutter / scroller），单一 selector 易漏
    var n = node;
    while (n && n !== document.body) {
      if (n.id === 'editor-wrap' || n.id === 'editor' || (n.classList && (n.classList.contains('CodeMirror') || n.classList.contains('CodeMirror-line') || n.classList.contains('CodeMirror-gutter')))) return true;
      n = n.parentNode;
    }
    return false;
  }
  function openCtxMenu(x, y) {
    if (!ctxMenu) return;
    if (docCtxMenu) docCtxMenu.style.display = 'none';
    ctxMenu.style.display = 'block';
    // 设成 block 后再读真实尺寸，避免初始 0 宽高导致位置错位
    var w = ctxMenu.offsetWidth || 184;
    var h = ctxMenu.offsetHeight || 320;
    var left = Math.min(x, window.innerWidth - w - 8);
    var top = Math.min(y, window.innerHeight - h - 8);
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    ctxMenu.style.left = left + 'px';
    ctxMenu.style.top = top + 'px';
  }
  function openDocCtxMenu(x, y) {
    if (!docCtxMenu) return;
    if (ctxMenu) ctxMenu.style.display = 'none';
    docCtxMenu.style.display = 'block';
    var w = docCtxMenu.offsetWidth || 160;
    var h = docCtxMenu.offsetHeight || 180;
    var left = Math.min(x, window.innerWidth - w - 8);
    var top = Math.min(y, window.innerHeight - h - 8);
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    docCtxMenu.style.left = left + 'px';
    docCtxMenu.style.top = top + 'px';
  }

  function closeCtxMenu() { if (ctxMenu) ctxMenu.style.display = 'none'; if (docCtxMenu) docCtxMenu.style.display = 'none'; }
  function handleCtxCmd(cmd) {
    if (!cmd) return;
    switch (cmd) {
      case 'undo': cm.undo(); break;
      case 'redo': cm.redo(); break;
      case 'cut': try { document.execCommand('cut'); } catch (e) {} break;
      case 'copy': try { document.execCommand('copy'); } catch (e) {} break;
      case 'paste':
        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(function (t) { if (t) cm.replaceSelection(t); }).catch(function () { try { document.execCommand('paste'); } catch (e2) {} });
          } else { document.execCommand('paste'); }
        } catch (e3) { try { document.execCommand('paste'); } catch (e4) {} }
        break;
      case 'selectall': cm.execCommand('selectAll'); break;
      case 'del': document.execCommand('delete'); break;
      case 'cmt': cm.execCommand('toggleComment'); break;
      // v0.20.45：右键菜单 JSON 工具（复用工具栏 JSON 工具集）
      case 'json-format': runTool('format'); break;
      case 'json-compress': runTool('compress'); break;
      case 'json-escape': runTool('escape'); break;
      case 'json-unescape': runTool('unescape'); break;
      case 'json-unicode-zh': runTool('unicode-zh'); break;
      case 'json-zh-unicode': runTool('zh-unicode'); break;
      default: execEditorCmd(cmd);
    }
  }
  // v0.20.29：侧边栏「我的文档」右键菜单命令
  function handleDocCtxCmd(dcmd) {
    if (!dcmd || !docCtxId) return;
    var d = null;
    for (var i = 0; i < state.docs.length; i++) { if (state.docs[i].id === docCtxId) { d = state.docs[i]; break; } }
    if (!d) { toast('文档不存在或已被移除', 'error'); return; }
    switch (dcmd) {
      case 'open':
        openDoc(d.id);
        break;
      case 'copy-title':
        copyToClipboard(d.title || '无标题').then(function () { toast('已复制标题', 'success'); });
        break;
      case 'copy-path':
        if (d.diskPath) copyToClipboard(d.diskPath).then(function () { toast('已复制路径', 'success'); });
        else toast('该文档没有磁盘路径', 'error');
        break;
      case 'del':
        openDocDelConfirm(d.id);
        break;
      case 'tag':
        openTagEditModal(d.id);
        break;
    }
  }
  // v0.20.10 关键修复：app.js 在 DOM 完全解析前执行（<script src="app.js"> 位于 #ctx-menu 元素之前），
  // 同步获取 ctxMenu 会得到 null，导致整个事件绑定块被 if(ctxMenu) 跳过 —— 这正是 v0.20.2~v0.20.9 右键/按钮/键盘全失效的根因。
  // 改为在 DOMContentLoaded 后再获取元素并初始化。
  function initCtxMenu() {
    ctxMenu = document.getElementById('ctx-menu');
    docCtxMenu = document.getElementById('doc-ctx-menu');
    ctxDebug = document.getElementById('stat-ctx');
    if (!ctxMenu) return;
    paintCtxDebug();
    // v0.20.7 诊断 + 多路触发：
    // 之前 9 个版本反复失败，根因不明（疑似本机 WebView2 在禁用原生菜单后不派发右键事件）。
    // 这里：(1) 状态栏实时计数 mousedown/contextmenu/键盘，定位事件是否到达 JS；
    //       (2) 同时绑定 mousedown(button=2) + contextmenu + 键盘 Menu/Shift+F10 三类触发，
    //           任一命中即弹菜单，不再依赖 isPlainEditorTarget 严格判定。
    var __diag = { md: 0, mdR: 0, ctx: 0, key: 0, last: '' };
    function diagUpdate() {
      if (!ctxDebug) return;
      ctxDebug.textContent = '🖱 md=' + __diag.md + '(右' + __diag.mdR + ') ctx=' + __diag.ctx + ' key=' + __diag.key + ' · ' + __diag.last;
      ctxDebug.style.color = '#d33';
    }
    // v0.20.8 兜底：点击触发器总开关。openMenu 会忽略具体事件类型，直接弹菜单。
    // 用于 Ctrl+., Menu 键, Shift+F10 与状态栏按钮（这些路径 WebView2 必派发）。
    // v0.20.29 目标分流：右键落在「我的文档」列表项（.doc-item）→ 弹文档右键菜单（doc-ctx-menu）；
    //   其余位置（编辑区/工具栏等）→ 弹纯文本菜单（ctx-menu），保持原有宽松兜底。
    function openMenu(e) {
      if (e && ctxMenu.contains(e.target)) return;          // 点的是菜单自身
      if (e && docCtxMenu && docCtxMenu.contains(e.target)) return; // 点的是文档菜单自身
      // 侧边栏右键拦截：非文档项区域不弹任何菜单
      var sidebar = document.getElementById('sidebar');
      if (e && sidebar && sidebar.contains(e.target)) {
        var docItem = e.target && e.target.closest ? e.target.closest('.doc-item') : null;
        if (!docItem) return; // 侧边栏非文档项 → 不弹菜单
      }
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      var x = (e && typeof e.clientX === 'number') ? e.clientX : (window.innerWidth / 2);
      var y = (e && typeof e.clientY === 'number') ? e.clientY : (window.innerHeight / 2);
      // v0.20.29：命中「我的文档」列表项 → 文档右键菜单
      var docItem = e && e.target && e.target.closest ? e.target.closest('.doc-item') : null;
      if (docItem) {
        docCtxId = docItem.dataset.docId || null;
        var hasPath = !!docItem.dataset.docPath;
        var cpBtn = document.getElementById('doc-ctx-copypath');
        if (cpBtn) cpBtn.style.display = hasPath ? '' : 'none';
        openDocCtxMenu(x, y);
        __ctxLast.opened = true;
        __ctxLast.match = 'doc-item';
        __ctxLast.src = e ? e.type : 'key';
        paintCtxDebug();
        return;
      }
      openCtxMenu(x, y);
      __ctxLast.opened = true;
      __ctxLast.match = 'Y';
      __ctxLast.src = e ? e.type : 'key';
      paintCtxDebug();
    }
    // 计数：任意 mousedown（诊断用，确认事件是否到达 JS）
    document.addEventListener('mousedown', function (e) {
      __diag.md++;
      if (e.button === 2) { __diag.mdR++; __diag.last = 'mousedown 右键'; }
      else { __diag.last = 'mousedown 左键 btn=' + e.button; }
      diagUpdate();
    }, true);
    // 触发 A：右键 mousedown（基础指针事件，最可靠）
    document.addEventListener('mousedown', function (e) {
      if (e.button === 2) { __diag.last = '→ 开菜单(mousedown)'; diagUpdate(); openMenu(e); }
    }, true);
    window.addEventListener('mousedown', function (e) { if (e.button === 2) openMenu(e); }, true);
    // 触发 B：contextmenu（兜底）
    document.addEventListener('contextmenu', function (e) { __diag.ctx++; __diag.last = 'contextmenu'; diagUpdate(); openMenu(e); }, false);
    document.addEventListener('contextmenu', function (e) { openMenu(e); }, true);
    window.addEventListener('contextmenu', function (e) { openMenu(e); }, true);
    // 触发 C：键盘 Menu 键 / Shift+F10 / Ctrl+.（WebView2 一定派发，作为兜底）
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
        __diag.key++; __diag.last = (e.key === 'ContextMenu' ? 'Menu键' : 'Shift+F10'); diagUpdate();
        if (e.preventDefault) e.preventDefault();
        openMenu(null);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        // Ctrl+. 兜底（点 / .）
        __diag.key++; __diag.last = 'Ctrl+.'; diagUpdate();
        if (e.preventDefault) e.preventDefault();
        openMenu(null);
      }
    });
    // 菜单项点击
    ctxMenu.addEventListener('click', function (e) {
      var item = e.target.closest('.ctx-item');
      if (!item) return;
      var cmd = item.getAttribute('data-cmd');
      closeCtxMenu();
      handleCtxCmd(cmd);
    });
    // v0.20.29：「我的文档」右键菜单项点击
    if (docCtxMenu) {
      docCtxMenu.addEventListener('click', function (e) {
        var item = e.target.closest('.ctx-item');
        if (!item) return;
        var dcmd = item.getAttribute('data-dcmd');
        closeCtxMenu();
        handleDocCtxCmd(dcmd);
      });
    }
    // 左键点菜单外关闭；右键不关
    document.addEventListener('mousedown', function (e) {
      if (e.button === 2) return;
      var inCtx = ctxMenu.style.display !== 'none' && ctxMenu.contains(e.target);
      var inDocCtx = docCtxMenu && docCtxMenu.style.display !== 'none' && docCtxMenu.contains(e.target);
      if (ctxMenu.style.display !== 'none' && !inCtx && !inDocCtx) closeCtxMenu();
      else if (docCtxMenu && docCtxMenu.style.display !== 'none' && !inDocCtx && !inCtx) closeCtxMenu();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCtxMenu(); });
    window.addEventListener('blur', closeCtxMenu);
    // v0.20.8：初始化时立刻渲染一次诊断面板，让用户能立刻看到「它存在并正常工作」
    diagUpdate();
  }
  // v0.20.10：文档解析完成后初始化右键菜单（此时 #ctx-menu 已存在）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCtxMenu);
  } else {
    initCtxMenu();
  }

  // 剪贴板历史弹窗
  $('clip-close').addEventListener('click', function () { $('clip-modal').style.display = 'none'; });
  $('clip-modal').addEventListener('click', function (e) {
    if (e.target === $('clip-modal')) $('clip-modal').style.display = 'none';
  });
  $('clip-clear').addEventListener('click', function () {
    localStorage.removeItem(CLIP_KEY);
    renderClipList();
  });
  document.addEventListener('copy', function () {
    var t = cm.getSelection() || (window.getSelection() ? String(window.getSelection()) : '');
    if (t) recordClip(t);
  });

  // 代码段弹窗
  $('snippet-close').addEventListener('click', function () { $('snippet-modal').style.display = 'none'; });
  $('snippet-modal').addEventListener('click', function (e) {
    if (e.target === $('snippet-modal')) $('snippet-modal').style.display = 'none';
  });

  // 📂 打开文件夹 / 侧栏切换
  $('btn-open-folder').addEventListener('click', openFolder);
  els.tabDocs.addEventListener('click', function () { switchSideTab('docs'); });
  els.tabFiles.addEventListener('click', function () { switchSideTab('files'); });

  // 🖼 图片：插入按钮 / 查看器交互 / 粘贴监听
  els.btnInsertImage.addEventListener('click', insertImageFile);

  // ✨ 插入菜单（类语雀组件）
  $('btn-insert').addEventListener('click', function (e) { e.stopPropagation(); openInsertMenu(); });
  document.addEventListener('click', function (e) {
    var wrap = $('insert-wrap');
    if (wrap && !wrap.contains(e.target)) closeInsertMenu();
  });
  Array.prototype.forEach.call(document.querySelectorAll('#insert-menu .menu-item'), function (it) {
    it.addEventListener('click', function () { routeInsert(it.getAttribute('data-insert')); });
  });
  // 代码块弹窗
  $('code-ins-ok').addEventListener('click', function () { var l = $('code-ins-lang').value; closeCodeModal(); insertCode(l); });
  $('code-ins-cancel').addEventListener('click', closeCodeModal);
  $('code-ins-close').addEventListener('click', closeCodeModal);
  // 表格弹窗
  $('table-ins-ok').addEventListener('click', function () { insertTable($('table-ins-rows').value, $('table-ins-cols').value, $('table-ins-header').checked); });
  $('table-ins-cancel').addEventListener('click', closeTableModal);
  $('table-ins-close').addEventListener('click', closeTableModal);
  // 标注弹窗
  Array.prototype.forEach.call(document.querySelectorAll('#callout-modal .callout-pick'), function (it) {
    it.addEventListener('click', function () { insertCallout(it.getAttribute('data-co')); });
  });
  $('callout-close').addEventListener('click', closeCalloutModal);
  // 图标面板
  $('icon-close').addEventListener('click', closeIconModal);
  Array.prototype.forEach.call(document.querySelectorAll('.icon-tab'), function (t) {
    t.addEventListener('click', function () {
      document.querySelectorAll('.icon-tab').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      var tab = t.getAttribute('data-icontab');
      if ($('icon-grid-emoji')) $('icon-grid-emoji').style.display = tab === 'emoji' ? '' : 'none';
      if ($('icon-grid-vector')) $('icon-grid-vector').style.display = tab === 'vector' ? '' : 'none';
    });
  });
  if ($('icon-search')) $('icon-search').addEventListener('input', function () { filterIcons(this.value); });

  els.imgClose.addEventListener('click', closeImageModal);
  els.imgZoomIn.addEventListener('click', function () { state.imgZoom = Math.min(state.imgZoom * 1.2, 8); applyImgZoom(); });
  els.imgZoomOut.addEventListener('click', function () { state.imgZoom = Math.max(state.imgZoom / 1.2, 0.1); applyImgZoom(); });
  els.imgZoomReset.addEventListener('click', function () { state.imgZoom = 1; state.imgPanX = 0; state.imgPanY = 0; applyImgZoom(); });
  els.imgFit.addEventListener('click', fitImage);
  els.imageModal.addEventListener('click', function (e) {
    if (e.target === els.imageModal) closeImageModal();
  });
  els.imageStage.addEventListener('wheel', function (e) {
    if (els.imageModal.style.display !== 'flex') return;
    e.preventDefault();
    var delta = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    state.imgZoom = Math.max(0.1, Math.min(state.imgZoom * delta, 8));
    applyImgZoom();
  }, { passive: false });
  els.imageStage.addEventListener('mousedown', function (e) {
    state.imgDragging = true; state.imgLastX = e.clientX; state.imgLastY = e.clientY;
    els.imageStage.classList.add('dragging');
  });
  window.addEventListener('mousemove', function (e) {
    if (!state.imgDragging) return;
    state.imgPanX += e.clientX - state.imgLastX; state.imgPanY += e.clientY - state.imgLastY;
    state.imgLastX = e.clientX; state.imgLastY = e.clientY; applyImgZoom();
  });
  window.addEventListener('mouseup', function () { state.imgDragging = false; els.imageStage.classList.remove('dragging'); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && els.imageModal.style.display === 'flex') closeImageModal();
  });

  // 粘贴图片自动插入（Markdown / HTML 文档）
  cm.on('paste', function (cm2, e) {
    var cd = e.clipboardData || window.clipboardData;
    if (!cd || !cd.items) return;
    for (var i = 0; i < cd.items.length; i++) {
      var it = cd.items[i];
      if (it.kind === 'file' && it.type && it.type.indexOf('image/') === 0) {
        var file = it.getAsFile();
        if (file) { e.preventDefault(); handlePastedImage(file); return; }
      }
    }
  });

  // 🔣 编码转换
  $('btn-encoding').addEventListener('click', openEncModal);
  $('enc-close').addEventListener('click', function () { $('enc-modal').style.display = 'none'; });
  $('enc-modal').addEventListener('click', function (e) {
    if (e.target === $('enc-modal')) $('enc-modal').style.display = 'none';
  });

  // 🗑 删除文档确认弹窗
  $('doc-del-close').addEventListener('click', closeDocDelConfirm);
  $('doc-del-cancel').addEventListener('click', closeDocDelConfirm);
  $('doc-del-modal').addEventListener('click', function (e) {
    if (e.target === $('doc-del-modal')) closeDocDelConfirm();
  });
  $('doc-del-confirm').addEventListener('click', function () {
    if (pendingDelId) deleteDoc(pendingDelId);
    closeDocDelConfirm();
  });
  $('enc-reload').addEventListener('click', function () {
    var d = activeDoc();
    if (!d || !d.diskPath) { toast('仅磁盘文件可重新读取', 'error'); return; }
    var enc = $('enc-select').value;
    getApi().read_text_file(d.diskPath, enc).then(function (res) {
      if (!res || res.error) { toast('读取失败：' + (res && res.error || ''), 'error'); return; }
      d.content = res.content;
      d.encoding = res.encoding || enc;
      cm.setValue(d.content);
      cm.clearHistory();
      syncFromEditor();
      $('enc-current').textContent = '磁盘文件 · ' + (res.encoding || enc);
      toast('已按 ' + (res.encoding || enc) + ' 重新读取 ✓', 'success');
    }).catch(function () { toast('重新读取失败', 'error'); });
  });
  $('enc-saveas').addEventListener('click', function () {
    var d = activeDoc();
    if (!d) return;
    if (!hasApi()) { toast('另存需在桌面版中使用', 'error'); return; }
    var ext = LANGS[d.lang] ? LANGS[d.lang].ext : '.txt';
    var name = (d.title || '未命名').replace(/[\\/:*?"<>|]/g, '_') + ext;
    var enc = $('enc-select').value;
    getApi().save_file_encoded(name, cm.getValue(), enc).then(function (p) {
      if (p) toast('已按 ' + enc + ' 另存为 ✓', 'success');
    }).catch(function () { toast('另存失败', 'error'); });
  });

  // ⇄ 文件比较（独立窗口）
  $('btn-compare').addEventListener('click', openCompareWindow);

  // Ctrl+滚轮缩放编辑器字体（持久化）
  var fontSize = parseInt(localStorage.getItem('inkpad.fontsize'), 10) || 14;
  function applyFontSize(px) {
    cm.getWrapperElement().style.fontSize = px + 'px';
    cm.refresh();
    localStorage.setItem('inkpad.fontsize', String(px));
  }
  applyFontSize(fontSize);
  cm.getWrapperElement().addEventListener('wheel', function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    fontSize = Math.min(26, Math.max(10, fontSize + (e.deltaY < 0 ? 1 : -1)));
    applyFontSize(fontSize);
  }, { passive: false });
