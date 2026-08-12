/* [esm] 导出本模块顶层绑定 */
export { saveDiskDoc, openEncModal, openCompareWindow, setLang, newDoc, exportDoc, importFile, toastTimer, toast };
/* [esm] 导入依赖模块绑定 */
import { $, LANGS, els, state } from './01-core.js';
import { cm } from './04-editor-init.js';
import { activeDoc, persist, uid } from './05-store.js';
import { openDoc, updatePreviewBtn } from './07-doc-open.js';
import { syncFromEditor } from './09-rich-save.js';
import { updatePreviewVisibility } from './10-status-preview.js';
import { getApi, hasApi, isRichDocContent } from './13-api-path.js';
import { openSingleModal } from './15-insert.js';
  function saveDiskDoc(d) {
    if (!d || !d.diskPath || !hasApi()) return;
    getApi().write_text_file(d.diskPath, d.content, d.encoding).then(function (ok) {
      if (ok) {
        els.statSaved.textContent = '已保存到磁盘';
        els.statSaved.style.color = '#0f7b0f';
      }
    }).catch(function () {
      els.statSaved.textContent = '磁盘保存失败';
      els.statSaved.style.color = 'var(--danger)';
    });
  }

  /* ---------------- 编码转换弹窗 ---------------- */
  function openEncModal() {
    var d = activeDoc();
    if (!d || (d.kind && d.kind !== 'text')) { toast('请先打开文本文档', 'error'); return; }
    $('enc-current').textContent = d.diskPath ? ('磁盘文件 · ' + (d.encoding || 'UTF-8')) : '本地文档（未关联磁盘文件）';
    var sel = $('enc-select');
    var cur = d.encoding || 'UTF-8';
    var matched = false;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === cur) { sel.selectedIndex = i; matched = true; break; }
    }
    if (!matched) sel.selectedIndex = 0;
    $('enc-reload').disabled = !d.diskPath;
    openSingleModal('enc-modal');
  }

  /* ---------------- 文件比较（独立窗口） ---------------- */
  function openCompareWindow() {
    if (!hasApi()) { toast('文件比较需在桌面版中使用', 'error'); return; }
    // 当前文本文档自动作为 A 侧带入，B 侧留空可粘贴/加载
    var d = activeDoc();
    var aText = '', aName = '文件 A';
    if (d && (!d.kind || d.kind === 'text')) {
      aText = cm.getValue();
      aName = (d.title || '当前文档') + '（当前文档）';
    }
    getApi().open_compare_window(aText, aName, '', '文件 B').then(function (ok) {
      if (ok) toast('比较窗口已打开，可直接粘贴内容对比', 'success');
      else toast('新窗口打开失败，请重试', 'error');
    }).catch(function () { toast('新窗口打开失败，请重试', 'error'); });
  }

  /* ---------------- 文档操作 ---------------- */
  function setLang(lang) {
    var d = activeDoc();
    if (!d) return;
    d.lang = lang;
    cm.setOption('mode', LANGS[lang] ? LANGS[lang].mime : 'text/plain');
    els.langSelect.value = lang;
    els.statLang.textContent = LANGS[lang] ? LANGS[lang].label : '纯文本';
    els.breadcrumb.textContent = lang === 'mermaid' ? '📊 图表' : '📝 文档';
    syncFromEditor();
    updatePreviewBtn();
    updatePreviewVisibility();
  }

  function newDoc(lang, title, content) {
    var d = {
      id: uid(),
      title: title || '',
      lang: lang || 'plaintext',
      content: content || '',
      updated: Date.now()
    };
    state.docs.push(d);
    persist();
    openDoc(d.id);
    if (!title) els.title.focus();
    return d;
  }

  function exportDoc() {
    var d = activeDoc();
    if (!d) return;
    // 富文档：序列化为 Markdown 导出（块编辑器自带 toMarkdown）
    if (d.kind === 'rich') {
      var md = window.InkpadBlocks ? window.InkpadBlocks.toMarkdown() : d.content;
      var rname = (d.title || '未命名').replace(/[\\/:*?"<>|]/g, '_') + '.md';
      if (window.pywebview && window.pywebview.api && window.pywebview.api.save_file) {
        window.pywebview.api.save_file(rname, md).then(function (saved) { if (saved) toast('已导出到 ' + saved, 'success'); }).catch(function () { toast('导出失败', 'error'); });
      } else {
        var rblob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        var ra = document.createElement('a'); ra.href = URL.createObjectURL(rblob); ra.download = rname; ra.click(); URL.revokeObjectURL(ra.href);
        toast('已导出 ' + rname, 'success');
      }
      return;
    }
    var isVisualDoc = d.kind && d.kind !== 'text';
    if (isVisualDoc && state.currentVisual) {
      d.content = JSON.stringify(state.currentVisual.model);
    }
    var ext = isVisualDoc ? '.json' : (LANGS[d.lang] ? LANGS[d.lang].ext : '.txt');
    var name = (d.title || '未命名').replace(/[\\/:*?"<>|]/g, '_') + ext;
    var content = isVisualDoc ? d.content : cm.getValue();

    // 桌面版（pywebview）：走原生「另存为」对话框
    if (window.pywebview && window.pywebview.api && window.pywebview.api.save_file) {
      window.pywebview.api.save_file(name, content).then(function (saved) {
        if (saved) toast('已导出到 ' + saved, 'success');
      }).catch(function () {
        toast('导出失败', 'error');
      });
      return;
    }

    // 浏览器降级方案：Blob 下载
    var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('已导出 ' + name, 'success');
  }

  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var content = String(reader.result || '');
      var name = file.name.replace(/\.[^.]+$/, '');
      var ext = (file.name.match(/\.([^.]+)$/) || [])[1] || '';

      // 【v0.18】.json 内容若符合 Inkpad 富文档块数组格式 → 当富文档导入
      if (ext.toLowerCase() === 'json' && isRichDocContent(content)) {
        var d2 = {
          id: uid(),
          title: name,
          kind: 'rich',
          encoding: 'utf-8',
          content: content,
          updated: Date.now()
        };
        state.docs.push(d2);
        persist();
        openDoc(d2.id);
        toast('已导入富文档：' + file.name, 'success');
        return;
      }

      var langMap = {
        md: 'markdown', markdown: 'markdown', json: 'json', xml: 'xml', html: 'html', htm: 'html',
        js: 'javascript', mjs: 'javascript', py: 'python', css: 'css', sql: 'sql',
        yaml: 'yaml', yml: 'yaml', sh: 'shell', bat: 'shell', mmd: 'mermaid', mermaid: 'mermaid',
        c: 'clike', h: 'clike', java: 'clike', cpp: 'clike', cc: 'clike', hpp: 'clike', cs: 'clike',
        txt: 'plaintext', log: 'plaintext', xhtml: 'html'
      };
      var d = newDoc(langMap[ext.toLowerCase()] || 'plaintext', name, content);
      toast('已导入「' + file.name + '」', 'success');
      // 导入 HTML 文件后默认自动打开预览
      if (d.lang === 'html') state.previewOn = true;
      openDoc(d.id);
    };
    reader.readAsText(file);
  }

  /* ---------------- Toast ---------------- */
  var toastTimer = null;
  function toast(msg, type) {
    els.toast.textContent = msg;
    els.toast.className = 'show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.className = ''; }, 2600);
  }
