/* =========================================================
 * InkpadBlocks —— Notion / 飞书式块编辑器（所见即所得）
 * ---------------------------------------------------------
 * 文档 = 块数组；文本块用 contentEditable 富文本，
 * 代码 / 表格 / 图片 / 流程图 / 公式 / 标注 渲染成组件。
 * 数据：blocks[] 序列化为 JSON 存 doc.content（localStorage / .json）。
 * 暴露：window.InkpadBlocks
 * ========================================================= */
window.InkpadBlocks = (function () {
  'use strict';

  // 桥接到 app.js 暴露的 InkpadApp 辅助函数
  function toast(msg, type) { if (window.InkpadApp) window.InkpadApp.toast(msg, type); }
  function dirOf(p) { return window.InkpadApp ? window.InkpadApp.dirOf(p) : (p.split(/[\\/]/).slice(0, -1).join('/') || '.'); }
  function resolveImgSrc(s, base) { return window.InkpadApp ? window.InkpadApp.resolveImgSrc(s, base) : s; }
  function guessMime(p) { return window.InkpadApp ? window.InkpadApp.guessMime(p) : 'image/png'; }

  var RICH_MARK = '<!-- inkpad:rich -->';

  // 块类型元信息（用于 + 菜单与图标）
  var BLOCK_TYPES = {
    text:    { label: '文本', icon: '📝' },
    h1:      { label: '一级标题', icon: 'H1' },
    h2:      { label: '二级标题', icon: 'H2' },
    h3:      { label: '三级标题', icon: 'H3' },
    todo:    { label: '待办列表', icon: '☑' },
    quote:   { label: '引用', icon: '❝' },
    code:    { label: '代码块', icon: '🧩' },
    table:   { label: '表格', icon: '▦' },
    image:   { label: '图片', icon: '🖼' },
    mermaid: { label: '流程图 / 图表', icon: '🔀' },
    math:    { label: '数学公式', icon: '∑' },
    callout: { label: '标注 / 提示', icon: '💡' },
    calloutTypes: ['note', 'tip', 'important', 'warning', 'caution', 'info', 'quote'],
    hr:      { label: '分割线', icon: '―' },
    cols:    { label: '分栏（两列）', icon: '▥' }
  };

  // 飞书式「/」菜单分组（第一期：基础 + 常用，不含视频/同步块/模板）
  var SLASH_GROUPS = [
    { name: '基础', items: [
      { type: 'text',  label: '文本',     icon: '📝', kw: 'text wenben 文本 正文 paragraph' },
      { type: 'h1',    label: '一级标题', icon: 'H1', kw: 'h1 yijibiaoti 标题 heading 一级 title' },
      { type: 'h2',    label: '二级标题', icon: 'H2', kw: 'h2 erjibiaoti 标题 heading 二级' },
      { type: 'h3',    label: '三级标题', icon: 'H3', kw: 'h3 sanjibiaoti 标题 heading 三级' },
      { type: 'ulist', label: '无序列表', icon: '•',  kw: 'ul wuxu liebiao list bullet 无序 列表' },
      { type: 'olist', label: '有序列表', icon: '1.', kw: 'ol youxu liebiao ordered list 有序 列表' },
      { type: 'code',  label: '代码块',   icon: '🧩', kw: 'code daima 代码 程序 snippet' },
      { type: 'quote', label: '引用',     icon: '❝', kw: 'quote yinyong 引用 blockquote' },
      { type: 'hr',    label: '分割线',   icon: '―',  kw: 'hr fengexian divider 分割 线' },
      { type: 'link',  label: '链接',     icon: '🔗', kw: 'link lianjie 链接 url hyperlink' }
    ] },
    { name: '常用', items: [
      { type: 'todo',    label: '任务',       icon: '☑', kw: 'todo renwu task 任务 待办 checkbox' },
      { type: 'image',   label: '图片',       icon: '🖼', kw: 'image tupian 图片 photo picture' },
      { type: 'table',   label: '表格',       icon: '▦', kw: 'table biaoge 表格 grid' },
      { type: 'cols',    label: '分栏',       icon: '▥', kw: 'cols fenlan column 分栏 两列' },
      { type: 'callout', label: '高亮块',     icon: '💡', kw: 'callout gaoliang highlight 高亮 标注 提示' },
      { type: 'math',    label: '数学公式',   icon: '∑', kw: 'math gongshi formula 公式 数学' }
    ] }
  ];

  var state = {
    container: null,
    doc: null,
    blocks: [],
    activeId: null,
    saveTimer: null,
    seq: 0,
    bubbleHandler: null,
    bubbleTimer: null
  };

  function api() { return window.pywebview && window.pywebview.api; }
  function hasApi() { return !!api(); }
  function uid() { return 'b' + Date.now().toString(36) + (state.seq++) + Math.random().toString(36).slice(2, 5); }
  function notifyChange() {
    if (window.InkpadApp && window.InkpadApp.richChanged) window.InkpadApp.richChanged();
  }
  // 大纲回调（被 app.js 设置）
  var _outlineCb = null;

  function setOutlineListener(cb) { _outlineCb = cb; }

  function notifyOutline() {
    var outline = [];
    state.blocks.forEach(function (b, idx) {
      if (b && (b.type === 'h1' || b.type === 'h2' || b.type === 'h3')) {
        var raw = (b.text || '').toString();
        // HTML 实体反转 + 去除所有 HTML 标签（与 stripHtml 等价）
        var tmp = document.createElement('div');
        tmp.innerHTML = raw;
        var txt = ((tmp.textContent || '') + '').replace(/\s+/g, ' ').trim();
        outline.push({ id: b.id, type: b.type, text: txt || ('未命名 ' + b.type.toUpperCase()) });
      }
    });
    if (_outlineCb) {
      try { _outlineCb(outline); } catch (e) { console.warn('[inkpad] outline cb', e); }
    }
  }

  function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      if (state.doc) {
        state.doc.content = JSON.stringify(state.blocks);
        state.doc.updated = Date.now();
        notifyChange();
      }
      notifyOutline();
    }, 350);
  }

  function defaultBlocks() {
    return [
      { id: uid(), type: 'h1', text: '无标题文档' },
      { id: uid(), type: 'text', text: '在这里输入内容，选中文字可加 <b>粗体</b> / <i>斜体</i>。把鼠标移到块左侧可拖拽排序，点 <b>+</b> 插入新块。' }
    ];
  }

  /* ---------------- 打开 / 关闭 ---------------- */
  function open(container, doc) {
    state.container = container;
    state.doc = doc;
    try {
      var parsed = JSON.parse(doc.content || '');
      if (Array.isArray(parsed)) state.blocks = parsed;
      else if (parsed && Array.isArray(parsed.blocks)) state.blocks = parsed.blocks;
      else state.blocks = defaultBlocks();
    } catch (e) {
      state.blocks = defaultBlocks();
    }
    if (!state.blocks.length) state.blocks = defaultBlocks();
    render();
    // 首次打开也立即推一次大纲（render 末尾会再推一次，做个保险）
    setTimeout(notifyOutline, 0);
    // 注册 bubble menu 选区监听（selectionchange 全局唯一）
    setupBubbleObserver();
  }

  function close() {
    clearTimeout(state.saveTimer);
    teardownBubbleObserver();
    notifyBubble({ visible: false });
    state.container = null;
    state.doc = null;
    state.blocks = [];
  }

  function serialize() { return JSON.stringify(state.blocks); }

  function findBlock(id) {
    for (var i = 0; i < state.blocks.length; i++) if (state.blocks[i].id === id) return state.blocks[i];
    return null;
  }
  function indexOfBlock(id) {
    for (var i = 0; i < state.blocks.length; i++) if (state.blocks[i].id === id) return i;
    return -1;
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    var c = state.container;
    if (!c) return;
    c.innerHTML = '';
    var root = document.createElement('div');
    root.className = 'ink-rich';

    state.blocks.forEach(function (b) {
      try { root.appendChild(renderBlock(b)); }
      catch (e) { console.warn('[inkpad] block render', b && b.type, e); }
    });

    var addZone = document.createElement('div');
    addZone.className = 'ink-rich-add';
    addZone.textContent = '+ 点击此处添加块';
    addZone.addEventListener('click', function () {
      var b = { id: uid(), type: 'text', text: '' };
      state.blocks.push(b);
      render();
      focusBlock(b.id);
      scheduleSave();
    });
    root.appendChild(addZone);
    c.appendChild(root);

    // 渲染完毕通知大纲（blocks 变化需要左栏重新计算）
    notifyOutline();
  }

  function renderBlock(b) {
    var el = document.createElement('div');
    el.className = 'ink-block ink-block-' + b.type;
    el.setAttribute('data-id', b.id);

    // 标题块：插入锚点，供左侧大纲跳转使用
    if (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') {
      var anchor = document.createElement('a');
      anchor.className = 'ink-anchor';
      anchor.id = 'ink-' + b.id;
      anchor.setAttribute('data-outline-id', b.id);
      el.appendChild(anchor);
    }

    // 左侧拖拽手柄
    var handle = document.createElement('div');
    handle.className = 'ink-block-handle';
    handle.setAttribute('draggable', 'true');
    handle.textContent = '⠿';
    handle.title = '拖拽排序';
    bindDrag(handle, b, el);
    el.appendChild(handle);

    // + 插入菜单
    var plus = document.createElement('div');
    plus.className = 'ink-block-plus';
    plus.textContent = '+';
    plus.title = '在此处插入块';
    plus.addEventListener('click', function (ev) {
      ev.stopPropagation();
      openInsertMenu(plus, function (type) {
        var nb = makeBlock(type);
        var idx = indexOfBlock(b.id);
        state.blocks.splice(idx + 1, 0, nb);
        render();
        focusBlock(nb.id);
        scheduleSave();
      });
    });
    el.appendChild(plus);

    // 删除按钮
    var del = document.createElement('div');
    del.className = 'ink-block-del';
    del.textContent = '🗑';
    del.title = '删除块';
    del.addEventListener('click', function (ev) {
      ev.stopPropagation();
      removeBlock(b.id);
    });
    el.appendChild(del);

    // 内容区
    var body = document.createElement('div');
    body.className = 'ink-block-body';
    el.appendChild(body);

    try { renderBody(b, body, el); }
    catch (e) { body.textContent = '[块渲染失败: ' + (e && e.message) + ']'; }

    return el;
  }

  function makeBlock(type) {
    var b = { id: uid(), type: type };
    if (type === 'text' || type === 'h1' || type === 'h2' || type === 'h3' || type === 'quote') b.text = '';
    else if (type === 'todo') { b.text = ''; b.checked = false; }
    else if (type === 'code') { b.lang = 'javascript'; b.src = ''; }
    else if (type === 'table') {
      b.rows = 2; b.cols = 2;
      b.data = [['表头1', '表头2'], ['内容1', '内容2']];
    }
    else if (type === 'image') { b.src = ''; b.alt = ''; }
    else if (type === 'mermaid') { b.src = 'graph TD\n  A[开始] --> B{条件判断}\n  B -- 是 --> C[执行]\n  B -- 否 --> D[结束]'; }
    else if (type === 'math') { b.src = 'E = mc^2'; }
    else if (type === 'callout') { b.ctype = 'note'; b.text = ''; }
    else if (type === 'cols') { b.left = ''; b.right = ''; }
    else if (type === 'ulist' || type === 'olist') { b.ordered = (type === 'olist'); b.items = ['']; }
    else if (type === 'link') { b.text = ''; b.href = ''; }
    return b;
  }

  function renderBody(b, body, el) {
    switch (b.type) {
      case 'text': case 'h1': case 'h2': case 'h3': case 'quote': return renderTextBlock(b, body);
      case 'todo': return renderTodoBlock(b, body);
      case 'code': return renderCodeBlock(b, body);
      case 'table': return renderTableBlock(b, body);
      case 'image': return renderImageBlock(b, body);
      case 'mermaid': return renderMermaidBlock(b, body);
      case 'math': return renderMathBlock(b, body);
      case 'callout': return renderCalloutBlock(b, body);
      case 'hr': return renderHrBlock(b, body);
      case 'cols': return renderColsBlock(b, body);
      case 'ulist': case 'olist': return renderListBlock(b, body);
      case 'link': return renderLinkBlock(b, body);
      case 'h4': case 'h5': case 'h6': return renderTextBlock(b, body);
      default: body.textContent = '[未知块类型: ' + b.type + ']';
    }
  }

  /* ---- 文本类（contentEditable） ---- */
    function editableOpts(div) {
    div.setAttribute('contenteditable', 'true');
    div.className = 'ink-editable';
    div.addEventListener('input', function () {
      var b = findBlock(div.getAttribute('data-bid'));
      if (b) { b.text = div.innerHTML; scheduleSave(); }
      onEditableInput(div, b);
    });
    div.addEventListener('keydown', function (ev) { onEditableKey(ev, div); });
    div.addEventListener('paste', onEditablePaste);
    div.addEventListener('input', function () {
      // 标题块内容变化（即便还没有触发防抖）也即时同步大纲
      var bb = findBlock(div.getAttribute('data-bid'));
      if (bb && (bb.type === 'h1' || bb.type === 'h2' || bb.type === 'h3')) {
        notifyOutline();
      }
    });
  }
  function renderTextBlock(b, body) {
    var div = document.createElement('div');
    div.setAttribute('data-bid', b.id);
    if (b.type === 'quote') div.classList.add('ink-quote');
    div.innerHTML = b.text || '';
    editableOpts(div);
    if (b.type === 'h1') div.style.fontSize = '1.8em';
    if (b.type === 'h2') div.style.fontSize = '1.45em';
    if (b.type === 'h3') div.style.fontSize = '1.2em';
    if (b.type === 'h4') div.style.fontSize = '1.05em'; div.style.fontWeight = '600'; div.style.color = '#4a4a52';
    if (b.type === 'h5') div.style.fontSize = '0.95em'; div.style.fontWeight = '600'; div.style.color = '#585862';
    if (b.type === 'h6') div.style.fontSize = '0.85em'; div.style.fontWeight = '600'; div.style.color = '#6c6c74';
    if (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') div.style.fontWeight = '700';
    body.appendChild(div);
  }
  function renderTodoBlock(b, body) {
    var row = document.createElement('div');
    row.className = 'ink-todo-row';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!b.checked;
    cb.addEventListener('change', function () { b.checked = cb.checked; scheduleSave(); });
    var div = document.createElement('div');
    div.setAttribute('data-bid', b.id);
    div.className = 'ink-editable ink-todo-text' + (b.checked ? ' done' : '');
    div.innerHTML = b.text || '';
    editableOpts(div);
    cb.addEventListener('change', function () { div.classList.toggle('done', cb.checked); });
    row.appendChild(cb); row.appendChild(div);
    body.appendChild(row);
  }

  /* ---- 代码块 ---- */
  function renderCodeBlock(b, body) {
    var view = document.createElement('pre');
    view.className = 'ink-code-view';
    var code = document.createElement('code');
    code.className = 'language-' + (b.lang || 'text');
    code.textContent = b.src || '';
    view.appendChild(code);
    if (typeof hljs !== 'undefined' && b.lang && b.lang !== 'text' && b.lang !== 'plaintext') {
      try { hljs.highlightElement(code); } catch (e) {}
    }
    var ta = document.createElement('textarea');
    ta.className = 'ink-code-edit';
    ta.value = b.src || '';
    ta.spellcheck = false;
    ta.style.display = 'none';
    ta.addEventListener('input', function () { b.src = ta.value; view.querySelector('code').textContent = ta.value; if (typeof hljs !== 'undefined' && b.lang) { try { hljs.highlightElement(view.querySelector('code')); } catch (e) {} } scheduleSave(); });
    var bar = document.createElement('div');
    bar.className = 'ink-block-bar';
    var langSel = document.createElement('select');
    ['javascript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'sql', 'bash', 'json', 'html', 'css', 'xml', 'yaml', 'text'].forEach(function (l) {
      var o = document.createElement('option'); o.value = l; o.textContent = l; if (l === (b.lang || 'javascript')) o.selected = true; langSel.appendChild(o);
    });
    langSel.addEventListener('change', function () { b.lang = langSel.value; ta.dispatchEvent(new Event('input')); });
    var editBtn = document.createElement('span');
    editBtn.className = 'ink-mini-btn';
    editBtn.textContent = '编辑源码';
    editBtn.addEventListener('click', function () {
      var editing = ta.style.display === 'none';
      ta.style.display = editing ? '' : 'none';
      view.style.display = editing ? 'none' : '';
      editBtn.textContent = editing ? '完成' : '编辑源码';
      if (editing) ta.focus();
    });
    bar.appendChild(langSel); bar.appendChild(editBtn);
    body.appendChild(bar); body.appendChild(view); body.appendChild(ta);
  }

  /* ---- 表格 ---- */
  function renderTableBlock(b, body) {
    if (!b.data || !b.data.length) b.data = [['', ''], ['', '']];
    var table = document.createElement('table');
    table.className = 'ink-gfm-table';
    b.data.forEach(function (row, ri) {
      var tr = document.createElement('tr');
      row.forEach(function (cell, ci) {
        var td = document.createElement(ri === 0 ? 'th' : 'td');
        td.setAttribute('contenteditable', 'true');
        td.className = 'ink-editable';
        td.textContent = cell || '';
        td.addEventListener('input', function () { b.data[ri][ci] = td.textContent; scheduleSave(); });
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    var bar = document.createElement('div');
    bar.className = 'ink-block-bar';
    var addRow = document.createElement('span'); addRow.className = 'ink-mini-btn'; addRow.textContent = '+ 行';
    addRow.addEventListener('click', function () { b.data.push(b.data[0].map(function () { return ''; })); render(); scheduleSave(); });
    var addCol = document.createElement('span'); addCol.className = 'ink-mini-btn'; addCol.textContent = '+ 列';
    addCol.addEventListener('click', function () { b.data.forEach(function (r) { r.push(''); }); render(); scheduleSave(); });
    var delRow = document.createElement('span'); delRow.className = 'ink-mini-btn'; delRow.textContent = '- 行';
    delRow.addEventListener('click', function () { if (b.data.length > 1) { b.data.pop(); render(); scheduleSave(); } });
    bar.appendChild(addRow); bar.appendChild(addCol); bar.appendChild(delRow);
    body.appendChild(bar); body.appendChild(table);
  }

  /* ---- 图片 ---- */
  // 为某个图片块打开文件选择器，选中后写入 src 并重渲染（供斜杠菜单/插入菜单/替换按钮复用）
  function pickImageForBlock(b) {
    if (!b) return;
    if (!hasApi()) { toast('选择图片需桌面版', 'error'); return; }
    api().pick_files().then(function (paths) {
      if (!paths || !paths.length) return;
      var p = paths[0];
      var dir = (state.doc && state.doc.diskPath) ? dirOf(state.doc.diskPath) : null;
      if (!dir && window.InkpadApp && window.InkpadApp.getRichDir) {
        dir = window.InkpadApp.getRichDir();
      }
      if (dir) {
        api().copy_image_to_assets(dir, p).then(function (res) {
          if (res && res.path) {
            b.src = res.rel; b.alt = p.split(/[\\/]/).pop(); render(); scheduleSave();
          } else if (res && res.error) {
            toast('插入失败：' + res.error, 'error');
          } else {
            toast('插入失败：未知错误', 'error');
          }
        }).catch(function () { toast('插入图片异常', 'error'); });
      } else {
        api().read_file_b64(p).then(function (res) {
          if (res && res.b64) {
            b.src = 'data:' + (res.mime || guessMime(p)) + ';base64,' + res.b64;
            b.alt = p.split(/[\\/]/).pop(); render(); scheduleSave();
          } else if (res && res.error) {
            toast('读取图片失败：' + res.error, 'error');
          } else {
            toast('读取图片失败', 'error');
          }
        }).catch(function () { toast('读取图片异常', 'error'); });
      }
    });
  }

  function renderImageBlock(b, body) {
    var img = document.createElement('img');
    img.className = 'ink-block-img';
    img.alt = b.alt || '';
    var src = b.src || '';
    var baseDir = null;
    if (src) {
      var d = state.doc;
      baseDir = (d && d.diskPath) ? dirOf(d.diskPath) : null;
      if (!baseDir && window.InkpadApp && window.InkpadApp.getRichDir) {
        baseDir = window.InkpadApp.getRichDir();
      }
    }
    // 先添加 error 监听，再设置 src，确保 error 事件不被遗漏
    var errRetried = false;
    img.addEventListener('error', function () {
      img.classList.add('ink-img-err');
      // 诊断：输出 src 前 100 字符到 toast
      var diag = (img.src || '').substring(0, 100);
      console.error('[inkpad] img load error, src=' + diag);
      // 回退：通过 API 读取图片为 base64 data URI
      if (errRetried || !src || !hasApi()) return;
      errRetried = true;
      var absPath = null;
      if (/^[a-z]:[\\\/]/i.test(src)) {
        absPath = src;
      } else if (baseDir) {
        absPath = baseDir.replace(/[\\\/]+$/, '') + '/' + src.replace(/^\.\//, '').replace(/^[\\\/]+/, '');
      }
      if (absPath) {
        api().read_file_b64(absPath).then(function (res) {
          if (res && res.b64) {
            img.src = 'data:' + (res.mime || 'image/png') + ';base64,' + res.b64;
            img.classList.remove('ink-img-err');
          } else {
            toast('图片加载失败：' + (res && res.error ? res.error : '未知'), 'error');
          }
        }).catch(function (e) { toast('图片加载异常', 'error'); });
      } else {
        toast('图片路径无法解析：' + diag, 'error');
      }
    });
    if (src) {
      img.src = resolveImgSrc(src, baseDir) || src;
    }
    // 【v0.19.0】双击图片 → 灯箱（可放大缩小 / 在新窗口打开）
    if (src) {
      img.style.cursor = 'zoom-in';
      img.addEventListener('dblclick', function (e) {
        e.preventDefault();
        openImageLightbox(img.src, img.alt || b.alt || '图片');
      });
    }
    var bar = document.createElement('div');
    bar.className = 'ink-block-bar';
    var pick = document.createElement('span'); pick.className = 'ink-mini-btn'; pick.textContent = '选择图片';
    pick.addEventListener('click', function () { pickImageForBlock(b); });
    bar.appendChild(pick);
    if (src) {
      body.appendChild(img);
      // 图片已存在时，移除默认显示的操作栏，改为在图片下方提供一个较小的“更换图片”入口，避免视觉冗余
      var changeBtn = document.createElement('span');
      changeBtn.className = 'ink-mini-btn';
      changeBtn.textContent = '更换图片';
      changeBtn.style.marginTop = '6px';
      changeBtn.addEventListener('click', function () { pick.click(); });
      body.appendChild(changeBtn);
    } else {
      body.appendChild(bar);
      var ph = document.createElement('div'); ph.className = 'ink-img-ph'; ph.textContent = '🖼 暂无图片，点「选择图片」或粘贴图片'; body.appendChild(ph);
    }
  }

  /* ---- 图片灯箱（双击图片放大查看 + 在新窗口打开）【v0.19.0】 ---- */
  function openImageLightbox(src, alt) {
    if (!src) return;
    var overlay = document.getElementById('ink-img-lightbox');
    if (overlay) overlay.parentNode.removeChild(overlay);
    overlay = document.createElement('div');
    overlay.id = 'ink-img-lightbox';
    overlay.className = 'ink-img-lightbox';
    overlay.innerHTML =
      '<div class="ink-lb-top">' +
        '<span class="ink-lb-title"></span>' +
        '<span class="ink-lb-sep"></span>' +
        '<button class="ink-lb-btn" data-act="out" title="缩小 (Ctrl+-)">－</button>' +
        '<span class="ink-lb-zoom">100%</span>' +
        '<button class="ink-lb-btn" data-act="in" title="放大 (Ctrl++)">＋</button>' +
        '<span class="ink-lb-sep"></span>' +
        '<button class="ink-lb-btn" data-act="actual" title="实际大小 1:1">实际大小</button>' +
        '<button class="ink-lb-btn" data-act="fit" title="适应窗口">适应</button>' +
        '<button class="ink-lb-btn" data-act="newwin" title="在新窗口打开">新窗口打开</button>' +
        '<span class="ink-lb-sep"></span>' +
        '<button class="ink-lb-btn ink-lb-close" data-act="close" title="关闭 (Esc)">✕</button>' +
      '</div>' +
      '<div class="ink-lb-stage"><div class="ink-lb-wrap"><img class="ink-lb-img" alt=""></div>' +
        '<div class="ink-lb-loading">加载中…</div></div>';
    document.body.appendChild(overlay);

    var stage = overlay.querySelector('.ink-lb-stage');
    var wrap = overlay.querySelector('.ink-lb-wrap');
    var im = overlay.querySelector('.ink-lb-img');
    var zoomLabel = overlay.querySelector('.ink-lb-zoom');
    var titleEl = overlay.querySelector('.ink-lb-title');
    var loading = overlay.querySelector('.ink-lb-loading');
    titleEl.textContent = alt || '图片';

    var scale = 1, tx = 0, ty = 0;
    var minScale = 0.1, maxScale = 8;

    function clampS(s) { return Math.max(minScale, Math.min(maxScale, s)); }
    function apply() {
      wrap.style.transform = 'translate(-50%, -50%) translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
      zoomLabel.textContent = Math.round(scale * 100) + '%';
    }
    function setScale(ns, cx, cy) {
      ns = clampS(ns);
      var r = stage.getBoundingClientRect();
      var px = (cx != null ? cx : r.width / 2) - r.left;
      var py = (cy != null ? cy : r.height / 2) - r.top;
      var ocx = (px - r.width / 2 - tx), ocy = (py - r.height / 2 - ty);
      var ratio = ns / scale;
      tx = px - r.width / 2 - ocx * ratio;
      ty = py - r.height / 2 - ocy * ratio;
      scale = ns; apply();
    }
    function zoomBy(f) { var r = stage.getBoundingClientRect(); setScale(scale * f, r.width / 2 + r.left, r.height / 2 + r.top); }
    function fit() {
      var r = stage.getBoundingClientRect();
      if (!im.naturalWidth) return;
      var pad = 24;
      scale = clampS(Math.min((r.width - pad) / im.naturalWidth, (r.height - pad) / im.naturalHeight));
      tx = 0; ty = 0; apply();
    }
    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); document.removeEventListener('keydown', onKey); }

    overlay.querySelector('[data-act="in"]').addEventListener('click', function () { zoomBy(1.2); });
    overlay.querySelector('[data-act="out"]').addEventListener('click', function () { zoomBy(1 / 1.2); });
    overlay.querySelector('[data-act="actual"]').addEventListener('click', function () { scale = 1; tx = 0; ty = 0; apply(); });
    overlay.querySelector('[data-act="fit"]').addEventListener('click', fit);
    overlay.querySelector('[data-act="close"]').addEventListener('click', close);
    overlay.querySelector('[data-act="newwin"]').addEventListener('click', function () {
      if (api() && api().open_image_viewer_window) {
        api().open_image_viewer_window(src, alt || '图片');
      } else if (typeof toast === 'function') {
        toast('新窗口查看需桌面版', 'error');
      }
    });
    // 点遮罩（stage 空白处）关闭
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay || e.target === stage) close();
    });
    // 滚轮缩放
    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      setScale(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY);
    }, { passive: false });
    // 拖拽平移
    var dragging = false, lx = 0, ly = 0;
    stage.addEventListener('pointerdown', function (e) {
      if (e.target !== im) return;
      dragging = true; lx = e.clientX; ly = e.clientY; stage.style.cursor = 'grabbing';
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    });
    stage.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      tx += e.clientX - lx; ty += e.clientY - ly; lx = e.clientX; ly = e.clientY; apply();
    });
    function endDrag() { dragging = false; stage.style.cursor = 'grab'; }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    function onKey(e) {
      if (e.key === 'Escape') close();
      else if (e.key === '+' || e.key === '=') zoomBy(1.2);
      else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.2);
      else if (e.key === '0') fit();
    }
    document.addEventListener('keydown', onKey);

    im.addEventListener('load', function () { loading.style.display = 'none'; fit(); });
    im.addEventListener('error', function () { loading.textContent = '图片加载失败'; });
    im.src = src;
    if (im.complete && im.naturalWidth) { loading.style.display = 'none'; fit(); }
  }

  /* ---- 流程图 ---- */
  function renderMermaidBlock(b, body) {
    var ph = document.createElement('div');
    ph.className = 'ink-mermaid-view';
    ph.textContent = '📊 渲染中…';
    var ta = document.createElement('textarea');
    ta.className = 'ink-mermaid-edit';
    ta.value = b.src || '';
    ta.spellcheck = false;
    ta.style.display = 'none';
    ta.addEventListener('input', function () { b.src = ta.value; drawMermaid(ph, ta.value); scheduleSave(); });
    var bar = document.createElement('div');
    bar.className = 'ink-block-bar';
    var editBtn = document.createElement('span'); editBtn.className = 'ink-mini-btn'; editBtn.textContent = '编辑源码';
    editBtn.addEventListener('click', function () {
      var editing = ta.style.display === 'none';
      ta.style.display = editing ? '' : 'none';
      ph.style.display = editing ? 'none' : '';
      editBtn.textContent = editing ? '完成' : '编辑源码';
      if (editing) ta.focus();
    });
    bar.appendChild(editBtn);
    body.appendChild(bar); body.appendChild(ph); body.appendChild(ta);
    drawMermaid(ph, b.src || '');
  }
  function drawMermaid(ph, code) {
    if (!code.trim()) { ph.textContent = '（空图表）'; return; }
    function renderNow() {
      try {
        mermaid.render('inkm-' + Date.now() + '-' + Math.floor(Math.random() * 1e6), code)
          .then(function (res) { ph.innerHTML = res.svg; })
          .catch(function (err) { ph.className = 'ink-mermaid-view ink-err'; ph.textContent = '图表渲染失败：' + (err && err.message ? err.message : err); });
      } catch (e) { ph.className = 'ink-mermaid-view ink-err'; ph.textContent = '图表渲染失败：' + e; }
    }
    if (typeof mermaid === 'undefined') {
      ph.textContent = '图表加载中…';
      if (window.__mermaidReady) {
        window.__mermaidReady(function (err) {
          if (err) { ph.className = 'ink-mermaid-view ink-err'; ph.textContent = '图表渲染失败：' + (err.message || err); return; }
          renderNow();
        });
      } else {
        ph.textContent = '（未加载 mermaid）';
      }
      return;
    }
    renderNow();
  }

  /* ---- 公式 ---- */
  function renderMathBlock(b, body) {
    var ph = document.createElement('div');
    ph.className = 'ink-math-view';
    ph.textContent = '∑ 渲染中…';
    var ta = document.createElement('textarea');
    ta.className = 'ink-math-edit';
    ta.value = b.src || '';
    ta.spellcheck = false;
    ta.style.display = 'none';
    ta.addEventListener('input', function () { b.src = ta.value; drawMath(ph, ta.value); scheduleSave(); });
    var bar = document.createElement('div');
    bar.className = 'ink-block-bar';
    var editBtn = document.createElement('span'); editBtn.className = 'ink-mini-btn'; editBtn.textContent = '编辑源码';
    editBtn.addEventListener('click', function () {
      var editing = ta.style.display === 'none';
      ta.style.display = editing ? '' : 'none';
      ph.style.display = editing ? 'none' : '';
      editBtn.textContent = editing ? '完成' : '编辑源码';
      if (editing) ta.focus();
    });
    bar.appendChild(editBtn);
    body.appendChild(bar); body.appendChild(ph); body.appendChild(ta);
    drawMath(ph, b.src || '');
  }
  function drawMath(ph, code) {
    if (typeof katex === 'undefined') { ph.textContent = code; return; }
    try { ph.innerHTML = katex.renderToString(code || '', { throwOnError: false, displayMode: true }); }
    catch (e) { ph.className = 'ink-math-view ink-err'; ph.textContent = '公式渲染失败：' + (e && e.message ? e.message : e); }
  }

  /* ---- 标注 ---- */
  function renderCalloutBlock(b, body) {
    var wrap = document.createElement('div');
    wrap.className = 'md-callout md-callout-' + (b.ctype || 'note');
    var bar = document.createElement('div');
    bar.className = 'ink-block-bar';
    var sel = document.createElement('select');
    ['note', 'tip', 'important', 'warning', 'caution', 'info', 'quote'].forEach(function (t) {
      var o = document.createElement('option'); o.value = t; o.textContent = t; if (t === (b.ctype || 'note')) o.selected = true; sel.appendChild(o);
    });
    sel.addEventListener('change', function () { b.ctype = sel.value; wrap.className = 'md-callout md-callout-' + b.ctype; scheduleSave(); });
    bar.appendChild(sel);
    var div = document.createElement('div');
    div.setAttribute('data-bid', b.id);
    div.className = 'ink-editable';
    div.innerHTML = b.text || '';
    editableOpts(div);
    wrap.appendChild(bar); wrap.appendChild(div);
    body.appendChild(wrap);
  }

  /* ---- 分割线 / 分栏 ---- */
  function renderHrBlock(b, body) { var hr = document.createElement('hr'); hr.className = 'ink-hr'; body.appendChild(hr); }
  function renderColsBlock(b, body) {
    var wrap = document.createElement('div');
    wrap.className = 'md-cols';
    ['left', 'right'].forEach(function (side) {
      var col = document.createElement('div');
      col.className = 'md-col ink-editable';
      col.setAttribute('contenteditable', 'true');
      col.setAttribute('data-bid', b.id);
      col.setAttribute('data-side', side);
      col.innerHTML = b[side] || '';
      col.addEventListener('input', function () { b[side] = col.innerHTML; scheduleSave(); });
      col.addEventListener('keydown', function (ev) { onEditableKey(ev, col); });
      wrap.appendChild(col);
    });
    body.appendChild(wrap);
  }

  /* ---- 列表块 ---- */
  function renderListBlock(b, body) {
    if (!b.items || !b.items.length) b.items = [''];
    var list = document.createElement(b.ordered ? 'ol' : 'ul');
    list.className = 'ink-list';
    b.items.forEach(function (txt, idx) {
      var li = document.createElement('li');
      li.className = 'ink-editable';
      li.setAttribute('contenteditable', 'true');
      li.setAttribute('data-bid', b.id);
      li.setAttribute('data-idx', idx);
      li.innerHTML = txt || '';
      bindListEditable(li, b, idx);
      list.appendChild(li);
    });
    body.appendChild(list);
  }
  function bindListEditable(li, b, idx) {
    li.addEventListener('input', function () { b.items[idx] = li.innerHTML; scheduleSave(); });
    li.addEventListener('keydown', function (ev) {
      if (state.slash && state.slash.blockId === b.id) { if (handleSlashKey(ev)) return; }
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        b.items.splice(idx + 1, 0, '');
        render();
        var nel = state.container.querySelector('.ink-editable[data-bid="' + b.id + '"][data-idx="' + (idx + 1) + '"]');
        if (nel) { nel.focus(); placeCaret(nel, true); }
        scheduleSave();
      } else if (ev.key === 'Backspace') {
        var sel = window.getSelection();
        var atStart = sel && sel.isCollapsed && sel.anchorOffset === 0 && sel.anchorNode === li;
        if (atStart) {
          if (b.items.length > 1) {
            ev.preventDefault();
            b.items.splice(idx, 1);
            render();
            var prevIdx = Math.max(0, idx - 1);
            var pel = state.container.querySelector('.ink-editable[data-bid="' + b.id + '"][data-idx="' + prevIdx + '"]');
            if (pel) { pel.focus(); placeCaret(pel, false); }
            scheduleSave();
          } else {
            ev.preventDefault();
            b.type = 'text'; b.text = li.innerHTML; delete b.items; delete b.ordered;
            render();
            var ed = findEditable(b.id);
            if (ed) { ed.focus(); placeCaret(ed, true); }
            scheduleSave();
          }
        }
      }
    });
    li.addEventListener('paste', onEditablePaste);
  }

  /* ---- 链接块 ---- */
  function renderLinkBlock(b, body) {
    var row = document.createElement('div');
    row.className = 'ink-link-row';
    var ico = document.createElement('span');
    ico.className = 'ink-link-ico'; ico.textContent = '🔗';
    var a = document.createElement('a');
    a.className = 'ink-link-anchor';
    a.textContent = b.text || '链接';
    a.href = b.href || '#';
    a.target = '_blank'; a.rel = 'noopener';
    a.addEventListener('click', function (ev) { if (!b.href) ev.preventDefault(); });
    row.appendChild(ico); row.appendChild(a);
    var label = document.createElement('div');
    label.className = 'ink-editable ink-link-label';
    label.setAttribute('contenteditable', 'true');
    label.setAttribute('data-bid', b.id);
    label.setAttribute('data-role', 'label');
    label.textContent = b.text || '';
    label.addEventListener('input', function () { b.text = label.textContent; a.textContent = b.text || '链接'; scheduleSave(); });
    var urlInput = document.createElement('input');
    urlInput.className = 'ink-link-url';
    urlInput.type = 'text';
    urlInput.placeholder = '粘贴或输入链接地址…';
    urlInput.value = b.href || '';
    urlInput.addEventListener('input', function () { b.href = urlInput.value; a.href = b.href || '#'; scheduleSave(); });
    body.appendChild(row);
    body.appendChild(label);
    body.appendChild(urlInput);
  }

  /* ---------------- 交互 ---------------- */
  /* ---------------- Bubble menu 基础设施 ---------------- */
  // 找到当前 Selection 所在的 ink-editable（contenteditable 块）和其 bid
  function getBlockAtCaret() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var node = sel.anchorNode;
    if (!node) return null;
    var ed = (node.nodeType === 1 ? node : node.parentElement);
    while (ed && (!ed.classList || !ed.classList.contains('ink-editable'))) ed = ed.parentElement;
    if (!ed) return null;
    var bid = ed.getAttribute('data-bid');
    if (!bid) return null;
    var b = findBlock(bid);
    if (!b) return null;
    var range = sel.getRangeAt(0).cloneRange();
    return { bid: bid, block: b, range: range, editable: ed, collapsed: sel.isCollapsed };
  }

  // 监听全局 selectionchange 触发 bubble 显隐（被 app.js 用作气泡锚点）
  var _bubbleCb = null;
  function setBubbleListener(cb) { _bubbleCb = cb; }
  function notifyBubble(info) {
    if (_bubbleCb) { try { _bubbleCb(info); } catch (e) { console.warn('[inkpad] bubble cb', e); } }
  }
  function setupBubbleObserver() {
    if (state.bubbleHandler) return;
    state.bubbleHandler = function () {
      if (state.bubbleTimer) clearTimeout(state.bubbleTimer);
      state.bubbleTimer = setTimeout(function () {
        var r = getBlockAtCaret();
        // 必须处于当前打开的富文档内、且是非折叠选区
        var inside = r && r.editable && state.container && state.container.contains(r.editable);
        if (inside && !r.collapsed) {
          notifyBubble({ visible: true, blockId: r.bid, range: r.range, editable: r.editable, block: r.block });
        } else {
          notifyBubble({ visible: false });
        }
      }, 140);
    };
    document.addEventListener('selectionchange', state.bubbleHandler);
  }
  function teardownBubbleObserver() {
    if (state.bubbleHandler) {
      document.removeEventListener('selectionchange', state.bubbleHandler);
      state.bubbleHandler = null;
    }
    if (state.bubbleTimer) { clearTimeout(state.bubbleTimer); state.bubbleTimer = null; }
  }

  // 块级类型转换（与 applySlash 内 textLike 分支等价，但保留更多文本兼容路径）
  // 适用场景：用户在 bubble 菜单上选「H1 / 引用 / 高亮块」等。重渲染后焦点回到该块末。
  function transformBlockType(bid, newType) {
    var b = findBlock(bid);
    if (!b) return false;
    // 取原内容（兼容 ulist/olist/code 等结构化字段）
    var savedText = b.text;
    if (savedText === undefined) {
      if (Array.isArray(b.items) && b.items.length) savedText = b.items.join('\n');
      else if (typeof b.src === 'string') savedText = b.src;
      else savedText = '';
    }
    var textLike = ['text', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'quote', 'todo', 'ulist', 'olist', 'link'].indexOf(newType) >= 0;
    if (!textLike) {
      // 非文本类：当前块直接替换（同步块/表格/图片 等）
      var idx = indexOfBlock(bid);
      if (idx < 0) return false;
      var nb = makeBlock(newType);
      // 新块如果支持 text 字段，迁移过去
      if (nb.text !== undefined || newType === 'callout') nb.text = savedText;
      state.blocks[idx] = nb;
      render();
      focusBlock(nb.id);
      scheduleSave();
      return true;
    }
    // 文本类：清空旧形状字段 + 设置新形状
    ['items','ordered','src','lang','checked','href','alt','data','rows','cols','ctype','left','right']
      .forEach(function (k) { delete b[k]; });
    b.type = newType;
    if (newType === 'todo') { b.text = savedText; b.checked = false; }
    else if (newType === 'ulist') { b.ordered = false; b.items = [savedText || '']; }
    else if (newType === 'olist') { b.ordered = true; b.items = [savedText || '']; }
    else if (newType === 'link') { b.href = ''; b.text = savedText || ''; }
    else { b.text = savedText || ''; }
    render();
    var ed = findEditable(b.id);
    if (ed) { ed.focus(); placeCaret(ed, true); }
    scheduleSave();
    return true;
  }

  // inline format 应用：在当前 ink-editable 选区上执行 execCommand。
  // cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough'
  //    | 'foreColor' / 'hiliteColor'
  //    | 'clearForeColor' / 'clearHiliteColor'（清除选区上的颜色样式，恢复默认）
  //    | 'createLink'（value=null 取消链接）
  function applyInlineFormat(cmd, value) {
    var r = getBlockAtCaret();
    if (!r) return false;
    // execCommand 需要临时焦点到该 editable
    try {
      r.editable.focus();
      if (cmd === 'foreColor') {
        document.execCommand('foreColor', false, value || '#000000');
      } else if (cmd === 'hiliteColor') {
        // 飞书式背景色。注意：webview2/Chromium 系对 hiliteColor 支持有限，
        // 退化为把选中范围包一个 background-color style 的 <span>
        var ok = false;
        try { ok = document.execCommand('hiliteColor', false, value || 'transparent'); } catch (e) { ok = false; }
        if (!ok) paintRangeBackground(r, value);
      } else if (cmd === 'clearForeColor') {
        clearRangeInlineProp(r, 'color');
        // 退回默认字色
        try { document.execCommand('foreColor', false, '#37352f'); } catch (e) {}
      } else if (cmd === 'clearHiliteColor') {
        clearRangeInlineProp(r, 'background-color');
      } else if (cmd === 'createLink') {
        if (!value) {
          // 取消链接：先把选中范围扩到最大链接节点，unlink
          document.execCommand('unlink', false, null);
        } else {
          document.execCommand('createLink', false, value);
        }
      } else {
        document.execCommand(cmd, false, null);
      }
    } catch (e) { console.warn('[inkpad] execCommand', cmd, e); return false; }
    // 同步回 state.blocks.b.text
    r.block.text = r.editable.innerHTML;
    scheduleSave();
    // 重新触发一次 bubble 状态（让 app.js 拿最新选区）
    if (state.bubbleHandler) {
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        notifyBubble({ visible: true, blockId: r.bid, range: sel.getRangeAt(0).cloneRange(), editable: r.editable, block: r.block });
      }
    }
    return true;
  }

  // 给 selection 包一段 span 应用 background-color（hiliteColor fallback）
  function paintRangeBackground(r, bg) {
    try {
      var sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      var range = sel.getRangeAt(0);
      if (!r.editable.contains(range.commonAncestorContainer)) return;
      var span = document.createElement('span');
      span.style.backgroundColor = bg || 'transparent';
      span.appendChild(range.extractContents());
      range.insertNode(span);
      // 重设选区到新 span 上
      sel.removeAllRanges();
      var newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.addRange(newRange);
    } catch (e) { console.warn('[inkpad] paintRangeBackground', e); }
  }

  // 清除选区上所有元素的 style[prop]（用于恢复颜色默认）
  function clearRangeInlineProp(r, prop) {
    try {
      var sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      var range = sel.getRangeAt(0);
      var root = range.commonAncestorContainer;
      if (!root) return;
      if (root.nodeType === 3) root = root.parentElement;
      if (!root) return;
      // 收窄到 ink-editable 内
      if (!r.editable.contains(root)) root = r.editable;
      var walker = document.createTreeWalker(root, window.NodeFilter ? window.NodeFilter.SHOW_ELEMENT : 0x1, null);
      var arr = [];
      var n;
      while ((n = walker.nextNode())) {
        try {
          if (range.intersectsNode(n) && n.style && n.style.getPropertyValue(prop)) arr.push(n);
        } catch (e) {}
      }
      arr.forEach(function (node) {
        node.style.removeProperty(prop);
        if (!node.getAttribute('style')) node.removeAttribute('style');
      });
      // 兜底：font[color] 也要清
      if (prop === 'color') {
        var fonts = root.querySelectorAll('font[color]');
        fonts.forEach(function (f) {
          if (range.intersectsNode(f)) f.removeAttribute('color');
        });
      }
    } catch (e) { console.warn('[inkpad] clearRangeInlineProp', e); }
  }

  /* ---------------- 交互 ---------------- */
  function onEditableKey(ev, div) {
    if (state.slash && state.slash.blockId === div.getAttribute('data-bid')) {
      if (handleSlashKey(ev)) return;
    }
    var bid = div.getAttribute('data-bid');
    var b = findBlock(bid);
    if (!b) return;
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      var idx = indexOfBlock(bid);
      var nb = { id: uid(), type: 'text', text: '' };
      state.blocks.splice(idx + 1, 0, nb);
      render();
      var nd = findEditable(nb.id);
      if (nd) placeCaret(nd, true);
      scheduleSave();
    } else if (ev.key === 'Backspace') {
      var sel = window.getSelection();
      var atStart = sel && sel.anchorOffset === 0 && sel.isCollapsed;
      if (atStart && (div.textContent === '' || (sel.anchorNode === div && sel.anchorOffset === 0))) {
        if (state.blocks.length > 1) {
          ev.preventDefault();
          var idx2 = indexOfBlock(bid);
          var prev = state.blocks[idx2 - 1];
          state.blocks.splice(idx2, 1);
          render();
          if (prev) { var pe = findEditable(prev.id); if (pe) placeCaret(pe, false); }
          scheduleSave();
        }
      }
    } else if (ev.key === 'ArrowUp' && div.getAttribute('data-side') !== 'right') {
      // 简单：不移块间光标
    }
  }

  function onEditablePaste(ev) {
    var items = (ev.clipboardData && ev.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image/') === 0) {
        ev.preventDefault();
        var file = items[i].getAsFile();
        if (file && state.doc) {
          var reader = new FileReader();
          reader.onload = function () {
            var arr = new Uint8Array(reader.result);
            var bin = '';
            for (var k = 0; k < arr.length; k += 0x8000) bin += String.fromCharCode.apply(null, arr.subarray(k, k + 0x8000));
            try {
              var b64 = btoa(bin);
              var nb = { id: uid(), type: 'image', src: 'data:' + (file.type || 'image/png') + ';base64,' + b64, alt: 'pasted' };
              state.blocks.push(nb); render(); scheduleSave();
            } catch (e) {}
          };
          reader.readAsArrayBuffer(file);
        }
        return;
      }
    }
  }

  function findEditable(bid) {
    return state.container.querySelector('.ink-editable[data-bid="' + bid + '"]');
  }
  function focusBlock(bid) {
    var ed = findEditable(bid);
    if (ed) { ed.focus(); placeCaret(ed, true); return; }
    var el = state.container.querySelector('.ink-block[data-id="' + bid + '"]');
    if (el) el.scrollIntoView({ block: 'center' });
  }
  function placeCaret(el, atEnd) {
    el.focus();
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(!atEnd);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function removeBlock(id) {
    var idx = indexOfBlock(id);
    if (idx < 0) return;
    if (state.blocks.length === 1) { state.blocks[0] = makeBlock('text'); render(); scheduleSave(); return; }
    state.blocks.splice(idx, 1);
    render();
    var prev = state.blocks[Math.max(0, idx - 1)];
    if (prev) { var pe = findEditable(prev.id); if (pe) placeCaret(pe, false); }
    scheduleSave();
  }

  /* ---- 拖拽排序 ---- */
  function bindDrag(handle, b, el) {
    handle.addEventListener('dragstart', function (ev) {
      state.dragId = b.id;
      ev.dataTransfer.effectAllowed = 'move';
      try { ev.dataTransfer.setData('text/plain', b.id); } catch (e) {}
    });
    el.addEventListener('dragover', function (ev) {
      if (!state.dragId || state.dragId === b.id) return;
      ev.preventDefault();
      var from = indexOfBlock(state.dragId);
      var to = indexOfBlock(b.id);
      if (from < 0 || to < 0) return;
      var moved = state.blocks.splice(from, 1)[0];
      state.blocks.splice(to, 0, moved);
      state.dragId = null;
      render();
      scheduleSave();
    });
    handle.addEventListener('dragend', function () { state.dragId = null; });
  }

  /* ---- + 插入菜单 ---- */
  function openInsertMenu(anchor, cb) {
    closeInsertMenu();
    var menu = document.createElement('div');
    menu.className = 'ink-insert-menu';
    menu.id = 'ink-insert-menu';
    Object.keys(BLOCK_TYPES).forEach(function (t) {
      if (t === 'calloutTypes') return;
      var item = document.createElement('div');
      item.className = 'ink-insert-item';
      item.innerHTML = '<span class="ink-insert-ico">' + (BLOCK_TYPES[t].icon) + '</span>' + BLOCK_TYPES[t].label;
      item.addEventListener('click', function () { closeInsertMenu(); cb(t); });
      menu.appendChild(item);
    });
    document.body.appendChild(menu);
    var r = anchor.getBoundingClientRect();
    menu.style.left = r.left + 'px';
    menu.style.top = (r.bottom + 4) + 'px';
    setTimeout(function () { document.addEventListener('click', closeInsertMenu); }, 0);
  }
  function closeInsertMenu() {
    var m = document.getElementById('ink-insert-menu');
    if (m) m.remove();
    document.removeEventListener('click', closeInsertMenu);
  }

  /* ---- 飞书式 / 触发菜单 ---- */
  function detectSlash(div) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var range = sel.getRangeAt(0);
    if (!range.collapsed) return null;
    var pre = range.cloneRange();
    pre.selectNodeContents(div);
    pre.setEnd(range.endContainer, range.endOffset);
    var before = pre.toString();
    var m = before.match(/^(.*?)\/([^\s/]*)$/);
    if (!m) return null;
    if (m[1].length && !/\s$/.test(m[1])) return null; // 避免 1/2 这类误触
    return { beforeSlash: m[1], query: m[2] };
  }
  function computeSlashContext(div) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var range = sel.getRangeAt(0);
    var pre = range.cloneRange(); pre.selectNodeContents(div); pre.setEnd(range.endContainer, range.endOffset);
    var post = range.cloneRange(); post.selectNodeContents(div); post.setStart(range.endContainer, range.endOffset);
    var before = pre.toString();
    var m = before.match(/^(.*?)\/([^\s/]*)$/);
    if (!m) return null;
    if (m[1].length && !/\s$/.test(m[1])) return null;
    return { beforeSlash: m[1], query: m[2], afterCaret: post.toString() };
  }
  function onEditableInput(div, b) {
    var d = detectSlash(div);
    if (d) {
      if (state.slash && state.slash.blockId === div.getAttribute('data-bid')) filterSlash(d.query);
      else openSlashMenu(div, d.query);
    } else if (state.slash && state.slash.blockId === div.getAttribute('data-bid')) {
      closeSlash();
    }
  }
  function flatSlashItems(query) {
    query = (query || '').toLowerCase().trim();
    var res = [];
    SLASH_GROUPS.forEach(function (g) {
      var items = g.items.filter(function (it) {
        if (!query) return true;
        return (it.label + ' ' + it.kw).toLowerCase().indexOf(query) >= 0;
      });
      if (items.length) res.push({ group: g.name, items: items });
    });
    return res;
  }
  function openSlashMenu(div, query) {
    closeSlash();
    var menu = document.createElement('div');
    menu.className = 'ink-insert-menu ink-slash-menu';
    menu.id = 'ink-slash-menu';
    state.slash = { blockId: div.getAttribute('data-bid'), menu: menu, items: [], index: 0, div: div };
    document.body.appendChild(menu);
    filterSlash(query);
    positionSlash(div, menu);
    setTimeout(function () { document.addEventListener('mousedown', onSlashOutside); }, 0);
  }
  function positionSlash(div, menu) {
    var rect = null;
    var sel = window.getSelection();
    if (sel && sel.rangeCount) {
      var r = sel.getRangeAt(0).cloneRange();
      var br = r.getBoundingClientRect();
      if (br && !(br.width === 0 && br.height === 0)) rect = br;
    }
    if (!rect) rect = div.getBoundingClientRect();
    menu.style.visibility = 'hidden';
    menu.style.display = 'block';
    var mw = menu.offsetWidth, mh = menu.offsetHeight;
    var top = rect.bottom + 6;
    var left = rect.left;
    if (left + mw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - mw - 8);
    if (top + mh > window.innerHeight - 8) top = Math.max(8, rect.top - mh - 6);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.visibility = 'visible';
  }
  function filterSlash(query) {
    var s = state.slash; if (!s) return;
    var grouped = flatSlashItems(query);
    var flat = [];
    grouped.forEach(function (g) { g.items.forEach(function (it) { flat.push(it); }); });
    s.items = flat;
    s.index = 0;
    var menu = s.menu;
    menu.innerHTML = '';
    if (!flat.length) {
      var empty = document.createElement('div');
      empty.className = 'ink-insert-item';
      empty.style.color = '#9a9aa2';
      empty.textContent = '无匹配项';
      menu.appendChild(empty);
      return;
    }
    grouped.forEach(function (g) {
      var gt = document.createElement('div');
      gt.className = 'ink-insert-group';
      gt.textContent = g.group;
      menu.appendChild(gt);
      g.items.forEach(function (it) {
        var item = document.createElement('div');
        item.className = 'ink-insert-item';
        item.innerHTML = '<span class="ink-insert-ico">' + it.icon + '</span>' + it.label;
        item.addEventListener('mousedown', function (ev) { ev.preventDefault(); applySlash(it.type); });
        item.addEventListener('mousemove', function () {
          var i = s.items.indexOf(it);
          if (i >= 0 && i !== s.index) { s.index = i; updateSlashActive(); }
        });
        menu.appendChild(item);
      });
    });
    updateSlashActive();
  }
  function updateSlashActive() {
    var s = state.slash; if (!s) return;
    var nodes = s.menu.querySelectorAll('.ink-insert-item');
    for (var i = 0; i < nodes.length; i++) nodes[i].classList.toggle('active', i === s.index);
    if (nodes[s.index]) nodes[s.index].scrollIntoView({ block: 'nearest' });
  }
  function slashMove(delta) {
    var s = state.slash; if (!s || !s.items.length) return;
    s.index = (s.index + delta + s.items.length) % s.items.length;
    updateSlashActive();
  }
  function slashSelect() {
    var s = state.slash; if (!s || !s.items.length) return;
    var it = s.items[s.index];
    if (it) applySlash(it.type);
  }
  function handleSlashKey(ev) {
    if (!state.slash) return false;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); slashMove(1); return true; }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); slashMove(-1); return true; }
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); slashSelect(); return true; }
    if (ev.key === 'Tab') { ev.preventDefault(); slashSelect(); return true; }
    if (ev.key === 'Escape') { ev.preventDefault(); closeSlash(); return true; }
    return false;
  }
  function onSlashOutside(ev) {
    if (state.slash && state.slash.menu && !state.slash.menu.contains(ev.target)) closeSlash();
  }
  function closeSlash() {
    if (state.slash && state.slash.menu) state.slash.menu.remove();
    document.removeEventListener('mousedown', onSlashOutside);
    state.slash = null;
  }
  function applySlash(type) {
    var s = state.slash; if (!s) return;
    var b = findBlock(s.blockId);
    closeSlash();
    if (!b) return;
    var div = findEditable(b.id);
    var ctx = div ? computeSlashContext(div) : null;
    var newText = ctx ? (ctx.beforeSlash + ctx.afterCaret) : (b.text || '');
    var textLike = ['text', 'h1', 'h2', 'h3', 'quote', 'todo', 'ulist', 'olist', 'link'].indexOf(type) >= 0;
    if (textLike) {
      delete b.items; delete b.ordered;
      b.type = type;
      if (type === 'todo') { b.text = newText; b.checked = false; }
      else if (type === 'ulist') { b.type = 'ulist'; b.ordered = false; b.items = [newText]; }
      else if (type === 'olist') { b.type = 'olist'; b.ordered = true; b.items = [newText]; }
      else if (type === 'link') { b.href = ''; b.text = newText; }
      else { b.text = newText; }
      render();
      var ed = findEditable(b.id);
      if (ed) { ed.focus(); placeCaret(ed, true); }
      scheduleSave();
    } else {
      var nb = makeBlock(type);
      var idx = indexOfBlock(b.id);
      if (!newText.trim()) { state.blocks[idx] = nb; }
      else { state.blocks.splice(idx + 1, 0, nb); }
      render();
      focusBlock(nb.id);
      scheduleSave();
      // 选图片时直接弹出文件选择器，无需二次点击「选择图片」按钮
      if (type === 'image') pickImageForBlock(nb);
    }
  }

  /* ---------------- 外部 API ---------------- */
  // 由工具栏「✨ 插入」菜单调用：在当前文档末尾插入块
  function insertBlock(type) {
    var nb = makeBlock(type);
    state.blocks.push(nb);
    render();
    focusBlock(nb.id);
    scheduleSave();
    // 选图片时直接弹出文件选择器，无需二次点击「选择图片」按钮
    if (type === 'image') pickImageForBlock(nb);
  }

  /* ---------------- 导出 Markdown ---------------- */
  function escapeMd(s) { return (s || '').replace(/([\\`*_{}\[\]()#+\-.!])/g, '\\$1'); }
  function toMarkdown() {
    var out = [];
    state.blocks.forEach(function (b) {
      switch (b.type) {
        case 'h1': out.push('# ' + stripHtml(b.text)); break;
        case 'h2': out.push('## ' + stripHtml(b.text)); break;
        case 'h3': out.push('### ' + stripHtml(b.text)); break;
        case 'text': out.push(stripHtml(b.text)); break;
        case 'quote': out.push('> ' + stripHtml(b.text)); break;
        case 'todo': out.push('- [' + (b.checked ? 'x' : ' ') + '] ' + stripHtml(b.text)); break;
        case 'code': out.push('```' + (b.lang || '') + '\n' + (b.src || '') + '\n```'); break;
        case 'table':
          if (b.data && b.data.length) {
            out.push('| ' + b.data[0].join(' | ') + ' |');
            out.push('| ' + b.data[0].map(function () { return '---'; }).join(' | ') + ' |');
            for (var r = 1; r < b.data.length; r++) out.push('| ' + b.data[r].join(' | ') + ' |');
          }
          break;
        case 'image': out.push('![' + (b.alt || '') + '](' + (b.src || '') + ')'); break;
        case 'mermaid': out.push('```mermaid\n' + (b.src || '') + '\n```'); break;
        case 'math': out.push('$$\n' + (b.src || '') + '\n$$'); break;
        case 'callout': out.push('> [!' + (b.ctype || 'note').toUpperCase() + ']\n> ' + stripHtml(b.text)); break;
        case 'hr': out.push('---'); break;
        case 'ulist': if (b.items) b.items.forEach(function (t) { out.push('- ' + stripHtml(t)); }); break;
        case 'olist': if (b.items) b.items.forEach(function (t) { out.push('1. ' + stripHtml(t)); }); break;
        case 'link': out.push('[' + stripHtml(b.text || '链接') + '](' + (b.href || '') + ')'); break;
        case 'cols': out.push('<div class="md-cols"><div class="md-col">' + stripHtml(b.left) + '</div><div class="md-col">' + stripHtml(b.right) + '</div></div>'); break;
        default: out.push(stripHtml(b.text || ''));
      }
      out.push('');
    });
    return out.join('\n');
  }
  function stripHtml(html) {
    if (!html) return '';
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || '').replace(/\n+/g, ' ').trim();
  }

  /* ---- 大纲跳转（被 outline 调用） ---- */
  function scrollToOutlineItem(id) {
    if (!state.container) return false;
    var anchor = state.container.querySelector('#ink-' + id);
    if (!anchor) return false;
    // 计算 rich-pane 容器顶部偏移，页面大小时锚点不被工具栏遮挡
    var pane = state.container.closest('#rich-pane') || state.container.parentElement;
    var paneRect = pane ? pane.getBoundingClientRect() : { top: 0 };
    var aRect = anchor.getBoundingClientRect();
    var offset = aRect.top - paneRect.top - 24; // 留 24px 顶部缓冲
    var paneScrollTop = (pane ? pane.scrollTop : 0) + offset;
    if (pane && typeof pane.scrollTo === 'function') {
      try { pane.scrollTo({ top: paneScrollTop, behavior: 'smooth' }); }
      catch (e) { pane.scrollTop = paneScrollTop; }
    } else {
      window.scrollTo({ top: window.scrollY + offset, behavior: 'smooth' });
    }
    // 视觉高亮
    var blk = anchor.parentElement;
    if (blk) {
      blk.classList.add('ink-block-highlight');
      setTimeout(function () { blk.classList.remove('ink-block-highlight'); }, 1400);
    }
    return true;
  }

  return {
    open: open,
    close: close,
    serialize: serialize,
    insertBlock: insertBlock,
    toMarkdown: toMarkdown,
    setOutlineListener: setOutlineListener,
    scrollToOutlineItem: scrollToOutlineItem,
    getBlocks: function () { return state.blocks.slice(); },
    notifyOutline: notifyOutline,
    // bubble menu 相关
    setBubbleListener: setBubbleListener,
    getBlockAtCaret: getBlockAtCaret,
    transformBlockType: transformBlockType,
    applyInlineFormat: applyInlineFormat
  };
})();
