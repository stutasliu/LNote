/* [esm] 导出本模块顶层绑定 */
export { initDocMap, updateDocMapUI };
/* [esm] 导入依赖模块绑定 */
import { els, state } from './01-core.js';
import { cm } from './04-editor-init.js';
  /* ---------------- 文档地图（右侧小地图） ----------------
   * 实现：Canvas 2D 按行采样绘制代码缩略图 + 绝对定位视口指示器。
   * 性能要点：
   *  - cm.heightAtLine 内部要遍历 chunk 树，逐行调用对大文档会卡死，
   *    因此按步长采样（采样点数 ≈ 画布高 × 2），采样点用
   *    heightAtLine('local') 精确定位，色块高度用行句柄的估算行高。
   *  - 滚动 / 内容变更 / 窗口尺寸变化统一走 rAF 节流重绘。 */

  var DOCMAP_KEY = 'inkpad.docmap.v1';
  var currentKind = null;   // 当前打开文档的类型（由 openDoc → updateDocMapUI 维护）
  var dragging = false;     // 是否正在拖拽画布（跳转）
  var rafId = null;         // 画布重绘 rAF 句柄（节流）
  var vpRaf = null;         // 视口框更新 rAF 句柄（节流）

  // 读取主题 CSS 变量（canvas 无法直接使用 var()，需取计算值）
  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  // 当前打开文档的类型；尚未打开文档时返回 null
  function detectKind() {
    var id = state.activeId;
    if (!id) return null;
    for (var i = 0; i < state.docs.length; i++) {
      if (state.docs[i] && state.docs[i].id === id) return state.docs[i].kind || 'text';
    }
    return null;
  }

  // 依据开关状态 + 当前文档类型刷新显示
  function applyUI() {
    if (!els.docMap) return;
    var show = !!state.docMapOn && currentKind === 'text';
    els.docMap.style.display = show ? '' : 'none';
    if (els.btnDocMap) els.btnDocMap.classList.toggle('active', !!state.docMapOn);
  }

  // openDoc 切换文档时调用：记录类型并刷新 UI（非文本文档强制隐藏）
  function updateDocMapUI(kind) {
    currentKind = kind;
    applyUI();
    if (state.docMapOn && currentKind === 'text') {
      scheduleRender();
      scheduleViewport();
    }
  }

  // App Bar 开关切换（结果持久化到 localStorage）
  function toggle() {
    if (!els.docMap || !els.btnDocMap) return;
    state.docMapOn = !state.docMapOn;
    try { localStorage.setItem(DOCMAP_KEY, state.docMapOn ? '1' : '0'); } catch (e) {}
    applyUI();
    if (state.docMapOn && currentKind === 'text') {
      scheduleRender();
      scheduleViewport();
    }
  }

  // 画布绘制：按行采样，行长映射为色块宽度（模拟代码分布）
  function draw() {
    rafId = null;
    var canvas = els.docMapCanvas;
    if (!canvas || !state.docMapOn || currentKind !== 'text') return;
    var container = els.docMap;
    var cssW = container.clientWidth;
    var cssH = container.clientHeight;
    if (cssW <= 0 || cssH <= 0) return;

    var dpr = window.devicePixelRatio || 1;
    var pxW = Math.round(cssW * dpr);
    var pxH = Math.round(cssH * dpr);
    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    if (!cm) return;
    var info = cm.getScrollInfo();
    var total = Math.max(info.height, 1);
    var px = cssH / total;
    var lineCount = cm.lineCount();
    var step = Math.max(1, Math.ceil(lineCount / Math.max(1, cssH * 2)));
    var baseH = cm.defaultTextHeight() || 14;

    // 采样行的最大行长（决定色块宽度比例）
    var maxLen = 1;
    var i, len, t;
    for (i = 0; i < lineCount; i += step) {
      t = cm.getLine(i);
      if (t && t.length > maxLen) maxLen = t.length;
    }
    if (maxLen < 1) maxLen = 1;

    var barW = cssW - 8;
    ctx.fillStyle = cssVar('--text-faint', '#A8A29E');
    ctx.globalAlpha = 0.55;
    for (i = 0; i < lineCount; i += step) {
      var y = cm.heightAtLine(i, 'local') * px;
      var handle = cm.getLineHandle(i);
      var lh = handle && handle.height ? handle.height : baseH;
      t = cm.getLine(i);
      len = t ? t.length : 0;
      var w = Math.max(2, barW * Math.min(1, len / maxLen));
      ctx.fillRect((cssW - w) / 2, y, w, Math.max(1, lh * px * 0.7));
    }
    ctx.globalAlpha = 1;
  }

  function scheduleRender() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () {
      rafId = null;
      draw();
    });
  }

  // 视口指示器：跟随 cm 滚动位置（实时同步，开销极小）
  function updateViewport() {
    vpRaf = null;
    var vp = els.docMapViewport;
    var container = els.docMap;
    if (!vp || !container || !state.docMapOn || currentKind !== 'text' || !cm) {
      if (vp) vp.style.display = 'none';
      return;
    }
    var cssH = container.clientHeight;
    if (cssH <= 0) { vp.style.display = 'none'; return; }
    var s = cm.getScrollInfo();
    var total = Math.max(s.height, 1);
    var scale = cssH / total;
    var top = s.top * scale;
    var h = Math.max(16, Math.min(cssH - top, s.clientHeight * scale));
    vp.style.display = '';
    vp.style.top = top + 'px';
    vp.style.height = h + 'px';
  }

  function scheduleViewport() {
    if (vpRaf) return;
    vpRaf = requestAnimationFrame(function () {
      vpRaf = null;
      updateViewport();
    });
  }

  // 点击 / 拖拽 → 按比例跳转（点击点置于视口中线）
  function jumpTo(e) {
    if (!state.docMapOn || currentKind !== 'text' || !cm) return;
    var container = els.docMap;
    var rect = container.getBoundingClientRect();
    if (rect.height <= 0) return;
    var ratio = (e.clientY - rect.top) / rect.height;
    ratio = Math.max(0, Math.min(1, ratio));
    var info = cm.getScrollInfo();
    var maxTop = Math.max(0, info.height - info.clientHeight);
    var targetTop = ratio * info.height - info.clientHeight / 2;
    targetTop = Math.max(0, Math.min(maxTop, targetTop));
    cm.scrollTo(null, targetTop);
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    dragging = true;
    jumpTo(e);
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!dragging) return;
    jumpTo(e);
  }

  function onMouseUp() { dragging = false; }
  function onMouseLeave() { dragging = false; }

  function handleScroll() {
    updateViewport();
    scheduleRender();
  }

  function handleChanges() {
    scheduleRender();
    scheduleViewport();
  }

  function handleResize() {
    scheduleRender();
    scheduleViewport();
  }

  function bindEvents() {
    if (els.btnDocMap) els.btnDocMap.addEventListener('click', toggle);
    var canvas = els.docMapCanvas;
    if (!canvas) return;
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('resize', handleResize);
    if (cm) {
      cm.on('scroll', handleScroll);
      cm.on('changes', handleChanges);
      cm.on('swapDoc', handleChanges);
      cm.on('refresh', handleResize);
      cm.on('viewportChange', handleChanges);
    }
  }

  // 启动：恢复开关状态 → 绑定事件 → 应用显示 → 首帧绘制
  function initDocMap() {
    if (!els.docMap || !els.docMapCanvas) return;
    var saved = null;
    try { saved = localStorage.getItem(DOCMAP_KEY); } catch (e) {}
    state.docMapOn = saved ? saved === '1' : false;
    currentKind = detectKind();
    bindEvents();
    applyUI();
    if (state.docMapOn) {
      scheduleRender();
      scheduleViewport();
    }
    // 首帧容器可能尚未完成布局（初始化先于异步 openDoc），延迟补绘一次
    setTimeout(function () {
      if (state.docMapOn) {
        scheduleRender();
        scheduleViewport();
      }
    }, 120);
  }
