/* [esm] 导出本模块顶层绑定 */
export { insertAtCursor, canInsertBlock, insertBlock, CALLOUT_PREVIEW, insertCallout, insertCode, insertTable, insertCols, openInsertMenu, closeInsertMenu, closeAllToolMenus, openIconModal, closeIconModal, buildIconGrids, filterIcons, openCalloutModal, closeCalloutModal, openCodeModal, closeCodeModal, openTableModal, closeTableModal, closeAllInsertModals, openSingleModal, routeInsert, scheduleFoldDataUris, foldDataUris, extFromType, insertImageFile, _guessMimeFromPath, buildDataUri, handlePastedImage };
/* [esm] 导入依赖模块绑定 */
import { $ } from './01-core.js';
import { cm } from './04-editor-init.js';
import { activeDoc } from './05-store.js';
import { closeDocDelConfirm } from './06-doc-list.js';
import { syncFromEditor } from './09-rich-save.js';
import { closeTsModal } from './11-format-tools.js';
import { dirOf, getApi, hasApi } from './13-api-path.js';
import { toast } from './16-doc-ops.js';
import { closeFindModal } from './19-find-replace.js';
  /* ---------------- 插入 / 粘贴图片 ---------------- */
  function insertAtCursor(text) {
    var pos = cm.getCursor();
    cm.replaceRange(text, pos);
    cm.setCursor({ line: pos.line, ch: pos.ch + text.length });
    cm.focus();
    syncFromEditor();
  }

  /* ---------------- 文档组件插入（类语雀） ---------------- */
  function canInsertBlock() {
    var d = activeDoc();
    if (!d) { toast('请先打开文档', 'error'); return false; }
    if (d.lang !== 'markdown' && d.lang !== 'html') {
      toast('「插入」组件仅适用于 Markdown / HTML 文档', 'error');
      return false;
    }
    return true;
  }

  function insertBlock(text) {
    if (!canInsertBlock()) return;
    var pos = cm.getCursor();
    var curLine = cm.getLine(pos.line) || '';
    var prefix = (pos.ch === 0 && curLine.trim() === '') ? '' : '\n\n';
    insertAtCursor(prefix + text + '\n');
  }

  var CALLOUT_PREVIEW = {
    note: '这里写说明或补充信息，可用于备注、背景说明等。',
    tip: '这里写技巧或建议，帮助读者更快上手。',
    important: '这里写重要提醒，读者务必留意。',
    warning: '这里写警告内容，提示潜在风险。',
    caution: '这里写危险 / 禁止内容，务必避免。'
  };

  function insertCallout(type) {
    var body = CALLOUT_PREVIEW[type] || '这里写标注内容。';
    insertBlock('> [!' + type.toUpperCase() + ']\n> ' + body + '\n');
    closeAllInsertModals();
  }

  function insertCode(lang) {
    insertBlock('```' + lang + '\n// 在此粘贴 ' + lang + ' 代码\n\n```');
  }

  function insertTable(rows, cols, header) {
    rows = Math.max(1, +rows || 3); cols = Math.max(1, +cols || 3);
    var i, j, lines = [], head = [], sep = [], blank = [];
    for (j = 0; j < cols; j++) { head.push('表头' + (j + 1)); sep.push('---'); blank.push('内容' + (j + 1)); }
    lines.push('| ' + head.join(' | ') + ' |');
    lines.push('| ' + sep.join(' | ') + ' |');
    for (i = 0; i < rows - (header ? 1 : 0); i++) {
      lines.push('| ' + blank.join(' | ') + ' |');
    }
    insertBlock(lines.join('\n'));
    closeAllInsertModals();
  }

  function insertCols() {
    insertBlock('<div class="md-cols"><div class="md-col">\n\n**左栏** 内容\n\n</div><div class="md-col">\n\n**右栏** 内容\n\n</div></div>');
  }

  function openInsertMenu() {
    var m = $('insert-menu');
    if (!m) return;
    var willOpen = (m.style.display === 'none' || !m.style.display);
    if (willOpen) closeAllToolMenus();   // 展开前先关掉 JSON/文本工具菜单
    m.style.display = willOpen ? 'block' : 'none';
  }
  function closeInsertMenu() { var m = $('insert-menu'); if (m) m.style.display = 'none'; }

  /**
   * 关闭所有工具栏下拉菜单（JSON 工具 / 文本工具 / 插入）。
   * 此前三个菜单各自独立 toggle、互不感知，连续点击会同时展开三个下拉列表。
   * 这里统一收口：任何一个菜单在展开前先调用本函数关闭其它两个。
   */
  function closeAllToolMenus() {
    var tm = $('tool-menu');       if (tm) tm.style.display = 'none';
    var cv = $('convert-menu');    if (cv) cv.style.display = 'none';
    var ttm = $('texttool-menu');  if (ttm) ttm.style.display = 'none';
    var im = $('insert-menu');     if (im) im.style.display = 'none';
  }

  function openIconModal() {
    if (!canInsertBlock()) return;
    buildIconGrids();
    openSingleModal('icon-modal');
    setTimeout(function () { if ($('icon-search')) $('icon-search').focus(); }, 0);
  }
  function closeIconModal() { if ($('icon-modal')) $('icon-modal').style.display = 'none'; }

  function buildIconGrids() {
    var ge = $('icon-grid-emoji');
    if (!ge || ge.dataset.built) return;
    if (typeof InkpadIcons !== 'undefined') {
      InkpadIcons.EMOJI.forEach(function (e) {
        var b = document.createElement('button');
        b.className = 'icon-cell';
        b.textContent = e;
        b.title = e;
        b.addEventListener('click', function () { insertAtCursor(e); closeIconModal(); });
        ge.appendChild(b);
      });
      ge.dataset.built = '1';
      var gv = $('icon-grid-vector');
      InkpadIcons.names.forEach(function (name) {
        var b = document.createElement('button');
        b.className = 'icon-cell icon-cell-vector';
        b.innerHTML = InkpadIcons.svg(name);
        b.title = ':icon-' + name + ':';
        b.addEventListener('click', function () { insertAtCursor(':icon-' + name + ':'); closeIconModal(); });
        gv.appendChild(b);
      });
    }
  }

  function filterIcons(q) {
    q = (q || '').trim().toLowerCase();
    var ge = $('icon-grid-emoji'), gv = $('icon-grid-vector');
    if (ge) Array.prototype.forEach.call(ge.children, function (b) {
      b.style.display = (!q || (b.textContent || '').toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
    if (gv) Array.prototype.forEach.call(gv.children, function (b) {
      b.style.display = (!q || (b.title || '').toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
  }

  function openCalloutModal() {
    if (!canInsertBlock()) return;
    openSingleModal('callout-modal');
  }
  function closeCalloutModal() { if ($('callout-modal')) $('callout-modal').style.display = 'none'; }

  function openCodeModal() {
    if (!canInsertBlock()) return;
    openSingleModal('code-ins-modal');
    setTimeout(function () { if ($('code-ins-lang')) $('code-ins-lang').focus(); }, 0);
  }
  function closeCodeModal() { if ($('code-ins-modal')) $('code-ins-modal').style.display = 'none'; }

  function openTableModal() {
    if (!canInsertBlock()) return;
    openSingleModal('table-ins-modal');
  }
  function closeTableModal() { if ($('table-ins-modal')) $('table-ins-modal').style.display = 'none'; }

  function closeAllInsertModals() {
    closeCodeModal(); closeTableModal(); closeIconModal(); closeCalloutModal(); closeInsertMenu();
  }

  /**
   * 中央互斥弹窗开关：打开任一主弹窗前，先关闭其它所有 .modal-overlay（含 fr-overlay）。
   * 解决「多个弹窗同时叠加出现」的根因——此前各弹窗各自独立 display='flex/block'，
   * 没有互斥逻辑，快捷键/菜单并行触发时就会叠加。
   * @param {string} id 要打开的弹窗元素 id（在 index.html 中必须有对应 .modal-overlay 或 #fr-overlay）
   */
  function openSingleModal(id) {
    if (!id) return;
    // 0) 有清理副作用的弹窗（定时器 / CodeMirror 高亮 / 待删除状态），先走专用关闭函数
    if (id !== 'ts-modal') closeTsModal();
    if (id !== 'fr-overlay') closeFindModal();
    if (id !== 'doc-del-modal') closeDocDelConfirm();
    // 1) 先关闭所有其它弹窗（连同查找替换浮层），保证全局只有一个可见
    var all = document.querySelectorAll('.modal-overlay, #fr-overlay');
    Array.prototype.forEach.call(all, function (el) {
      if (el.id !== id) el.style.display = 'none';
    });
    // 2) 关闭独立插入菜单（与弹窗互斥）
    closeInsertMenu();
    // 3) 打开目标弹窗。不同弹窗使用的 display 值不同（flex / block），统一按元素当前标记重设：
    var target = $(id);
    if (!target) return;
    // fr-overlay 原生用 block；其余 .modal-overlay 用 flex
    target.style.display = (id === 'fr-overlay') ? 'block' : 'flex';
  }

  function routeInsert(kind) {
    closeInsertMenu();
    // 富文档（块编辑器）：直接追加对应块，由块编辑器自带编辑 UI 处理
    var d = activeDoc();
    if (d && d.kind === 'rich') {
      if (window.InkpadBlocks) {
        var rk = (kind === 'task') ? 'todo' : kind;
        var SUPPORTED = ['text', 'h1', 'h2', 'h3', 'todo', 'quote', 'code', 'table', 'image', 'mermaid', 'math', 'callout', 'hr', 'cols'];
        if (SUPPORTED.indexOf(rk) >= 0) window.InkpadBlocks.insertBlock(rk);
        else toast('该组件在富文档模式下暂不支持，可在文本块中直接用 :icon-名称: 嵌入图标', 'info');
      }
      return;
    }
    switch (kind) {
      case 'code': openCodeModal(); break;
      case 'image': insertImageFile(); break;
      case 'table': openTableModal(); break;
      case 'mermaid':
        insertBlock('```mermaid\ngraph TD\n  A[开始] --> B{条件判断}\n  B -->|是| C[执行操作]\n  B -->|否| D[结束]\n```');
        break;
      case 'icon': openIconModal(); break;
      case 'math': insertBlock('$$\nE = mc^2\n$$'); break;
      case 'callout': openCalloutModal(); break;
      case 'task': insertBlock('- [ ] 待办事项一\n- [ ] 待办事项二\n- [x] 已完成事项'); break;
      case 'quote': insertBlock('> 引用内容：这里写引用文字。'); break;
      case 'toc': insertBlock('[TOC]'); break;
      case 'hr': insertBlock('---'); break;
      case 'cols': insertCols(); break;
    }
  }

  /* ---------------- data: URI 折叠显示 ---------------- */
  // 把 `![alt](data:xxx;base64,XXXXX)` 中的 base64 区段折叠成 `🖼 嵌入图片 · mime · 24.5 KB`
  // 的小卡片，原文本保持完整（保存/复制/搜索都拿回真实 base64），
  // 折叠只影响编辑器渲染，由 markText({collapsed:true}) 实现。
  // 守卫：mark 必须带 __inkpadDataUriFold 标志，避免清掉无关 mark
  function scheduleFoldDataUris() {
    if (!cm) return;
    if (scheduleFoldDataUris._t) return;
    scheduleFoldDataUris._t = setTimeout(function () {
      scheduleFoldDataUris._t = null;
      try { foldDataUris(cm); } catch (e) { /* 数据损坏时静默 */ }
    }, 60);
  }

  function foldDataUris(cm) {
    if (!cm) return;
    // 先清旧的 data: fold marks
    try {
      var marks = cm.getAllMarks();
      for (var i = 0; i < marks.length; i++) {
        if (marks[i].__inkpadDataUriFold) marks[i].clear();
      }
    } catch (e) { /* getAllMarks 偶尔抛错，无害 */ }

    var text = cm.getValue();
    if (!text) return;
    // 匹配 ![任意 alt 文本](data:mime;base64,xxxx)。注意 alt 文本里不能含 ']'，所以用 [^\]]*
    var re = /!\[[^\]]*\]\(data:([^;,)]+);base64,([A-Za-z0-9+/=]+)\)/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      // 折叠区段 = "data:<mime>;base64,<b64>" 整段，不动 "![alt](" 和 ")"
      var urlStart = m.index + m[0].indexOf('(data:') + 1; // 跳过 (
      var urlLen = ('data:' + m[1] + ';base64,' + m[2]).length;
      var fromIdx = urlStart;
      var toIdx = urlStart + urlLen;
      // from 在 "(" 后一个字符
      var from = cm.posFromIndex(fromIdx);
      var to = cm.posFromIndex(toIdx);
      if (!from || !to) continue;
      try {
        var sizeKB = (m[2].length * 0.75 / 1024);
        var sizeTxt = sizeKB >= 1024 ? (sizeKB / 1024).toFixed(2) + ' MB' : sizeKB.toFixed(1) + ' KB';
        var widget = document.createElement('span');
        widget.className = 'ink-datauri-fold';
        widget.contentEditable = false;
        var lbl = document.createElement('span');
        lbl.className = 'ink-datauri-fold-label';
        lbl.textContent = '🖼 嵌入图片 · ' + m[1] + ' · ' + sizeTxt;
        widget.appendChild(lbl);
        var btn = document.createElement('span');
        btn.className = 'ink-datauri-fold-btn';
        btn.textContent = '展开';
        btn.title = '展开/收起内联图片数据';
        widget.appendChild(btn);
        var mk = cm.markText(from, to, {
          collapsed: true,
          replacement: widget,
          inclusiveLeft: false,
          inclusiveRight: false,
          clearWhenEmpty: false
        });
        mk.__inkpadDataUriFold = true;
        // 点击 toggle：清掉再重 fold（让用户能看到原 base64 一瞬间）
        (function (mref) {
          widget.addEventListener('click', function (ev) {
            ev.preventDefault(); ev.stopPropagation();
            try { mref.clear(); } catch (e) {}
            // 不立即 re-fold，让用户看到完整文本；下一次 change 会重新折叠
          });
        })(mk);
      } catch (e) { /* 单个 markText 失败不影响其他 */ }
    }
  }

  function extFromType(type) {
    return ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' })[type] || 'png';
  }

  function insertImageFile() {
    var d = activeDoc();
    if (!d || (d.kind && d.kind !== 'text')) { toast('请先打开文本文档', 'error'); return; }
    if (d.lang !== 'markdown' && d.lang !== 'html') {
      toast('插入图片需切换到 Markdown 或 HTML 文档', 'error'); return;
    }
    if (!hasApi()) { toast('插入图片需在桌面版中使用', 'error'); return; }
    var hasDisk = !!d.diskPath;
    var baseDir = hasDisk ? dirOf(d.diskPath) : null;
    getApi().pick_files().then(function (paths) {
      if (!paths || !paths.length) return;
      var queue = Promise.resolve();
      paths.forEach(function (p) {
        queue = queue.then(function () {
          if (hasDisk) {
            // 已保存文档：拷贝到 .md 同目录的 assets/，写相对路径（文件可移植）
            return getApi().copy_image_to_assets(baseDir, p).then(function (res) {
              if (res && res.path) {
                insertAtCursor('![](' + res.rel + ')');
                toast('已插入：' + res.rel, 'success');
              } else if (res && res.error) {
                toast('插入失败：' + res.error, 'error');
              }
            });
          } else {
            // 未保存文档：直接 inline base64（自带图片数据，存盘后随文档一起保存）
            return getApi().read_file_b64(p).then(function (res) {
              if (!res || !res.b64) { toast('读取图片失败：' + p, 'error'); return; }
              insertAtCursor('![image](' + buildDataUri(res.mime || _guessMimeFromPath(p), res.b64) + ')');
              toast('已插入内联图片（保存文档后图片将随文档一起保存）', 'success');
            });
          }
        });
      });
    }).catch(function () { toast('选择图片失败', 'error'); });
  }

  function _guessMimeFromPath(p) {
    var ext = (p.split('.').pop() || '').toLowerCase();
    return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
         : ext === 'gif' ? 'image/gif'
         : ext === 'webp' ? 'image/webp'
         : ext === 'svg' ? 'image/svg+xml'
         : 'image/png';
  }

  // 防御性拼接 data: URI：传入的 b64 必须是字符串，否则走 atob(空) 兜底；
  // 万一上游传入对象也不会再产生 `[object Object]`
  function buildDataUri(mime, b64) {
    if (typeof b64 !== 'string') {
      console.warn('[inkpad] buildDataUri: b64 is not string, got', typeof b64, b64);
      b64 = '';
    }
    return 'data:' + (mime || 'image/png') + ';base64,' + b64;
  }

  function handlePastedImage(file) {
    var d = activeDoc();
    if (!d) return;
    if (d.lang !== 'markdown' && d.lang !== 'html') {
      toast('粘贴图片需为 Markdown / HTML 文档', 'error'); return;
    }
    if (!hasApi()) { toast('粘贴图片需在桌面版中使用', 'error'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var b64;
      try {
        var arr = new Uint8Array(reader.result);
        // 一次性转成二进制字符串（按 0x8000 分块，避免超大图片 O(n²)）
        var bin = '';
        for (var i = 0; i < arr.length; i += 0x8000) {
          bin += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
        }
        b64 = btoa(bin);
      } catch (e) {
        toast('读取粘贴图片失败', 'error');
        return;
      }
      if (typeof b64 !== 'string' || !b64) { toast('读取粘贴图片失败', 'error'); return; }
      var mime = (file && file.type) || 'image/png';
      if (d.diskPath) {
        // 已保存文档：写到同目录 assets/，相对路径（文件可移植）
        var ext = extFromType(mime);
        var fname = 'paste_' + Date.now() + '.' + ext;
        var baseDir = dirOf(d.diskPath);
        getApi().save_image_binary(baseDir, fname, b64).then(function (res) {
          if (res && res.path) {
            insertAtCursor('![](' + res.rel + ')');
            toast('已粘贴图片', 'success');
          } else if (res && res.error) toast('粘贴失败：' + res.error, 'error');
        }).catch(function () { toast('粘贴图片失败', 'error'); });
      } else {
        // 未保存文档：直接 inline base64（用户随手粘贴不必先存盘）
        insertAtCursor('![image](' + buildDataUri(mime, b64) + ')');
        toast('已粘贴内联图片（保存文档后图片将随文档一起保存）', 'success');
      }
    };
    reader.onerror = function () { toast('读取粘贴图片失败', 'error'); };
    reader.readAsArrayBuffer(file);
  }
