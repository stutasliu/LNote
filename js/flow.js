/* =========================================================
 * InkpadFlow —— 可视化流程图编辑器（仿 ProcessOn 基础交互）
 * 节点：开始/结束(圆角) 过程(矩形) 判断(菱形)
 * 交互：拖拽移动、连线模式、双击编辑、Delete 删除
 * ========================================================= */
window.InkpadFlow = (function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var CANVAS_W = 3000, CANVAS_H = 2000;

  var container = null;   // #visual-canvas
  var svg = null;
  var model = null;       // { nodes:[], edges:[] }
  var onChange = null;
  var selected = null;    // { kind:'node'|'edge', id }
  var mode = 'select';    // 'select' | 'link'
  var linkFrom = null;
  var drag = null;        // { id, startClientX, startClientY, origX, origY, moved }
  var hintEl = null;
  var linkBtnEl = null;
  var keyHandler = null;

  var seq = 0;
  function uid(prefix) {
    return (prefix || 'n') + (++seq) + Date.now().toString(36);
  }

  /* ---------------- 模型 ---------------- */
  function defaultModel() {
    return {
      nodes: [
        { id: 'n1', type: 'start',    x: 200, y: 80,  text: '开始' },
        { id: 'n2', type: 'decision', x: 200, y: 220, text: '条件判断' },
        { id: 'n3', type: 'process',  x: 380, y: 380, text: '处理数据' },
        { id: 'n4', type: 'process',  x: 60,  y: 380, text: '记录日志' },
        { id: 'n5', type: 'end',      x: 200, y: 540, text: '结束' }
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3', text: '是' },
        { id: 'e3', from: 'n2', to: 'n4', text: '否' },
        { id: 'e4', from: 'n3', to: 'n5' },
        { id: 'e5', from: 'n4', to: 'n5' }
      ]
    };
  }

  function getNode(id) {
    for (var i = 0; i < model.nodes.length; i++) {
      if (model.nodes[i].id === id) return model.nodes[i];
    }
    return null;
  }

  function nodeSize(node) {
    var len = (node.text || '').replace(/[\x00-\xff]/g, 'a').length; // 中文按2个宽度估
    var w = Math.max(90, len * 8 + 34);
    if (node.type === 'decision') return { w: Math.max(120, len * 8 + 60), h: 64 };
    return { w: w, h: 42 };
  }

  // 节点边界上与另一节点的连线交点（用矩形近似，菱形略溢出可接受）
  function borderPoint(node, tx, ty) {
    var s = nodeSize(node);
    var dx = tx - node.x, dy = ty - node.y;
    if (!dx && !dy) return { x: node.x, y: node.y };
    var sx = dx ? (s.w / 2) / Math.abs(dx) : Infinity;
    var sy = dy ? (s.h / 2) / Math.abs(dy) : Infinity;
    var t = Math.min(sx, sy);
    return { x: node.x + dx * t, y: node.y + dy * t };
  }

  /* ---------------- 渲染 ---------------- */
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function render() {
    if (!svg) return;
    svg.innerHTML =
      '<defs><marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" ' +
      'markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path d="M 0 1 L 9 5 L 0 9 z" fill="#8a94a6"></path></marker></defs>';

    var edgeLayer = el('g', {});
    var nodeLayer = el('g', {});
    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);

    // 连线
    model.edges.forEach(function (edge) {
      var a = getNode(edge.from), b = getNode(edge.to);
      if (!a || !b) return;
      var p1 = borderPoint(a, b.x, b.y);
      var p2 = borderPoint(b, a.x, a.y);
      var g = el('g', { 'class': 'flow-edge' + (isSel('edge', edge.id) ? ' selected' : ''), 'data-id': edge.id });
      // 透明加宽的点击热区
      g.appendChild(el('line', {
        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
        stroke: 'transparent', 'stroke-width': 12, 'class': 'edge-hit'
      }));
      g.appendChild(el('line', {
        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
        'class': 'edge-line', 'marker-end': 'url(#flow-arrow)'
      }));
      if (edge.text) {
        var t = el('text', { x: (p1.x + p2.x) / 2 + 6, y: (p1.y + p2.y) / 2 - 6, 'class': 'edge-text' });
        t.textContent = edge.text;
        g.appendChild(t);
      }
      edgeLayer.appendChild(g);
    });

    // 节点
    model.nodes.forEach(function (node) {
      var s = nodeSize(node);
      var cls = 'flow-node type-' + node.type +
        (isSel('node', node.id) ? ' selected' : '') +
        (linkFrom === node.id ? ' link-from' : '');
      var g = el('g', { 'class': cls, 'data-id': node.id, transform: 'translate(' + node.x + ',' + node.y + ')' });

      if (node.type === 'decision') {
        var hw = s.w / 2, hh = s.h / 2;
        g.appendChild(el('polygon', {
          points: '0,' + (-hh) + ' ' + hw + ',0 0,' + hh + ' ' + (-hw) + ',0',
          'class': 'node-shape'
        }));
      } else {
        g.appendChild(el('rect', {
          x: -s.w / 2, y: -s.h / 2, width: s.w, height: s.h,
          rx: (node.type === 'start' || node.type === 'end') ? s.h / 2 : 6,
          'class': 'node-shape'
        }));
      }
      var t = el('text', { x: 0, y: 0, 'class': 'node-text' });
      t.textContent = node.text;
      g.appendChild(t);
      nodeLayer.appendChild(g);
    });
  }

  function isSel(kind, id) {
    return selected && selected.kind === kind && selected.id === id;
  }

  /* ---------------- 交互 ---------------- */
  function onMouseDown(e) {
    if (e.button !== 0) return;
    var g = e.target.closest('.flow-node');
    if (g) {
      var node = getNode(g.getAttribute('data-id'));
      if (!node) return;
      drag = { id: node.id, startX: e.clientX, startY: e.clientY, origX: node.x, origY: node.y, moved: false };
      e.preventDefault();
      return;
    }
    var eg = e.target.closest('.flow-edge');
    if (eg) {
      selected = { kind: 'edge', id: eg.getAttribute('data-id') };
      render();
      return;
    }
    // 空白处：取消选择 / 取消连线
    if (mode === 'link') cancelLink();
    selected = null;
    render();
  }

  function onMouseMove(e) {
    if (!drag) return;
    var dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) {
      var node = getNode(drag.id);
      if (node) {
        node.x = Math.round(drag.origX + dx);
        node.y = Math.round(drag.origY + dy);
        render();
      }
    }
  }

  function onMouseUp(e) {
    if (!drag) return;
    var node = getNode(drag.id);
    if (drag.moved) {
      onChange();
    } else if (node) {
      // 视为点击
      if (mode === 'link') {
        if (!linkFrom) {
          linkFrom = node.id;
          setHint('已选起点「' + node.text + '」，再点击终点节点（Esc 取消）');
        } else if (linkFrom !== node.id) {
          model.edges.push({ id: uid('e'), from: linkFrom, to: node.id });
          cancelLink();
          onChange();
        }
      } else {
        selected = { kind: 'node', id: node.id };
      }
      render();
    }
    drag = null;
  }

  function onDblClick(e) {
    var g = e.target.closest('.flow-node');
    if (!g) return;
    var node = getNode(g.getAttribute('data-id'));
    if (node) editNodeText(node);
  }

  function onKey(e) {
    var tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    if (e.key === 'Escape') {
      if (mode === 'link') { cancelLink(); render(); }
      else if (selected) { selected = null; render(); }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      e.preventDefault();
      deleteSelected();
    }
  }

  function editNodeText(node) {
    var s = nodeSize(node);
    var input = document.createElement('input');
    input.className = 'node-edit-input';
    input.value = node.text || '';
    input.style.left = (node.x - s.w / 2) + 'px';
    input.style.top = (node.y - s.h / 2) + 'px';
    input.style.width = s.w + 'px';
    input.style.height = s.h + 'px';
    container.appendChild(input);
    input.focus();
    input.select();

    var done = false;
    function commit(save) {
      if (done) return;
      done = true;
      if (save) {
        var v = input.value.trim();
        if (v && v !== node.text) { node.text = v; onChange(); }
      }
      input.remove();
      render();
    }
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') commit(true);
      else if (ev.key === 'Escape') commit(false);
      ev.stopPropagation();
    });
    input.addEventListener('blur', function () { commit(true); });
  }

  function deleteSelected() {
    if (!selected) { setHint('先点击选中一个节点或连线'); return; }
    if (selected.kind === 'node') {
      var id = selected.id;
      model.nodes = model.nodes.filter(function (n) { return n.id !== id; });
      model.edges = model.edges.filter(function (e) { return e.from !== id && e.to !== id; });
    } else {
      model.edges = model.edges.filter(function (e) { return e.id !== selected.id; });
    }
    selected = null;
    onChange();
    render();
  }

  function cancelLink() {
    mode = 'select';
    linkFrom = null;
    setHint('拖拽移动节点 · 双击编辑文字 · 点击选中后可删除');
    if (linkBtnEl) linkBtnEl.classList.remove('active');
  }

  function setHint(text) {
    if (hintEl) hintEl.textContent = text;
  }

  function addNode(type) {
    var labels = { start: '开始', process: '步骤', decision: '判断', end: '结束' };
    // 放到当前可视区域中心附近
    var cx = (container ? container.scrollLeft + container.clientWidth / 2 : 300);
    var cy = (container ? container.scrollTop + container.clientHeight / 2 : 300);
    var node = { id: uid('n'), type: type, x: Math.round(cx), y: Math.round(cy), text: labels[type] || '节点' };
    model.nodes.push(node);
    selected = { kind: 'node', id: node.id };
    onChange();
    render();
    editNodeText(node);
  }

  /* ---------------- 工具栏 ---------------- */
  function renderToolbar(bar) {
    bar.innerHTML = '';
    function btn(label, title, fn) {
      var b = document.createElement('button');
      b.className = 'tool-btn';
      b.innerHTML = label;
      b.title = title;
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    }
    btn('＋ 开始/结束', '添加圆角矩形节点', function () { addNode('start'); });
    btn('▭ 过程', '添加矩形节点', function () { addNode('process'); });
    btn('◇ 判断', '添加菱形节点', function () { addNode('decision'); });
    var linkBtn = btn('🔗 连线', '依次点击起点和终点节点', function () {
      if (mode === 'link') { cancelLink(); render(); return; }
      mode = 'link';
      linkFrom = null;
      linkBtn.classList.add('active');
      setHint('连线模式：点击起点节点');
    });
    linkBtnEl = linkBtn;
    btn('🗑 删除', '删除选中的节点或连线（Delete 键）', deleteSelected);
    hintEl = document.createElement('span');
    hintEl.className = 'vt-hint';
    hintEl.textContent = '拖拽移动节点 · 双击编辑文字 · 点击选中后可删除';
    bar.appendChild(hintEl);
  }

  /* ---------------- 生命周期 ---------------- */
  function init(el_, data, changeCb) {
    container = el_;
    model = data;
    onChange = changeCb;
    selected = null;
    mode = 'select';
    linkFrom = null;
    container.innerHTML = '';
    svg = el('svg', { width: CANVAS_W, height: CANVAS_H, 'class': 'flow-svg' });
    container.appendChild(svg);

    svg.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    svg.addEventListener('dblclick', onDblClick);
    keyHandler = onKey;
    document.addEventListener('keydown', keyHandler);
    render();
  }

  function destroy() {
    if (svg) {
      svg.removeEventListener('mousedown', onMouseDown);
      svg.removeEventListener('dblclick', onDblClick);
    }
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    container = null;
    svg = null;
    model = null;
  }

  function count(m) {
    return m.nodes.length + ' 节点 · ' + m.edges.length + ' 连线';
  }

  return {
    init: init,
    destroy: destroy,
    renderToolbar: renderToolbar,
    defaultModel: defaultModel,
    count: count
  };
})();
