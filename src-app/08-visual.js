/* [esm] 导出本模块顶层绑定 */
export { openVisual, onVisualChange, updateVisualStatus, VISUAL_EXPORTS, buildVisualExportMenu, exportVisual, saveUniversal };
/* [esm] 导入依赖模块绑定 */
import { bus, els, state } from './01-core.js';
import { KIND_META, VISUAL_MODULES } from './04-editor-init.js';
import { persist } from './05-store.js';
import { fullTime } from './06-doc-list.js';
import { toast } from './16-doc-ops.js';
  /* ---------------- 可视化文档（流程图/思维导图/思维笔记） ---------------- */
  function openVisual(d, kind) {
    var mod = window[VISUAL_MODULES[kind]];
    var meta = KIND_META[kind];
    var model = null;
    try { model = JSON.parse(d.content); } catch (e) { model = null; }
    if (!model || typeof model !== 'object') model = mod.defaultModel();

    state.currentVisual = { kind: kind, doc: d, model: model, module: mod };
    mod.init(els.visualCanvas, model, onVisualChange);
    mod.renderToolbar(els.visualToolbar);
    buildVisualExportMenu(els.visualToolbar, kind);

    els.breadcrumb.textContent = meta.icon;
    els.statLang.textContent = meta.label;
    els.statCursor.textContent = '';
    updateVisualStatus();
  }

  function onVisualChange() {
    if (!state.currentVisual) return;
    state.currentVisual.doc.content = JSON.stringify(state.currentVisual.model);
    state.currentVisual.doc.title = els.title.value;
    state.currentVisual.doc.updated = Date.now();
    els.statSaved.textContent = '保存中…';
    els.statSaved.style.color = '';
    els.statEdit.textContent = '最后编辑 ' + fullTime(state.currentVisual.doc.updated);
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      persist();
      els.statSaved.textContent = '已保存';
      els.statSaved.style.color = '#0f7b0f';
      bus.emit('docs:changed');
    }, 400);
    updateVisualStatus();
  }

  function updateVisualStatus() {
    if (!state.currentVisual) return;
    els.statCount.textContent = state.currentVisual.module.count(state.currentVisual.model);
  }

  /* ---------------- 可视化文档导出 ---------------- */
  // kind → 可用格式（label, fmt, ext）
  var VISUAL_EXPORTS = {
    flow: [
      ['PNG 图片', 'png', '.png'],
      ['高清 PNG', 'png-hd', '.png'],
      ['JPG 图片', 'jpg', '.jpg'],
      ['高清 JPG', 'jpg-hd', '.jpg'],
      ['SVG 矢量图', 'svg', '.svg'],
      ['高清 PDF', 'pdf', '.pdf'],
      ['Word（.docx）', 'docx', '.docx'],
      ['PPT（.pptx）', 'pptx', '.pptx'],
      ['Markdown', 'md', '.md'],
      ['Excel（.csv）', 'csv', '.csv'],
      ['JSON 工程文件', 'json', '.json']
    ],
    mind: [
      ['PNG 图片', 'png', '.png'],
      ['高清 PNG', 'png-hd', '.png'],
      ['JPG 图片', 'jpg', '.jpg'],
      ['高清 JPG', 'jpg-hd', '.jpg'],
      ['SVG 矢量图', 'svg', '.svg'],
      ['高清 PDF', 'pdf', '.pdf'],
      ['Word（.docx）', 'docx', '.docx'],
      ['PPT（.pptx）', 'pptx', '.pptx'],
      ['Markdown', 'md', '.md'],
      ['Excel（.csv）', 'csv', '.csv'],
      ['XMind 文件', 'xmind', '.xmind'],
      ['FreeMind 文件（.mm）', 'mm', '.mm'],
      ['JSON 工程文件', 'json', '.json']
    ]
  };

  // 在可视化工具栏末尾追加「导出为」下拉菜单
  function buildVisualExportMenu(bar, kind) {
    var list = VISUAL_EXPORTS[kind];
    if (!list) return;
    var wrap = document.createElement('div');
    wrap.className = 'tool-menu-wrap';
    var btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.innerHTML = '⬇ 导出为 ▾';
    var menu = document.createElement('div');
    menu.className = 'tool-menu visual-export-menu';
    menu.style.display = 'none';
    list.forEach(function (item) {
      var mi = document.createElement('button');
      mi.className = 'menu-item';
      mi.textContent = item[0];
      mi.setAttribute('data-fmt', item[1]);
      mi.setAttribute('data-ext', item[2]);
      menu.appendChild(mi);
    });
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    bar.appendChild(wrap);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', function () { menu.style.display = 'none'; });
    menu.addEventListener('click', function (e) {
      var mi = e.target.closest('.menu-item');
      if (!mi) return;
      menu.style.display = 'none';
      exportVisual(mi.getAttribute('data-fmt'), mi.getAttribute('data-ext'));
    });
  }

  function exportVisual(fmt, ext) {
    var cv = state.currentVisual;
    if (!cv) return;
    var X = window.InkpadExporter;
    var title = (cv.doc.title || KIND_META[cv.kind].label).replace(/[\\/:*?"<>|]/g, '_');
    var svg = els.visualCanvas.querySelector('svg');

    function done(path) {
      if (path) toast('已导出：' + path, 'success');
    }
    function fail(err) {
      toast('导出失败：' + (err && err.message ? err.message : err), 'error');
    }
    function saveText(text) {
      saveUniversal(title + ext, text, false).then(done, fail);
    }
    function saveBinary(u8) {
      saveUniversal(title + ext, u8, true).then(done, fail);
    }

    try {
      switch (fmt) {
        case 'json':
          saveText(JSON.stringify(cv.model, null, 2));
          break;
        case 'svg':
          saveText(X.exportSvgText(svg));
          break;
        case 'png':
        case 'png-hd':
          X.rasterize(svg, fmt === 'png-hd' ? 3 : 1, 'png').then(function (r) { saveBinary(r.data); }, fail);
          break;
        case 'jpg':
        case 'jpg-hd':
          X.rasterize(svg, fmt === 'jpg-hd' ? 3 : 1, 'jpeg').then(function (r) { saveBinary(r.data); }, fail);
          break;
        case 'pdf':
          X.rasterize(svg, 3, 'jpeg').then(function (r) {
            saveBinary(X.makePdf(r.data, r.width, r.height));
          }, fail);
          break;
        case 'docx':
          X.rasterize(svg, 2, 'png').then(function (r) {
            saveBinary(X.makeDocx(r.data, r.width, r.height));
          }, fail);
          break;
        case 'pptx':
          X.rasterize(svg, 2, 'png').then(function (r) {
            saveBinary(X.makePptx(r.data, r.width, r.height));
          }, fail);
          break;
        case 'md':
          saveText(cv.kind === 'mind' ? X.mindToMarkdown(cv.model.root, cv.doc.title)
                                      : X.flowToMarkdown(cv.model, cv.doc.title));
          break;
        case 'csv':
          saveText(cv.kind === 'mind' ? X.mindToCSV(cv.model.root) : X.flowToCSV(cv.model));
          break;
        case 'mm':
          saveText(X.makeFreeMind(cv.model.root));
          break;
        case 'xmind':
          saveBinary(X.makeXMind(cv.model.root, cv.doc.title));
          break;
      }
    } catch (e) { fail(e); }
  }

  // 通用保存：桌面版走原生对话框（支持二进制），浏览器降级为下载
  function saveUniversal(filename, content, isBinary) {
    if (window.pywebview && window.pywebview.api) {
      if (isBinary && window.pywebview.api.save_file_binary) {
        return window.pywebview.api.save_file_binary(filename, window.InkpadExporter.u8ToBase64(content));
      }
      if (!isBinary && window.pywebview.api.save_file) {
        return window.pywebview.api.save_file(filename, content);
      }
    }
    // 浏览器降级
    var blob = isBinary ? new Blob([content]) : new Blob([content], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    return Promise.resolve(filename);
  }
