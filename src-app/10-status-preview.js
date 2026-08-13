/* [esm] 导出本模块顶层绑定 */
export { statDebounceTimer, STAT_DEBOUNCE_MS, STAT_BIG_DOC, countCharsAndWords, updateStatus, updatePreviewVisibility, scheduleRender, renderMermaid, renderHtmlPreview, inlineHtmlImages, renderMarkdownPreview, resolveMarkdownImages, panState, svgNatural, prepareSvg, applyZoom };
/* [esm] 导入依赖模块绑定 */
import { els, state } from './01-core.js';
import { cm } from './04-editor-init.js';
import { activeDoc } from './05-store.js';
import { dirOf, getApi, hasApi, isAbsPath, joinPath, normPath, resolveImgSrc, toFileUrl } from './13-api-path.js';
  // 字符/词统计要走大文档，单次扫描 100ms+ 直接 debounce + 替代两次 regex match，
  // 避免「只是输入一个字符就卡顿」。光标位置立即更新（几乎零成本）。
  var statDebounceTimer = null;
  var STAT_DEBOUNCE_MS = 180;
  // 「大文档阈值」：超过这个字符数就不递归统计 CJK/词数（仍统计总字符数）
  var STAT_BIG_DOC = 200 * 1024;

  function countCharsAndWords(text) {
    var chars = text.length;
    // 单次 charCodeAt 扫描：CJK + ASCII 单词边界
    var cjk = 0, words = 0;
    var inWord = false;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      var isCjk = (c >= 0x4e00 && c <= 0x9fff);
      var isWordChar = isCjk
        || (c >= 0x30 && c <= 0x39)
        || (c >= 0x41 && c <= 0x5a)
        || (c >= 0x61 && c <= 0x7a)
        || c === 0x5f || c === 0x24;
      if (isCjk) cjk++;
      if (isWordChar) {
        if (!inWord) { words++; inWord = true; }
      } else {
        inWord = false;
      }
    }
    return { chars: chars, cjk: cjk, words: words };
  }

  function updateStatus() {
    // 光标位置：用户最关心的，立刻显示
    var cur = cm.getCursor();
    els.statCursor.textContent = '行 ' + (cur.line + 1) + ', 列 ' + (cur.ch + 1);

    // 字符数 / 词数：要扫描大文档，debounce 节流
    if (statDebounceTimer) return;
    statDebounceTimer = setTimeout(function () {
      statDebounceTimer = null;
      var text = cm.getValue();
      var sel = cm.getSelection();
      var out;
      if (text.length > STAT_BIG_DOC) {
        // 大文档：仅显示字符数；CJK/词数用 ~估算
        out = {
          chars: text.length,
          cjk: '~',
          words: '~'
        };
      } else {
        out = countCharsAndWords(text);
      }
      var base = out.chars + ' 字符 · ' + out.words + ' 词';
      els.statCount.textContent = sel ? base + ' · 选中 ' + sel.length + ' 字符' : base;
    }, STAT_DEBOUNCE_MS);
  }

  /* ---------------- Mermaid 渲染 ---------------- */
  /* ---------------- 右侧预览（Markdown / HTML / Mermaid 共用） ---------------- */
  function updatePreviewVisibility() {
    var d = activeDoc();
    var isMermaid = d && d.lang === 'mermaid';
    var isMd = d && d.lang === 'markdown';
    var isHtml = d && d.lang === 'html';
    var show = state.previewOn && (isMermaid || isMd || isHtml);
    els.previewPane.style.display = show ? 'flex' : 'none';
    els.splitter.style.display = show ? 'block' : 'none';
    els.btnTogglePreview.classList.toggle('active', !!show);
    // 顶栏右上角预览按钮：高亮 + 提示随状态切换
    els.btnPreviewTop.classList.toggle('active', !!show);
    els.btnPreviewTop.title = show ? '关闭预览' : '预览';
    if (isMd) els.btnTogglePreview.textContent = '👁 MD预览';
    else if (isHtml) els.btnTogglePreview.textContent = '👁 HTML预览';
    else els.btnTogglePreview.textContent = '👁 图表预览';
    if (!show) return;
    if (isMermaid) {
      els.previewTitle.textContent = '图表预览';
      els.previewHint.textContent = '拖拽平移 · Ctrl+滚轮缩放 · 双击复位';
      els.mdOut.style.display = 'none';
      els.htmlOut.style.display = 'none';
      els.mermaidOut.style.display = '';
    } else if (isHtml) {
      els.previewTitle.textContent = 'HTML 预览';
      els.previewHint.textContent = '本地实时渲染 · 修改自动刷新';
      els.mdOut.style.display = 'none';
      els.htmlOut.style.display = '';
      els.mermaidOut.style.display = 'none';
    } else {
      els.previewTitle.textContent = 'Markdown 预览';
      els.previewHint.textContent = '支持 GFM 表格 · 代码块 · ```mermaid 图表';
      els.mermaidOut.style.display = 'none';
      els.htmlOut.style.display = 'none';
      els.mdOut.style.display = '';
    }
    scheduleRender();
  }

  function scheduleRender() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(function () {
      var d = activeDoc();
      if (!d || !state.previewOn) return;
      if (d.lang === 'mermaid') renderMermaid();
      else if (d.lang === 'markdown') renderMarkdownPreview();
      else if (d.lang === 'html') renderHtmlPreview();
    }, 300);
  }

  function renderMermaid() {
    var d = activeDoc();
    if (!d || d.lang !== 'mermaid' || !state.previewOn) return;
    var code = cm.getValue().trim();
    els.mermaidOut.innerHTML = '';
    var oldErr = document.querySelector('.mermaid-error');
    if (oldErr) oldErr.remove();

    if (!code) {
      els.previewEmpty.style.display = '';
      return;
    }
    els.previewEmpty.style.display = 'none';

    var seq = ++state.mermaidSeq;
    mermaid.render('mmd-' + seq, code).then(function (res) {
      if (seq !== state.mermaidSeq) return; // 已有更新的渲染
      els.mermaidOut.innerHTML = res.svg;
      prepareSvg();
    }).catch(function (err) {
      if (seq !== state.mermaidSeq) return;
      var div = document.createElement('div');
      div.className = 'mermaid-error';
      div.textContent = '图表语法错误：\n' + (err && err.message ? err.message : String(err));
      els.previewPane.querySelector('#preview-body').appendChild(div);
    });
  }

  function renderHtmlPreview() {
    var d = activeDoc();
    if (!d || d.lang !== 'html' || !state.previewOn) return;
    var src = cm.getValue();
    els.previewEmpty.style.display = 'none';
    if (!src.trim()) {
      els.htmlFrame.srcdoc = '<body style="font-family:sans-serif;color:#999;padding:40px;text-align:center">在左侧输入 HTML，这里实时渲染</body>';
      return;
    }
    var baseDir = d.diskPath ? dirOf(d.diskPath) : null;
    inlineHtmlImages(src, baseDir).then(function (html) {
      if (html) els.htmlFrame.srcdoc = html;
    });
  }

  // 把 HTML 预览里的本地图片内联为 base64（srcdoc 无法用相对/绝对 file 路径）
  function inlineHtmlImages(html, baseDir) {
    var re = /(<img\b[^>]*\ssrc\s*=\s*)(["'])(.*?)\2/gi;
    var found = [];
    var mm;
    while ((mm = re.exec(html))) {
      var src = mm[3];
      if (/^(https?:|data:|blob:)/i.test(src)) continue;
      var abs = isAbsPath(src) ? normPath(src) : (baseDir ? joinPath(baseDir, src) : null);
      if (!abs) continue;
      found.push({ full: mm[0], pre: mm[1], q: mm[2], abs: abs });
    }
    if (!found.length) return Promise.resolve(html);
    var out = html;
    return Promise.all(found.map(function (it) {
      if (!hasApi()) { it.url = toFileUrl(it.abs); return Promise.resolve(); }
      return getApi().read_file_b64(it.abs).then(function (res) {
        if (res && res.b64) it.url = 'data:' + (res.mime || 'image/png') + ';base64,' + res.b64;
        else it.url = toFileUrl(it.abs);
      }).catch(function () { it.url = toFileUrl(it.abs); });
    })).then(function () {
      found.forEach(function (it) {
        if (it.url) out = out.split(it.full).join(it.pre + it.q + it.url + it.q);
      });
      return out;
    });
  }

  function renderMarkdownPreview() {
    var d = activeDoc();
    if (!d || d.lang !== 'markdown' || !state.previewOn) return;
    var text = cm.getValue();
    var oldErr = document.querySelector('.mermaid-error');
    if (oldErr) oldErr.remove();
    els.previewEmpty.style.display = 'none';
    if (!text.trim()) {
      els.mdOut.innerHTML = '<div class="preview-empty"><div class="preview-empty-icon">📝</div>' +
        '<p>在左侧输入 Markdown<br>这里会实时渲染预览</p></div>';
      return;
    }
    window.InkpadMd.renderInto(els.mdOut, text);
    resolveMarkdownImages(d);
  }

  // 把 Markdown 预览里的本地相对图片解析为可加载的 file:// 绝对路径
  function resolveMarkdownImages(d) {
    var baseDir = d.diskPath ? dirOf(d.diskPath) : null;
    var imgs = els.mdOut.querySelectorAll('img');
    Array.prototype.forEach.call(imgs, function (img) {
      var src = img.getAttribute('src') || '';
      var url = resolveImgSrc(src, baseDir);
      if (url) img.src = url;
    });
  }

  /* ---------------- 预览区：拖拽平移 + 缩放 ---------------- */
  var panState = { down: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 };
  state.zoomLevel = 1; // Phase ESM：跨模块赋值（17-events 缩放），收拢进 state
  var svgNatural = null; // { w, h } SVG 原始尺寸

  function prepareSvg() {
    var svg = els.mermaidOut.querySelector('svg');
    if (!svg) { svgNatural = null; return; }
    svg.style.maxWidth = 'none';
    var vb = svg.viewBox && svg.viewBox.baseVal;
    var w = vb && vb.width ? vb.width : svg.getBoundingClientRect().width;
    var h = vb && vb.height ? vb.height : svg.getBoundingClientRect().height;
    if (!w || !h) { svgNatural = null; return; }
    svgNatural = { w: w, h: h };
    applyZoom();
  }

  function applyZoom() {
    if (!svgNatural) return;
    var svg = els.mermaidOut.querySelector('svg');
    if (!svg) return;
    svg.style.width = (svgNatural.w * state.zoomLevel) + 'px';
    svg.style.height = (svgNatural.h * state.zoomLevel) + 'px';
  }
