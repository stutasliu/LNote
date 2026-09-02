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
  var model = null;       // { root:{id,text,children:[],collapsed,style?} }
  var onChange = null;
  var selectedId = null;
  var keyHandler = null;
  var undoStack = [];     // 撤销历史（模型快照栈）
  var styleBarEl = null;  // 样式设置浮层面板
  var ctxMenuEl = null;   // 右键上下文菜单 DOM
  var stylePanelOpen = false;
  var stylePanelTab = 'node'; // 'node' | 'page' 样式面板当前 tab
  var panelMode = null;   // 当前样式作用对象：'node' | null
  var panelHistPushed = false; // 本次选中周期是否已入撤销栈（连续调节只入一次）
  var lastPanelSelKey = '';    // 上次样式栏对应的选中对象标识（选中切换时重置历史标记）
  var focusId = null;     // 聚焦模式：只高亮从根到 focusId 的路径 + 其后代
  var CLIPBOARD_MIME = 'application/x-inkpad-mind';
  // 布局密度（由 model.layoutDensity 驱动：compact/normal/loose）
  var LAYOUT_PRESETS = {
    compact: { nodePad: 8,  vGap: 10, hGap: 120, maxWidth: 220 },
    normal:  { nodePad: 12, vGap: 18, hGap: 200, maxWidth: 320 },
    loose:   { nodePad: 16, vGap: 26, hGap: 280, maxWidth: 420 }
  };

  var seq = 0;
  function uid() { return 'm' + (++seq) + Date.now().toString(36); }

  /* ---------------- 模型 ---------------- */
  function defaultModel() {
    return {
      themeName: 'classic',
      layoutDensity: 'normal',
      numberingStyle: 'none', // 'none' | 'arabic' | 'alpha' | 'roman' | 'cn'
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

  function _layoutParam() {
    var key = (model && model.layoutDensity) || 'normal';
    return LAYOUT_PRESETS[key] || LAYOUT_PRESETS.normal;
  }

  function textWidth(text, pad) {
    if (pad == null) pad = 12;
    var len = (text || '').replace(/[\x00-\xff]/g, 'a').length;
    return Math.max(90, len * 8 + pad * 2);
  }

  /* ---------------- 布局（叶子依次排，父节点垂直居中于子树） ---------------- */
  function layout() {
    var leaves = 0;
    var maxDepth = 0;
    var p = _layoutParam();
    var _pad = PAD;
    function walk(node, depth, idxPath) {
      if (!idxPath) idxPath = [];
      node._depth = depth;
      node._idx = idxPath.slice();
      var maxW = p.maxWidth;
      var raw = textWidth(node.text, p.nodePad);
      // 形状决定最小宽高：菱形/六边形需要更宽一点的矩形底
      var shp = (node.style && node.style.shape) || 'rect';
      var w = Math.max(raw, shp === 'diamond' || shp === 'hexagon' ? NODE_H * 2.2 : 90);
      if (w > maxW) w = maxW;
      node._w = w;
      node._x = _pad + depth * p.hGap + node._w / 2;
      if (depth > maxDepth) maxDepth = depth;
      var visible = !node.collapsed && node.children && node.children.length;
      if (!visible) {
        node._y = _pad + leaves * (NODE_H + p.vGap) + NODE_H / 2;
        leaves++;
      } else {
        for (var i = 0; i < node.children.length; i++) {
          var np = idxPath.slice(); np.push(i + 1);
          walk(node.children[i], depth + 1, np);
        }
        var first = node.children[0], last = node.children[node.children.length - 1];
        node._y = (first._y + last._y) / 2;
      }
    }
    walk(model.root, 0, [1]);
    return {
      w: _pad * 2 + (maxDepth + 1) * p.hGap + p.maxWidth,
      h: _pad * 2 + leaves * (NODE_H + p.vGap)
    };
  }

  /* ---------------- 渲染 ---------------- */
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function _isOnFocusPath(nodeId) {
    // 判断 nodeId 是否在「根到 focusId」路径上，或者是 focusId 的子孙
    if (!focusId) return true;
    if (nodeId === focusId) return true;
    var onPath = false;
    (function walk(n, ancestors) {
      if (onPath) return;
      if (n.id === focusId) {
        // focusId 路径上的所有祖先（包括 root）
        for (var i = 0; i < ancestors.length; i++) if (ancestors[i] === nodeId) { onPath = true; return; }
        // focusId 自身
        if (focusId === nodeId) onPath = true;
        return;
      }
      var next = ancestors.slice();
      next.push(n.id);
      (n.children || []).forEach(function (c) { walk(c, next); });
    })(model.root, []);
    if (onPath) return true;
    // 子孙判断：从 focusId 对应节点开始遍历子树，含 nodeId 即命中
    var fr = findNode(model.root, focusId);
    if (!fr) return true;
    var found = false;
    (function w(n) {
      if (found) return;
      if (n.id === nodeId) { found = true; return; }
      (n.children || []).forEach(w);
    })(fr.node);
    return found;
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
      var st = effNodeStyle(node);
      var visible = !node.collapsed && node.children && node.children.length;
      var dim = focusId && !_isOnFocusPath(node.id);
      if (visible) {
        node.children.forEach(function (c) {
          var x1 = node._x + node._w / 2, y1 = node._y;
          var x2 = c._x - c._w / 2, y2 = c._y;
          var es = { stroke: st.stroke, 'stroke-width': st.strokeWidth };
          var dash = dashAttr(st.strokeDash);
          if (dash) es['stroke-dasharray'] = dash;
          if (dim) es.opacity = 0.12;
          edgeLayer.appendChild(el('path', {
            d: 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + 45) + ' ' + y1 + ', ' + (x2 - 45) + ' ' + y2 + ', ' + x2 + ' ' + y2,
            'class': 'mind-edge',
            style: styleStr(es)
          }));
          draw(c);
        });
      }
      var isRoot = node === model.root;
      var g = el('g', {
        'class': 'mind-node' + (isRoot ? ' root' : '') + (node.id === selectedId ? ' selected' : '') + (dim ? ' dim' : ''),
        'data-id': node.id,
        transform: 'translate(' + node._x + ',' + node._y + ')',
        style: dim ? 'opacity:0.12' : ''
      });
      g.appendChild(el('rect', {
        x: -node._w / 2, y: -NODE_H / 2, width: node._w, height: NODE_H, rx: st.radius, 'class': 'node-shape',
        style: styleStr({ fill: st.fill, stroke: st.stroke, 'stroke-width': st.strokeWidth })
      }));
      if (node.id === selectedId) {
        g.appendChild(el('rect', {
          x: -node._w / 2, y: -NODE_H / 2, width: node._w, height: NODE_H, rx: st.radius, 'class': 'node-outline'
        }));
      }
      var t = el('text', { x: 0, y: 0, 'class': 'node-text' });
      t.textContent = node.text;
      t.setAttribute('style', styleStr({
        fill: st.textColor,
        'font-size': st.fontSize + 'px',
        'font-weight': st.bold ? 'bold' : 'normal',
        'font-style': st.italic ? 'italic' : 'normal'
      }));
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
    applyPan();
    syncStyleBar();
  }

  function subtreeCount(node) {
    var n = 0;
    (function walk(x) {
      (x.children || []).forEach(function (c) { n++; walk(c); });
    })(node);
    return n;
  }

  /* ---------------- 剪贴板：复制/剪切/粘贴 ---------------- */
  // 复制为「JSON(树) + 纯文本(缩进层级)」双 payload，支持跨 mind 实例、跨文档，以及外部粘贴为 Markdown 风格缩进
  function _treeToPlain(nodes, depth) {
    if (!depth) depth = 0;
    var pad = '';
    for (var i = 0; i < depth; i++) pad += '  ';
    return nodes.map(function (n) {
      var line = pad + '- ' + n.text;
      if (n.children && n.children.length) line += '\n' + _treeToPlain(n.children, depth + 1);
      return line;
    }).join('\n');
  }
  function writeClipboard(payload, plainText) {
    var p1;
    // modern Clipboard API：同时写多类型
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      var blob1 = new Blob([payload], { type: CLIPBOARD_MIME });
      var blob2 = new Blob([plainText], { type: 'text/plain' });
      try {
        p1 = navigator.clipboard.write([new window.ClipboardItem({
          'text/plain': blob2,
          [CLIPBOARD_MIME]: blob1
        })]);
      } catch (_) { p1 = Promise.reject(); }
    } else {
      p1 = Promise.reject();
    }
    return p1.catch(function () {
      // 退化：仅写入纯文本（JSON 用 base64 token 编码入 localStorage 兜底）
      try { localStorage.setItem('_inkpad_mind_copy', payload); } catch (_) {}
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(plainText).catch(function () {
          return legacyCopy(plainText);
        });
      }
      return Promise.resolve(legacyCopy(plainText));
    });
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove();
    return ok;
  }
  function readClipboardJSON(e) {
    // 优先从 ClipboardEvent.clipboardData 读（Ctrl+V 事件触发时有，最稳定）
    if (e && e.clipboardData) {
      try {
        var v = e.clipboardData.getData(CLIPBOARD_MIME);
        if (v) return JSON.parse(v);
      } catch (_) {}
    }
    // 退化：读 localStorage 兜底 token（右键粘贴 / 异步时可用）
    try {
      var raw = localStorage.getItem('_inkpad_mind_copy');
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  }
  function readClipboardPlainText(e) {
    if (e && e.clipboardData) {
      try { return e.clipboardData.getData('text/plain') || ''; } catch (_) {}
    }
    return '';
  }
  function copyCurrent() {
    var fr = targetNode();
    if (!fr) return Promise.resolve(false);
    var root = cloneNode(fr.node);
    var payload = JSON.stringify({ v: 1, root: root });
    var plain = _treeToPlain([root], 0);
    return writeClipboard(payload, plain).then(function () {
      setHintTemp('已复制 ' + countSubtree(root) + ' 个节点到剪贴板');
      return true;
    });
  }
  function cutCurrent() {
    // 剪切 = 复制 + 删除（根不可剪切，保留同 addChild 安全模型）
    var fr = targetNode();
    if (!fr || !fr.parent) { setHintTemp('根节点不能剪切'); return Promise.resolve(false); }
    return copyCurrent().then(function () {
      pushHistory();
      fr.parent.children = fr.parent.children.filter(function (c) { return c.id !== fr.node.id; });
      selectedId = null;
      onChange();
      render();
      setHintTemp('已剪切节点（可用 Ctrl+V 粘贴）');
      return true;
    });
  }
  function plainTextToNodes(text) {
    // 粘贴外部纯文本时：按行拆分为平铺同级子节点；若使用 Markdown 缩进（以 2/4 空格或一个 tab 前缀），还原为层级
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var roots = [], stack = [{ depth: -1, node: null, children: roots }];
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      if (!raw.trim()) continue;
      var m = raw.match(/^([\s]*)(?:[-*\u2022\u25CF]\s+)?([\s\S]*)$/);
      var prefix = m ? m[1] : '';
      var txt = (m ? m[2] : raw).trim();
      if (!txt) continue;
      // 计算缩进：按 tab=2, 每 2 空格=1 级
      var depth = 0;
      for (var k = 0; k < prefix.length; ) {
        if (prefix.charAt(k) === '\t') { depth++; k++; }
        else { depth++; k += 2; }
      }
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
      var parent = stack[stack.length - 1];
      var node = { id: uid(), text: txt, children: [], collapsed: false };
      parent.children.push(node);
      stack.push({ depth: depth, node: node, children: node.children });
    }
    return roots;
  }
  function pasteFromClipboard(e) {
    // 粘贴落点：选中节点下挂；若无选中则挂 root 下
    var dest = targetNode() ? targetNode().node : (model ? model.root : null);
    if (!dest) return Promise.resolve(false);
    var tree = readClipboardJSON(e);
    pushHistory();
    if (tree && tree.root) {
      // 解析成功 JSON 粘贴：深拷贝后重新分配 id，避免两个节点同 id（跨文档尤其重要）
      function reId(n) {
        n.id = uid();
        if (n.children) n.children.forEach(reId);
        return n;
      }
      var newNode = reId(cloneNode(tree.root));
      dest.children = dest.children || [];
      dest.children.push(newNode);
      dest.collapsed = false;
      selectedId = newNode.id;
      setHintTemp('已粘贴 ' + countSubtree(newNode) + ' 个节点');
    } else {
      var plain = readClipboardPlainText(e);
      // 若纯文本空：尝试异步 readText（右键粘贴时 e 为空）
      var p = plain ? Promise.resolve(plain) :
        ((navigator.clipboard && navigator.clipboard.readText)
          ? navigator.clipboard.readText().catch(function () { return ''; })
          : Promise.resolve(''));
      return p.then(function (text) {
        var newNodes = plainTextToNodes(text);
        if (!newNodes.length) { setHintTemp('剪贴板为空或无法解析'); return false; }
        dest.children = dest.children || [];
        for (var i = 0; i < newNodes.length; i++) dest.children.push(newNodes[i]);
        dest.collapsed = false;
        selectedId = newNodes[0].id;
        onChange();
        render();
        setHintTemp('已粘贴 ' + newNodes.length + ' 个节点');
        return true;
      });
    }
    onChange();
    render();
    return Promise.resolve(true);
  }

  /* ---------------- 右键菜单 ---------------- */
  var CTX_ITEMS_BLANK = [
    { id: 'paste', label: '粘贴', icon: '📋', shortcut: 'Ctrl+V' },
    { sep: true },
    { id: 'new-child', label: '新增主题（子节点）', icon: '➕', shortcut: 'Tab' },
    { id: 'new-sibling', label: '新增主题（同级）', icon: '➡️', shortcut: 'Enter' },
    { sep: true },
    { id: 'focus-exit', label: '退出聚焦模式', icon: '🌐' },
    { id: 'select-root', label: '选择根节点', icon: '🎯' }
  ];
  var CTX_ITEMS_NODE = [
    { id: 'copy', label: '复制', icon: '📄', shortcut: 'Ctrl+C' },
    { id: 'cut', label: '剪切', icon: '✂️', shortcut: 'Ctrl+X' },
    { id: 'paste', label: '粘贴为子节点', icon: '📋', shortcut: 'Ctrl+V' },
    { sep: true },
    { id: 'new-child', label: '新增子主题', icon: '➕', shortcut: 'Tab' },
    { id: 'new-sibling', label: '新增同级主题', icon: '➡️', shortcut: 'Enter' },
    { id: 'new-parent', label: '新增父主题', icon: '⬆️', shortcut: 'Shift+Tab' },
    { sep: true },
    { id: 'edit', label: '编辑文字', icon: '✏️', shortcut: 'F2' },
    { id: 'toggle', label: '折叠/展开分支', icon: '🔽' },
    { id: 'focus', label: '聚焦此分支', icon: '🔍', shortcut: 'Ctrl+`' },
    { sep: true },
    { id: 'delete', label: '删除', icon: '🗑️', shortcut: 'Del' },
    { id: 'delete-subtree', label: '批量删除子孙', icon: '🗂️', shortcut: 'Ctrl+Del' }
  ];
  function buildCtxMenu() {
    if (ctxMenuEl) return;
    ctxMenuEl = document.createElement('div');
    ctxMenuEl.className = 'mind-ctx-menu';
    ctxMenuEl.style.display = 'none';
    ctxMenuEl.addEventListener('click', function (ev) {
      var mi = ev.target.closest('.mcm-item');
      if (!mi) return;
      var id = mi.getAttribute('data-id');
      if (!id) return;
      hideCtxMenu();
      runCtxAction(id);
    });
    document.body.appendChild(ctxMenuEl);
  }
  function hideCtxMenu() { if (ctxMenuEl) ctxMenuEl.style.display = 'none'; }
  function showCtxMenu(x, y, mode) {
    if (!ctxMenuEl) buildCtxMenu();
    var items = mode === 'node' ? CTX_ITEMS_NODE : CTX_ITEMS_BLANK;
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.sep) { html += '<div class="mcm-sep"></div>'; continue; }
      var disabled = '';
      if (it.id === 'focus-exit' && !focusId) disabled = ' disabled';
      if (it.id === 'paste') { disabled = ''; /* 粘贴即使空也显示，用户可感知为空 */ }
      html += '<div class="mcm-item' + disabled + '" data-id="' + it.id + '">' +
        '<span class="mcm-icon">' + (it.icon || '') + '</span>' +
        '<span class="mcm-label">' + it.label + '</span>' +
        (it.shortcut ? '<span class="mcm-keys">' + it.shortcut + '</span>' : '') +
        '</div>';
    }
    ctxMenuEl.innerHTML = html;
    ctxMenuEl.style.display = 'block';
    var w = ctxMenuEl.offsetWidth || 220;
    var h = ctxMenuEl.offsetHeight || 320;
    var left = Math.min(x, window.innerWidth - w - 8);
    var top = Math.min(y, window.innerHeight - h - 8);
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    ctxMenuEl.style.left = left + 'px';
    ctxMenuEl.style.top = top + 'px';
  }
  function runCtxAction(id) {
    switch (id) {
      case 'copy': copyCurrent(); break;
      case 'cut':  cutCurrent(); break;
      case 'paste': pasteFromClipboard(null); break;
      case 'new-child':   addChild(); break;
      case 'new-sibling': addSibling(); break;
      case 'new-parent':  addParent(); break;
      case 'edit':        editSelected(); break;
      case 'toggle': {
        var fr = targetNode();
        if (fr && fr.node.children && fr.node.children.length) {
          pushHistory();
          fr.node.collapsed = !fr.node.collapsed;
          onChange(); render();
        }
        break;
      }
      case 'focus': {
        var fr2 = targetNode();
        if (fr2) { focusId = fr2.node.id; render(); setHintTemp('已进入聚焦模式（Ctrl+` 切换）'); }
        break;
      }
      case 'focus-exit': focusId = null; render(); break;
      case 'select-root': selectedId = model.root.id; render(); break;
      case 'delete': deleteSelected(); break;
      case 'delete-subtree': deleteCurrentChildren(); break;
    }
  }
  // 新增父主题：当前节点 → 变为新父节点的子节点
  function addParent() {
    var fr = targetNode();
    if (!fr) return;
    if (!fr.parent) { setHintTemp('根节点不能再新增父主题'); return; }
    pushHistory();
    var p = { id: uid(), text: '新主题', children: [], collapsed: false };
    // 把旧 parent.children[i] 替换成 p，再把原节点挂为 p 的第一个子
    var siblings = fr.parent.children;
    for (var i = 0; i < siblings.length; i++) {
      if (siblings[i].id === fr.node.id) {
        siblings[i] = p;
        p.children.push(fr.node);
        break;
      }
    }
    selectedId = p.id;
    onChange(); render();
    // 进入编辑态
    setTimeout(function () { editNodeText(p.id); }, 30);
  }
  function countSubtree(n) {
    var c = 1;
    if (n.children) for (var i = 0; i < n.children.length; i++) c += countSubtree(n.children[i]);
    return c;
  }
  // 删除当前节点的所有子孙（保留自身）
  function deleteCurrentChildren() {
    var fr = targetNode();
    if (!fr) return;
    if (!fr.node.children || !fr.node.children.length) { setHintTemp('该节点没有可删除的子节点'); return; }
    var n = countSubtree(fr.node) - 1;
    if (!confirm('确定要批量删除「' + fr.node.text + '」的全部子孙节点吗？将删除 ' + n + ' 个节点。')) return;
    pushHistory();
    fr.node.children = [];
    fr.node.collapsed = false;
    onChange();
    render();
    setHintTemp('已删除 ' + n + ' 个子孙节点');
  }

  /* ---------------- 拖拽：根节点平移画布 / 子节点拖动排序 ---------------- */
  var dragState = null;
  var _dragJustEnded = false;
  var panX = 0, panY = 0; // 画布平移偏移（transform translate）

  function applyPan() {
    if (wrap) wrap.style.transform = 'translate(' + panX + 'px,' + panY + 'px)';
  }

  function onNodeMouseDown(e) {
    if (!container) return;
    if (e.button !== 0) return; // 仅左键
    var g = e.target.closest('.mind-node');
    if (!g) return;
    // 点击折叠开关不触发拖拽
    if (e.target.closest('.mind-toggle')) return;
    var nodeId = g.getAttribute('data-id');
    var isRoot = (nodeId === model.root.id);
    dragState = {
      mode: isRoot ? 'pan' : 'reorder',
      nodeId: nodeId,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: panX,
      startPanY: panY,
      moved: false,
      ghostEl: null,
      hoverIdx: -1
    };
    document.addEventListener('mousemove', onDragMouseMove);
    document.addEventListener('mouseup', onDragMouseUp);
  }

  function onDragMouseMove(e) {
    if (!dragState || !container) return;
    var dx = e.clientX - dragState.startX;
    var dy = e.clientY - dragState.startY;
    if (!dragState.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return; // 阈值
    e.preventDefault();
    if (!dragState.moved) {
      dragState.moved = true;
      if (dragState.mode === 'pan') {
        container.style.cursor = 'grabbing';
      } else if (dragState.mode === 'reorder') {
        // 创建拖拽幽灵元素
        var fr = findNode(model.root, dragState.nodeId);
        if (!fr || !fr.parent) { dragState = null; return; }
        dragState.parent = fr.parent;
        dragState.siblings = fr.parent.children;
        dragState.dragIdx = fr.parent.children.indexOf(fr.node);
        createDragGhost(fr.node, e.clientX, e.clientY);
        // 隐藏原节点（降低透明度）
        var origEl = container.querySelector('.mind-node[data-id="' + CSS.escape(dragState.nodeId) + '"]');
        if (origEl) origEl.style.opacity = '0.25';
      }
    }
    if (dragState.mode === 'pan') {
      // 平移画布：用 transform translate 移动 wrap
      panX = dragState.startPanX + dx;
      panY = dragState.startPanY + dy;
      applyPan();
    } else if (dragState.mode === 'reorder') {
      // 更新幽灵位置
      if (dragState.ghostEl) {
        dragState.ghostEl.style.left = e.clientX + 'px';
        dragState.ghostEl.style.top = e.clientY + 'px';
      }
      updateReorderHover(e.clientY);
    }
  }

  function onDragMouseUp(e) {
    document.removeEventListener('mousemove', onDragMouseMove);
    document.removeEventListener('mouseup', onDragMouseUp);
    if (!dragState) return;
    if (dragState.moved && dragState.mode === 'reorder' && dragState.hoverIdx >= 0) {
      // 执行重排序
      var fr = findNode(model.root, dragState.nodeId);
      if (fr && fr.parent && dragState.hoverIdx !== dragState.dragIdx) {
        pushHistory();
        var arr = fr.parent.children;
        var movedNode = arr.splice(dragState.dragIdx, 1)[0];
        // 调整目标索引（删除后偏移）
        var targetIdx = dragState.hoverIdx;
        if (dragState.dragIdx < targetIdx) targetIdx--;
        arr.splice(targetIdx, 0, movedNode);
        onChange();
        setHintTemp('已重新排序节点');
      }
    }
    // 清理幽灵
    if (dragState && dragState.ghostEl) dragState.ghostEl.remove();
    // 恢复原节点透明度
    if (dragState && dragState.nodeId) {
      var origEl = container.querySelector('.mind-node[data-id="' + CSS.escape(dragState.nodeId) + '"]');
      if (origEl) origEl.style.opacity = '';
    }
    // 清理插入指示线
    var indicator = container.querySelector('.mind-drop-indicator');
    if (indicator) indicator.remove();
    var wasMoved = dragState.moved;
    var wasPan = dragState.mode === 'pan';
    dragState = null;
    container.style.cursor = '';
    if (wasMoved) { _dragJustEnded = true; if (!wasPan) render(); }
  }

  function createDragGhost(node, x, y) {
    var ghost = document.createElement('div');
    ghost.className = 'mind-drag-ghost';
    var st = effNodeStyle(node);
    ghost.textContent = node.text;
    ghost.style.background = st.fill;
    ghost.style.color = st.textColor;
    ghost.style.borderColor = st.stroke;
    document.body.appendChild(ghost);
    dragState.ghostEl = ghost;
    ghost.style.left = x + 'px';
    ghost.style.top = y + 'px';
  }

  function updateReorderHover(mouseY) {
    if (!dragState || !dragState.parent) return;
    // 找到兄弟节点中最近的插入位置
    var bestIdx = -1;
    var bestDist = Infinity;
    var siblings = dragState.siblings;
    for (var i = 0; i < siblings.length; i++) {
      var n = siblings[i];
      if (n.id === dragState.nodeId) continue;
      var elNode = container.querySelector('.mind-node[data-id="' + CSS.escape(n.id) + '"]');
      if (!elNode) continue;
      var rect = elNode.getBoundingClientRect();
      // 插入点：节点上方/下方
      var topY = rect.top;
      var botY = rect.bottom;
      var midY = (topY + botY) / 2;
      // 距离上方（插入到 i 之前）
      var distTop = Math.abs(mouseY - topY);
      // 距离下方（插入到 i+1 之前）
      var distBot = Math.abs(mouseY - botY);
      if (distTop < bestDist) { bestDist = distTop; bestIdx = i; }
      if (distBot < bestDist) { bestDist = distBot; bestIdx = i + 1; }
    }
    dragState.hoverIdx = bestIdx;
    // 显示插入指示线
    var indicator = container.querySelector('.mind-drop-indicator');
    if (bestIdx < 0) return;
    // 计算指示线位置（相对于 container scroll viewport）
    var targetEl;
    var insertBefore = true;
    if (bestIdx >= siblings.length) {
      targetEl = container.querySelector('.mind-node[data-id="' + CSS.escape(siblings[siblings.length - 1].id) + '"]');
      insertBefore = false;
    } else {
      targetEl = container.querySelector('.mind-node[data-id="' + CSS.escape(siblings[bestIdx].id) + '"]');
      insertBefore = true;
    }
    if (!targetEl) return;
    var tRect = targetEl.getBoundingClientRect();
    var lineY = insertBefore ? tRect.top : tRect.bottom;
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'mind-drop-indicator';
      container.appendChild(indicator);
    }
    indicator.style.position = 'fixed';
    indicator.style.left = tRect.left + 'px';
    indicator.style.top = lineY + 'px';
    indicator.style.width = tRect.width + 'px';
    indicator.style.display = 'block';
  }

  /* ---------------- 交互 ---------------- */
  function onContextMenu(e) {
    if (!container) return;
    e.preventDefault();
    var n = e.target.closest('.mind-node');
    var mode = 'blank';
    if (n) {
      selectedId = n.getAttribute('data-id');
      render();
      mode = 'node';
    }
    buildCtxMenu();
    showCtxMenu(e.clientX, e.clientY, mode);
  }
  function _isMindActive() { return !!container; }

  function onClick(e) {
    hideCtxMenu();
    // 拖拽刚结束，抑制本次 click（避免拖动后被误判为选中）
    if (_dragJustEnded) { _dragJustEnded = false; return; }
    var tg = e.target.closest('.mind-toggle');
    if (tg) {
      var fr = findNode(model.root, tg.getAttribute('data-id'));
      if (fr) {
        pushHistory();
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
    hideCtxMenu();
    var g = e.target.closest('.mind-node');
    if (!g) return;
    var fr = findNode(model.root, g.getAttribute('data-id'));
    if (fr) editNodeText(fr.node);
  }

  var copyCutHandler = null, pasteHandler = null, docMouseDownHandler = null;

  function onKey(e) {
    var tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    if (!_isMindActive()) return;
    // Ctrl/Cmd 组合键
    if (e.ctrlKey || e.metaKey) {
      if (e.shiftKey) {
        // Shift+Ctrl+V 一般是无格式粘贴，此处视为普通粘贴
      }
      if (e.key === 'c' || e.key === 'C') { e.preventDefault(); copyCurrent(); return; }
      if (e.key === 'x' || e.key === 'X') { e.preventDefault(); cutCurrent(); return; }
      if (e.key === 'v' || e.key === 'V') {
        // 粘贴优先走事件驱动的 paste（真实 clipboardData），fallback 到异步 readText
        e.preventDefault();
        // 主动触发 window 的 paste 事件链路，避免我们绕过事件而宿主里的 paste 拦截器又与我们抢
        var ok = false;
        try {
          if (document.execCommand && !navigator.clipboard) ok = document.execCommand('paste');
        } catch (_) {}
        if (!ok) pasteFromClipboard(null);
        return;
      }
      if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undo(); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        // Ctrl+Del 或 Ctrl+Backspace：批量删除子孙
        e.preventDefault(); deleteCurrentChildren(); return;
      }
      if (e.key === '`') {
        // Ctrl+`：聚焦模式开关（当前选中则聚焦；无选中或已聚焦则退出）
        e.preventDefault();
        var frF = targetNode();
        if (focusId || !frF) { focusId = null; setHintTemp('已退出聚焦模式'); }
        else { focusId = frF.node.id; setHintTemp('已进入聚焦模式（Ctrl+` 切换）'); }
        render();
        return;
      }
      return;
    }
    if (e.key === 'Escape') {
      hideCtxMenu();
      focusId = null;
      selectedId = null;
      render();
      return;
    }
    // Shift+Tab：新增父主题（Tab 本身是新增子，shift 取反）
    if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); addParent(); return; }
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
        if (v && v !== node.text) { pushHistory(); node.text = v; onChange(); }
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
    pushHistory();
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
    pushHistory();
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
    pushHistory();
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

  /* ---------------- 样式系统（ProcessOn 风格样式面板，与流程图一致） ---------------- */
  // model 中 style 只存用户自定义字段，渲染时与默认值合并得到最终样式
  var STYLE_COLORS = [
    '#ffffff', '#f1f1ef', '#fdf6e3', '#fde8e8', '#e8f5e9', '#e3f2fd', '#fff3e0', '#f3e5f5',
    '#ffeb3b', '#ff9800', '#f44336', '#e91e63', '#9c27b0', '#3f51b5', '#2196f3', '#00bcd4',
    '#4caf50', '#8bc34a', '#5b6b79', '#8a94a6', '#6b7688', '#333333', '#111111'
  ];

  // 12 套预设主题（按层级 root / level1 / level2+ / leaf / edge / arrow 设置默认值，用户自定义 style 仍会覆盖）
  var THEMES = {
    classic: {
      root:   { fill: '#e8f2fb', stroke: '#3370FF', strokeWidth: 1.6, bold: true, fontSize: 14, shape: 'round' },
      level1: { fill: '#ffffff', stroke: '#3370FF', strokeWidth: 1.4, shape: 'round' },
      level2: { fill: '#ffffff', stroke: '#7a8794', strokeWidth: 1.2, shape: 'rect' },
      edge:   { stroke: '#c3cad2', strokeWidth: 1.6, dash: 'none', arrow: 'none' }
    },
    business: {
      root:   { fill: '#1f2a44', stroke: '#1f2a44', strokeWidth: 1.6, textColor: '#ffffff', bold: true, fontSize: 15, shape: 'round' },
      level1: { fill: '#eef1f7', stroke: '#1f2a44', strokeWidth: 1.4, textColor: '#1f2a44', shape: 'round' },
      level2: { fill: '#ffffff', stroke: '#8a94a6', strokeWidth: 1.2, shape: 'rect' },
      edge:   { stroke: '#1f2a44', strokeWidth: 1.4, dash: 'none', arrow: 'end' }
    },
    rainbow: {
      root:   { fill: '#ff5c8a', stroke: '#ff5c8a', strokeWidth: 1.6, textColor: '#ffffff', bold: true, fontSize: 14, shape: 'ellipse' },
      level1: { fill: '#ffb74d', stroke: '#e8991a', strokeWidth: 1.4, textColor: '#3a2a00', shape: 'ellipse' },
      level2: { fill: '#ffe082', stroke: '#d2a82b', strokeWidth: 1.2, textColor: '#2a1f00', shape: 'rect' },
      edge:   { stroke: '#ff8a65', strokeWidth: 1.8, dash: 'dashed', arrow: 'end' }
    },
    dark: {
      root:   { fill: '#263238', stroke: '#00e5ff', strokeWidth: 1.8, textColor: '#e0f7fa', bold: true, fontSize: 14, shape: 'round' },
      level1: { fill: '#37474f', stroke: '#26c6da', strokeWidth: 1.4, textColor: '#ffffff', shape: 'round' },
      level2: { fill: '#455a64', stroke: '#78909c', strokeWidth: 1.2, textColor: '#eceff1', shape: 'rect' },
      edge:   { stroke: '#546e7a', strokeWidth: 1.6, dash: 'none', arrow: 'end' }
    },
    light: {
      root:   { fill: '#f5f7fa', stroke: '#cbd2d9', strokeWidth: 1.6, bold: true, fontSize: 14, shape: 'round' },
      level1: { fill: '#ffffff', stroke: '#cbd2d9', strokeWidth: 1.4, shape: 'round' },
      level2: { fill: '#fafbfc', stroke: '#e4e7eb', strokeWidth: 1.2, shape: 'rect' },
      edge:   { stroke: '#cbd2d9', strokeWidth: 1.2, dash: 'none', arrow: 'none' }
    },
    pastoral: { // 田园：植物绿色调
      root:   { fill: '#558b2f', stroke: '#33691e', strokeWidth: 1.6, textColor: '#ffffff', bold: true, fontSize: 14, shape: 'hexagon' },
      level1: { fill: '#c5e1a5', stroke: '#558b2f', strokeWidth: 1.4, shape: 'round' },
      level2: { fill: '#f1f8e9', stroke: '#8bc34a', strokeWidth: 1.2, shape: 'rect' },
      edge:   { stroke: '#689f38', strokeWidth: 1.4, dash: 'dotted', arrow: 'end' }
    },
    ocean: {
      root:   { fill: '#01579b', stroke: '#01579b', strokeWidth: 1.6, textColor: '#ffffff', bold: true, fontSize: 14, shape: 'round' },
      level1: { fill: '#81d4fa', stroke: '#0288d1', strokeWidth: 1.4, shape: 'round' },
      level2: { fill: '#e1f5fe', stroke: '#4fc3f7', strokeWidth: 1.2, shape: 'rect' },
      edge:   { stroke: '#0277bd', strokeWidth: 1.4, dash: 'none', arrow: 'end' }
    },
    sunset: {
      root:   { fill: '#d84315', stroke: '#bf360c', strokeWidth: 1.6, textColor: '#ffffff', bold: true, fontSize: 14, shape: 'round' },
      level1: { fill: '#ffab91', stroke: '#e64a19', strokeWidth: 1.4, shape: 'round' },
      level2: { fill: '#fbe9e7', stroke: '#ff8a65', strokeWidth: 1.2, shape: 'rect' },
      edge:   { stroke: '#d84315', strokeWidth: 1.4, dash: 'none', arrow: 'end' }
    },
    forest: {
      root:   { fill: '#1b5e20', stroke: '#1b5e20', strokeWidth: 1.6, textColor: '#ffffff', bold: true, fontSize: 14, shape: 'hexagon' },
      level1: { fill: '#a5d6a7', stroke: '#2e7d32', strokeWidth: 1.4, shape: 'round' },
      level2: { fill: '#e8f5e9', stroke: '#66bb6a', strokeWidth: 1.2, shape: 'rect' },
      edge:   { stroke: '#2e7d32', strokeWidth: 1.4, dash: 'dashed', arrow: 'end' }
    },
    ink: { // 水墨
      root:   { fill: '#212121', stroke: '#212121', strokeWidth: 1.6, textColor: '#ffffff', bold: true, fontSize: 14, shape: 'rect' },
      level1: { fill: '#ffffff', stroke: '#424242', strokeWidth: 1.4, shape: 'rect' },
      level2: { fill: '#ffffff', stroke: '#757575', strokeWidth: 1.0, shape: 'rect' },
      edge:   { stroke: '#424242', strokeWidth: 1.0, dash: 'none', arrow: 'none' }
    },
    sakura: { // 樱花粉
      root:   { fill: '#f06292', stroke: '#ec407a', strokeWidth: 1.6, textColor: '#ffffff', bold: true, fontSize: 14, shape: 'ellipse' },
      level1: { fill: '#fce4ec', stroke: '#f06292', strokeWidth: 1.4, shape: 'ellipse' },
      level2: { fill: '#fff5f8', stroke: '#f8bbd0', strokeWidth: 1.2, shape: 'rect' },
      edge:   { stroke: '#ec407a', strokeWidth: 1.4, dash: 'dotted', arrow: 'end' }
    },
    candy: {
      root:   { fill: '#7e57c2', stroke: '#5e35b1', strokeWidth: 1.6, textColor: '#ffffff', bold: true, fontSize: 14, shape: 'diamond' },
      level1: { fill: '#d1c4e9', stroke: '#7e57c2', strokeWidth: 1.4, shape: 'diamond' },
      level2: { fill: '#ede7f6', stroke: '#b39ddb', strokeWidth: 1.2, shape: 'rect' },
      edge:   { stroke: '#5e35b1', strokeWidth: 1.4, dash: 'none', arrow: 'end' }
    }
  };
  function _themeStyle(name) { return THEMES[name] || THEMES.classic; }

  function nodeDefaultStyle(node) {
    var s = {
      fill: '#ffffff', stroke: '#7a8794', strokeWidth: 1.3, strokeDash: 'none',
      radius: 8, textColor: '#171E23', fontSize: 13, bold: false, italic: false,
      underline: false, strikethrough: false, align: 'center', shape: 'rect'
    };
    var theme = _themeStyle(model && model.themeName);
    // 按 _depth 分级覆盖（layout 每次会先写 _depth，进入渲染时一定存在）
    var depth = typeof node._depth === 'number' ? node._depth : (function () {
      var d = 0, n = node, fr = null;
      while ((fr = findNode(model.root, n.id)) && fr.parent) { d++; n = fr.parent.node; if (d > 64) break; }
      return d;
    })();
    var base = depth === 0 ? theme.root : (depth === 1 ? theme.level1 : theme.level2);
    if (base) for (var k in base) s[k] = base[k];
    if (node === model.root) {
      // root 兜底
      if (!s.bold) s.bold = true;
    }
    return s;
  }
  function effNodeStyle(node) {
    var d = nodeDefaultStyle(node);
    var o = node.style || {};
    for (var k in d) if (o[k] != null) d[k] = o[k];
    return d;
  }
  // 节点连线默认样式（边挂在子节点上，读 node.edgeStyle；否则 fallback 主题 edge）
  function effEdgeStyle(childNode) {
    var theme = _themeStyle(model && model.themeName);
    var def = { stroke: theme.edge.stroke, strokeWidth: theme.edge.strokeWidth, dash: theme.edge.dash || 'none', arrow: theme.edge.arrow || 'none' };
    var o = childNode.edgeStyle || {};
    for (var k in def) if (o[k] != null) def[k] = o[k];
    return def;
  }
  function dashAttr(v) {
    if (!v || v === 'none') return null;
    return v === 'dashed' ? '8 4' : (v === 'dotted' ? '3 3' : v);
  }
  function numberingLabel(idxPath, style) {
    if (!style || style === 'none' || !idxPath || !idxPath.length) return '';
    // 根（1 项，idxPath=[1]）不编号，否则从第二层开始显示「a.b.c」
    if (idxPath.length <= 1) return '';
    var parts = [];
    for (var i = 1; i < idxPath.length; i++) parts.push(numToString(idxPath[i], style, i));
    return parts.join('.') + ' ';
  }
  function numToString(n, style, depth) {
    n = Number(n) || 1;
    if (style === 'arabic') return String(n);
    if (style === 'alpha') {
      // 按深度切换大小写：偶数深度大写，奇数深度小写
      var A = (depth % 2 === 0) ? 64 : 96;
      var s = '';
      var x = n;
      while (x > 0) { var m = (x - 1) % 26; s = String.fromCharCode(A + m + 1) + s; x = Math.floor((x - 1) / 26); }
      return s || 'A';
    }
    if (style === 'roman') {
      return toRoman(n);
    }
    if (style === 'cn') {
      return toChineseNum(n);
    }
    return String(n);
  }
  function toRoman(n) {
    var m = ['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];
    if (n < 21) return m[n] || '';
    var ones = ['','I','II','III','IV','V','VI','VII','VIII','IX'];
    var tens = ['','X','XX','XXX','XL','L','LX','LXX','LXXX','XC'];
    var t = Math.floor(n / 10), o = n % 10;
    return tens[t] + ones[o];
  }
  function toChineseNum(n) {
    var cn1 = ['〇','一','二','三','四','五','六','七','八','九'];
    if (n <= 9) return cn1[n];
    if (n < 20) return '十' + (n === 10 ? '' : cn1[n - 10]);
    if (n < 100) {
      var t = Math.floor(n / 10), o = n % 10;
      return cn1[t] + '十' + (o ? cn1[o] : '');
    }
    return String(n);
  }
  // 颜色类属性转内联 style：只有内联 style 才能覆盖 css/components.css 中的默认外观规则
  function styleStr(obj) {
    var parts = [];
    for (var k in obj) parts.push(k + ':' + obj[k]);
    return parts.join(';');
  }
  function toHexColor(v) {
    if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) return v;
    return '#ffffff';
  }
  function clampRange(ctl, v) {
    var num = parseFloat(v);
    if (isNaN(num)) num = parseFloat(ctl.min) || 0;
    return Math.max(parseFloat(ctl.min), Math.min(parseFloat(ctl.max), num));
  }
  // 绘制 SVG 形状（rect / round / ellipse / diamond / hexagon），返回 shape 元素和其几何尺寸
  function renderNodeShape(node, st) {
    var w = node._w, h = NODE_H;
    var shape = st.shape || 'rect';
    var x = -w / 2, y = -h / 2;
    var rx = Math.max(0, Math.min(st.radius || 0, h / 2));
    if (shape === 'rect') {
      return el('rect', {
        x: x, y: y, width: w, height: h, rx: 0, ry: 0, 'class': 'node-shape',
        style: styleStr({ fill: st.fill, stroke: st.stroke, 'stroke-width': st.strokeWidth })
      });
    }
    if (shape === 'round') {
      return el('rect', {
        x: x, y: y, width: w, height: h, rx: rx, ry: rx, 'class': 'node-shape',
        style: styleStr({ fill: st.fill, stroke: st.stroke, 'stroke-width': st.strokeWidth })
      });
    }
    if (shape === 'ellipse') {
      return el('ellipse', {
        cx: 0, cy: 0, rx: w / 2, ry: h / 2, 'class': 'node-shape',
        style: styleStr({ fill: st.fill, stroke: st.stroke, 'stroke-width': st.strokeWidth })
      });
    }
    if (shape === 'diamond') {
      var pts = [
        '0,' + (-h / 2),
        (w / 2) + ',0',
        '0,' + (h / 2),
        (-w / 2) + ',0'
      ].join(' ');
      return el('polygon', {
        points: pts, 'class': 'node-shape',
        style: styleStr({ fill: st.fill, stroke: st.stroke, 'stroke-width': st.strokeWidth })
      });
    }
    if (shape === 'hexagon') {
      var dx = Math.min(h / 2, w * 0.15);
      var hp = [
        (x + dx) + ',' + y,
        (x + w - dx) + ',' + y,
        (x + w) + ',0',
        (x + w - dx) + ',' + (y + h),
        (x + dx) + ',' + (y + h),
        x + ',0'
      ].join(' ');
      return el('polygon', {
        points: hp, 'class': 'node-shape',
        style: styleStr({ fill: st.fill, stroke: st.stroke, 'stroke-width': st.strokeWidth })
      });
    }
    // 兜底：普通圆角矩形
    return el('rect', {
      x: x, y: y, width: w, height: h, rx: rx, ry: rx, 'class': 'node-shape',
      style: styleStr({ fill: st.fill, stroke: st.stroke, 'stroke-width': st.strokeWidth })
    });
  }
  function renderNodeOutline(node, st) {
    // 选中轮廓：形状需与 shape 一致、放大一圈
    var w = node._w + 4, h = NODE_H + 4;
    var shape = st.shape || 'rect';
    var x = -w / 2, y = -h / 2;
    var rx = Math.max(0, Math.min((st.radius || 0) + 2, h / 2));
    var baseStyle = 'fill:none;stroke:var(--accent);stroke-width:2.2;pointer-events:none';
    if (shape === 'rect') return el('rect', { x: x, y: y, width: w, height: h, rx: 0, 'class': 'node-outline', style: baseStyle });
    if (shape === 'round') return el('rect', { x: x, y: y, width: w, height: h, rx: rx, 'class': 'node-outline', style: baseStyle });
    if (shape === 'ellipse') return el('ellipse', { cx: 0, cy: 0, rx: w / 2, ry: h / 2, 'class': 'node-outline', style: baseStyle });
    if (shape === 'diamond') {
      var pts = ['0,' + (-h / 2), (w / 2) + ',0', '0,' + (h / 2), (-w / 2) + ',0'].join(' ');
      return el('polygon', { points: pts, 'class': 'node-outline', style: baseStyle });
    }
    if (shape === 'hexagon') {
      var dx = Math.min(h / 2, w * 0.15);
      var hp = [
        (x + dx) + ',' + y, (x + w - dx) + ',' + y,
        (x + w) + ',0', (x + w - dx) + ',' + (y + h),
        (x + dx) + ',' + (y + h), x + ',0'
      ].join(' ');
      return el('polygon', { points: hp, 'class': 'node-outline', style: baseStyle });
    }
    return el('rect', { x: x, y: y, width: w, height: h, rx: rx, 'class': 'node-outline', style: baseStyle });
  }
  // SVG marker：箭头（复用 <defs> 中的全局 marker）
  function ensureArrowMarker(svgEl) {
    if (!svgEl) return 'mind-arrow';
    var d = svgEl.querySelector('defs');
    if (!d) { d = el('defs', {}); svgEl.insertBefore(d, svgEl.firstChild); }
    if (d.querySelector('#mind-arrow')) return 'mind-arrow';
    var marker = document.createElementNS(NS, 'marker');
    marker.setAttribute('id', 'mind-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('orient', 'auto-start-reverse');
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    path.setAttribute('fill', 'context-stroke');
    marker.appendChild(path);
    d.appendChild(marker);
    return 'mind-arrow';
  }

  /* ---------------- 撤销（模型快照栈） ---------------- */
  function cloneNode(n) {
    var c = { id: n.id, text: n.text, collapsed: !!n.collapsed };
    if (n.style) c.style = JSON.parse(JSON.stringify(n.style));
    if (n.edgeStyle) c.edgeStyle = JSON.parse(JSON.stringify(n.edgeStyle));
    c.children = (n.children || []).map(cloneNode);
    return c;
  }
  function pushHistory() {
    var snap = {
      root: cloneNode(model.root),
      themeName: model.themeName || 'classic',
      layoutDensity: model.layoutDensity || 'normal',
      numberingStyle: model.numberingStyle || 'none'
    };
    undoStack.push(snap);
    if (undoStack.length > 50) undoStack.shift();
  }
  function undo() {
    if (!undoStack.length) { setHintTemp('没有可撤销的操作'); return; }
    var snap = undoStack.pop();
    model.root = snap.root;
    if (typeof snap.themeName === 'string') model.themeName = snap.themeName;
    if (typeof snap.layoutDensity === 'string') model.layoutDensity = snap.layoutDensity;
    if (typeof snap.numberingStyle === 'string') model.numberingStyle = snap.numberingStyle;
    selectedId = null;
    onChange();
    render();
    setHintTemp('已撤销上一步操作（Ctrl+Z）');
  }

  /* ---------------- 样式设置浮层面板（右上角按钮弹出，复用 fsb-* 组件） ---------------- */
  var SHAPE_PRESETS = [
    { v: 'rect',    label: '▢', t: '直角矩形' },
    { v: 'round',   label: '▭', t: '圆角矩形' },
    { v: 'ellipse', label: '◯', t: '椭圆' },
    { v: 'diamond', label: '◈', t: '菱形' },
    { v: 'hexagon', label: '⬢', t: '六边形' }
  ];
  var ALIGN_PRESETS = [
    { v: 'left',    label: '⬅', t: '左对齐' },
    { v: 'center',  label: '⬌', t: '居中' },
    { v: 'right',   label: '➡', t: '右对齐' }
  ];
  var THEME_LIST = [
    'classic','business','rainbow','dark','light','pastoral',
    'ocean','sunset','forest','ink','sakura','candy'
  ];
  var THEME_LABELS = {
    classic:'经典', business:'商务', rainbow:'彩虹', dark:'深色',
    light:'亮色', pastoral:'田园', ocean:'海洋', sunset:'日落',
    forest:'森林', ink:'水墨', sakura:'樱花', candy:'糖果'
  };

  function buildStyleBar() {
    if (!container || styleBarEl) return;
    styleBarEl = document.createElement('div');
    styleBarEl.className = 'mind-style-bar';
    styleBarEl.style.display = 'none';
    styleBarEl.innerHTML =
      // 顶部 tab：节点 / 页面
      '<div class="fsb-tabs">' +
        '<div class="fsb-tab active" data-tab="node">节点</div>' +
        '<div class="fsb-tab" data-tab="page">页面</div>' +
      '</div>' +
      // 节点 tab
      '<div class="fsb-sec fsb-node">' +
        '<span class="fsb-lbl">填充</span><span class="fsb-pal" data-k="fill"></span>' +
        '<span class="fsb-lbl">边框</span><span class="fsb-pal" data-k="stroke"></span>' +
        '<span class="fsb-lbl">文字</span><span class="fsb-pal" data-k="textColor"></span>' +
        '<span class="fsb-sep"></span>' +
        '<span class="fsb-lbl">形状</span><span class="fsb-shape" data-k="shape"></span>' +
        '<span class="fsb-sep"></span>' +
        '<span class="fsb-lbl">线宽</span><span class="fsb-seg" data-k="strokeWidth" data-opts="1,1.3,1.6,2,3"></span>' +
        '<span class="fsb-lbl">线型</span><span class="fsb-seg" data-k="strokeDash" data-opts="none|实线,dashed|虚线,dotted|点线"></span>' +
        '<span class="fsb-radius-wrap"><span class="fsb-lbl">圆角</span><input type="range" class="fsb-range" min="0" max="20" step="1" data-k="radius"></span>' +
        '<span class="fsb-sep"></span>' +
        '<span class="fsb-lbl">对齐</span><span class="fsb-seg fsb-align" data-k="align" data-opts="left|⬅,center|⬌,right|➡"></span>' +
        '<span class="fsb-sep"></span>' +
        '<button class="fsb-btn fsb-toggle" data-k="bold" title="加粗">B</button>' +
        '<button class="fsb-btn fsb-toggle" data-k="italic" title="斜体">I</button>' +
        '<button class="fsb-btn fsb-toggle fsb-underline" data-k="underline" title="下划线">U</button>' +
        '<button class="fsb-btn fsb-toggle fsb-strike" data-k="strikethrough" title="删除线">S</button>' +
        '<span class="fsb-lbl">字号</span><input type="range" class="fsb-range fsb-range-sm" min="10" max="24" step="1" data-k="fontSize">' +
        '<span class="fsb-sep"></span>' +
        // 连线样式（作用于当前节点到父节点的连线，写入 node.edgeStyle）
        '<div class="fsb-subtitle">当前节点的连线</div>' +
        '<span class="fsb-lbl">粗细</span><span class="fsb-seg fsb-edge" data-ek="strokeWidth" data-opts="1,1.3,1.6,2,3"></span>' +
        '<span class="fsb-lbl">线型</span><span class="fsb-seg fsb-edge" data-ek="dash" data-opts="none|实线,dashed|虚线,dotted|点线"></span>' +
        '<span class="fsb-lbl">箭头</span><span class="fsb-seg fsb-edge" data-ek="arrow" data-opts="none|无,end|有"></span>' +
        '<span class="fsb-edge-hint">※ 控制当前节点与父节点之间的连线</span>' +
      '</div>' +
      // 页面 tab
      '<div class="fsb-sec fsb-page" style="display:none;">' +
        '<div class="fsb-subtitle">布局密度</div>' +
        '<span class="fsb-seg fsb-layout" data-pk="layoutDensity" data-opts="compact|紧凑,normal|适中,loose|宽松"></span>' +
        '<div class="fsb-subtitle">编号</div>' +
        '<span class="fsb-seg fsb-numbering" data-pk="numberingStyle" data-opts="none|无,arabic|1.2.3,alpha|A.a.c,roman|Ⅰ.Ⅱ,cn|一.二.三"></span>' +
        '<div class="fsb-subtitle">预设主题风格</div>' +
        '<div class="fsb-themes"></div>' +
      '</div>' +
      '<div class="fsb-empty">请先选中节点后再设置样式</div>';
    document.body.appendChild(styleBarEl);

    // 色块填充
    var pals = styleBarEl.querySelectorAll('.fsb-pal');
    for (var i = 0; i < pals.length; i++) {
      (function (pal) {
        STYLE_COLORS.forEach(function (c) {
          var sw = document.createElement('button');
          sw.type = 'button';
          sw.className = 'fsb-swatch';
          sw.style.background = c;
          sw.title = c;
          sw.dataset.v = c;
          pal.appendChild(sw);
        });
      })(pals[i]);
    }
    // 分段按钮（通用：strokeWidth / strokeDash / align / edge-* / layout / numbering）
    var segs = styleBarEl.querySelectorAll('.fsb-seg');
    for (var j = 0; j < segs.length; j++) {
      (function (seg) {
        seg.dataset.opts.split(',').forEach(function (opt) {
          var parts = opt.split('|');
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'fsb-btn fsb-seg-btn';
          b.textContent = parts[1] || parts[0];
          b.dataset.v = parts[0];
          seg.appendChild(b);
        });
      })(segs[j]);
    }
    // 形状预设
    var shapeBox = styleBarEl.querySelector('.fsb-shape');
    if (shapeBox) {
      SHAPE_PRESETS.forEach(function (o) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'fsb-btn fsb-shape-btn';
        b.dataset.v = o.v;
        b.title = o.t;
        b.textContent = o.label;
        shapeBox.appendChild(b);
      });
    }
    // 主题预设色块
    var themeBox = styleBarEl.querySelector('.fsb-themes');
    if (themeBox) {
      THEME_LIST.forEach(function (name) {
        var th = THEMES[name] || THEMES.classic;
        var rootFill = th.root.fill, lv1Fill = th.level1.fill, edgeStroke = th.edge.stroke;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fsb-theme';
        btn.dataset.theme = name;
        btn.title = THEME_LABELS[name] || name;
        btn.innerHTML =
          '<span class="fth-preview">' +
            '<i class="fth-root" style="background:' + rootFill + '"></i>' +
            '<i class="fth-line" style="background:' + edgeStroke + '"></i>' +
            '<i class="fth-node" style="background:' + lv1Fill + '"></i>' +
            '<i class="fth-line" style="background:' + edgeStroke + '"></i>' +
            '<i class="fth-leaf" style="background:#fff"></i>' +
          '</span>' +
          '<span class="fth-name">' + (THEME_LABELS[name] || name) + '</span>';
        themeBox.appendChild(btn);
      });
    }
    // Tab 切换
    var tabs = styleBarEl.querySelectorAll('.fsb-tab');
    for (var ti = 0; ti < tabs.length; ti++) {
      tabs[ti].addEventListener('click', function (e) {
        var tab = e.currentTarget.getAttribute('data-tab');
        stylePanelTab = tab;
        var allTabs = styleBarEl.querySelectorAll('.fsb-tab');
        for (var i = 0; i < allTabs.length; i++) allTabs[i].classList.toggle('active', allTabs[i].getAttribute('data-tab') === tab);
        syncStyleBar();
      });
    }
    styleBarEl.addEventListener('click', onStyleBarClick);
    styleBarEl.addEventListener('input', onStyleBarInput);
  }

  // 面板当前作用对象：思维导图单选；但「连线样式」要作用在节点的 edgeStyle，写入位置和样式 key 不同
  function panelTargets() {
    if (panelMode !== 'node' || !selectedId) return null;
    var fr = findNode(model.root, selectedId);
    if (!fr) return null;
    return { kind: 'node', list: [fr.node], parent: fr.parent, edgeOf: fr.node };
  }

  // 应用「节点样式」/「连线样式」/「页面级样式」统一入口
  function applyPanelValue(key, val, scope) {
    // scope 缺省 = 'node'；传 'edge' => 写入 edgeStyle；传 'page' => 写入 model 顶层
    if (!scope) scope = /^(themeName|layoutDensity|numberingStyle)$/.test(key) ? 'page' :
      (/^(stroke|dash|arrow|strokeWidth)$/.test(key) && (selectedId && selectedId !== model.root.id)) ? 'edge' : 'node';
    if (scope === 'page') {
      if (!panelHistPushed) { pushHistory(); panelHistPushed = true; }
      if (key === 'themeName') {
        // 切换主题 = 先清空所有节点自定义 style（不保留用户自定义），只保留主题默认值
        if (confirm('切换主题会覆盖当前已有的自定义样式，是否继续？（保留 Ctrl+Z 可撤回）')) {
          model.themeName = val;
          (function clearStyle(n) {
            if (n.style) n.style = undefined;
            if (n.edgeStyle) n.edgeStyle = undefined;
            (n.children || []).forEach(clearStyle);
          })(model.root);
        } else {
          panelHistPushed = false; undoStack.pop();
          return;
        }
      } else {
        model[key] = val;
      }
      onChange(); render();
      return;
    }
    var targets = panelTargets();
    if (!targets || !targets.list.length) return;
    if (!panelHistPushed) { pushHistory(); panelHistPushed = true; }
    if (scope === 'edge') {
      if (targets.edgeOf === model.root) { setHintTemp('根节点没有入边（连线）'); return; }
      targets.edgeOf.edgeStyle = targets.edgeOf.edgeStyle || {};
      targets.edgeOf.edgeStyle[key] = val;
    } else {
      targets.list.forEach(function (obj) {
        obj.style = obj.style || {};
        obj.style[key] = val;
      });
    }
    onChange(); render();
  }

  function applyPanelEdit(ctl) {
    var val = ctl.value;
    if (ctl.type === 'range') val = parseFloat(val);
    applyPanelValue(ctl.dataset.k, val, ctl.dataset.ek ? 'edge' : undefined);
  }

  // 按钮点击：色块 / 线宽·线型分段按钮 / 加粗·斜体开关 / 形状 / 主题 / edge 段 / align 段 / 页面段
  function onStyleBarClick(e) {
    var t = e.target;
    if (!t || !t.dataset) return;
    // tab 切换本身已绑定，不在这里重复
    if (t.classList && t.classList.contains('fsb-theme')) {
      e.stopPropagation();
      applyPanelValue('themeName', t.getAttribute('data-theme') || t.dataset.theme, 'page');
      return;
    }
    if (t.classList.contains('fsb-swatch')) {
      if (!t.dataset.v) return;
      applyPanelValue(t.parentNode.dataset.k, t.dataset.v);
    } else if (t.classList.contains('fsb-shape-btn')) {
      if (!t.dataset.v) return;
      applyPanelValue('shape', t.dataset.v);
    } else if (t.classList.contains('fsb-seg-btn')) {
      if (!t.dataset.v) return;
      var seg = t.parentNode;
      var scope = undefined;
      if (seg.dataset.pk) scope = 'page';
      else if (seg.dataset.ek) scope = 'edge';
      var key = seg.dataset.pk || seg.dataset.ek || seg.dataset.k;
      applyPanelValue(key, t.dataset.v, scope);
    } else if (t.classList.contains('fsb-toggle')) {
      var targets = panelTargets();
      if (!targets || !targets.list.length) return;
      applyPanelValue(t.dataset.k, !effNodeStyle(targets.list[0])[t.dataset.k]);
    }
  }

  // 滑杆输入：实时应用
  function onStyleBarInput(e) {
    var ctl = e.target;
    if (!ctl || !ctl.dataset || !ctl.dataset.k) return;
    if (ctl.type !== 'range') return;
    applyPanelEdit(ctl);
  }

  // 每次 render() 后同步样式浮层：tab 切换、高亮当前值
  function syncStyleBar() {
    if (!styleBarEl) return;
    var curKey = selectedId || '';
    if (curKey !== lastPanelSelKey) { lastPanelSelKey = curKey; panelHistPushed = false; }
    panelMode = selectedId ? 'node' : null;
    if (!stylePanelOpen) { styleBarEl.style.display = 'none'; return; }
    styleBarEl.style.display = 'flex';
    var emptyEl = styleBarEl.querySelector('.fsb-empty');
    var nodeSec = styleBarEl.querySelector('.fsb-node');
    var pageSec = styleBarEl.querySelector('.fsb-page');
    if (nodeSec) nodeSec.style.display = 'none';
    if (pageSec) pageSec.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'none';

    if (stylePanelTab === 'page') {
      if (pageSec) pageSec.style.display = 'flex';
      syncPagePanel(pageSec);
      return;
    }

    if (!panelMode) {
      if (emptyEl) emptyEl.style.display = 'flex';
      return;
    }
    var targets = panelTargets();
    if (!targets || !targets.list.length) {
      if (emptyEl) emptyEl.style.display = 'flex';
      return;
    }
    if (nodeSec) nodeSec.style.display = 'flex';
    var st = effNodeStyle(targets.list[0]);
    syncNodePanel(nodeSec, st, targets.edgeOf);
  }
  function syncNodePanel(sec, st, edgeOf) {
    // 色块
    var pals = sec.querySelectorAll('.fsb-pal');
    for (var p = 0; p < pals.length; p++) {
      var pal = pals[p];
      var hex = toHexColor(st[pal.dataset.k]).toLowerCase();
      var sws = pal.querySelectorAll('.fsb-swatch');
      for (var s = 0; s < sws.length; s++) sws[s].classList.toggle('active', sws[s].dataset.v.toLowerCase() === hex);
    }
    // 节点分段（线宽 / 线型 / 对齐）
    var nodeSegs = sec.querySelectorAll(':scope > .fsb-seg:not(.fsb-edge)');
    for (var g = 0; g < nodeSegs.length; g++) {
      var seg = nodeSegs[g];
      var val = String(st[seg.dataset.k]);
      var segBtns = seg.querySelectorAll('.fsb-seg-btn');
      for (var b = 0; b < segBtns.length; b++) segBtns[b].classList.toggle('active', segBtns[b].dataset.v === val);
    }
    // 形状
    var shapeBtns = sec.querySelectorAll('.fsb-shape-btn');
    for (var h = 0; h < shapeBtns.length; h++) shapeBtns[h].classList.toggle('active', shapeBtns[h].dataset.v === st.shape);
    // toggle（B/I/U/S）
    var toggles = sec.querySelectorAll('.fsb-toggle');
    for (var tt = 0; tt < toggles.length; tt++) {
      var tgl = toggles[tt];
      tgl.classList.toggle('active', !!st[tgl.dataset.k]);
    }
    // range
    var ranges = sec.querySelectorAll('.fsb-range');
    for (var r = 0; r < ranges.length; r++) {
      var ctl = ranges[r];
      ctl.value = String(clampRange(ctl, st[ctl.dataset.k]));
    }
    // 连线段
    var edgeHint = sec.querySelector('.fsb-edge-hint');
    var isRoot = edgeOf && edgeOf === model.root;
    var edgeSegs = sec.querySelectorAll(':scope > .fsb-seg.fsb-edge');
    var es = (edgeOf && !isRoot) ? effEdgeStyle(edgeOf) : null;
    for (var ge = 0; ge < edgeSegs.length; ge++) {
      var eSeg = edgeSegs[ge];
      var ek = eSeg.dataset.ek;
      var eVal = es ? String(es[ek]) : '';
      var eBtns = eSeg.querySelectorAll('.fsb-seg-btn');
      for (var be = 0; be < eBtns.length; be++) {
        eBtns[be].classList.toggle('active', eBtns[be].dataset.v === eVal);
        eBtns[be].classList.toggle('disabled', !!isRoot);
      }
    }
    if (edgeHint) edgeHint.textContent = isRoot ? '※ 根节点没有入边连线' : '※ 控制当前节点与父节点之间的连线';
  }
  function syncPagePanel(sec) {
    if (!sec) return;
    var layoutSeg = sec.querySelector('.fsb-layout');
    if (layoutSeg) {
      var v = String(model.layoutDensity || 'normal');
      var bs = layoutSeg.querySelectorAll('.fsb-seg-btn');
      for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('active', bs[i].dataset.v === v);
    }
    var numSeg = sec.querySelector('.fsb-numbering');
    if (numSeg) {
      var vn = String(model.numberingStyle || 'none');
      var ns = numSeg.querySelectorAll('.fsb-seg-btn');
      for (var j = 0; j < ns.length; j++) ns[j].classList.toggle('active', ns[j].dataset.v === vn);
    }
    var themes = sec.querySelectorAll('.fsb-theme');
    var cur = model.themeName || 'classic';
    for (var t = 0; t < themes.length; t++) {
      themes[t].classList.toggle('active', (themes[t].getAttribute('data-theme') || themes[t].dataset.theme) === cur);
    }
  }

  // 右上角按钮切换样式浮层
  function toggleStylePanel() {
    stylePanelOpen = !stylePanelOpen;
    if (styleBarEl) syncStyleBar();
    return stylePanelOpen;
  }
  function setStylePanelOpen(open) {
    stylePanelOpen = !!open;
    if (styleBarEl) syncStyleBar();
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
    focusId = null;
    panX = 0; panY = 0;
    container.innerHTML = '';
    wrap = document.createElement('div');
    wrap.className = 'mind-wrap';
    container.appendChild(wrap);

    container.addEventListener('click', onClick);
    container.addEventListener('dblclick', onDblClick);
    container.addEventListener('contextmenu', onContextMenu);
    container.addEventListener('mousedown', onNodeMouseDown);
    keyHandler = onKey;
    document.addEventListener('keydown', keyHandler);

    // 剪贴板 copy/cut/paste 事件监听（通过 window 捕获，和宿主富文本区分靠 _isMindActive 守卫）
    copyCutHandler = function (e) {
      if (!_isMindActive()) return;
      var tag = (e.target.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      // 仅当 mind 画布为交互目标时接管（在 container 内或刚聚焦过）
      var ae = document.activeElement;
      var aeInside = !!(ae && container && container.contains(ae));
      // 若当前没有真实焦点 target，通过最近一次 selectedId 判定
      if (!aeInside && !(e.target && container && (container === e.target || container.contains(e.target)))) {
        if (selectedId === null) return;
      }
      e.preventDefault();
      if (e.type === 'copy') copyCurrent();
      else if (e.type === 'cut')  cutCurrent();
    };
    pasteHandler = function (e) {
      if (!_isMindActive()) return;
      var tag = (e.target.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      var ae = document.activeElement;
      var aeInside = !!(ae && container && container.contains(ae));
      if (!aeInside && selectedId === null && !(e.target && container && (container === e.target || container.contains(e.target)))) return;
      e.preventDefault();
      e.stopPropagation();
      pasteFromClipboard(e);
    };
    docMouseDownHandler = function (e) {
      // 点击右键菜单外部（且不是画布内的右键触发源）时关闭菜单
      if (!container) return;
      if (!ctxMenuEl || ctxMenuEl.style.display === 'none') return;
      if (e.target.closest && e.target.closest('.mind-ctx-menu')) return;
      if (e.target.closest && e.target.closest('.mind-style-bar')) return; // 样式面板不关（交给 20-craft-init）
      hideCtxMenu();
    };
    window.addEventListener('copy', copyCutHandler);
    window.addEventListener('cut',  copyCutHandler);
    window.addEventListener('paste', pasteHandler, true);
    document.addEventListener('mousedown', docMouseDownHandler, true);

    buildStyleBar();
    render();
  }

  function destroy() {
    if (container) {
      container.removeEventListener('click', onClick);
      container.removeEventListener('dblclick', onDblClick);
      container.removeEventListener('contextmenu', onContextMenu);
      container.removeEventListener('mousedown', onNodeMouseDown);
    }
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    if (copyCutHandler) {
      window.removeEventListener('copy', copyCutHandler);
      window.removeEventListener('cut',  copyCutHandler);
    }
    if (pasteHandler) window.removeEventListener('paste', pasteHandler, true);
    if (docMouseDownHandler) document.removeEventListener('mousedown', docMouseDownHandler, true);
    copyCutHandler = pasteHandler = docMouseDownHandler = null;
    if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; }
    if (styleBarEl) { styleBarEl.remove(); styleBarEl = null; }
    stylePanelOpen = false;
    undoStack = [];
    focusId = null;
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
    count: count,
    toggleStylePanel: toggleStylePanel,
    setStylePanelOpen: setStylePanelOpen
  };
})();
