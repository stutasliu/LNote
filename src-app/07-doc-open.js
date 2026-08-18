/* [esm] 导出本模块顶层绑定 */
export { updateInfoPanel, goLine, openDoc, updatePreviewBtn, refreshTextDocFromDisk, refreshRichDocFromDisk, refreshDocFromDisk };
/* [esm] 导入依赖模块绑定 */
import { LANGS, els, state } from './01-core.js';
import { richOutline, richOutlineVisible } from './02-rich-outline.js';
import { cm } from './04-editor-init.js';
import { activeDoc, persist, saveCursorPos, loadCursorPos, clampCursorPos } from './05-store.js';
import { fullTime, renderList } from './06-doc-list.js';
import { openVisual } from './08-visual.js';
import { ensureRichDiskPath } from './09-rich-save.js';
import { updatePreviewVisibility, updateStatus } from './10-status-preview.js';
import { dirOf, getApi, hasApi } from './13-api-path.js';
import { saveDiskDoc, toast } from './16-doc-ops.js';
import { renderBacklinks } from './21-backlinks.js';
  /* ---------------- 渲染：编辑区 ---------------- */
  // v0.20.35：原型信息面板（属性 + 动态大纲）更新
  function updateInfoPanel(d, kind) {
    var fmtName = { text: '纯文本', markdown: 'Markdown', rich: '富文档',
      flow: '流程图', mind: '思维导图', note: '思维笔记' }[kind] || '纯文本';
    var langName = { plaintext: '纯文本', markdown: 'Markdown', json: 'JSON', xml: 'XML',
      html: 'HTML', javascript: 'JavaScript', python: 'Python', css: 'CSS', sql: 'SQL',
      yaml: 'YAML', shell: 'Shell', clike: 'C/Java', mermaid: 'Mermaid' }[d.lang] || '纯文本';
    var shownFmt = kind === 'text' ? langName : fmtName;
    // v0.20.44：content 可能是字符串（文本文档）或数组（块/行），分别处理，避免 reduce 报错
    var _content = d.content;
    var _linesNum = d.lines;
    if (typeof _linesNum !== 'number') {
      _linesNum = Array.isArray(_content) ? _content.length
        : (typeof _content === 'string' ? _content.split('\n').length : 0);
    }
    var lines = _linesNum;
    var chars = d.chars;
    if (typeof chars !== 'number') {
      if (Array.isArray(_content)) {
        chars = _content.reduce(function (s, l) { return s + (l && l.text ? l.text : String(l || '')).length; }, 0);
      } else if (typeof _content === 'string') {
        chars = _content.length;
      } else {
        chars = 0;
      }
    }

    var pFormat = document.getElementById('pFormat');
    var pEnc = document.getElementById('pEnc');
    var pPath = document.getElementById('pPath');
    var pLines = document.getElementById('pLines');
    var pChars = document.getElementById('pChars');
    var metaFormat = document.getElementById('metaFormat');
    var metaStat = document.getElementById('metaStat');
    if (pFormat) pFormat.textContent = shownFmt;
    if (pEnc) pEnc.textContent = d.diskPath ? (d.encoding || 'UTF-8') : 'UTF-8';
    // 位置：磁盘文件显示所在目录，title 显示完整路径；本地文档显示占位
    if (pPath) {
      pPath.textContent = d.diskPath ? dirOf(d.diskPath) || '/' : '本地文档';
      pPath.title = d.diskPath || '';
    }
    if (pLines) pLines.textContent = kind === 'rich' ? (d.blocks ? d.blocks.length + ' 块' : '—') : lines;
    if (pChars) pChars.textContent = chars;
    if (metaFormat) metaFormat.textContent = shownFmt;
    if (metaStat) metaStat.textContent = kind === 'rich'
      ? ((d.blocks ? d.blocks.length : 0) + ' 块 · ' + chars + ' 字符')
      : (lines + ' 行 · ' + chars + ' 字符');

    // App Bar 模式图标
    if (els.breadcrumb) els.breadcrumb.textContent = kind === 'diagram' ? '📊' : (kind === 'rich' ? '📝' : '📝');

    // 大纲卡片：经典文档显示行大纲；富文档由底部飞书式大纲接管（清空）
    var outlineCard = document.getElementById('outlineCard');
    if (outlineCard) {
      if (kind === 'rich') {
        outlineCard.innerHTML = '';
      } else {
        // content 可能是字符串：按行拆分；数组：直接取行对象
        var _rows = Array.isArray(_content) ? _content
          : (typeof _content === 'string' ? _content.split('\n') : []);
        var items = _rows.slice(0, 12).map(function (l, i) {
          var txt = (l.text || l) + '';
          if (txt.indexOf('#') === 0 || /^[A-Za-z0-9_ ]{0,3}[：:]\s/.test(txt)) {
            var indent = txt.indexOf('##') === 0 ? ' indent' : '';
            var safe = txt.replace(/</g, '&lt;');
            return '<div class="outline-item' + indent + '" onclick="goLine(' + (i + 1) + ')">' +
              '<svg class="ol-icon" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>' +
              '<span class="ol-text">' + (safe.slice(0, 24) || '（空行）') + '</span></div>';
          }
          return '';
        }).join('');
        outlineCard.innerHTML = items
          ? '<div class="card-title"><svg viewBox="0 0 24 24"><path d="M3 9h14V7H3v2zm0 4h14v-2H3v2zm0 4h14v-2H3v2z"/></svg>大纲</div>' + items
          : '<div class="card-title"><svg viewBox="0 0 24 24"><path d="M3 9h14V7H3v2zm0 4h14v-2H3v2zm0 4h14v-2H3v2z"/></svg>大纲</div><div style="font-size:12px;color:var(--text-faint);padding:4px 8px">暂无标题行<br><small>以「#」开头的行会出现在这里</small></div>';
      }
    }

    // 反向链接卡片（Obsidian 风格）：随当前文档切换刷新
    renderBacklinks(d);
  }

  // v0.20.35：信息面板大纲点击 → 跳转到对应行
  function goLine(n) {
    try {
      if (cm && cm.setCursor) { cm.setCursor({ line: n - 1, ch: 0 }); cm.focus(); }
      else {
        var codeScroll = document.getElementById('codeScroll');
        var lines = document.querySelectorAll('#codeLines .code-line');
        if (lines[n - 1] && codeScroll) {
          codeScroll.scrollTop = lines[n - 1].offsetTop - 40;
        }
      }
      var items = document.querySelectorAll('#outlineCard .outline-item');
      Array.prototype.forEach.call(items, function (o) { o.classList.remove('active'); });
      var ev = window.event;
      if (ev && ev.currentTarget) ev.currentTarget.classList.add('active');
    } catch (e) {}
  }

  // 打开 / 刷新文本文档后，把光标恢复到上次离开时的位置并滚动到可见处
  function restoreCursor(d, text) {
    if (!d || !cm || !cm.setCursor) return;
    var saved = loadCursorPos(d.id);
    if (!saved) return;
    var pos = clampCursorPos(saved, text);
    cm.setCursor(pos);
    cm.scrollIntoView(pos);
  }

  function openDoc(id) {
    // 切换前记住上一个文本文档的光标位置（重新打开该文档时恢复，而不是回到开头）
    var prevD = activeDoc();
    if (prevD && prevD.id !== id && cm && (!prevD.kind || prevD.kind === 'text')) {
      saveCursorPos(prevD.id, cm.getCursor());
    }
    state.activeId = id;
    var d = activeDoc();
    if (!d) return;
    persist();

    var kind = d.kind || 'text';

    // 切换文档前销毁上一个可视化编辑器（解绑全局事件）
    if (state.currentVisual && state.currentVisual.module) state.currentVisual.module.destroy();
    state.currentVisual = null;
    // 关闭上一个富文档编辑器
    if (window.InkpadBlocks && els.richPane && els.richPane.style.display !== 'none') {
      window.InkpadBlocks.close();
    }

    els.editorPane.style.display = kind === 'text' ? 'flex' : 'none';
    els.visualPane.style.display = (kind === 'flow' || kind === 'mind' || kind === 'note') ? 'flex' : 'none';
    els.richPane.style.display = kind === 'rich' ? 'flex' : 'none';
    // 文本类工具仅对文本文档可见
    [els.langSelect, els.toolsWrap, els.toolsWrap2, els.btnFormatXml, els.btnFind, els.btnEncoding, els.btnCompare, els.btnTogglePreview].forEach(function (el) {
      el.style.display = kind === 'text' ? '' : 'none';
    });

    // 富文档专用：📑 大纲按钮只在富文档显示
    if (els.btnRichOutline) {
      els.btnRichOutline.style.display = kind === 'rich' ? '' : 'none';
    }
    // 离开富文档时强制收起大纲（避免其它模式的 layout 残留边栏）
    if (kind !== 'rich') {
      if (richOutline.visible) richOutlineVisible(false);
      if (richOutline.observer) {
        try { richOutline.observer.disconnect(); } catch (e) {}
        richOutline.observer = null;
      }
      richOutline.activeId = null;
    }

    els.title.value = d.title || '';
    // v0.20.35：原型信息面板 + App Bar 标题元信息
    updateInfoPanel(d, kind);
    // 预览按钮可见性：所有文档类型统一处理（富文档/可视化文档隐藏）
    updatePreviewBtn();
    // 元信息合并到底部状态栏
    els.statEdit.textContent = '最后编辑 ' + fullTime(d.updated || Date.now());
    if (d.diskPath) {
      els.statEnc.textContent = '磁盘文件 · ' + (d.encoding || 'UTF-8');
      els.statEditSep.style.display = '';
    } else {
      els.statEnc.textContent = '本地文档';
      els.statEditSep.style.display = 'none';
    }

    if (kind === 'rich') {
      els.previewPane.style.display = 'none';
      els.breadcrumb.textContent = '📝';
      els.statLang.textContent = '块编辑器';
      els.statCursor.textContent = '';
      els.btnInsertImage.style.display = 'none';
      if (window.InkpadBlocks) {
        var finishOpen = function () {
          window.InkpadBlocks.open(els.richCanvas, d);
          renderList();
        };
        // 优先从磁盘文件读取最新内容（富文档正文可能超出本地存储上限）。
        // 若 pywebview 桥尚未就绪（启动自动打开时），挂起等待 pywebviewready 后再读，
        // 否则外部修改过的磁盘内容不会被加载
        var loadFromDisk = function (cb) {
          if (!d.diskPath) { cb(); return; }
          var doRead = function () {
            getApi().read_text_file(d.diskPath).then(function (res) {
              if (res && res.content != null && res.content !== '') {
                try { JSON.parse(res.content); d.content = res.content; } catch (e) {}
              }
              cb();
            }).catch(function () { cb(); });
          };
          if (hasApi()) doRead();
          else {
            window.addEventListener('pywebviewready', function h() {
              window.removeEventListener('pywebviewready', h);
              doRead();
            }, { once: true });
          }
        };
        ensureRichDiskPath(d).then(function (assigned) {
          loadFromDisk(function () {
            finishOpen();
            if (assigned) { persist(); saveDiskDoc(d); }
          });
        });
      }
      return;
    }

    if (kind !== 'text') {
      els.previewPane.style.display = 'none';
      openVisual(d, kind);
      renderList();
      return;
    }

    cm.setValue(d.content || '');
    cm.setOption('mode', LANGS[d.lang] ? LANGS[d.lang].mime : 'text/plain');
    cm.clearHistory();
    restoreCursor(d, d.content || '');
    els.langSelect.value = d.lang || 'plaintext';

    var isDiagram = d.lang === 'mermaid';
    els.breadcrumb.textContent = isDiagram ? '📊' : '📝';
    els.statLang.textContent = LANGS[d.lang] ? LANGS[d.lang].label : '纯文本';
    els.btnTogglePreview.classList.toggle('active', isDiagram && state.previewOn);

    updatePreviewVisibility();
    updateStatus();
    renderList();
    // 有磁盘路径的文本文档：打开时异步重读磁盘最新内容（外部软件可能已修改过文件）
    refreshTextDocFromDisk(d);
  }

  // 【磁盘刷新】文本文档打开时从磁盘重读最新内容：
  // - 磁盘与内存一致 → 忽略（避免每次打开都闪动/清撤销历史）
  // - 磁盘更新且用户未在读取期间编辑 → 应用磁盘版本并提示
  // - 磁盘更新但用户已开始输入 → 保留本地未保存内容并提示
  // - 已切走其它文档 → 仅静默更新内存 + 持久化
  function refreshTextDocFromDisk(d) {
    if (!d || d.kind === 'rich' || !d.diskPath) return;
    // pywebviewready 尚未触发（启动自动打开文档时常见）：挂起等待就绪后重试，
    // 否则磁盘刷新会因 hasApi()=false 被静默跳过，导致启动时仍显示旧内容
    if (!hasApi()) {
      window.addEventListener('pywebviewready', function h() {
        window.removeEventListener('pywebviewready', h);
        refreshTextDocFromDisk(d);
      }, { once: true });
      return;
    }
    var prev = d.content || '';
    getApi().read_text_file(d.diskPath).then(function (res) {
      if (!res || res.error) return;
      var diskContent = res.content == null ? '' : res.content;
      if (diskContent === prev) return; // 磁盘与内存一致，无需处理
      var isCurrent = activeDoc() === d;
      if (isCurrent && cm.getValue() === prev) {
        // 磁盘有更新、用户没在读取期间修改 → 应用磁盘最新版本
        d.content = diskContent;
        d.encoding = res.encoding || d.encoding || 'UTF-8';
        d.updated = Date.now();
        persist();
        cm.setValue(diskContent);
        cm.setOption('mode', LANGS[d.lang] ? LANGS[d.lang].mime : 'text/plain');
        cm.clearHistory();
        restoreCursor(d, diskContent);
        updatePreviewVisibility();
        updateStatus();
        renderList();
        toast('检测到磁盘内容已更新，已加载最新版本', 'info');
      } else if (isCurrent) {
        toast('磁盘内容已变化，但当前存在未保存修改，已保留本地内容', 'warn');
      } else {
        // 已切到其它文档：静默更新内存 + 持久化
        d.content = diskContent;
        d.encoding = res.encoding || d.encoding || 'UTF-8';
        d.updated = Date.now();
        persist();
      }
    }).catch(function () {});
  }

  // 【富文档磁盘刷新】富文档（块编辑器）打开时 / 窗口聚焦时重读磁盘最新内容：
  // - 磁盘与编辑器当前块模型一致 → 忽略（用户刚自动保存过）
  // - 磁盘更新且用户未在编辑 → 重新加载块编辑器渲染最新版本并提示
  // - 磁盘更新但用户正在编辑 → 保留本地未保存内容并提示
  function refreshRichDocFromDisk(d) {
    if (!d || d.kind !== 'rich' || !d.diskPath) return;
    if (!hasApi()) {
      window.addEventListener('pywebviewready', function h() {
        window.removeEventListener('pywebviewready', h);
        refreshRichDocFromDisk(d);
      }, { once: true });
      return;
    }
    var prev = d.content || '';
    getApi().read_text_file(d.diskPath).then(function (res) {
      if (!res || res.error) return;
      var diskContent = res.content == null ? '' : res.content;
      if (diskContent === prev) return; // 磁盘与内存一致
      var isCurrent = activeDoc() === d;
      if (!isCurrent) {
        // 已切走：仅更新内存 + 持久化（下次打开时由 openDoc 渲染）
        d.content = diskContent;
        d.updated = Date.now();
        persist();
        return;
      }
      var cur = '';
      try { cur = window.InkpadBlocks ? window.InkpadBlocks.serialize() : prev; } catch (e) {}
      // 规范化比较（忽略空格/缩进差异）：JSON 解析后逐字比较，避免把格式差异误判为用户编辑
      var norm = function (s) { try { return JSON.stringify(JSON.parse(s)); } catch (e) { return s; } };
      if (norm(diskContent) === norm(cur)) return;  // 磁盘与编辑器当前内容一致（用户刚保存）
      if (norm(cur) !== norm(prev)) {
        // 用户正在编辑（块模型已偏离上次内存）→ 保留本地
        toast('磁盘内容已变化，但当前存在未保存修改，已保留本地内容', 'warn');
        return;
      }
      // 应用磁盘最新版本并重新渲染块编辑器
      d.content = diskContent;
      d.encoding = res.encoding || d.encoding || 'utf-8';
      d.updated = Date.now();
      persist();
      window.InkpadBlocks.open(els.richCanvas, d);
      renderList();
      toast('检测到磁盘内容已更新，已加载最新版本', 'info');
    }).catch(function () {});
  }

  // 统一磁盘刷新入口：文本文档 / 富文档都从磁盘读取最新内容
  function refreshDocFromDisk(d) {
    if (!d) return;
    if (d.kind === 'rich') refreshRichDocFromDisk(d);
    else refreshTextDocFromDisk(d);
  }

  // 预览按钮仅对 Markdown / HTML 文档显示（顶栏右上角）
  function updatePreviewBtn() {
    var d = activeDoc();
    var ok = d && (d.lang === 'markdown' || d.lang === 'html');
    els.btnPreviewTop.style.display = ok ? '' : 'none';
    els.btnInsertImage.style.display = (d && (d.lang === 'markdown' || d.lang === 'html')) ? '' : 'none';
  }
