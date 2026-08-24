/* [esm] 导出本模块顶层绑定 */
export { initDocMap, updateDocMapUI };
/* [esm] 导入依赖模块绑定 */
import { els, state } from './01-core.js';
import { cm } from './04-editor-init.js';
  /* ---------------- 文档地图（右侧小地图） ----------------
   * 实现：Canvas 2D「真实文本缩略图」+ 绝对定位视口指示器。
   *  - 坐标系为固定行距：每行在画布上占 lineSpacing() 高（行数少时
   *    放大、行数多时保持 3px），坐标 = 行号 × lineSpacing，天然
   *    兼容折叠区域，无需 heightAtLine 逐行遍历（大文档不卡）。
   *  - 可视区域（当前视口对应的行区间）：以迷你字号渲染真实文本，
   *    能看到字符形状与内容密度；可视区域之外：按行长度采样绘制
   *    色块。滚动 / 变更 / 缩放统一走 rAF 节流重绘。 */

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

  // 画布绘制：
  //  - 可视区域之外：按行长度采样绘制色块（代码分布）
  //  - 可视区域内：以迷你字号渲染真实文本（字符模式缩略图）
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
    var lineCount = docLineCount();
    if (lineCount <= 0) return;
    var gap = lineSpacing();
    var range = visibleLineRange();
    var visTop = range[0], visBot = range[1];
    var barW = cssW - 8;

    // ---- 第一部分：可视区域之外 —— 按行长采样绘制色块 ----
    var step = Math.max(1, Math.ceil(lineCount / Math.max(1, cssH * 2)));
    var maxLen = 1;
    var i, t, len;
    for (i = 0; i < lineCount; i += step) {
      if (i >= visTop && i <= visBot) continue;
      t = cm.getLine(i);
      if (t && t.length > maxLen) maxLen = t.length;
    }
    if (maxLen < 1) maxLen = 1;

    ctx.fillStyle = cssVar('--text-faint', '#A8A29E');
    ctx.globalAlpha = 0.55;
    var barH = Math.max(1, gap * 0.7);
    for (i = 0; i < lineCount; i += step) {
      if (i >= visTop && i <= visBot) continue;
      t = cm.getLine(i);
      len = t ? t.length : 0;
      var w = Math.max(2, barW * Math.min(1, len / maxLen));
      ctx.fillRect((cssW - w) / 2, i * gap + (gap - barH) / 2, w, barH);
    }

    // ---- 第二部分：可视区域 —— 渲染真实文本（迷你字符） ----
    var fontPx = Math.max(2.5, gap * 0.85);
    ctx.font = fontPx + 'px Consolas, "Microsoft YaHei", monospace';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = 0.8;
    var maxChars = Math.max(4, Math.floor(cssW / (fontPx * 0.82)));
    var ty = visTop * gap + (gap - fontPx) / 2;
    for (i = visTop; i <= visBot; i++) {
      t = cm.getLine(i);
      if (!t) continue;
      if (t.length > maxChars) t = t.slice(0, maxChars);
      ctx.fillText(t, 2, ty + (i - visTop) * gap);
    }
    ctx.globalAlpha = 1;
  }

  // 当前文档行数
  function docLineCount() {
    return cm ? cm.lineCount() : 0;
  }

  // minimap 每行高度（px）：行数少时适当放大、行数多时保持固定，保证字符可读
  function lineSpacing() {
    var n = docLineCount();
    if (n <= 0 || !els.docMap) return 3;
    return Math.max(3, Math.min(6, els.docMap.clientHeight / n));
  }

  // 可视区域在 minimap 中的行区间（含折叠感知）
  function visibleLineRange() {
    if (!cm) return [0, -1];
    var info = cm.getScrollInfo();
    var top = Math.max(0, cm.lineAtHeight(info.top, 'local'));
    var bot = Math.min(docLineCount() - 1, cm.lineAtHeight(info.top + info.clientHeight, 'local'));
    return [top, bot];
  }

  function scheduleRender() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () {
      rafId = null;
      draw();
    });
  }

  // 视口指示器：跟随 cm 滚动位置（行区间 × 行距，与文字渲染同坐标系）
  function updateViewport() {
    vpRaf = null;
    var vp = els.docMapViewport;
    var container = els.docMap;
    if (!vp || !container || !state.docMapOn || currentKind !== 'text' || !cm) {
      if (vp) vp.style.display = 'none';
      return;
    }
    if (container.clientHeight <= 0) { vp.style.display = 'none'; return; }
    var range = visibleLineRange();
    var visTop = range[0], visBot = range[1];
    if (visBot < visTop) { vp.style.display = 'none'; return; }
    var gap = lineSpacing();
    var top = visTop * gap;
    var h = Math.max(8, (visBot - visTop + 1) * gap);
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
