/* [esm] 导出本模块顶层绑定 */
export { richOutline, richOutlineVisible, renderRichOutline, scrollToOutlineItem, setupRichOutlineObserver, bindRichOutline };
/* [esm] 导入依赖模块绑定 */
import { els } from './01-core.js';
import { activeDoc } from './05-store.js';
import { toast } from './16-doc-ops.js';
  /* ---------------- 富文档大纲面板（飞书式侧栏） ---------------- */
  var richOutline = {
    visible: false,         // 大纲面板是否显示
    items: [],              // [{ id, type, text }]
    activeId: null,         // 当前滚动所在标题
    observer: null,         // IntersectionObserver 实例
    filterKw: '',           // 搜索关键字
    dragState: null         // splitter 拖拽
  };

  /* ---------------- 富文档大纲（飞书式左侧 TOC） ---------------- */

  function richOutlineVisible(v) {
    v = !!v;
    richOutline.visible = v;
    if (els.richOutline) {
      els.richOutline.style.display = v ? 'flex' : 'none';
    }
    if (els.richOutlineSplitter) {
      els.richOutlineSplitter.style.display = v ? '' : 'none';
    }
    if (els.btnRichOutline) {
      els.btnRichOutline.classList.toggle('primary', v);
      els.btnRichOutline.title = v ? '收起大纲（飞书式侧栏）' : '富文档大纲 / 目录（飞书式侧栏）';
    }
    if (v && window.InkpadBlocks) {
      // 显示时立即要求一次大纲 + 启动 observer
      try { window.InkpadBlocks.notifyOutline(); } catch (e) {}
      setupRichOutlineObserver();
    } else if (!v && richOutline.observer) {
      try { richOutline.observer.disconnect(); } catch (e) {}
      richOutline.observer = null;
    }
  }

  function renderRichOutline(items) {
    if (!els.outlineList) return;
    richOutline.items = Array.isArray(items) ? items.slice() : [];
    // 应用搜索过滤（保持原有顺序与层级）
    var kw = (richOutline.filterKw || '').trim().toLowerCase();
    var i;
    // 重建列表
    els.outlineList.innerHTML = '';
    if (!richOutline.items.length) {
      els.outlineList.appendChild(els.outlineEmpty);
      els.outlineEmpty.style.display = '';
    } else {
      els.outlineEmpty.style.display = 'none';
      for (i = 0; i < richOutline.items.length; i++) {
        var it = richOutline.items[i];
        var row = document.createElement('div');
        row.className = 'outline-item outline-' + it.type;
        row.setAttribute('data-id', it.id);
        row.setAttribute('data-type', it.type);
        row.title = it.text;
        var mark = document.createElement('span');
        mark.className = 'outline-mark';
        mark.textContent = it.type.toUpperCase();
        var txt = document.createElement('span');
        txt.className = 'outline-text';
        txt.textContent = it.text;
        row.appendChild(mark);
        row.appendChild(txt);
        if (kw && it.text.toLowerCase().indexOf(kw) < 0) row.classList.add('hide');
        row.addEventListener('click', function (ev) {
          var id = ev.currentTarget.getAttribute('data-id');
          scrollToOutlineItem(id);
        });
        els.outlineList.appendChild(row);
      }
    }
    // 更新顶部计数（仅统计未隐藏的）
    var shown = els.outlineList.querySelectorAll('.outline-item:not(.hide)').length;
    els.outlineCount.textContent = shown + (kw ? ('/' + richOutline.items.length) : '');
    // 恢复活动高亮
    if (richOutline.activeId) {
      var activeEl = els.outlineList.querySelector('[data-id="' + richOutline.activeId + '"]');
      if (activeEl) activeEl.classList.add('active');
    }
    if (els.outlineFoot) {
      els.outlineFoot.style.display = richOutline.items.length ? '' : 'none';
    }
    if (richOutline.observer) {
      try { richOutline.observer.disconnect(); } catch (e) {}
      setupRichOutlineObserver();
    }
  }

  function scrollToOutlineItem(id) {
    if (!window.InkpadBlocks) return;
    if (!richOutline.activeId || richOutline.activeId !== id) {
      var prev = els.outlineList.querySelectorAll('.outline-item.active');
      for (var i = 0; i < prev.length; i++) prev[i].classList.remove('active');
      var node = els.outlineList.querySelector('[data-id="' + id + '"]');
      if (node) {
        node.classList.add('active');
        if (node.scrollIntoView) {
          try { node.scrollIntoView({ block: 'nearest' }); } catch (e) {}
        }
      }
      richOutline.activeId = id;
    }
    window.InkpadBlocks.scrollToOutlineItem(id);
  }

  /**
   * 用 IntersectionObserver 跟踪富文档滚动：当前可见的标题在 outline 高亮
   * 注：观察每个 ink-anchor 是否开始进入视口顶部 60px 范围
   */
  function setupRichOutlineObserver() {
    if (!els.richPane || !window.IntersectionObserver) return;
    if (richOutline.observer) {
      try { richOutline.observer.disconnect(); } catch (e) {}
      richOutline.observer = null;
    }
    var anchors = els.richPane.querySelectorAll('.ink-anchor');
    if (!anchors.length) return;
    var visibleSet = {};
    richOutline.observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var id = entry.target.id.replace(/^ink-/, '');
        if (entry.isIntersecting) visibleSet[id] = entry.intersectionRatio || 0.0001;
        else delete visibleSet[id];
      });
      var bestId = null, bestRatio = 0;
      Object.keys(visibleSet).forEach(function (id) {
        if (visibleSet[id] > bestRatio) { bestRatio = visibleSet[id]; bestId = id; }
      });
      // 若无可见锚点（用户滚到顶/底），退化到 richOutline.activeId 附近的最近一个
      if (!bestId && richOutline.items.length) {
        var ids = richOutline.items.map(function (x) { return x.id; });
        if (richOutline.activeId) {
          var curIdx = ids.indexOf(richOutline.activeId);
          // 找一个最接近的锚点（按 rich-pane 顶部距离）
          var paneTop = els.richPane.getBoundingClientRect().top;
          var bestDiff = Infinity;
          anchors.forEach(function (a) {
            var d = a.getBoundingClientRect().top - paneTop;
            if (d >= -8 && d < bestDiff) { bestDiff = d; bestId = a.id.replace(/^ink-/, ''); }
          });
        }
      }
      if (bestId && bestId !== richOutline.activeId) {
        richOutline.activeId = bestId;
        var prev = els.outlineList.querySelectorAll('.outline-item.active');
        for (var i = 0; i < prev.length; i++) prev[i].classList.remove('active');
        var node = els.outlineList.querySelector('[data-id="' + bestId + '"]');
        if (node) {
          node.classList.add('active');
          // outline 自动滚动到可见
          if (node.scrollIntoView) {
            try { node.scrollIntoView({ block: 'nearest' }); } catch (e) {}
          }
        }
      }
    }, {
      root: els.richPane,
      rootMargin: '0px 0px -75% 0px',
      threshold: [0, 0.1, 0.5, 1]
    });
    anchors.forEach(function (a) { richOutline.observer.observe(a); });
  }

  function bindRichOutline() {
    if (!els.btnRichOutline) return;

    // 📑 工具栏按钮：切换显示
    els.btnRichOutline.addEventListener('click', function () {
      if (!activeDoc() || activeDoc().kind !== 'rich') {
        toast('请先打开一个富文档', 'warn');
        return;
      }
      richOutlineVisible(!richOutline.visible);
    });

    // × 收起按钮
    els.btnCloseOutline && els.btnCloseOutline.addEventListener('click', function () {
      richOutlineVisible(false);
    });

    // 搜索
    els.outlineSearch && els.outlineSearch.addEventListener('input', function () {
      richOutline.filterKw = els.outlineSearch.value;
      renderRichOutline(richOutline.items);
    });

    // 上一个 / 下一个 / 刷新
    els.btnOutlineUp && els.btnOutlineUp.addEventListener('click', function () {
      var ids = richOutline.items.map(function (x) { return x.id; });
      if (!ids.length) return;
      var curIdx = ids.indexOf(richOutline.activeId);
      if (curIdx < 0) curIdx = ids.length; // 从尾往上
      var prev = ids[Math.max(0, curIdx - 1)];
      if (prev) scrollToOutlineItem(prev);
    });
    els.btnOutlineDown && els.btnOutlineDown.addEventListener('click', function () {
      var ids = richOutline.items.map(function (x) { return x.id; });
      if (!ids.length) return;
      var curIdx = ids.indexOf(richOutline.activeId);
      var next = ids[(curIdx + 1) % ids.length];
      if (next) scrollToOutlineItem(next);
    });
    els.btnOutlineReload && els.btnOutlineReload.addEventListener('click', function () {
      if (window.InkpadBlocks) {
        try { window.InkpadBlocks.notifyOutline(); } catch (e) {}
      }
    });

    // splitter 拖拽
    if (els.richOutlineSplitter) {
      els.richOutlineSplitter.addEventListener('mousedown', function (ev) {
        ev.preventDefault();
        var rect = els.richOutline.getBoundingClientRect();
        richOutline.dragState = { startX: ev.clientX, startW: rect.width };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });
    }
    window.addEventListener('mousemove', function (e) {
      if (!richOutline.dragState) return;
      var newW = richOutline.dragState.startW + (e.clientX - richOutline.dragState.startX);
      if (newW < 160) newW = 160;
      if (newW > 460) newW = 460;
      els.richOutline.style.flex = '0 0 ' + newW + 'px';
    });
    window.addEventListener('mouseup', function () {
      if (richOutline.dragState) {
        richOutline.dragState = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });

    // 注册 block-editor 的 outline 回调
    if (window.InkpadBlocks) {
      window.InkpadBlocks.setOutlineListener(renderRichOutline);
    }
  }
