/* [esm] 导出本模块顶层绑定 */
export { initDocMap, updateDocMapUI };
/* [esm] 导入依赖模块绑定 */
import { els, state } from './01-core.js';
import { cm } from './04-editor-init.js';
  /* ---------------- 文档地图（右侧小地图） ----------------
   * 实现：Canvas 2D 全文档真实文本缩略图 + 可滚动视口指示器。
   *  - 坐标系为固定行距 lineSpacing()：内容总高 = 行数 × 行距，
   *    无论文档多大都按真实行距完整铺开（不压缩、不耗尽高度），
   *    地图内容超过可视高度时通过 #doc-map-scroll 滚动查看。
   *  - 视口指示器：绝对定位 div，随编辑器滚动同步移动且自动让
   *    滚动条滑到视口框所在位置；地图自身滚轮 / 拖动滚动条时
   *    反向把编辑器跳到对应位置（双向联动）。
   *  - 变更 / 缩放才重绘画布；滚动仅移动视口框与同步滚动条。 */

  var DOCMAP_KEY = 'inkpad.docmap.v1';
  var DOCMAP_BASE_GAP = 6;     // 每行基础高度（px）
  var DOCMAP_MAX_GAP = 12;     // 行距上限（文本可读上限）
  var DOCMAP_FONT_MAX = 7;     // 字号上限（小图要显示更多内容，字号不宜过大）
  var DOCMAP_MIN_GAP = 4;      // 行距下限（保证可读，过小文字看不清）
  var currentKind = null;   // 当前打开文档的类型（由 openDoc → updateDocMapUI 维护）
  var dragging = false;     // 是否正在拖拽画布（跳转）
  var rafId = null;         // 画布重绘 rAF 句柄（节流）
  var vpRaf = null;         // 视口框更新 rAF 句柄（节流）
  var lastMapSyncTs = 0;    // 上次程序同步地图滚动条的时间戳（避免 scroll 事件回环）

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

  // minimap 内容总高（px）：行数 × 行距，作为可滚动区域的实际高度
  function contentHeight() {
    var n = docLineCount();
    if (n <= 0) return 0;
    return n * lineSpacing();
  }

  // 画布绘制：只渲染「当前可见切片」，画布尺寸恒等于可视面板大小，与文档长度无关。
  //  - 内容总高 = 行数 × lineSpacing()（决定滚动条范围），但 canvas 高度 = 面板高度，
  //    通过 top = scrollTop 吸附到视口，并按 scrollTop 偏移只画可见行。
  //  - 好处：canvas 永远是小位图 → 始终 1:1 原生分辨率 → 文字清晰；行距/字号保持可读范围，
  //    长文档只是滚动查看，不会因压缩行距而把字缩小。
  function draw() {
    rafId = null;
    var canvas = els.docMapCanvas;
    if (!canvas || !state.docMapOn || currentKind !== 'text') return;
    var content = els.docMapContent;
    var scroll = els.docMapScroll;
    if (!content || !scroll) return;
    var cssW = content.clientWidth;
    if (cssW <= 0) return;
    var lineCount = docLineCount();
    if (lineCount <= 0) { updateContentSize(0); return; }
    var gap = lineSpacing();
    var contentH = contentHeight();
    if (contentH <= 0) { updateContentSize(0); return; }

    updateContentSize(contentH);

    var dpr = window.devicePixelRatio || 1;
    var panelH = scroll.clientHeight;
    if (panelH <= 0) panelH = 600;
    var scrollTop = scroll.scrollTop;
    // 画布固定为面板大小（小位图），始终以 1:1 原生分辨率绘制 → 不缩小、不模糊
    var pxW = Math.round(cssW * dpr);
    var pxH = Math.round(panelH * dpr);
    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;
    canvas.style.top = scrollTop + 'px';       // 吸附到视口顶部
    canvas.style.height = panelH + 'px';         // 高度 = 可见面板高度

    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);      // 仅 dpr，无缩放
    ctx.clearRect(0, 0, cssW, panelH);
    if (!cm) return;

    // 字号：行距宽时随之放大（上限 DOCMAP_FONT_MAX），保底 3px，保证清晰可读
    var fontPx = Math.min(DOCMAP_FONT_MAX, Math.max(3, gap * 0.7));

    ctx.fillStyle = cssVar('--text', '#171E23');
    ctx.font = fontPx + 'px Consolas, "Microsoft YaHei", monospace';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = 0.85;
    var maxChars = Math.max(8, Math.floor((cssW - 4) / (fontPx * 0.72)));

    // 只绘制落在可视面板内的行（依据 scrollTop 偏移）
    var firstLine = Math.max(0, Math.floor(scrollTop / gap));
    var lastLine = Math.min(lineCount - 1, Math.ceil((scrollTop + panelH) / gap));
    var i, t, y;
    for (i = firstLine; i <= lastLine; i++) {
      t = cm.getLine(i);
      if (!t || t.length === 0) continue;
      if (t.length > maxChars) t = t.slice(0, maxChars);
      y = Math.round(i * gap - scrollTop);
      if (y > panelH) break;
      ctx.fillText(t, 2, y);
    }
    ctx.globalAlpha = 1;
  }

  // 设置内容区高度（= 行数 × 行距），用于滚轮/滚动条范围；canvas 高度由 draw 单独按面板设置
  function updateContentSize(contentH) {
    if (!els.docMapContent) return;
    els.docMapContent.style.height = contentH + 'px';
  }

  // 当前文档行数
  function docLineCount() {
    return cm ? cm.lineCount() : 0;
  }

  // 编辑器可视区行数（供行距比例计算）
  function editorVisibleLineCount() {
    var r = visibleLineRange();
    var c = r[1] - r[0] + 1;
    return c > 0 ? c : 0;
  }

  // minimap 每行高度（px）
  //  目标：地图可视区展示「编辑器可视内容 × 1.5」（多展示一半）→ 视口框占地图面板约 2/3
  //  长文档：锁 1.5× 比例，内容总高超面板、可滚动跟随；
  //  短文档（全文能塞进面板）：按面板高度铺满，限制行距保证可读。
  //  清晰度关键：canvas 只绘制「视口切片」（见 draw），行距无需压缩也能保持清晰，
  //  因此行距始终落在 [DOCMAP_MIN_GAP, DOCMAP_MAX_GAP] 可读区间内，字号随之清晰。
  function lineSpacing() {
    var n = docLineCount();
    if (n <= 0 || !els.docMap) return DOCMAP_BASE_GAP;
    var panelH = els.docMapScroll ? els.docMapScroll.clientHeight : 600;
    if (panelH <= 0) panelH = 600;
    var vis = editorVisibleLineCount();
    if (vis <= 0) vis = Math.max(10, Math.round(panelH / 18));
    var ratioGap = panelH / (vis * 1.5);
    var gap;
    if (n * ratioGap <= panelH) {
      // 全文可放进面板（短文）：按面板高度铺满，但限制最大/最小行距保证可读
      gap = Math.min(DOCMAP_MAX_GAP, Math.max(DOCMAP_MIN_GAP, panelH / n));
    } else {
      // 长文：锁 1.5× 比例 → 视口框约 2/3 面板，内容可滚动
      gap = Math.max(DOCMAP_MIN_GAP, Math.min(DOCMAP_MAX_GAP, ratioGap));
    }
    return gap;
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

  // 视口指示器：跟随 cm 滚动位置（行区间 × 行距），并同步地图滚动条
  function updateViewport() {
    vpRaf = null;
    var vp = els.docMapViewport;
    var content = els.docMapContent;
    if (!vp || !content || !state.docMapOn || currentKind !== 'text' || !cm) {
      if (vp) vp.style.display = 'none';
      return;
    }
    var range = visibleLineRange();
    var visTop = range[0], visBot = range[1];
    var gap = lineSpacing();
    if (visBot < visTop || gap <= 0) { vp.style.display = 'none'; return; }
    var top = visTop * gap;
    var h = Math.max(8, (visBot - visTop + 1) * gap);
    vp.style.display = '';
    vp.style.top = top + 'px';
    vp.style.height = h + 'px';
    // 让地图滚动条滑到视口框所在位置（保持视口框在地图可视区内）
    syncMapScroll(top, h);
  }

  // 程序化设置地图滚动条：记录时间戳，供 onMapScroll 识别「由我们触发的滚动事件」而忽略
  function setMapScrollTop(v) {
    var scroll = els.docMapScroll;
    if (!scroll) return;
    if (Math.abs(scroll.scrollTop - v) <= 1) return;
    lastMapSyncTs = (window.performance && performance.now) ? performance.now() : Date.now();
    scroll.scrollTop = v;
  }

  // 编辑器滚动 → 地图滚动条跟随（程序同步，滚动事件带时间戳防回环）
  function syncMapScroll(visTopPx, visHPx) {
    if (!els.docMapScroll) return;
    var scroll = els.docMapScroll;
    var maxScroll = scroll.scrollHeight - scroll.clientHeight;
    if (maxScroll <= 0) { setMapScrollTop(0); return; }
    // 让视口框居于地图可视区中部 → 地图可视区约展示 1.5× 编辑器可视内容
    var target = visTopPx - (scroll.clientHeight - visHPx) / 2;
    target = Math.max(0, Math.min(maxScroll, target));
    setMapScrollTop(target);
  }

  function scheduleViewport() {
    if (vpRaf) return;
    vpRaf = requestAnimationFrame(function () {
      vpRaf = null;
      updateViewport();
    });
  }

  // 点击 / 拖拽 → 按地图滚动位置反向跳转编辑器（点击点置于视口中线）
  function jumpTo(e) {
    if (!state.docMapOn || currentKind !== 'text' || !cm) return;
    var scroll = els.docMapScroll;
    if (!scroll) return;
    var rect = scroll.getBoundingClientRect();
    if (rect.height <= 0) return;
    // 地图上的点击位置（含滚动偏移）对应到文档行区间
    var y = (e.clientY - rect.top) + scroll.scrollTop;
    var gap = lineSpacing();
    if (gap <= 0) return;
    var clickedLine = Math.floor(y / gap);
    var info = cm.getScrollInfo();
    var lineCount = docLineCount();
    // 目标行对应的文档滚动 top
    var targetTop = (clickedLine / Math.max(1, lineCount)) * info.height - info.clientHeight / 2;
    var maxTop = Math.max(0, info.height - info.clientHeight);
    targetTop = Math.max(0, Math.min(maxTop, targetTop));
    cm.scrollTo(null, targetTop);
    // 用户直接拖动地图滚动条：即使编辑器滚动位置被钳制（不触发 scroll 事件），
    // 也要按新的 scrollTop 重绘当前可见切片，避免画布停留在旧内容/旧位置。
    scheduleRender();
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

  // 地图滚动条 / 滚轮滚动 → 反向把编辑器跳到对应位置（用户在拖动地图浏览）
  function onMapScroll() {
    // 由 syncMapScroll 程序设置的滚动条，其事件在下一拍才触发，此时 syncingMap 已复位，
    // 故改用「最近一次程序同步时间戳」来判断，避免编辑器↔地图互相追逐造成抖动。
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    if (now - lastMapSyncTs < 60) return;
    if (!cm || !state.docMapOn || currentKind !== 'text') return;
    var scroll = els.docMapScroll;
    if (!scroll) return;
    var gap = lineSpacing();
    if (gap <= 0) return;
    var clickedLine = Math.floor(scroll.scrollTop / gap);
    var info = cm.getScrollInfo();
    var lineCount = docLineCount();
    var targetTop = (clickedLine / Math.max(1, lineCount)) * info.height - info.clientHeight / 2;
    var maxTop = Math.max(0, info.height - info.clientHeight);
    targetTop = Math.max(0, Math.min(maxTop, targetTop));
    cm.scrollTo(null, targetTop);
  }

  function handleScroll() {
    // 编辑器滚动：更新视口框 + 同步地图滚动条，并重绘当前可见切片（位置随滚动移动）
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
    if (els.docMapScroll) els.docMapScroll.addEventListener('scroll', onMapScroll);
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
