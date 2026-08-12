/* [esm] 导出本模块顶层绑定 */
export { bubbleMenu, richBubbleTypeLabel, BUBBLE_BLOCK_ITEMS, BUBBLE_BLOCK_FLYOUT, BUBBLE_TEXT_COLORS, BUBBLE_BG_COLORS, BUBBLE_COLORS, ensureBubbleRoot, makeBubbleSep, showRichBubble, repositionBubbleForPanel, hideRichBubble, toggleBubbleDropdown, hideBubbleDropdown, toggleBubbleLinkInput, hideBubbleLinkInput, toggleBubbleColorBar, hideBubbleColorBar, runBubbleInline, bindRichBubble };
/* [esm] 导入依赖模块绑定 */
import { toast } from './16-doc-ops.js';
  /* ============================================================
   *  富文档 bubble menu（飞书式：选中文本浮条菜单）
   * ============================================================ */
  var bubbleMenu = {
    root: null, bar: null, dropdown: null, linkInput: null,
    colorBar: null, colorItems: null,
    visible: false, currentBlock: null
  };

  function richBubbleTypeLabel(t) {
    return {
      text: '正文', h1: '一级标题', h2: '二级标题', h3: '三级标题',
      quote: '引用', todo: '任务', code: '代码块', callout: '高亮块',
      ulist: '无序列表', olist: '有序列表', link: '链接块', cols: '分栏'
    }[t] || t;
  }

  // 块类型下拉菜单的 items（与飞书截图一致）
  var BUBBLE_BLOCK_ITEMS = [
    { type: 'text',  label: '正文',     icon: 'T' },
    { type: 'h1',    label: '一级标题', icon: 'H1' },
    { type: 'h2',    label: '二级标题', icon: 'H2' },
    { type: 'h3',    label: '三级标题', icon: 'H3' },
    { type: 'hn',    label: '其他标题', icon: 'Hn', flyout: true },
    { type: 'olist', label: '有序列表', icon: '≡' },
    { type: 'ulist', label: '无序列表', icon: '☰' },
    { type: 'todo',  label: '任务',     icon: '☑' },
    { type: 'code',  label: '代码块',   icon: '{}' },
    { type: 'quote', label: '引用',     icon: '❝' },
    { type: 'callout', label: '高亮块', icon: '💡' },
    { type: 'sync',  label: '同步块',   icon: '∥' }
  ];

  // 「其他标题」子菜单的二级 items（H4/H5/H6 — 飞书 Hn 行为）
  var BUBBLE_BLOCK_FLYOUT = [
    { type: 'h4', label: '四级标题', icon: 'H4' },
    { type: 'h5', label: '五级标题', icon: 'H5' },
    { type: 'h6', label: '六级标题', icon: 'H6' }
  ];

  // 文字颜色（8 色 + 第 1 个表示「默认」）
  var BUBBLE_TEXT_COLORS = [
    { name: '默认', hex: 'default' },     // 清除字体颜色
    { name: '灰',   hex: '#787774' },
    { name: '棕',   hex: '#976d57' },
    { name: '橙',   hex: '#cc782f' },
    { name: '黄',   hex: '#c29243' },
    { name: '绿',   hex: '#548164' },
    { name: '蓝',   hex: '#477da5' },
    { name: '紫',   hex: '#7a459c' }
  ];

  // 背景颜色（14 色 + 首格「默认」白色斜杠）
  var BUBBLE_BG_COLORS = [
    { name: '默认', hex: 'default' },     // 清除背景色
    { name: '浅灰', hex: '#e9e9ed' },
    { name: '浅米', hex: '#f3eada' },
    { name: '浅粉', hex: '#fbe1e3' },
    { name: '浅黄', hex: '#fbf0c8' },
    { name: '浅绿', hex: '#dde9dd' },
    { name: '浅蓝', hex: '#dde6ee' },
    { name: '浅紫', hex: '#e6dfee' },
    { name: '灰',   hex: '#bfc1c4' },
    { name: '棕',   hex: '#d9c0a8' },
    { name: '橙',   hex: '#f5cdb0' },
    { name: '黄',   hex: '#fae09c' },
    { name: '绿',   hex: '#abd2ab' },
    { name: '蓝',   hex: '#a8c3d0' },
    { name: '紫',   hex: '#c1add3' }
  ];
  // 维护一个颜色统一接口（同前 BUBBLE_COLORS 的语义，用于将来的「最近用」等扩展）
  var BUBBLE_COLORS = BUBBLE_TEXT_COLORS.concat(BUBBLE_BG_COLORS).filter(function (c, idx, arr) {
    return arr.indexOf(c) === idx;
  });

  function ensureBubbleRoot() {
    if (bubbleMenu.root) return bubbleMenu.root;
    var root = document.createElement('div');
    root.id = 'ink-bubble';
    root.style.display = 'none';
    root.setAttribute('role', 'toolbar');

    // 类型选择（左）+ 横条按钮组 + 颜色（折叠展开）
    var bar = document.createElement('div');
    bar.className = 'ink-bubble-bar';
    root.appendChild(bar);

    // 块类型下拉触发按钮
    var typeBtn = document.createElement('button');
    typeBtn.className = 'ink-bubble-btn ink-bubble-type';
    typeBtn.setAttribute('data-act', 'type');
    typeBtn.innerHTML = '<span class="ink-bubble-type-label">H3</span><span class="ink-bubble-caret">▾</span>';
    typeBtn.addEventListener('mousedown', function (e) { e.preventDefault(); toggleBubbleDropdown(); });
    bar.appendChild(typeBtn);

    // 分隔
    bar.appendChild(makeBubbleSep());

    // B / I / U / S
    [['bold','B',false], ['italic','I',true], ['underline','U',false], ['strikeThrough','S',false]]
      .forEach(function (p) {
        var b = document.createElement('button');
        b.className = 'ink-bubble-btn';
        if (p[2]) b.innerHTML = '<i>' + p[1] + '</i>';
        else b.textContent = p[1];
        b.title = ({
          bold: '加粗 (Ctrl+B)', italic: '斜体 (Ctrl+I)',
          underline: '下划线 (Ctrl+U)', strikeThrough: '删除线'
        })[p[0]];
        b.addEventListener('mousedown', function (e) { e.preventDefault(); runBubbleInline(p[0]); });
        bar.appendChild(b);
      });

    bar.appendChild(makeBubbleSep());

    // 链接按钮
    var linkBtn = document.createElement('button');
    linkBtn.className = 'ink-bubble-btn';
    linkBtn.title = '添加链接';
    linkBtn.innerHTML = '🔗';
    linkBtn.addEventListener('mousedown', function (e) {
      e.preventDefault();
      toggleBubbleLinkInput();
    });
    bar.appendChild(linkBtn);

    // 颜色按钮（飞书式：双 A 字母 + ▾；点开展开字体颜色 + 背景颜色 + 恢复默认）
    var colorBtn = document.createElement('button');
    colorBtn.className = 'ink-bubble-btn ink-bubble-color';
    colorBtn.title = '文字/背景颜色';
    colorBtn.innerHTML = '<span class="ink-bubble-color-letter">A</span><span class="ink-bubble-color-letter ink-bubble-color-letter-bg">A</span><span class="ink-bubble-caret">▾</span>';
    colorBtn.addEventListener('mousedown', function (e) {
      e.preventDefault();
      toggleBubbleColorBar();
    });
    bar.appendChild(colorBtn);

    bar.appendChild(makeBubbleSep());

    // 「块转换」类按钮：引用 / 高亮块（同步块已在块类型下拉里，这里不放）
    [['quote','❝','引用'], ['callout','💡','高亮块']]
      .forEach(function (p) {
        var b = document.createElement('button');
        b.className = 'ink-bubble-btn ink-bubble-block-act';
        b.title = p[2];
        b.textContent = p[1];
        if (p[0] === 'quote') b.addEventListener('mousedown', function (e) {
          e.preventDefault();
          var b2 = bubbleMenu.currentBlock; if (b2 && window.InkpadBlocks) window.InkpadBlocks.transformBlockType(b2.id, 'quote');
          hideRichBubble();
        });
        else if (p[0] === 'callout') b.addEventListener('mousedown', function (e) {
          e.preventDefault();
          var b2 = bubbleMenu.currentBlock; if (b2 && window.InkpadBlocks) window.InkpadBlocks.transformBlockType(b2.id, 'callout');
          hideRichBubble();
        });
        bar.appendChild(b);
      });

    // 关闭按钮
    var closeBtn = document.createElement('button');
    closeBtn.className = 'ink-bubble-btn ink-bubble-close';
    closeBtn.title = '关闭';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('mousedown', function (e) { e.preventDefault(); hideRichBubble(); });
    bar.appendChild(closeBtn);

    // 块类型下拉面板（默认隐藏）— 含 Hn flyout + ✓ 高亮
    var dd = document.createElement('div');
    dd.className = 'ink-bubble-dropdown';
    dd.style.display = 'none';

    BUBBLE_BLOCK_ITEMS.forEach(function (it) {
      var row = document.createElement('div');
      row.className = 'ink-bubble-dd-item' + (it.flyout ? ' has-flyout' : '');
      row.setAttribute('data-type', it.type);
      // mark / 文字 / ✓ / ›  四列结构：左 mark → label → 右 push → 末尾 ✓ 或 ›
      row.innerHTML =
        '<span class="ink-bubble-dd-mark">' + it.icon + '</span>' +
        '<span class="ink-bubble-dd-text">' + it.label + '</span>' +
        '<span class="ink-bubble-dd-spacer"></span>' +
        '<span class="ink-bubble-dd-check">✓</span>';
      if (it.flyout) {
        // 鼠标悬浮显示二级 H4/H5/H6 flyout
        row.addEventListener('mouseenter', function () {
          // 标记 sibling flyout 取消
          if (bubbleMenu.dropdown) {
            Array.prototype.forEach.call(
              bubbleMenu.dropdown.querySelectorAll('.ink-bubble-dd-item.has-flyout'),
              function (it2) { it2.classList.remove('show-flyout'); }
            );
          }
          row.classList.add('show-flyout');
        });
        row.addEventListener('mouseleave', function () {
          row.classList.remove('show-flyout');
        });
        // 注意：Hn 行的 mousedown 不直接生效，而由 flyout 二级项接管
        row.addEventListener('mousedown', function (e) {
          e.preventDefault();
          // 不关门，等子项
        });
      } else {
        row.addEventListener('mousedown', function (e) {
          e.preventDefault();
          var b = bubbleMenu.currentBlock;
          if (!b) return;
          if (it.type === 'sync') {
            // 同步块（飞书协作概念）：本地暂以高亮块承载并提示
            window.InkpadBlocks.transformBlockType(b.id, 'callout');
            toast('同步块是协作概念，本地版暂以高亮块承载', 'info');
          } else {
            window.InkpadBlocks.transformBlockType(b.id, it.type);
          }
          hideBubbleDropdown();
        });
      }
      dd.appendChild(row);

      // flyout panel 锚定到 row 上
      if (it.flyout) {
        var flyout = document.createElement('div');
        flyout.className = 'ink-bubble-flyout';
        BUBBLE_BLOCK_FLYOUT.forEach(function (sub) {
          var srow = document.createElement('div');
          srow.className = 'ink-bubble-flyout-item';
          srow.setAttribute('data-type', sub.type);
          srow.innerHTML =
            '<span class="ink-bubble-dd-mark">' + sub.icon + '</span>' +
            '<span class="ink-bubble-dd-text">' + sub.label + '</span>';
          srow.addEventListener('mousedown', function (e) {
            e.preventDefault();
            var b = bubbleMenu.currentBlock;
            if (b && window.InkpadBlocks) window.InkpadBlocks.transformBlockType(b.id, sub.type);
            hideBubbleDropdown();
          });
          flyout.appendChild(srow);
        });
        row.appendChild(flyout);
      }
    });
    root.appendChild(dd);

    // 链接输入（默认隐藏）
    var linkWrap = document.createElement('div');
    linkWrap.className = 'ink-bubble-link-row';
    linkWrap.style.display = 'none';
    var linkInput = document.createElement('input');
    linkInput.type = 'text';
    linkInput.placeholder = '输入链接地址，回车应用';
    linkInput.className = 'ink-bubble-link-input';
    linkInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        var url = linkInput.value.trim();
        if (window.InkpadBlocks) window.InkpadBlocks.applyInlineFormat('createLink', url || null);
        hideBubbleLinkInput();
      } else if (ev.key === 'Escape') {
        hideBubbleLinkInput();
      }
    });
    var unlinkBtn = document.createElement('button');
    unlinkBtn.className = 'ink-bubble-btn';
    unlinkBtn.title = '取消链接';
    unlinkBtn.textContent = '✕链';
    unlinkBtn.addEventListener('mousedown', function (ev) {
      ev.preventDefault();
      if (window.InkpadBlocks) window.InkpadBlocks.applyInlineFormat('createLink', null);
      hideBubbleLinkInput();
    });
    linkWrap.appendChild(linkInput);
    linkWrap.appendChild(unlinkBtn);
    root.appendChild(linkWrap);

    // 颜色面板（默认隐藏）— 拆为「字体颜色」/「背景颜色」/「恢复默认」三段
    var colorBar = document.createElement('div');
    colorBar.className = 'ink-bubble-colors';
    colorBar.style.display = 'none';

    function buildColorSection(headerText, items, mode) {
      var section = document.createElement('div');
      section.className = 'ink-bubble-color-section';
      var h = document.createElement('div');
      h.className = 'ink-bubble-color-header';
      h.textContent = headerText;
      section.appendChild(h);
      var grid = document.createElement('div');
      grid.className = 'ink-bubble-color-grid';
      items.forEach(function (c) {
        var s = document.createElement('span');
        s.className = 'ink-bubble-color-chip';
        s.title = c.name;
        if (c.hex === 'default') {
          s.classList.add('ink-bubble-color-chip-default');
        } else {
          s.style.background = c.hex;
        }
        s.setAttribute('data-hex', c.hex);
        s.setAttribute('data-mode', mode);
        s.addEventListener('mousedown', function (e) {
          e.preventDefault();
          if (!window.InkpadBlocks) return;
          if (c.hex === 'default') {
            // 默认：清除该模式颜色
            window.InkpadBlocks.applyInlineFormat(
              mode === 'bg' ? 'clearHiliteColor' : 'clearForeColor',
              null
            );
          } else {
            window.InkpadBlocks.applyInlineFormat(
              mode === 'bg' ? 'hiliteColor' : 'foreColor',
              c.hex
            );
          }
        });
        grid.appendChild(s);
      });
      section.appendChild(grid);
      return section;
    }

    colorBar.appendChild(buildColorSection('字体颜色', BUBBLE_TEXT_COLORS, 'fg'));
    colorBar.appendChild(buildColorSection('背景颜色', BUBBLE_BG_COLORS, 'bg'));

    // 「恢复默认」按钮
    var resetWrap = document.createElement('div');
    resetWrap.className = 'ink-bubble-color-reset-wrap';
    var resetBtn = document.createElement('div');
    resetBtn.className = 'ink-bubble-color-reset';
    resetBtn.textContent = '恢复默认';
    resetBtn.addEventListener('mousedown', function (e) {
      e.preventDefault();
      if (!window.InkpadBlocks) return;
      window.InkpadBlocks.applyInlineFormat('clearForeColor', null);
      window.InkpadBlocks.applyInlineFormat('clearHiliteColor', null);
    });
    resetWrap.appendChild(resetBtn);
    colorBar.appendChild(resetWrap);

    root.appendChild(colorBar);

    document.body.appendChild(root);

    bubbleMenu.root = root;
    bubbleMenu.bar = bar;
    bubbleMenu.dropdown = dd;
    bubbleMenu.linkInput = linkInput;
    bubbleMenu.linkRow = linkWrap;
    bubbleMenu.colorBar = colorBar;
    return root;
  }

  function makeBubbleSep() {
    var s = document.createElement('span');
    s.className = 'ink-bubble-sep';
    return s;
  }

  function showRichBubble(info) {
    var root = ensureBubbleRoot();
    if (!info || !info.range) { hideRichBubble(); return; }
    // 当 selectionchange 在 mouseup 过程中被触发、菜单还没显示时，先按 rect 显示
    var rect = info.range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) { hideRichBubble(); return; }
    // 先排版
    root.style.display = '';
    root.style.visibility = 'hidden';
    var w = root.offsetWidth;
    var h = root.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight;
    var top = rect.top - h - 8;
    var left = rect.left + rect.width / 2 - w / 2;
    if (top < 36) top = rect.bottom + 8; // 屏幕顶部贴边时翻转到下方
    if (left < 8) left = 8;
    if (left + w > vw - 8) left = vw - 8 - w;
    if (top + h > vh - 8) top = Math.max(8, vh - 8 - h);
    root.style.top = top + 'px';
    root.style.left = left + 'px';
    root.style.visibility = 'visible';

    // 当前块类型 → 类型按钮显示
    var b = info.block;
    bubbleMenu.currentBlock = b;
    var lab = root.querySelector('.ink-bubble-type-label');
    if (lab) lab.textContent = richBubbleTypeLabel(b.type);

    // 高亮当前已选项（同步块下拉里）
    var rows = root.querySelectorAll('.ink-bubble-dd-item');
    rows.forEach(function (r) {
      var t = r.getAttribute('data-type');
      // 「有序/无序」映射：截图里写「有序列表 / 无序列表」，但 label 标反了，这里按实际显示
      var match = t === b.type;
      r.classList.toggle('active', match);
    });

    bubbleMenu.visible = true;
    // 【v0.18.7】记录选区信息，供后续下拉打开后重新定位（避开贴边被裁）
    bubbleMenu.lastRect = rect;
  }

  /**
   * 【v0.18.7】当 block-type / 颜色 / 链接三个下拉面板展开后，
   * 整条 #ink-bubble（含横条 + 面板）的总高度可能超出视口，被底边裁掉。
   * 这里以面板"当前真实高度"为基准，把整条气泡回挪到视口内。
   * - 首选：横条贴选区上方、面板往下挂；
   * - 顶部贴边：横条贴选区下方、面板往下挂（已经做的）；
   * - 整条仍超底边：把 top 收回到 vh - h - 8；
   * - 仍会盖住选区：尽量保留 "横条在上"，否则把整条下推到选区下方。
   */
  function repositionBubbleForPanel() {
    var root = bubbleMenu.root;
    if (!root || root.style.display === 'none') return;
    var vw = window.innerWidth, vh = window.innerHeight;
    var w = root.offsetWidth;
    var h = root.offsetHeight; // 当前真实高度（含展开的面板）
    var rect = bubbleMenu.lastRect;
    if (!rect) return;
    var top;
    var selMid = rect.top + (rect.bottom - rect.top) / 2;
    // 默认：横条在选区上方（老逻辑）
    top = rect.top - h - 8;
    var anchorAbove = top + h + 8; // 选区到容器底边距离（正 = 容器在选区上方）
    if (top < 36) {
      // 顶部贴边 → 翻到选区下方
      top = rect.bottom + 8;
    }
    // 整条仍超底边
    if (top + h > vh - 8) {
      top = Math.max(8, vh - 8 - h);
    }
    // 如果整条气泡完全覆盖了选区 → 把整条下推到选区下方（横条不挡文字）
    if (top <= rect.top + 2 && top + h >= rect.bottom - 2) {
      var underTop = rect.bottom + 8;
      if (underTop + h <= vh - 8 && underTop >= 36) {
        top = underTop;
      } else if (rect.top - h - 8 >= 36) {
        top = rect.top - h - 8;
      } else {
        top = Math.max(8, Math.min(vh - 8 - h, rect.bottom + 8));
        if (top < 8) top = 8;
      }
    }
    var left = rect.left + (rect.right - rect.left) / 2 - w / 2;
    if (left < 8) left = 8;
    if (left + w > vw - 8) left = vw - 8 - w;
    root.style.top = top + 'px';
    root.style.left = left + 'px';
  }

  function hideRichBubble() {
    if (!bubbleMenu.root) return;
    bubbleMenu.root.style.display = 'none';
    hideBubbleDropdown();
    hideBubbleLinkInput();
    hideBubbleColorBar();
    bubbleMenu.visible = false;
    bubbleMenu.currentBlock = null;
  }

  function toggleBubbleDropdown() {
    if (!bubbleMenu.dropdown) return;
    var v = bubbleMenu.dropdown.style.display;
    hideBubbleLinkInput(); hideBubbleColorBar();
    // 注意：CSS 基础值是 display:none，不能设成 ''（清空 inline 会回退到 none，导致永远隐藏）。
    // 这里用显式 'block'。
    bubbleMenu.dropdown.style.display = (v === 'none' || v === '' ? 'block' : 'none');
    // 【v0.18.7】面板展开后整体高度变化，重新定位以避开被窗口底边裁掉
    if (bubbleMenu.dropdown.style.display !== 'none') repositionBubbleForPanel();
  }
  function hideBubbleDropdown() { if (bubbleMenu.dropdown) bubbleMenu.dropdown.style.display = 'none'; }

  function toggleBubbleLinkInput() {
    if (!bubbleMenu.linkRow) return;
    var v = bubbleMenu.linkRow.style.display;
    hideBubbleDropdown(); hideBubbleColorBar();
    // CSS 基础值是 display:none，必须用显式 'flex'（横向排列输入框 + 取消按钮）。
    bubbleMenu.linkRow.style.display = (v === 'none' || v === '' ? 'flex' : 'none');
    if (bubbleMenu.linkRow.style.display !== 'none') {
      setTimeout(function () { bubbleMenu.linkInput.focus(); }, 30);
      // 【v0.18.7】面板展开后整体高度变化，重新定位
      repositionBubbleForPanel();
    }
  }
  function hideBubbleLinkInput() {
    if (bubbleMenu.linkRow) bubbleMenu.linkRow.style.display = 'none';
    if (bubbleMenu.linkInput) bubbleMenu.linkInput.value = '';
  }

  function toggleBubbleColorBar() {
    if (!bubbleMenu.colorBar) return;
    var v = bubbleMenu.colorBar.style.display;
    hideBubbleDropdown(); hideBubbleLinkInput();
    // CSS 基础值是 display:none，必须用显式 'flex'（换行色板使用 flex-wrap）。
    bubbleMenu.colorBar.style.display = (v === 'none' || v === '' ? 'flex' : 'none');
    // 【v0.18.7】面板展开后整体高度变化，重新定位
    if (bubbleMenu.colorBar.style.display !== 'none') repositionBubbleForPanel();
  }
  function hideBubbleColorBar() { if (bubbleMenu.colorBar) bubbleMenu.colorBar.style.display = 'none'; }

  function runBubbleInline(cmd) {
    if (window.InkpadBlocks) window.InkpadBlocks.applyInlineFormat(cmd, null);
  }

  function bindRichBubble() {
    // 1. 注册 block-editor 的 bubble 回调
    if (window.InkpadBlocks) {
      window.InkpadBlocks.setBubbleListener(function (info) {
        if (!info) { hideRichBubble(); return; }
        if (!info.visible) { hideRichBubble(); return; }
        showRichBubble(info);
      });
    }
    // 2. 失焦 / 点击别处 / esc 关闭
    document.addEventListener('mousedown', function (ev) {
      if (!bubbleMenu.root || bubbleMenu.root.style.display === 'none') return;
      if (bubbleMenu.root.contains(ev.target)) return;
      // 别处点击收菜单
      setTimeout(function () {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed) hideRichBubble();
        else if (bubbleMenu.dropdown && bubbleMenu.dropdown.style.display !== 'none') hideBubbleDropdown();
      }, 0);
    }, true);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && bubbleMenu.visible) hideRichBubble();
    });
  }
