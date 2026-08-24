/* [esm] 导出本模块顶层绑定 */
export { openDocFile, openDocFromData, closeDocModal, extractDocText, importDocAsRich, importDocAsText };
/* [esm] 导入依赖模块绑定 */
import { els, state } from './01-core.js';
import { persist, uid } from './05-store.js';
import { openDoc } from './07-doc-open.js';
import { copyToClipboard } from './11-format-tools.js';
import { getApi, hasApi, normPath } from './13-api-path.js';
  var toastTimer = null;
  function toast(msg, type) {
    els.toast.textContent = msg;
    els.toast.className = 'show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.className = ''; }, 2600);
  }
  var docSess = 0;
  var docState = { html: '', text: '', path: '', name: '', ext: '', busy: false };

  function _showDocModal() {
    var all = document.querySelectorAll('.modal-overlay, #fr-overlay');
    Array.prototype.forEach.call(all, function (el) {
      if (el.id !== 'doc-modal') el.style.display = 'none';
    });
    els.docModal.style.display = 'flex';
    els.docStage.scrollTop = 0;
  }
  function docLoading(on) {
    if (on) {
      els.docBody.innerHTML = '<div class="doc-loading">正在加载文档…</div>';
    } else {
      var l = els.docBody.querySelector('.doc-loading');
      if (l && l.parentNode) l.parentNode.removeChild(l);
    }
  }
  function docError(msg) {
    els.docBody.innerHTML = '<div class="doc-error">' + (msg || '加载失败') + '</div>';
  }
  function base64ToArrayBuffer(b64) {
    var bin = atob(b64);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  // 把 .docx 的 ArrayBuffer 交给 mammoth 渲染 HTML + 提取纯文本（两者并行）
  function loadWithMammoth(buf, sess) {
    if (!window.__docReady) { docError('文档解析器未就绪'); return; }
    docLoading(true);
    window.__docReady(function (err) {
      if (sess !== docSess) return;
      if (err || !window.mammoth) { docError('文档解析器加载失败'); return; }
      window.mammoth.convertToHtml({ arrayBuffer: buf }).then(function (res) {
        if (sess !== docSess) return;
        docLoading(false);
        var html = res.value || '';
        docState.html = html;
        if (html.trim()) {
          els.docBody.innerHTML = '<div class="doc-content">' + html + '</div>';
        } else {
          docError('未能解析出文档内容，文件可能不是有效的 .docx');
        }
        updateDocBar();
      }).catch(function (e) {
        if (sess !== docSess) return;
        if (getApi() && getApi().debug_log) getApi().debug_log('[doc] convertToHtml error: ' + (e && e.message ? e.message : String(e)));
        docError('文档解析失败：文件可能不是有效的 .docx');
        updateDocBar();
      });
      window.mammoth.extractRawText({ arrayBuffer: buf }).then(function (res) {
        if (sess !== docSess) return;
        docState.text = String(res.value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n');
        updateDocBar();
      }).catch(function () {
        if (sess !== docSess) return;
        docState.text = '';
      });
    });
  }
  function updateDocBar() {
    if (els.docPageInfo) {
      els.docPageInfo.textContent = docState.text
        ? docState.text.length + ' 字'
        : (docState.html ? '解析中…' : '');
    }
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // 把后端提取的 .doc 纯文本渲染进查看器（含会话防竞态）
  function loadOldDocText(text, sess) {
    if (sess !== docSess) return;
    docLoading(false);
    var t = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n');
    docState.text = t;
    if (t.trim()) {
      var html = t.split('\n').map(function (line) {
        return escapeHtml(line) || '<br>';
      }).join('<br>');
      els.docBody.innerHTML = '<div class="doc-content"><pre class="doc-plain">' + html + '</pre></div>';
    } else {
      docError('未能解析出文档内容，文件可能不是有效的 .doc');
    }
    updateDocBar();
  }
  // 登记为 kind:'doc' 文档条目（侧栏可再次打开；复用磁盘路径避免重复条目）
  function registerDocEntry(path, name) {
    var key = normPath(path).toLowerCase();
    for (var i = 0; i < state.docs.length; i++) {
      var x = state.docs[i];
      if (x && x.kind === 'doc' && x.diskPath && normPath(x.diskPath).toLowerCase() === key) {
        x.updated = Date.now();
        persist();
        return x;
      }
    }
    var d = {
      id: uid(),
      title: (name || 'Word 文档').replace(/\.(docx|doc)$/i, ''),
      kind: 'doc',
      lang: 'doc',
      encoding: 'binary',
      diskPath: path,
      updated: Date.now()
    };
    state.docs.push(d);
    persist();
    return d;
  }
  function openDocFile(path, name) {
    if (!path) { toast('Word 文档缺少磁盘路径', 'error'); return null; }
    var entry = registerDocEntry(path, name);
    if (!hasApi()) {
      window.addEventListener('pywebviewready', function h() {
        window.removeEventListener('pywebviewready', h);
        openDocFile(path, name);
      }, { once: true });
      return entry ? entry.id : null;
    }
    var sess = ++docSess;
    docState.path = path;
    docState.name = name || path.replace(/\\/g, '/').split('/').pop() || 'Word 文档';
    docState.ext = ((name || '').match(/\.([^.]+)$/) || [])[1] || '';
    docState.ext = docState.ext.toLowerCase();
    docState.html = '';
    docState.text = '';
    els.docName.textContent = docState.name;
    docLoading(true);
    _showDocModal();
    if (docState.ext === 'doc') {
      getApi().read_doc_text(path).then(function (res) {
        if (sess !== docSess) return;
        if (!res || res.error) { docError(res && res.error ? String(res.error) : '解析失败'); updateDocBar(); return; }
        loadOldDocText(res.text || '', sess);
      }).catch(function () {
        if (sess !== docSess) return;
        docError('解析 .doc 文件失败');
        updateDocBar();
      });
      return entry ? entry.id : null;
    }
    getApi().read_file_b64(path).then(function (res) {
      if (sess !== docSess) return;
      if (!res || !res.b64) { docError('读取失败'); return; }
      loadWithMammoth(base64ToArrayBuffer(res.b64), sess);
    }).catch(function () {
      if (sess !== docSess) return;
      docError('读取文件失败');
    });
    return entry ? entry.id : null;
  }
  // 浏览器降级：FileReader 得到的 ArrayBuffer 直接预览（桌面版导入走 openDiskFile 登记磁盘路径）
  function openDocFromData(buf, name) {
    var sess = ++docSess;
    docState.path = '';
    docState.name = name || 'Word 文档';
    docState.ext = 'docx';
    docState.html = '';
    docState.text = '';
    els.docName.textContent = docState.name;
    docLoading(true);
    _showDocModal();
    loadWithMammoth(buf, sess);
  }
  function closeDocModal() {
    docSess++;
    els.docModal.style.display = 'none';
    els.docBody.innerHTML = '';
    els.docPageInfo.textContent = '';
    docState.html = '';
    docState.text = '';
    docState.path = '';
    docState.name = '';
    docState.ext = '';
  }
  // 全文（用于复制 / 导入迁移）；未加载完成返回空
  function extractDocText() {
    return Promise.resolve(docState.text || '');
  }
  // 把纯文本按行转成 Inkpad 富文档块（# 标题 / - 列表 / 1. 列表 / 正文）
  function textToBlocks(text) {
    var blocks = [];
    (String(text || '').split('\n')).forEach(function (line) {
      var t = line.replace(/\r$/, '');
      var trimmed = t.trim();
      if (!trimmed) return;
      var type = 'text';
      if (/^#{1,3}\s/.test(trimmed)) {
        type = 'h' + trimmed.match(/^#+/)[0].length;
        t = trimmed.replace(/^#+\s*/, '');
      } else if (/^[-*]\s/.test(trimmed)) {
        type = 'ulist'; t = trimmed.replace(/^[-*]\s*/, '');
      } else if (/^\d+[.、)]\s/.test(trimmed)) {
        type = 'olist'; t = trimmed.replace(/^\d+[.、)]\s*/, '');
      }
      blocks.push({ id: uid(), type: type, text: t });
    });
    if (!blocks.length) blocks.push({ id: uid(), type: 'text', text: '' });
    return blocks;
  }
  // 导入迁移：转为富文档（块编辑器）继续编辑
  function importDocAsRich() {
    return extractDocText().then(function (text) {
      if (!text || !text.trim()) { toast('未提取到文本（文档为空或尚未加载完成）', 'error'); return; }
      var name = (docState.name || 'Word 文档').replace(/\.(docx|doc)$/i, '');
      closeDocModal();
      var d = {
        id: uid(),
        title: name + '（导入）',
        kind: 'rich',
        encoding: 'utf-8',
        content: JSON.stringify(textToBlocks(text)),
        updated: Date.now()
      };
      state.docs.push(d);
      persist();
      openDoc(d.id);
      els.title.focus();
      toast('已导入为富文档，可继续编辑', 'success');
    }).catch(function () { toast('导入失败', 'error'); });
  }
  // 导入迁移：转为 Markdown 文本继续编辑
  function importDocAsText() {
    return extractDocText().then(function (text) {
      if (!text || !text.trim()) { toast('未提取到文本（文档为空或尚未加载完成）', 'error'); return; }
      var name = (docState.name || 'Word 文档').replace(/\.(docx|doc)$/i, '');
      closeDocModal();
      var d = {
        id: uid(),
        title: name + '（导入）',
        lang: 'markdown',
        content: text,
        updated: Date.now()
      };
      state.docs.push(d);
      persist();
      openDoc(d.id);
      toast('已导入为 Markdown 文档，可继续编辑', 'success');
    }).catch(function () { toast('导入失败', 'error'); });
  }
