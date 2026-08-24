/* [esm] 导出本模块顶层绑定 */
export { openPdfFile, openPdfFromData, closePdfModal, pdfPrev, pdfNext, pdfZoomIn, pdfZoomOut, pdfZoomReset, pdfFitWidth, extractPdfText };
/* [esm] 导入依赖模块绑定 */
import { els, state } from './01-core.js';
import { persist, uid } from './05-store.js';
import { getApi, hasApi, normPath } from './13-api-path.js';
  var toastTimer = null;
  function toast(msg, type) {
    els.toast.textContent = msg;
    els.toast.className = 'show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.className = ''; }, 2600);
  }
  var pdfSess = 0;
  var pdfState = { doc: null, page: 0, numPages: 0, zoom: 1, text: '', path: '', name: '' };

  function _showPdfModal() {
    var all = document.querySelectorAll('.modal-overlay, #fr-overlay');
    Array.prototype.forEach.call(all, function (el) {
      if (el.id !== 'pdf-modal') el.style.display = 'none';
    });
    els.pdfModal.style.display = 'flex';
    els.pdfStage.scrollTop = 0;
  }
  function pdfLoading(on) {
    if (on) {
      els.pdfCanvasWrap.innerHTML = '<div class="pdf-loading">正在加载 PDF…</div>';
    } else {
      var l = els.pdfCanvasWrap.querySelector('.pdf-loading');
      if (l && l.parentNode) l.parentNode.removeChild(l);
    }
  }
  function pdfError(msg) {
    els.pdfCanvasWrap.innerHTML = '<div class="pdf-error">' + (msg || '加载失败') + '</div>';
  }
  function base64ToArrayBuffer(b64) {
    var bin = atob(b64);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  function loadWithPdfjs(data, sess) {
    if (!window.__pdfReady) { pdfError('pdf.js 未就绪'); return; }
    pdfLoading(true);
    window.__pdfReady(function (err) {
      if (sess !== pdfSess) return;
      if (err || !window.pdfjsLib) { pdfError('pdf.js 加载失败'); return; }
      window.pdfjsLib.getDocument({
        data: data,
        cMapUrl: 'js/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: 'js/standard_fonts/',
        useWorkerFetch: false
      }).promise.then(function (pdf) {
        if (sess !== pdfSess) { try { pdf.destroy(); } catch (e) {} return; }
        pdfState.doc = pdf;
        pdfState.numPages = pdf.numPages;
        pdfState.page = 1;
        pdfState.zoom = 1;
        pdfState.text = '';
        pdfLoading(false);
        renderPage(1);
      }).catch(function (e) {
        if (sess !== pdfSess) return;
        if (getApi() && getApi().debug_log) getApi().debug_log('[pdf] getDocument error: ' + (e && e.message ? e.message : String(e)));
        pdfError('PDF 解析失败，文件可能已损坏');
      });
    });
  }
  function renderPage(n) {
    var pdf = pdfState.doc;
    if (!pdf || !pdfState.numPages) return;
    pdfState.page = Math.min(Math.max(1, n), pdfState.numPages);
    pdf.getPage(pdfState.page).then(function (page) {
      var wrap = els.pdfCanvasWrap;
      var wrapEl = document.createElement('div');
      wrapEl.className = 'pdf-page-wrap';
      var canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      var vp = page.getViewport({ scale: pdfState.zoom });
      var dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = vp.width + 'px';
      canvas.style.height = vp.height + 'px';
      var ctx = canvas.getContext('2d');
      var marker = document.createElement('div');
      marker.className = 'pdf-page-marker';
      marker.textContent = pdfState.page + ' / ' + pdfState.numPages;
      var tlDiv = document.createElement('div');
      tlDiv.className = 'textLayer';
      tlDiv.style.setProperty('--scale-factor', String(vp.scale));
      wrapEl.appendChild(tlDiv);
      wrapEl.appendChild(canvas);
      wrapEl.appendChild(marker);
      wrap.innerHTML = '';
      wrap.appendChild(wrapEl);
      var rtask = page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      if (getApi() && getApi().debug_log) getApi().debug_log('[pdf] render start p' + pdfState.page + ' canvas=' + canvas.width + 'x' + canvas.height);
      if (rtask && rtask.promise) {
        rtask.promise.then(function () {
          if (getApi() && getApi().debug_log) getApi().debug_log('[pdf] render ok p' + pdfState.page);
          _checkBlankCanvas(canvas);
        }).catch(function (e) {
          if (getApi() && getApi().debug_log) getApi().debug_log('[pdf] render error: ' + (e && e.message ? e.message : String(e)));
          if (e && e.name === 'RenderingCancelledException') return;
          pdfError('页面渲染失败：' + (e && e.message ? e.message : '未知错误'));
        });
      }
      if (window.pdfjsLib && window.pdfjsLib.renderTextLayer) {
        page.getTextContent().then(function (tc) {
          if (!tlDiv.isConnected) return;
          if (getApi() && getApi().debug_log) getApi().debug_log('[pdf] text layer start p' + pdfState.page + ' items=' + (tc && tc.items ? tc.items.length : 0));
          var tlt = window.pdfjsLib.renderTextLayer({
            textContentSource: tc,
            container: tlDiv,
            viewport: vp
          });
          if (tlt && tlt.promise) {
            tlt.promise.then(function () {
              if (getApi() && getApi().debug_log) getApi().debug_log('[pdf] text layer ok p' + pdfState.page + ' spans=' + tlDiv.querySelectorAll('span').length);
            }).catch(function (e) {
              if (getApi() && getApi().debug_log) getApi().debug_log('[pdf] text layer error: ' + (e && e.message ? e.message : String(e)));
            });
          }
        }).catch(function (e) {
          if (getApi() && getApi().debug_log) getApi().debug_log('[pdf] getTextContent error: ' + (e && e.message ? e.message : String(e)));
        });
      }
      updatePdfBar();
    }).catch(function (e) {
      if (getApi() && getApi().debug_log) getApi().debug_log('[pdf] getPage error: ' + (e && e.message ? e.message : String(e)));
      toast('页面渲染失败', 'error');
    });
  }
  function _checkBlankCanvas(canvas) {
    try {
      var prev = els.pdfCanvasWrap.querySelector('.pdf-blank-warn');
      if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
      var cw = canvas.width;
      var ch = canvas.height;
      if (!cw || !ch) return;
      var ctx = canvas.getContext('2d');
      var imgd = ctx.getImageData(0, 0, cw, ch);
      var d = imgd.data;
      var nw = 0;
      var step = 8;
      for (var i = 0; i < d.length; i += 4 * step) {
        if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 250) nw++;
      }
      var sampled = d.length / 4 / step;
      if (nw === 0 && sampled >= 400) {
        if (getApi() && getApi().debug_log) getApi().debug_log('[pdf] blank canvas detected p' + pdfState.page);
        var warn = document.createElement('div');
        warn.className = 'pdf-blank-warn';
        warn.textContent = '此页内容为空：PDF 文件可能已损坏，建议重新获取该文件';
        els.pdfCanvasWrap.appendChild(warn);
      }
    } catch (e) {}
  }
  function updatePdfBar() {
    var pct = Math.round(pdfState.zoom * 100);
    els.pdfPageInfo.textContent = pdfState.numPages ? (pdfState.page + ' / ' + pdfState.numPages + ' 页 · ' + pct + '%') : '';
    els.pdfPrev.disabled = pdfState.page <= 1;
    els.pdfNext.disabled = pdfState.page >= pdfState.numPages;
  }
  function registerPdfEntry(path, name) {
    var key = normPath(path).toLowerCase();
    for (var i = 0; i < state.docs.length; i++) {
      var x = state.docs[i];
      if (x && x.kind === 'pdf' && x.diskPath && normPath(x.diskPath).toLowerCase() === key) {
        x.updated = Date.now();
        persist();
        return x;
      }
    }
    var d = {
      id: uid(),
      title: (name || 'PDF 文档').replace(/\.pdf$/i, ''),
      kind: 'pdf',
      lang: 'pdf',
      encoding: 'binary',
      diskPath: path,
      updated: Date.now()
    };
    state.docs.push(d);
    persist();
    return d;
  }
  function openPdfFile(path, name) {
    if (!path) { toast('PDF 文档缺少磁盘路径', 'error'); return null; }
    var entry = registerPdfEntry(path, name);
    if (!hasApi()) {
      window.addEventListener('pywebviewready', function h() {
        window.removeEventListener('pywebviewready', h);
        openPdfFile(path, name);
      }, { once: true });
      return entry ? entry.id : null;
    }
    var sess = ++pdfSess;
    pdfState.path = path;
    pdfState.name = name || path.replace(/\\/g, '/').split('/').pop() || 'PDF';
    els.pdfName.textContent = pdfState.name;
    pdfLoading(true);
    _showPdfModal();
    getApi().read_file_b64(path).then(function (res) {
      if (sess !== pdfSess) return;
      if (!res || !res.b64) { pdfError('读取失败'); return; }
      loadWithPdfjs(base64ToArrayBuffer(res.b64), sess);
    }).catch(function (e) {
      if (sess !== pdfSess) return;
      pdfError('读取文件失败');
    });
    return entry ? entry.id : null;
  }
  function openPdfFromData(data, name) {
    var sess = ++pdfSess;
    pdfState.path = '';
    pdfState.name = name || 'PDF 文档';
    els.pdfName.textContent = pdfState.name;
    pdfLoading(true);
    _showPdfModal();
    loadWithPdfjs(data, sess);
  }
  function closePdfModal() {
    pdfSess++;
    els.pdfModal.style.display = 'none';
    els.pdfCanvasWrap.innerHTML = '';
    els.pdfPageInfo.textContent = '';
    if (pdfState.doc) { try { pdfState.doc.destroy(); } catch (e) {} }
    pdfState.doc = null;
    pdfState.page = 0;
    pdfState.numPages = 0;
    pdfState.zoom = 1;
    pdfState.text = '';
    pdfState.path = '';
    pdfState.name = '';
  }
  function pdfPrev() { if (pdfState.page > 1) renderPage(pdfState.page - 1); }
  function pdfNext() { if (pdfState.page < pdfState.numPages) renderPage(pdfState.page + 1); }
  function pdfZoomIn() { pdfZoomBy(1.25); }
  function pdfZoomOut() { pdfZoomBy(1 / 1.25); }
  function pdfZoomBy(f) {
    var nz = Math.round(pdfState.zoom * f * 100) / 100;
    if (nz < 0.2 || nz > 8) return;
    pdfState.zoom = nz;
    if (pdfState.doc) renderPage(pdfState.page);
  }
  function pdfZoomReset() {
    pdfState.zoom = 1;
    if (pdfState.doc) renderPage(pdfState.page);
  }
  function pdfFitWidth() {
    var pdf = pdfState.doc;
    if (!pdf) return;
    pdf.getPage(pdfState.page).then(function (page) {
      var vp1 = page.getViewport({ scale: 1 });
      var avail = els.pdfStage.clientWidth - 48;
      if (avail < 100) avail = 800;
      pdfState.zoom = Math.min(8, Math.max(0.2, avail / vp1.width));
      renderPage(pdfState.page);
    }).catch(function () {});
  }
  function extractPdfText() {
    var pdf = pdfState.doc;
    if (!pdf) return Promise.resolve('');
    if (pdfState.text) return Promise.resolve(pdfState.text);
    var parts = [];
    var chain = Promise.resolve();
    var i;
    for (i = 1; i <= pdf.numPages; i++) {
      chain = chain.then((function (n) {
        return function () {
          return pdf.getPage(n).then(function (pg) {
            return pg.getTextContent().then(function (tc) {
              var strs = tc.items.map(function (it) { return it.str || ''; });
              var joined = strs.join('');
              var cjkCount = (joined.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
              var sep = joined.length && cjkCount / joined.length > 0.25 ? '' : ' ';
              parts.push(strs.join(sep).replace(/[ \t]{2,}/g, ' ').replace(/^ +| +$/g, ''));
            });
          });
        };
      })(i));
    }
    return chain.then(function () {
      pdfState.text = parts.join('\n').replace(/\n{3,}/g, '\n\n');
      return pdfState.text;
    });
  }
