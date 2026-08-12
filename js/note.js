/* =========================================================
 * InkpadNote —— 思维笔记（大纲笔记，仿幕布 / ProcessOn 思维笔记）
 * Enter 新增同级 · Tab 缩进 · Shift+Tab 降级 · 折叠展开 · 行内编辑
 * ========================================================= */
window.InkpadNote = (function () {
  'use strict';

  var container = null;   // #visual-canvas
  var wrap = null;
  var model = null;       // { children:[{id,text,children:[],collapsed}] }
  var onChange = null;
  var currentId = null;   // 最近聚焦的行

  var seq = 0;
  function uid() { return 'o' + (++seq) + Date.now().toString(36); }

  /* ---------------- 模型 ---------------- */
  function defaultModel() {
    return {
      children: [
        { id: uid(), text: '第一章 核心观点', collapsed: false, children: [
          { id: uid(), text: '要点一', collapsed: false, children: [] },
          { id: uid(), text: '要点二', collapsed: false, children: [
            { id: uid(), text: '补充说明', collapsed: false, children: [] }
          ] }
        ] },
        { id: uid(), text: '第二章 待办事项', collapsed: false, children: [
          { id: uid(), text: '按 Enter 新增一条笔记', collapsed: false, children: [] },
          { id: uid(), text: '按 Tab 缩进为子级', collapsed: false, children: [] }
        ] }
      ]
    };
  }

  // 查找：返回 { node, parentList, index, parentNode }
  function find(id, list, parentNode) {
    list = list || model.children;
    parentNode = parentNode || null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return { node: list[i], parentList: list, index: i, parentNode: parentNode };
      var r = find(id, list[i].children || [], list[i]);
      if (r) return r;
    }
    return null;
  }

  function each(fn, list) {
    (list || model.children).forEach(function (n) {
      fn(n);
      each(fn, n.children || []);
    });
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    wrap.innerHTML = '';
    var frag = document.createDocumentFragment();
    model.children.forEach(function (n) { frag.appendChild(renderNode(n)); });
    wrap.appendChild(frag);
    if (!model.children.length) {
      var empty = document.createElement('div');
      empty.className = 'note-empty';
      empty.textContent = '空白笔记，点击「＋ 同级」开始';
      wrap.appendChild(empty);
    }
  }

  function renderNode(node) {
    var box = document.createElement('div');
    box.className = 'ol-node';

    var row = document.createElement('div');
    row.className = 'ol-row';
    row.setAttribute('data-id', node.id);

    var hasKids = node.children && node.children.length > 0;
    var toggle = document.createElement('span');
    if (hasKids) {
      toggle.className = 'ol-toggle';
      toggle.textContent = node.collapsed ? '▸' : '▾';
      toggle.title = node.collapsed ? '展开' : '折叠';
    } else {
      toggle.className = 'ol-dot';
      toggle.textContent = '•';
    }
    row.appendChild(toggle);

    var text = document.createElement('div');
    text.className = 'ol-text';
    text.setAttribute('contenteditable', 'true');
    text.setAttribute('spellcheck', 'false');
    text.textContent = node.text || '';
    row.appendChild(text);

    if (node.collapsed && hasKids) {
      var badge = document.createElement('span');
      badge.className = 'ol-badge';
      badge.textContent = countKids(node) + ' 条';
      row.appendChild(badge);
    }

    box.appendChild(row);

    if (hasKids && !node.collapsed) {
      var kids = document.createElement('div');
      kids.className = 'ol-children';
      node.children.forEach(function (c) { kids.appendChild(renderNode(c)); });
      box.appendChild(kids);
    }
    return box;
  }

  function countKids(node) {
    var n = 0;
    (function walk(x) { (x.children || []).forEach(function (c) { n++; walk(c); }); })(node);
    return n;
  }

  function focusRow(id, toEnd) {
    var el = wrap.querySelector('.ol-row[data-id="' + id + '"] .ol-text');
    if (!el) return;
    el.focus();
    var r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(toEnd !== false);
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  /* ---------------- 结构操作 ---------------- */
  function addSiblingAfter(id) {
    var fr = id ? find(id) : null;
    var node = { id: uid(), text: '', collapsed: false, children: [] };
    if (!fr) {
      model.children.push(node);
    } else {
      fr.parentList.splice(fr.index + 1, 0, node);
    }
    onChange();
    render();
    focusRow(node.id);
  }

  function addChild(id) {
    var fr = id ? find(id) : null;
    var node = { id: uid(), text: '', collapsed: false, children: [] };
    if (!fr) { model.children.push(node); }
    else {
      fr.node.children = fr.node.children || [];
      fr.node.collapsed = false;
      fr.node.children.push(node);
    }
    onChange();
    render();
    focusRow(node.id);
  }

  function indent(id) {
    var fr = find(id);
    if (!fr || fr.index === 0) return; // 没有上一个兄弟则无法缩进
    var prev = fr.parentList[fr.index - 1];
    fr.parentList.splice(fr.index, 1);
    prev.children = prev.children || [];
    prev.collapsed = false;
    prev.children.push(fr.node);
    onChange();
    render();
    focusRow(id);
  }

  function outdent(id) {
    var fr = find(id);
    if (!fr || !fr.parentNode) return; // 已是顶级
    var pf = find(fr.parentNode.id);
    pf.parentList.splice(pf.index + 1, 0, fr.node);
    fr.parentList.splice(fr.index, 1);
    onChange();
    render();
    focusRow(id);
  }

  function remove(id) {
    var fr = find(id);
    if (!fr) return null;
    fr.parentList.splice(fr.index, 1);
    onChange();
    render();
    // 返回聚焦目标：上一个兄弟 / 父级 / 最后一条
    if (fr.index > 0) return fr.parentList[fr.index - 1].id;
    if (fr.parentNode) return fr.parentNode.id;
    return model.children.length ? model.children[model.children.length - 1].id : null;
  }

  /* ---------------- 事件 ---------------- */
  function onFocusIn(e) {
    var row = e.target.closest ? e.target.closest('.ol-row') : null;
    if (row) currentId = row.getAttribute('data-id');
  }

  function onInput(e) {
    var row = e.target.closest ? e.target.closest('.ol-row') : null;
    if (!row) return;
    var fr = find(row.getAttribute('data-id'));
    if (fr) {
      fr.node.text = e.target.textContent;
      onChange();
    }
  }

  function onKeyDown(e) {
    var row = e.target.closest ? e.target.closest('.ol-row') : null;
    if (!row) return;
    var id = row.getAttribute('data-id');
    if (e.key === 'Enter') {
      e.preventDefault();
      addSiblingAfter(id);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) outdent(id); else indent(id);
    } else if (e.key === 'Backspace') {
      if (!e.target.textContent) {
        e.preventDefault();
        var focusTo = remove(id);
        if (focusTo) focusRow(focusTo);
      }
    }
  }

  function onClick(e) {
    var t = e.target;
    if (t.classList && t.classList.contains('ol-toggle')) {
      var row = t.closest('.ol-row');
      var fr = find(row.getAttribute('data-id'));
      if (fr) {
        fr.node.collapsed = !fr.node.collapsed;
        onChange();
        render();
      }
    }
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
    btn('＋ 同级', '在当前行下方新增（Enter）', function () { addSiblingAfter(currentId); });
    btn('＋ 子级', '新增当前行的子级', function () { addChild(currentId); });
    btn('⇥ 缩进', '当前行缩进为上一行的子级（Tab）', function () { if (currentId) indent(currentId); });
    btn('⇤ 降级', '当前行提升一级（Shift+Tab）', function () { if (currentId) outdent(currentId); });
    btn('🗑 删除', '删除当前行', function () { if (currentId) remove(currentId); });
    var hint = document.createElement('span');
    hint.className = 'vt-hint';
    hint.textContent = 'Enter 新增 · Tab 缩进 · Shift+Tab 降级 · 点 ▾ 折叠';
    bar.appendChild(hint);
  }

  /* ---------------- 生命周期 ---------------- */
  function init(el_, data, changeCb) {
    container = el_;
    model = data;
    onChange = changeCb;
    currentId = null;
    container.innerHTML = '';
    wrap = document.createElement('div');
    wrap.className = 'note-wrap';
    container.appendChild(wrap);

    wrap.addEventListener('focusin', onFocusIn);
    wrap.addEventListener('input', onInput);
    wrap.addEventListener('keydown', onKeyDown);
    wrap.addEventListener('click', onClick);
    render();
  }

  function destroy() {
    if (wrap) {
      wrap.removeEventListener('focusin', onFocusIn);
      wrap.removeEventListener('input', onInput);
      wrap.removeEventListener('keydown', onKeyDown);
      wrap.removeEventListener('click', onClick);
    }
    container = null;
    wrap = null;
    model = null;
  }

  function count(m) {
    var n = 0;
    (function walk(list) {
      (list || []).forEach(function (x) { n++; walk(x.children); });
    })(m.children);
    return n + ' 条笔记';
  }

  return {
    init: init,
    destroy: destroy,
    renderToolbar: renderToolbar,
    defaultModel: defaultModel,
    count: count
  };
})();
