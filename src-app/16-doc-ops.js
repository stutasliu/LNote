/* [esm] 导出本模块顶层绑定 */
export { saveDiskDoc, openEncModal, openCompareWindow, setLang, newDoc, exportDoc, importFile, toastTimer, toast, renameDoc, duplicateDoc, exportDocById, toggleFavorite, togglePin, newSticky, saveSticky, findDoc, saveDocTags, collectAllTags, createCollection, renameCollection, deleteCollection, addDocsToCollection, removeDocFromCollection, findCollection, openStickyEditor, setTagExpiry, clearTagExpiry, cleanupExpiredTags, matchReminder, toLocalInput, fromLocalInput, fmtStamp };
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
  function setLang(lang, skipAutoFormat) {
    var d = activeDoc();
    if (!d) return;
    d.lang = lang;
    // v0.20.45：顶部语言切换为 JSON 时，自动序列化/格式化当前内容（仅文本类文档）。
    // skipAutoFormat=true 用于工具已自行格式化后（如 JSON 格式化 / 压缩），避免二次处理。
    if (lang === 'json' && !skipAutoFormat && (!d.kind || d.kind === 'text')) {
      var raw = cm.getValue();
      if (raw.trim()) {
        try {
          cm.setValue(JSON.stringify(JSON.parse(raw.trim()), null, 2));
          toast('已自动格式化 JSON ✓', 'success');
        } catch (e) {
          toast('内容不是合法 JSON，已切换语言（未格式化）', 'error');
        }
      }
    }
    cm.setOption('mode', LANGS[lang] ? LANGS[lang].mime : 'text/plain');
    els.langSelect.value = lang;
    els.statLang.textContent = LANGS[lang] ? LANGS[lang].label : '纯文本';
    els.breadcrumb.textContent = lang === 'mermaid' ? '📊' : '📝';
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

  /* ---------------- 单文档操作（按 id） ---------------- */

  // 根据 id 找文档
  function findDoc(id) {
    for (var i = 0; i < state.docs.length; i++) {
      if (state.docs[i].id === id) return state.docs[i];
    }
    return null;
  }

  // 重命名文档
  function renameDoc(id, newTitle) {
    var d = findDoc(id);
    if (!d) return false;
    d.title = newTitle || '无标题';
    d.updated = Date.now();
    persist();
    return true;
  }

  // 创建副本
  function duplicateDoc(id) {
    var d = findDoc(id);
    if (!d) return null;
    var copy = {
      id: uid(),
      title: (d.title || '无标题') + '（副本）',
      lang: d.lang,
      content: d.content || '',
      updated: Date.now()
    };
    if (d.kind) copy.kind = d.kind;
    if (d.encoding) copy.encoding = d.encoding;
    state.docs.push(copy);
    persist();
    return copy;
  }

  // 按 id 导出单文档（支持富文档/文本/可视化）
  function exportDocById(id) {
    var d = findDoc(id);
    if (!d) { toast('文档不存在', 'error'); return; }
    // 富文档
    if (d.kind === 'rich') {
      var md = d.content || '';
      var rname = (d.title || '未命名').replace(/[\\/:*?"<>|]/g, '_') + '.md';
      if (window.pywebview && window.pywebview.api && window.pywebview.api.save_file) {
        window.pywebview.api.save_file(rname, md).then(function (saved) {
          if (saved) toast('已导出到 ' + saved, 'success');
        }).catch(function () { toast('导出失败', 'error'); });
      } else {
        var rblob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        var ra = document.createElement('a'); ra.href = URL.createObjectURL(rblob); ra.download = rname; ra.click(); URL.revokeObjectURL(ra.href);
        toast('已导出 ' + rname, 'success');
      }
      return;
    }
    var isVisualDoc = d.kind && d.kind !== 'text';
    var ext = isVisualDoc ? '.json' : (LANGS[d.lang] ? LANGS[d.lang].ext : '.txt');
    var name = (d.title || '未命名').replace(/[\\/:*?"<>|]/g, '_') + ext;
    var content = d.content || '';
    if (window.pywebview && window.pywebview.api && window.pywebview.api.save_file) {
      window.pywebview.api.save_file(name, content).then(function (saved) {
        if (saved) toast('已导出到 ' + saved, 'success');
      }).catch(function () { toast('导出失败', 'error'); });
    } else {
      var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('已导出 ' + name, 'success');
    }
  }

  // 切换收藏
  function toggleFavorite(id) {
    var d = findDoc(id);
    if (!d) return false;
    d.favorite = !d.favorite;
    d.updated = Date.now();
    persist();
    return d.favorite;
  }

  // 切换置顶
  function togglePin(id) {
    var d = findDoc(id);
    if (!d) return false;
    d.pinned = !d.pinned;
    d.updated = Date.now();
    persist();
    return d.pinned;
  }

  /* ================= 便签模块：便利贴 / 标签 / 便签集 ================= */

  // 新建便利贴
  function newSticky() {
    var d = {
      id: uid(),
      title: '',
      kind: 'sticky',
      content: '',
      color: '#FFD43B',
      updated: Date.now()
    };
    state.docs.push(d);
    persist();
    state.stickyEditId = d.id;
    state.stickyColor = d.color || '#FFD43B';
    // 切到便利贴视图并打开编辑浮层（不设置 activeId，避免主编辑器被便利贴接管）
    state.docFilter = 'sticky';
    state.tagFilter = null;
    state.colFilter = null;
    openStickyEditor(d);
    return d;
  }

  // 保存便利贴（失焦 / 保存按钮调用）
  function saveSticky(id, opts) {
    var d = findDoc(id);
    if (!d || d.kind !== 'sticky') return false;
    if (opts.title !== undefined) d.title = opts.title;
    if (opts.content !== undefined) d.content = opts.content;
    if (opts.color !== undefined) d.color = opts.color;
    if (opts.pinned !== undefined) d.pinned = !!opts.pinned;
    if (opts.reminder !== undefined) {
      if (opts.reminder && opts.reminder.enabled) d.reminder = opts.reminder;
      else delete d.reminder;
    }
    if (opts.dueAt !== undefined) {
      if (opts.dueAt) d.dueAt = opts.dueAt;
      else delete d.dueAt;
    }
    d.updated = Date.now();
    persist();
    return true;
  }

  // 打开便利贴编辑浮层（填充标题/正文/颜色/置顶/提醒/到期）
  function openStickyEditor(d) {
    if (!els.stickyEditModal) return;
    els.stickyEditTitle.value = d.title || '';
    els.stickyEditContent.value = d.content || '';
    els.stickyEditPin.checked = !!d.pinned;
    state.stickyColor = d.color || '#FFD43B';
    // 高亮当前颜色
    Array.prototype.forEach.call(els.stickyColorRow.children, function (el) {
      el.classList.toggle('active', el.getAttribute('data-color') === state.stickyColor);
    });
    // 定时提醒
    var rem = d.reminder;
    if (els.stickyEditRemEnabled) {
      els.stickyEditRemEnabled.checked = !!(rem && rem.enabled);
      els.stickyRemRow.style.display = (rem && rem.enabled) ? '' : 'none';
      els.stickyEditRemType.value = (rem && rem.type) || 'once';
      els.stickyEditRemTime.value = (rem && rem.time) || '09:00';
      els.stickyEditRemDate.value = (rem && rem.date) || '';
      els.stickyEditRemDay.value = (rem && rem.day) || '';
      // 每周复选框
      Array.prototype.forEach.call(els.stickyRemWeekly.querySelectorAll('input[type=checkbox]'), function (cb) {
        cb.checked = !!(rem && rem.type === 'weekly' && rem.days && rem.days.indexOf(Number(cb.value)) >= 0);
      });
      syncRemSubUI();
    }
    // 到期时间
    if (els.stickyEditDue) els.stickyEditDue.value = d.dueAt ? toLocalInput(d.dueAt) : '';
    els.stickyEditModal.style.display = 'flex';
  }

  // 根据提醒类型显示对应子区域（单次日期 / 每周 / 每月）
  function syncRemSubUI() {
    if (!els.stickyEditRemType) return;
    var t = els.stickyEditRemType.value;
    if (els.stickyRemOnce) els.stickyRemOnce.style.display = t === 'once' ? '' : 'none';
    if (els.stickyRemWeekly) els.stickyRemWeekly.style.display = t === 'weekly' ? '' : 'none';
    if (els.stickyRemMonthly) els.stickyRemMonthly.style.display = t === 'monthly' ? '' : 'none';
  }

  /* ---------------- 定时标签：时间工具 + 标签过期 ---------------- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // 时间戳 → datetime-local 输入值（YYYY-MM-DDTHH:mm）
  function toLocalInput(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  // datetime-local 值 → 时间戳
  function fromLocalInput(v) {
    if (!v) return null;
    var t = new Date(v).getTime();
    return isNaN(t) ? null : t;
  }

  // 格式化时间戳为可读文本
  function fmtStamp(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  // 设置标签过期时间（days 天后过期；days=null 清除）
  function setTagExpiry(tag, days) {
    if (days == null) { clearTagExpiry(tag); return; }
    var n = Number(days);
    if (isNaN(n) || n < 1) { toast('请输入有效的天数（≥1）', 'error'); return; }
    state.tagMeta[tag] = { expiresAt: Date.now() + n * 86400000 };
    persist();
    toast('标签 #' + tag + ' 将于 ' + n + ' 天后过期', 'success');
  }

  function clearTagExpiry(tag) {
    if (state.tagMeta[tag]) {
      delete state.tagMeta[tag];
      persist();
      toast('已清除标签 #' + tag + ' 的过期时间', 'success');
    }
  }

  // 清理已过期标签：解除全部文档关联并删除元数据；返回被清理的标签数组
  function cleanupExpiredTags() {
    var now = Date.now();
    var expired = [];
    for (var t in state.tagMeta) {
      if (state.tagMeta[t] && state.tagMeta[t].expiresAt && state.tagMeta[t].expiresAt < now) {
        expired.push(t);
      }
    }
    if (!expired.length) return [];
    var changed = false;
    state.docs.forEach(function (d) {
      if (!d.tags || !d.tags.length) return;
      var before = d.tags.length;
      d.tags = d.tags.filter(function (x) { return expired.indexOf(x) < 0; });
      if (d.tags.length !== before) changed = true;
    });
    expired.forEach(function (t) { delete state.tagMeta[t]; });
    if (changed) {
      persist();
      toast('已自动清理过期标签：#' + expired.join(' #'), 'success');
    } else {
      persist();
    }
    return expired;
  }

  // 判断便利贴提醒是否命中当前时刻
  function matchReminder(rem, now) {
    if (!rem || !rem.enabled) return false;
    now = now || new Date();
    var hhmm = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    if (rem.time !== hhmm) return false;
    if (rem.type === 'once') {
      return rem.date === (now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()));
    }
    if (rem.type === 'daily') return true;
    if (rem.type === 'weekly') {
      return !!(rem.days && rem.days.indexOf(now.getDay()) >= 0);
    }
    if (rem.type === 'monthly') {
      return Number(rem.day) === now.getDate();
    }
    return false;
  }

  // 保存文档标签
  function saveDocTags(id, tags) {
    var d = findDoc(id);
    if (!d) return false;
    d.tags = tags.slice();
    d.updated = Date.now();
    persist();
    return true;
  }

  // 汇总全部标签（去重 + 计数）
  function collectAllTags() {
    var map = {};
    state.docs.forEach(function (d) {
      if (d.deleted || d.kind === 'sticky') return;
      (d.tags || []).forEach(function (t) {
        map[t] = (map[t] || 0) + 1;
      });
    });
    return map;
  }

  // 便签集操作
  function findCollection(id) {
    for (var i = 0; i < state.collections.length; i++) {
      if (state.collections[i].id === id) return state.collections[i];
    }
    return null;
  }

  function createCollection(name) {
    name = (name || '').trim();
    if (!name) { toast('便签集名称不能为空', 'error'); return null; }
    if (name.length > 20) { toast('名称最长 20 字', 'error'); return null; }
    var col = { id: uid(), name: name, docIds: [] };
    state.collections.push(col);
    persist();
    return col;
  }

  function renameCollection(id, name) {
    var col = findCollection(id);
    name = (name || '').trim();
    if (!col) return false;
    if (!name) { toast('名称不能为空', 'error'); return false; }
    col.name = name;
    persist();
    return true;
  }

  function deleteCollection(id) {
    for (var i = 0; i < state.collections.length; i++) {
      if (state.collections[i].id === id) {
        state.collections.splice(i, 1);
        // 若正在浏览该集合，退出集合过滤
        if (state.colFilter === id) { state.colFilter = null; }
        persist();
        return true;
      }
    }
    return false;
  }

  // 将一批文档加入集合
  function addDocsToCollection(colId, docIds) {
    var col = findCollection(colId);
    if (!col || !docIds || !docIds.length) return false;
    var added = 0;
    docIds.forEach(function (id) {
      if (col.docIds.indexOf(id) < 0) { col.docIds.push(id); added++; }
    });
    if (added) persist();
    return added > 0;
  }

  // 从集合移除文档
  function removeDocFromCollection(colId, docId) {
    var col = findCollection(colId);
    if (!col) return false;
    var idx = col.docIds.indexOf(docId);
    if (idx < 0) return false;
    col.docIds.splice(idx, 1);
    persist();
    return true;
  }
