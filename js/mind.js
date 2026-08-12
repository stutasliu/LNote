/* =========================================================
 * InkpadMind —— 可视化思维导图编辑器
 * 树状自动布局：添加子节点/同级、双击编辑、折叠展开、删除
 * ========================================================= */
window.InkpadMind = (function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var NODE_H = 40, VGAP = 18, DX = 200, PAD = 40;

  var container = null;   // #visual-canvas
  var wrap = null;        // 内层包裹（定位参考）
  var svg = null;
  var model = null;       // { root:{id,text,children:[],collapsed} }
  var onChange = null;
  var selectedId = null;
  var keyHandler = null;

  var seq = 0;
  function uid() { return 'm' + (++seq) + Date.now().toString(36); }

  /* ---------------- 模型 ---------------- */
  function defaultModel() {
    return {
      root: {
        id: 'root', text: '中心主题', collapsed: false,
        children: [
          { id: 'm1', text: '分支主题 1', collapsed: false, children: [
            { id: 'm1a', text: '子主题', collapsed: false, children: [] }
          ] },
          { id: 'm2', text: '分支主题 2', collapsed: false, children: [] },
          { id: 'm3', text: '分支主题 3', collapsed: false, children: [] }
        ]
      }
    };
  }

  function findNode(node, id, parent) {
    if (node.id === id) return { node: node, parent: parent || null };
    var cs = node.children || [];
    for (var i = 0; i < cs.length; i++) {
      var r = findNode(cs[i], id, node);
      if (r) return r;
    }
    return null;
  }

  function textWidth(text) {
    var len = (text || '').replace(/[\x00-\xff]/g, 'a').length;
    return Math.max(90, len * 8 + 32);
  }

  /* ---------------- 布局（叶子依次排，父节点垂直居中于子树） ---------------- */
  function layout() {
    var leaves = 0;
    var maxDepth = 0;
    function walk(node, depth) {
      node._w = textWidth(node.text);
      node._x = PAD + depth * DX + node._w / 2;
      if (depth > maxDepth) maxDepth = depth;
      var visible = !node.collapsed && node.children && node.children.length;
      if (!visible) {
        node._y = PAD + leaves * (NODE_H + VGAP) + NODE_H / 2;
        leaves++;
      } else {
        for (var i = 0; i < node.children.length; i++) walk(node.children[i], depth + 1);
        var first = node.children[0], last = node.children[node.children.length - 1];
        node._y = (first._y + last._y) / 2;
      }
    }
    walk(model.root, 0);
    return {
      w: PAD * 2 + (maxDepth + 1) * DX + 120,
      h: PAD * 2 + leaves * (NODE_H + VGAP)
    };
  }

  /* ---------------- 渲染 ---------------- */
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function render() {
    var size = layout();
    wrap.innerHTML = '';
    svg = el('svg', { width: size.w, height: size.h, 'class': 'mind-svg' });
    wrap.appendChild(svg);

    var edgeLayer = el('g', {});
    var nodeLayer = el('g', {});
    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);

    (function draw(node) {
      var visible = !node.collapsed && node.children && node.children.length;
      if (visible) {
        node.children.forEach(function (c) {
          var x1 = node._x + node._w / 2, y1 = node._y;
          var x2 = c._x - c._w / 2, y2 = c._y;
          edgeLayer.appendChild(el('path', {
            d: 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + 45) + ' ' + y1 + ', ' + (x2 - 45) + ' ' + y2 + ', ' + x2 + ' ' + y2,
            'class': 'mind-edge'
          }));
          draw(c);
        });
      }
      var isRoot = node === model.root;
      var g = el('g', {
        'class': 'mind-node' + (isRoot ? ' root' : '') + (node.id === selectedId ? ' selected' : ''),
        'data-id': node.id,
        transform: 'translate(' + node._x + ',' + node._y + ')'
      });
      g.appendChild(el('rect', {
        x: -node._w / 2, y: -NODE_H / 2, width: node._w, height: NODE_H, rx: 8, 'class': 'node-shape'
      }));
      var t = el('text', { x: 0, y: 0, 'class': 'node-text' });
      t.textContent = node.text;
      g.appendChild(t);
      // 折叠开关
      if (node.children && node.children.length) {
        var tg = el('g', { 'class': 'mind-toggle', 'data-id': node.id, transform: 'translate(' + (node._w / 2 + 12) + ',0)' });
        tg.appendChild(el('circle', { r: 8, 'class': 'toggle-circle' }));
        var tt = el('text', { x: 0, y: 0, 'class': 'toggle-text' });
        tt.textContent = node.collapsed ? '+' : '−';
        tg.appendChild(tt);
        if (node.collapsed) {
          var ct = el('text', { x: node._w / 2 + 26, y: 0, 'class': 'collapse-count' });
          ct.textContent = '(' + subtreeCount(node) + ')';
          g.appendChild(ct);
        }
        g.appendChild(tg);
      }
      nodeLayer.appendChild(g);
    })(model.root);
  }

  function subtreeCount(node) {
    var n = 0;
    (function walk(x) {
      (x.children || []).forEach(function (c) { n++; walk(c); });
    })(node);
    return n;
  }

  /* ---------------- 交互 ---------------- */
  function onClick(e) {
    var tg = e.target.closest('.mind-toggle');
    if (tg) {
      var fr = findNode(model.root, tg.getAttribute('data-id'));
      if (fr) {
        fr.node.collapsed = !fr.node.collapsed;
        onChange();
        render();
      }
      return;
    }
    var g = e.target.closest('.mind-node');
    if (g) {
      selectedId = g.getAttribute('data-id');
      render();
      return;
    }
    selectedId = null;
    render();
  }

  function onDblClick(e) {
    var g = e.target.closest('.mind-node');
    if (!g) return;
    var fr = findNode(model.root, g.getAttribute('data-id'));
    if (fr) editNodeText(fr.node);
  }

  function onKey(e) {
    var tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    if (!selectedId) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
    else if (e.key === 'Tab') { e.preventDefault(); addChild(); }
    else if (e.key === 'Enter') { e.preventDefault(); addSibling(); }
    else if (e.key === 'F2') { e.preventDefault(); editSelected(); }
  }

  function editNodeText(node) {
    var input = document.createElement('input');
    input.className = 'node-edit-input';
    input.value = node.text || '';
    input.style.left = (node._x - node._w / 2) + 'px';
    input.style.top = (node._y - NODE_H / 2) + 'px';
    input.style.width = node._w + 'px';
    input.style.height = NODE_H + 'px';
    wrap.appendChild(input);
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

  function targetNode() {
    if (!selectedId) return { node: model.root, parent: null };
    return findNode(model.root, selectedId);
  }

  function addChild() {
    var fr = targetNode();
    if (!fr) return;
    var parent = fr.node;
    parent.children = parent.children || [];
    parent.collapsed = false;
    var node = { id: uid(), text: '分支主题', collapsed: false, children: [] };
    parent.children.push(node);
    selectedId = node.id;
    onChange();
    render();
    editNodeText(node);
  }

  function addSibling() {
    var fr = targetNode();
    if (!fr || !fr.parent) { setHintTemp('根节点不能添加同级'); return; }
    var list = fr.parent.children;
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === fr.node.id) idx = i;
    var node = { id: uid(), text: '分支主题', collapsed: false, children: [] };
    list.splice(idx + 1, 0, node);
    selectedId = node.id;
    onChange();
    render();
    editNodeText(node);
  }

  function editSelected() {
    var fr = targetNode();
    if (fr) editNodeText(fr.node);
  }

  function deleteSelected() {
    if (!selectedId) { setHintTemp('先点击选中一个节点'); return; }
    var fr = findNode(model.root, selectedId);
    if (!fr || !fr.parent) { setHintTemp('根节点不能删除'); return; }
    fr.parent.children = fr.parent.children.filter(function (c) { return c.id !== selectedId; });
    selectedId = null;
    onChange();
    render();
  }

  var hintEl = null;
  var hintTimer = null;
  function setHintTemp(text) {
    if (!hintEl) return;
    var orig = '点击选中节点 · 双击编辑 · Tab 加子节点 · Enter 加同级';
    hintEl.textContent = text;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hintEl.textContent = orig; }, 2000);
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
    btn('＋ 子节点', '为选中节点添加子节点（Tab）', addChild);
    btn('＋ 同级', '为选中节点添加同级节点（Enter）', addSibling);
    btn('✏ 编辑', '编辑选中节点文字（F2 / 双击）', editSelected);
    btn('🗑 删除', '删除选中分支（Delete）', deleteSelected);
    hintEl = document.createElement('span');
    hintEl.className = 'vt-hint';
    hintEl.textContent = '点击选中节点 · 双击编辑 · Tab 加子节点 · Enter 加同级';
    bar.appendChild(hintEl);
  }

  /* ---------------- 生命周期 ---------------- */
  function init(el_, data, changeCb) {
    container = el_;
    model = data;
    onChange = changeCb;
    selectedId = null;
    container.innerHTML = '';
    wrap = document.createElement('div');
    wrap.className = 'mind-wrap';
    container.appendChild(wrap);

    container.addEventListener('click', onClick);
    container.addEventListener('dblclick', onDblClick);
    keyHandler = onKey;
    document.addEventListener('keydown', keyHandler);
    render();
  }

  function destroy() {
    if (container) {
      container.removeEventListener('click', onClick);
      container.removeEventListener('dblclick', onDblClick);
    }
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    container = null;
    wrap = null;
    svg = null;
    model = null;
  }

  function count(m) {
    return (subtreeCount(m.root) + 1) + ' 节点';
  }

  return {
    init: init,
    destroy: destroy,
    renderToolbar: renderToolbar,
    defaultModel: defaultModel,
    count: count
  };
})();
