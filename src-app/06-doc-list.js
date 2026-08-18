/* [esm] 导出本模块顶层绑定 */
export { renderList, pendingDelId, openDocDelConfirm, closeDocDelConfirm, deleteDoc, shortTime, fullTime, toggleBatchMode, refreshBatchCount, getBatchSelectedIds, batchDelete, batchDestroy, batchExport, openDocMenu, closeDocMenu, renameDocId, renderSideSub, openTagEditModal, closeTagEditModal, openStickyEditModal, closeStickyEditModal, tagAddFromInput, stickyEditSave, syncSortButton, toggleSortGroup };
/* [esm] 导入依赖模块绑定 */
import { $, bus, els, state } from './01-core.js';
import { cm, docIcon } from './04-editor-init.js';
import { persist } from './05-store.js';
import { openDoc } from './07-doc-open.js';
import { folderState } from './14-filetree-image.js';
import { openSingleModal } from './15-insert.js';
import { toast, renameDoc, duplicateDoc, exportDocById, toggleFavorite, togglePin, findDoc, saveDocTags, collectAllTags, newSticky, saveSticky, openStickyEditor, setTagExpiry, clearTagExpiry, cleanupExpiredTags, matchReminder, toLocalInput, fromLocalInput, fmtStamp, revealInFolder } from './16-doc-ops.js';
  /* ---------------- 渲染：侧栏（飞书风格：按时间分组 + 置顶优先） ---------------- */
  function renderList() {
    els.docList.innerHTML = '';

    // 先渲染侧栏标签区 / 便签集区（数据联动）
    renderSideSub();

    // 按当前过滤模式筛选文档
    var filter = state.docFilter || 'recent';
    var filtered = state.docs.filter(function (d) {
      if (filter === 'trash') return d.deleted;
      if (d.deleted) return false;
      // 便利贴视图：只显示便利贴
      if (filter === 'sticky') return d.kind === 'sticky';
      // 其余视图：排除便利贴
      if (d.kind === 'sticky') return false;
      // 标签过滤（优先于集合与基础视图）
      if (state.tagFilter) {
        return (d.tags || []).indexOf(state.tagFilter) >= 0;
      }
      if (filter === 'recent') return true;
      if (filter === 'my-space') return true;
      if (filter === 'wiki') return d.lang === 'markdown' || d.kind === 'doc' || (!d.lang && !d.kind);
      if (filter === 'favorites') return d.favorite;
      return true;
    });

    // 回收站模式：单独渲染
    if (filter === 'trash') {
      renderTrashList(filtered);
      return;
    }

    // 便利贴模式：单独渲染（卡片式），隐藏批量入口
    if (filter === 'sticky') {
      if (els.batchToggle) els.batchToggle.style.display = 'none';
      renderStickyList(filtered);
      return;
    }
    if (els.batchToggle) els.batchToggle.style.display = '';

    // 排序开关：关闭（默认）时保持创建顺序（docs 数组顺序，点击文档不会跳动）；
    // 开启时按最近使用（updated 倒序）。置顶在任何模式下都优先。
    var sorted = filtered.slice().sort(function (a, b) {
      var ap = a.pinned ? 1 : 0, bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      if (state.sortGroup) return (b.updated || 0) - (a.updated || 0);
      return 0;   // 关闭排序：保持原始顺序（依赖稳定排序）
    });

    if (sorted.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'doc-item empty-hint';
      empty.style.color = '#86909C';
      empty.style.fontSize = '12px';
      empty.style.padding = '8px 12px';
      var hints = {
        'recent': '暂无文档，点击下方 + 新建',
        'my-space': '暂无文档',
        'wiki': '暂无知识库文档（Markdown 文档会显示在此）',
        'favorites': '暂无收藏文档，右键文档可收藏'
      };
      if (state.tagFilter) { empty.textContent = '暂无「#' + state.tagFilter + '」标签的文档'; }
      else { empty.textContent = hints[filter] || '暂无文档'; }
      els.docList.appendChild(empty);
      return;
    }

    // 先渲染「置顶」分组（若有）
    var pinnedDocs = sorted.filter(function (d) { return d.pinned; });
    if (pinnedDocs.length > 0) {
      var pinnedLabel = document.createElement('div');
      pinnedLabel.className = 'doc-group-label';
      pinnedLabel.textContent = '置顶';
      els.docList.appendChild(pinnedLabel);
      pinnedDocs.forEach(function (d) {
        els.docList.appendChild(createDocItem(d));
      });
    }

    // 排序开关关闭（默认）：其余文档直接平铺，不按时间分组
    if (!state.sortGroup) {
      sorted.forEach(function (d) {
        if (d.pinned) return;
        els.docList.appendChild(createDocItem(d));
      });
      refreshBatchCount();
      return;
    }

    // 排序开关开启：飞书风格按时间分组（今天 / 昨天 / 本周 / 更早）—— 仅对未置顶文档
    var groups = { '今天': [], '昨天': [], '本周': [], '更早': [] };
    var now = new Date();
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var yesterdayStart = todayStart - 86400000;
    var weekStart = todayStart - (now.getDay() * 86400000);

    sorted.forEach(function (d) {
      if (d.pinned) return;  // 已放入置顶分组，跳过
      var ts = d.updated || 0;
      if (ts >= todayStart) {
        groups['今天'].push(d);
      } else if (ts >= yesterdayStart) {
        groups['昨天'].push(d);
      } else if (ts >= weekStart) {
        groups['本周'].push(d);
      } else {
        groups['更早'].push(d);
      }
    });

    // 渲染分组
    var groupOrder = ['今天', '昨天', '本周', '更早'];
    groupOrder.forEach(function (label) {
      var docs = groups[label];
      if (docs.length === 0) return;

      var labelEl = document.createElement('div');
      labelEl.className = 'doc-group-label';
      labelEl.textContent = label;
      els.docList.appendChild(labelEl);

      docs.forEach(function (d) {
        els.docList.appendChild(createDocItem(d));
      });
    });

    // 刷新批量计数
    refreshBatchCount();
  }

  /* ---------------- 文档排序开关（按时间分组，默认关闭） ---------------- */
  var SORT_KEY = 'inkpad.sortgroup';

  // 读取开关状态（默认关闭）并同步按钮高亮
  function syncSortButton() {
    try {
      var v = localStorage.getItem(SORT_KEY);
      state.sortGroup = v === '1';
    } catch (e) { state.sortGroup = false; }
    if (els.btnSortToggle) els.btnSortToggle.classList.toggle('active', !!state.sortGroup);
  }

  // 切换开关并重新渲染列表
  function toggleSortGroup() {
    state.sortGroup = !state.sortGroup;
    try { localStorage.setItem(SORT_KEY, state.sortGroup ? '1' : '0'); } catch (e) {}
    if (els.btnSortToggle) els.btnSortToggle.classList.toggle('active', !!state.sortGroup);
    renderList();
    toast(state.sortGroup ? '已开启按最近使用排序（时间分组）' : '已关闭排序，列表保持创建顺序', 'success');
  }

  function createDocItem(d) {
    var item = document.createElement('div');
    item.className = 'doc-item' + (d.id === state.activeId ? ' active' : '') + (state.batchMode ? ' batch-mode' : '');
    item.dataset.docId = d.id;
    item.dataset.docPath = d.diskPath || '';

    // 批量模式：左侧显示复选框
    var batchChk = state.batchMode
      ? ('<label class="doc-batch-check" title="选择"><input type="checkbox" ' + (state.batchSelected[d.id] ? 'checked' : '') + '></label>')
      : '';

    // 收藏、置顶状态标记（小图标叠加）
    var badgeFavorite = d.favorite ? '<span class="doc-badge doc-fav" title="已收藏">★</span>' : '';
    var badgePinned = d.pinned ? '<span class="doc-badge doc-pin" title="已置顶">📌</span>' : '';

    // 三点菜单按钮（非批量模式下显示，批量模式下隐藏）
    var threeDotBtn = state.batchMode ? '' : '<button class="doc-more-btn" title="更多操作"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg></button>';

    item.innerHTML =
      batchChk +
      '<span class="doc-emoji">' + docIcon(d) + '</span>' +
      '<span class="doc-mid">' +
        '<span class="doc-name-wrap">' +
          badgePinned + badgeFavorite +
          '<span class="doc-name"></span>' +
        '</span>' +
        '<span class="doc-time">' + shortTime(d.updated) + '</span>' +
        (d.tags && d.tags.length ? '<span class="doc-tags">' + d.tags.map(function (t) { return '<span class="doc-tag" data-tag="' + encodeURIComponent(t) + '">#' + escapeHtml(t) + '</span>'; }).join('') + '</span>' : '') +
      '</span>' +
      threeDotBtn;

    item.querySelector('.doc-name').textContent = d.title || '无标题';

    // 1.5) 标签胶囊点击：进入该标签过滤视图（不打开文档）
    var tagEls = item.querySelectorAll('.doc-tag');
    Array.prototype.forEach.call(tagEls, function (te) {
      te.addEventListener('click', function (e) {
        e.stopPropagation();
        var t = te.getAttribute('data-tag');
        t = t ? decodeURIComponent(t) : t;
        state.tagFilter = t;
        state.docFilter = 'recent';
        markNavClean();
        renderList();
      });
    });

    // 1) 整体行点击：打开文档（批量模式下不再是打开，而是切换选中）
    item.addEventListener('click', function (e) {
      // 若点在三点按钮/复选框或操作菜单里，不走默认打开
      if (e.target.closest('.doc-more-btn') || e.target.closest('.doc-menu') || e.target.closest('.doc-batch-check')) {
        return;
      }
      if (state.batchMode) {
        var cb = item.querySelector('.doc-batch-check input');
        if (cb) { cb.checked = !cb.checked; state.batchSelected[d.id] = cb.checked ? true : false; refreshBatchCount(); }
      } else {
        openDoc(d.id);
      }
    });

    // 2) 批量模式：复选框事件（阻止冒泡避免触发 item 点击导致重复切换）
    if (state.batchMode) {
      var cb2 = item.querySelector('.doc-batch-check input');
      if (cb2) {
        cb2.addEventListener('click', function (e) {
          e.stopPropagation();
          state.batchSelected[d.id] = cb2.checked ? true : false;
          refreshBatchCount();
        });
      }
    }

    // 3) 三点按钮点击：打开行内操作菜单
    var moreBtn = item.querySelector('.doc-more-btn');
    if (moreBtn) {
      moreBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeDocMenu();  // 先关闭其他
        openDocMenu(item, d);
      });
    }
    return item;
  }

  /* ---------------- 三点操作菜单 ---------------- */
  var _openMenu = null; // 当前打开的菜单节点，便于关闭

  function closeDocMenu() {
    if (_openMenu) { try { _openMenu.parentNode.removeChild(_openMenu); } catch (e) {} _openMenu = null; }
  }

  // 全局点击关闭已打开的菜单（排除点击按钮本身或菜单内）
  document.addEventListener('click', function (e) {
    if (!_openMenu) return;
    if (e.target.closest('.doc-menu') || e.target.closest('.doc-more-btn')) return;
    closeDocMenu();
  });

  function openDocMenu(itemEl, d) {
    var menu = document.createElement('div');
    menu.className = 'doc-menu';
    menu.innerHTML =
      '<div class="doc-menu-item" data-cmd="duplicate"><svg viewBox="0 0 24 24"><path d="M8 4h8a2 2 0 0 1 2 2v8M16 8H8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>创建副本</span></div>' +
      '<div class="doc-menu-item" data-cmd="rename"><svg viewBox="0 0 24 24"><path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>重命名</span></div>' +
      '<div class="doc-menu-divider"></div>' +
      '<div class="doc-menu-item" data-cmd="' + (d.favorite ? 'unfavorite' : 'favorite') + '"><svg viewBox="0 0 24 24"><path d="M12 17.3l-6.18 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73 1.64 7.03z" stroke="currentColor" stroke-width="1.6" fill="' + (d.favorite ? 'currentColor' : 'none') + '" stroke-linecap="round" stroke-linejoin="round"/></svg><span>' + (d.favorite ? '取消收藏' : '收藏') + '</span></div>' +
      '<div class="doc-menu-item" data-cmd="' + (d.pinned ? 'unpin' : 'pin') + '"><svg viewBox="0 0 24 24"><path d="M6 4h12M12 4v6m-5 0h10l-2 6h-6l-2-6zM12 16v5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>' + (d.pinned ? '取消置顶' : '添加到置顶') + '</span></div>' +
      '<div class="doc-menu-divider"></div>' +
      '<div class="doc-menu-item" data-cmd="tag"><svg viewBox="0 0 24 24"><path d="M20 12l-8 8-8-8V4h8l8 8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg><span>编辑标签</span></div>' +
      '<div class="doc-menu-divider"></div>' +
      '<div class="doc-menu-item" data-cmd="reveal"><svg viewBox="0 0 24 24"><path d="M4 5h5l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>打开所在文件夹</span></div>' +
      '<div class="doc-menu-item" data-cmd="export"><svg viewBox="0 0 24 24"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>导出</span></div>' +
      '<div class="doc-menu-item doc-menu-danger" data-cmd="delete"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>删除</span></div>';

    // 计算菜单位置：放在 itemEl 的右下/右上角，不越出侧栏
    // 使用 fixed 绝对定位到 body
    document.body.appendChild(menu);
    var rect = itemEl.getBoundingClientRect();
    var sb = els.sidebar.getBoundingClientRect();
    var mw = 180, mh = menu.offsetHeight;
    var top = rect.top;
    var left = rect.right - mw - 2;
    if (left < sb.left + 4) left = sb.left + 4;
    if (top + mh > window.innerHeight) top = Math.max(sb.top, rect.bottom - mh);
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
    _openMenu = menu;

    // 菜单项点击
    menu.querySelectorAll('.doc-menu-item').forEach(function (mi) {
      mi.addEventListener('click', function () {
        var cmd = mi.getAttribute('data-cmd');
        closeDocMenu();
        handleDocCmd(cmd, d);
      });
    });
  }

  // 处理单文档操作命令
  function handleDocCmd(cmd, d) {
    switch (cmd) {
      case 'duplicate':
        var cp = duplicateDoc(d.id);
        bus.emit('docs:changed');
        toast('已创建副本：' + (cp ? (cp.title || '无标题') : ''), 'success');
        break;
      case 'rename':
        renameDocId = d.id;
        if (els.docRenameInput) els.docRenameInput.value = d.title || '';
        openSingleModal('doc-rename-modal');
        setTimeout(function () { if (els.docRenameInput) els.docRenameInput.focus(); }, 100);
        break;
      case 'favorite':
        toggleFavorite(d.id); bus.emit('docs:changed'); toast('已收藏', 'success');
        break;
      case 'unfavorite':
        toggleFavorite(d.id); bus.emit('docs:changed'); toast('已取消收藏', 'success');
        break;
      case 'pin':
        togglePin(d.id); bus.emit('docs:changed'); toast('已置顶', 'success');
        break;
      case 'unpin':
        togglePin(d.id); bus.emit('docs:changed'); toast('已取消置顶', 'success');
        break;
      case 'export':
        exportDocById(d.id);
        break;
      case 'reveal':
        revealInFolder(d);
        break;
      case 'tag':
        openTagEditModal(d.id);
        break;
      case 'delete':
        openDocDelConfirm(d.id);
        break;
    }
  }

  var renameDocId = null;  // 当前在重命名的 docId，由模态框确认时读取

  /* ---------------- 回收站渲染 ---------------- */
  function renderTrashList(trashedDocs) {
    var sorted = trashedDocs.slice().sort(function (a, b) {
      return (b.deletedAt || 0) - (a.deletedAt || 0);
    });
    if (sorted.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'doc-item empty-hint';
      empty.style.color = '#86909C';
      empty.style.fontSize = '12px';
      empty.style.padding = '8px 12px';
      empty.textContent = '回收站为空';
      els.docList.appendChild(empty);
      return;
    }
    sorted.forEach(function (d) {
      var item = document.createElement('div');
      item.className = 'doc-item trash-item' + (state.batchMode ? ' batch-mode' : '');
      item.dataset.docId = d.id;
      var icon = docIcon(d);
      var title = d.title || '无标题';
      var delTime = d.deletedAt ? fullTime(d.deletedAt) : '';
      // 批量模式：左侧显示复选框；非批量模式：右侧三点按钮
      var batchChk = state.batchMode
        ? ('<label class="doc-batch-check" title="选择"><input type="checkbox" ' + (state.batchSelected[d.id] ? 'checked' : '') + '></label>')
        : '';
      var moreBtn = state.batchMode ? '' : '<button class="trash-more" title="更多操作"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg></button>';
      item.innerHTML = batchChk +
        '<span class="doc-icon">' + icon + '</span>' +
        '<div class="doc-info">' +
          '<div class="doc-title-row">' +
            '<span class="doc-title">' + escapeHtml(title) + '</span>' +
          '</div>' +
          '<div class="doc-meta-row">' +
            '<span class="doc-time">删除于 ' + delTime + '</span>' +
          '</div>' +
        '</div>' +
        moreBtn;
      // 行点击：批量模式下切换选中
      item.addEventListener('click', function (e) {
        if (e.target.closest('.trash-more') || e.target.closest('.doc-menu') || e.target.closest('.doc-batch-check')) return;
        if (state.batchMode) {
          var cb = item.querySelector('.doc-batch-check input');
          if (cb) { cb.checked = !cb.checked; state.batchSelected[d.id] = cb.checked ? true : false; refreshBatchCount(); }
        }
      });
      // 复选框事件（阻止冒泡避免重复切换）
      if (state.batchMode) {
        var cb2 = item.querySelector('.doc-batch-check input');
        if (cb2) {
          cb2.addEventListener('click', function (e) {
            e.stopPropagation();
            state.batchSelected[d.id] = cb2.checked ? true : false;
            refreshBatchCount();
          });
        }
      }
      // 非批量模式：三点菜单
      if (!state.batchMode) {
        item.querySelector('.trash-more').addEventListener('click', function (e) {
          e.stopPropagation();
          openTrashMenu(this, d);
        });
      }
      els.docList.appendChild(item);
    });
    // 批量模式下同步计数与全选状态
    if (state.batchMode) refreshBatchCount();
  }

  // 回收站条目三点菜单：恢复 / 彻底删除
  var _trashMenu = null;
  function openTrashMenu(btnEl, d) {
    closeTrashMenu();
    var menu = document.createElement('div');
    menu.className = 'doc-menu';
    menu.innerHTML =
      '<div class="doc-menu-item" data-cmd="restore"><svg viewBox="0 0 24 24"><path d="M4 9h13a4 4 0 0 1 0 8H9" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 6l-4 3 4 3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>恢复</span></div>' +
      '<div class="doc-menu-divider"></div>' +
      '<div class="doc-menu-item doc-menu-danger" data-cmd="destroy"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>彻底删除</span></div>';
    document.body.appendChild(menu);
    var r = btnEl.getBoundingClientRect();
    var mw = menu.offsetWidth || 184;
    var mh = menu.offsetHeight;
    var left = Math.min(Math.max(8, r.right - mw), window.innerWidth - mw - 8);
    var top = r.bottom + mh + 8 > window.innerHeight ? Math.max(8, r.top - mh - 8) : r.bottom + 4;
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
    _trashMenu = menu;
    menu.querySelectorAll('.doc-menu-item').forEach(function (mi) {
      mi.addEventListener('click', function () {
        var cmd = mi.getAttribute('data-cmd');
        closeTrashMenu();
        if (cmd === 'restore') {
          restoreDoc(d.id);
        } else if (cmd === 'destroy') {
          destroyDoc(d.id);
        }
      });
    });
  }
  function closeTrashMenu() {
    if (_trashMenu) { try { _trashMenu.parentNode.removeChild(_trashMenu); } catch (e) {} _trashMenu = null; }
  }
  document.addEventListener('click', function (e) {
    if (!_trashMenu) return;
    if (e.target.closest('.doc-menu')) return;
    closeTrashMenu();
  });

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // 恢复文档
  function restoreDoc(id) {
    var d = state.docs.find(function (x) { return x.id === id; });
    if (!d) return;
    d.deleted = false;
    d.deletedAt = null;
    d.updated = Date.now();
    persist();
    renderList();
    toast('已恢复：' + (d.title || '无标题'), 'success');
  }

  // 彻底删除
  function destroyDoc(id) {
    var idx = -1;
    for (var i = 0; i < state.docs.length; i++) { if (state.docs[i].id === id) { idx = i; break; } }
    if (idx < 0) return;
    var removed = state.docs[idx];
    if (removed.diskPath && folderState.openFiles) {
      for (var p in folderState.openFiles) {
        if (folderState.openFiles[p] === id) delete folderState.openFiles[p];
      }
    }
    state.docs.splice(idx, 1);
    if (removed.id) { try { localStorage.removeItem('inkpad.content.' + removed.id); } catch (e) {} }
    persist();
    renderList();
    toast('已彻底删除：' + (removed.title || '无标题'));
  }

  /* ---------------- 删除文档（软删除到回收站） ---------------- */
  var pendingDelId = null;
  function openDocDelConfirm(id) {
    var d = null;
    for (var i = 0; i < state.docs.length; i++) { if (state.docs[i].id === id) { d = state.docs[i]; break; } }
    if (!d) return;
    pendingDelId = id;
    var name = d.title || '无标题';
    var foot = $('doc-del-foot');
    if (d.kind === 'sticky') {
      if (foot) foot.textContent = '便利贴将移入回收站，可在左侧「回收站」中恢复或彻底删除。';
    } else {
      if (d.diskPath) name += '（磁盘文件）';
      if (foot) foot.textContent = '文档将移入回收站，可在左侧「回收站」中恢复或彻底删除。';
    }
    $('doc-del-name').textContent = name;
    openSingleModal('doc-del-modal');
  }
  function closeDocDelConfirm() {
    pendingDelId = null;
    $('doc-del-modal').style.display = 'none';
  }
  function deleteDoc(id) {
    var idx = -1;
    for (var i = 0; i < state.docs.length; i++) { if (state.docs[i].id === id) { idx = i; break; } }
    if (idx < 0) return;
    var d = state.docs[idx];
    // 同步清理文件树中已打开记录（软删除不再打开）
    if (d.diskPath && folderState.openFiles) {
      for (var p in folderState.openFiles) {
        if (folderState.openFiles[p] === id) delete folderState.openFiles[p];
      }
    }
    // 软删除：标记 deleted/deletedAt，保留正文以便恢复
    d.deleted = true;
    d.deletedAt = Date.now();
    // 清理批量选中记录
    if (state.batchSelected && state.batchSelected[id]) delete state.batchSelected[id];
    // 若删除的是当前文档，切到下一篇未删除文档
    if (state.activeId === id) {
      var nextDoc = null;
      for (var j = 0; j < state.docs.length; j++) {
        if (state.docs[j].id !== id && !state.docs[j].deleted) { nextDoc = state.docs[j]; break; }
      }
      state.activeId = nextDoc ? nextDoc.id : null;
    }
    persist();
    bus.emit('docs:changed');
    if (state.activeId) {
      openDoc(state.activeId);
    } else {
      // 没有可打开文档了，清空编辑器
      els.title.value = '';
      els.statEdit.textContent = '';
      els.statEnc.textContent = '';
      els.statEditSep.style.display = 'none';
      if (cm) { cm.setValue(''); }
      els.breadcrumb.textContent = '📝';
    }
    renderList();
    toast('已移入回收站：' + (d.title || '无标题'));
  }

  /* ---------------- 批量管理 ---------------- */

  function getBatchSelectedIds() {
    var ids = [];
    for (var k in state.batchSelected) {
      if (state.batchSelected[k]) ids.push(k);
    }
    return ids;
  }

  function toggleBatchMode(on) {
    state.batchMode = on === false ? false : (on === true ? true : !state.batchMode);
    if (!state.batchMode) {
      state.batchSelected = {}; // 退出批量模式清空选中
    }
    // UI 同步
    if (els.batchToggle) els.batchToggle.style.display = state.batchMode ? 'none' : '';
    if (els.sbBatchBar) els.sbBatchBar.style.display = state.batchMode ? '' : 'none';
    if (els.batchSelectAll) els.batchSelectAll.checked = false;
    // 回收站模式下隐藏「批量导出」（已删除文档无导出意义）
    if (els.batchExport) els.batchExport.style.display = state.docFilter === 'trash' ? 'none' : '';
    // 重渲染列表（切换复选框/三点按钮显示）
    renderList();
  }

  // 当前视图（普通列表 / 回收站 / 便利贴）下的可见文档
  function currentViewDocs() {
    return (state.docs || []).filter(function (d) {
      if (state.docFilter === 'trash') return !!d.deleted;
      if (state.docFilter === 'sticky') return d.kind === 'sticky';
      return !d.deleted;
    });
  }

  function refreshBatchCount() {
    var ids = getBatchSelectedIds();
    if (els.batchCount) els.batchCount.textContent = '已选 ' + ids.length + ' 项';
    if (els.batchSelectAll) {
      var viewDocs = currentViewDocs();
      var selInView = viewDocs.filter(function (d) { return state.batchSelected[d.id]; }).length;
      els.batchSelectAll.checked = (viewDocs.length > 0) && (selInView === viewDocs.length);
      els.batchSelectAll.indeterminate = (selInView > 0) && (selInView < viewDocs.length);
    }
  }

  // 批量删除（软删除到回收站）
  function batchDelete(ids) {
    if (!ids || ids.length === 0) { toast('请先选择要删除的文档', 'error'); return 0; }
    var count = 0;
    ids.forEach(function (id) {
      var idx = -1;
      for (var i = 0; i < state.docs.length; i++) { if (state.docs[i].id === id) { idx = i; break; } }
      if (idx < 0) return;
      var d = state.docs[idx];
      if (d.diskPath && folderState.openFiles) {
        for (var p in folderState.openFiles) {
          if (folderState.openFiles[p] === id) delete folderState.openFiles[p];
        }
      }
      // 软删除：标记 deleted/deletedAt，保留正文
      d.deleted = true;
      d.deletedAt = Date.now();
      if (state.batchSelected[id]) delete state.batchSelected[id];
      count++;
    });
    // 若 activeId 被软删除，切到第一篇未删除文档
    if (state.activeId && !state.docs.some(function (d) { return d.id === state.activeId && !d.deleted; })) {
      var nextDoc = null;
      for (var j = 0; j < state.docs.length; j++) {
        if (!state.docs[j].deleted) { nextDoc = state.docs[j]; break; }
      }
      state.activeId = nextDoc ? nextDoc.id : null;
    }
    persist();
    bus.emit('docs:changed');
    if (state.activeId) { openDoc(state.activeId); }
    else {
      els.title.value = '';
      els.statEdit.textContent = '';
      els.statEnc.textContent = '';
      els.statEditSep.style.display = 'none';
      if (cm) { cm.setValue(''); }
      els.breadcrumb.textContent = '📝';
    }
    return count;
  }

  // 批量彻底删除（回收站模式）
  function batchDestroy(ids) {
    if (!ids || ids.length === 0) { toast('请先选择要彻底删除的文档', 'error'); return 0; }
    var count = 0;
    ids.forEach(function (id) {
      var idx = -1;
      for (var i = 0; i < state.docs.length; i++) { if (state.docs[i].id === id) { idx = i; break; } }
      if (idx < 0) return;
      var removed = state.docs[idx];
      if (removed.diskPath && folderState.openFiles) {
        for (var p in folderState.openFiles) {
          if (folderState.openFiles[p] === id) delete folderState.openFiles[p];
        }
      }
      state.docs.splice(idx, 1);
      if (removed.id) { try { localStorage.removeItem('inkpad.content.' + removed.id); } catch (e) {} }
      if (state.batchSelected[id]) delete state.batchSelected[id];
      count++;
    });
    persist();
    bus.emit('docs:changed');
    renderList();
    return count;
  }

  // 批量导出（浏览器端采用循环逐个下载；桌面端 pywebview 下无法批量另存为，仍走逐个 Blob 下载）
  function batchExport(ids) {
    if (!ids || ids.length === 0) { toast('请先选择要导出的文档', 'error'); return 0; }
    var count = 0;
    ids.forEach(function (id) {
      try { exportDocById(id); count++; } catch (e) { console.warn(e); }
    });
    if (count > 0) toast('批量导出完成：共 ' + count + ' 项', 'success');
    return count;
  }

  function shortTime(ts) {
    var diff = Date.now() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    var dt = new Date(ts);
    return (dt.getMonth() + 1) + '/' + dt.getDate();
  }

  function fullTime(ts) {
    var dt = new Date(ts);
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) +
      ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
  }

  /* ================= 便签模块：侧栏标签区 / 便签集区渲染 ================= */

  // 清除主导航与 tab 的高亮（进入标签/集合过滤时）
  function markNavClean() {
    ['nav-recent', 'nav-my-space', 'nav-wiki', 'nav-favorites', 'nav-trash', 'nav-sticky', 'tab-docs', 'tab-files'].forEach(function (n) {
      var el = document.getElementById(n);
      if (el) el.classList.remove('active');
    });
  }

  // 渲染侧栏标签区
  function renderSideSub() {
    if (!els.tagList) return;

    // ---- 清理已过期标签（解除文档关联） ----
    cleanupExpiredTags();

    // ---- 标签区 ----
    var tagMap = collectAllTags();
    var tagNames = Object.keys(tagMap);
    els.tagList.innerHTML = '';
    if (tagNames.length) {
      tagNames.sort(function (a, b) { return tagMap[b] - tagMap[a] || a.localeCompare(b); });
      tagNames.forEach(function (t) {
        var it = document.createElement('div');
        var meta = state.tagMeta[t];
        var expMark = (meta && meta.expiresAt) ? ' <span class="sb-tag-exp" title="到期 ' + fmtStamp(meta.expiresAt) + '">⏳</span>' : '';
        it.className = 'sb-tag-item' + (state.tagFilter === t ? ' active' : '');
        it.innerHTML = '<span class="sb-tag-name"><span class="sb-tag-hash">#</span>' + escapeHtml(t) + expMark + '</span><span class="sb-tag-num">' + tagMap[t] + '</span>';
        it.addEventListener('click', function () {
          state.tagFilter = (state.tagFilter === t) ? null : t;
          state.docFilter = 'recent';
          markNavClean();
          renderList();
        });
        // 标签右键菜单：设置/清除过期时间
        it.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          e.stopPropagation();
          openTagMenu(it, t, meta);
        });
        els.tagList.appendChild(it);
      });
    } else {
      var te = document.createElement('div');
      te.className = 'sb-sub-empty';
      te.textContent = '暂无标签';
      els.tagList.appendChild(te);
    }
    if (els.tagCount) els.tagCount.textContent = tagNames.length ? String(tagNames.length) : '';
  }

  // 标签右键菜单（设置过期时间 / 清除过期时间）
  var _tagMenu = null;
  function openTagMenu(itemEl, tag, meta) {
    closeTagMenu();
    var menu = document.createElement('div');
    menu.className = 'doc-menu';
    menu.innerHTML =
      '<div class="doc-menu-item" data-cmd="setexp"><svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 9v4l2.5 2.5M9 3h6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg><span>设置过期时间</span></div>' +
      (meta && meta.expiresAt ? '<div class="doc-menu-item" data-cmd="clearexp"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>清除过期时间</span></div>' : '');
    if (!menu.innerHTML.trim()) { menu.innerHTML = '<div class="doc-menu-item" data-cmd="setexp"><span>设置过期时间</span></div>'; }
    document.body.appendChild(menu);
    var rect = itemEl.getBoundingClientRect();
    menu.style.top = rect.bottom + 'px';
    menu.style.left = Math.max(8, rect.left) + 'px';
    _tagMenu = menu;
    menu.querySelectorAll('.doc-menu-item').forEach(function (mi) {
      mi.addEventListener('click', function () {
        var cmd = mi.getAttribute('data-cmd');
        closeTagMenu();
        if (cmd === 'setexp') {
          var cur = meta && meta.expiresAt ? Math.max(1, Math.round((meta.expiresAt - Date.now()) / 86400000)) : '';
          var days = prompt('标签 #' + tag + ' 多少天后过期？（输入数字天数）', cur);
          if (days == null) return;
          setTagExpiry(tag, days);
          renderSideSub();
          renderList();
        } else if (cmd === 'clearexp') {
          clearTagExpiry(tag);
          renderSideSub();
          renderList();
        }
      });
    });
  }
  function closeTagMenu() {
    if (_tagMenu) { try { _tagMenu.parentNode.removeChild(_tagMenu); } catch (e) {} _tagMenu = null; }
  }
  document.addEventListener('click', function (e) {
    if (!_tagMenu) return;
    if (e.target.closest('.doc-menu')) return;
    closeTagMenu();
  });

  /* ================= 便签模块：便利贴渲染 ================= */

  // 格式化提醒描述（供卡片与弹窗展示）
  function remText(rem) {
    if (!rem || !rem.enabled) return '';
    var t = rem.time || '';
    if (rem.type === 'once') return (rem.date || '') + ' ' + t;
    if (rem.type === 'daily') return '每天 ' + t;
    if (rem.type === 'weekly') {
      var names = ['日', '一', '二', '三', '四', '五', '六'];
      var ds = (rem.days || []).slice().sort();
      return '每周' + ds.map(function (d) { return '周' + names[d]; }).join('、') + ' ' + t;
    }
    if (rem.type === 'monthly') return '每月' + (rem.day || '?') + '日 ' + t;
    return t;
  }

  function renderStickyList(stickies) {
    var sorted = stickies.slice().sort(function (a, b) {
      var ap = a.pinned ? 1 : 0, bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return (b.updated || 0) - (a.updated || 0);
    });
    if (sorted.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'doc-item empty-hint';
      empty.style.color = '#86909C';
      empty.style.fontSize = '12px';
      empty.style.padding = '8px 12px';
      empty.textContent = '还没有便利贴，点击下方 + 新建';
      els.docList.appendChild(empty);
      return;
    }
    sorted.forEach(function (d) {
      var item = document.createElement('div');
      item.className = 'sticky-card' + (d.pinned ? ' pinned' : '');
      item.style.background = d.color || '#FFD43B';
      item.dataset.docId = d.id;
      var title = d.title || '无标题';
      var content = (d.content || '').replace(/\n/g, ' ').slice(0, 60);
      // 定时提醒 / 到期状态
      var statusHtml = '';
      if (d.reminder && d.reminder.enabled) {
        statusHtml += '<span class="sticky-card-rem" title="定时提醒">⏰ ' + remText(d.reminder) + '</span>';
      }
      if (d.dueAt) {
        var nowTs = Date.now();
        if (d.dueAt < nowTs) statusHtml += '<span class="sticky-card-due overdue" title="已到期">已到期</span>';
        else if (d.dueAt - nowTs < 86400000) statusHtml += '<span class="sticky-card-due near" title="即将到期">即将到期</span>';
        else statusHtml += '<span class="sticky-card-due" title="到期时间">' + fmtStamp(d.dueAt) + '</span>';
      }
      item.innerHTML =
        '<div class="sticky-card-head">' +
          (d.pinned ? '<span class="sticky-pin-badge" title="已置顶">📌</span>' : '') +
          '<span class="sticky-card-title">' + escapeHtml(title) + '</span>' +
        '</div>' +
        (content ? '<div class="sticky-card-content">' + escapeHtml(content) + '</div>' : '') +
        (statusHtml ? '<div class="sticky-card-status">' + statusHtml + '</div>' : '') +
        '<div class="sticky-card-foot">' +
          '<span class="sticky-card-time">' + shortTime(d.updated) + '</span>' +
          '<button class="sticky-card-more" title="更多操作"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg></button>' +
        '</div>';
      // 点击卡片：打开编辑浮层
      item.addEventListener('click', function (e) {
        if (e.target.closest('.sticky-card-more') || e.target.closest('.doc-menu')) return;
        openStickyEditModal(d.id);
      });
      // 三点菜单按钮：编辑 / 置顶 / 删除
      item.querySelector('.sticky-card-more').addEventListener('click', function (e) {
        e.stopPropagation();
        openStickyMenu(this, d);
      });
      els.docList.appendChild(item);
    });
  }

  // 便利贴卡片三点菜单
  var _stickyMenu = null;
  function openStickyMenu(btnEl, d) {
    closeStickyMenu();
    var menu = document.createElement('div');
    menu.className = 'doc-menu';
    menu.innerHTML =
      '<div class="doc-menu-item" data-cmd="edit"><svg viewBox="0 0 24 24"><path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>编辑</span></div>' +
      '<div class="doc-menu-item" data-cmd="' + (d.pinned ? 'unpin' : 'pin') + '"><svg viewBox="0 0 24 24"><path d="M6 4h12M12 4v6m-5 0h10l-2 6h-6l-2-6zM12 16v5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>' + (d.pinned ? '取消置顶' : '置顶') + '</span></div>' +
      '<div class="doc-menu-divider"></div>' +
      '<div class="doc-menu-item doc-menu-danger" data-cmd="delete"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>删除</span></div>';
    document.body.appendChild(menu);
    var r = btnEl.getBoundingClientRect();
    var mw = menu.offsetWidth || 184;
    var mh = menu.offsetHeight;
    var left = Math.min(Math.max(8, r.right - mw), window.innerWidth - mw - 8);
    var top = r.bottom + mh + 8 > window.innerHeight ? Math.max(8, r.top - mh - 8) : r.bottom + 4;
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
    _stickyMenu = menu;
    menu.querySelectorAll('.doc-menu-item').forEach(function (mi) {
      mi.addEventListener('click', function () {
        var cmd = mi.getAttribute('data-cmd');
        closeStickyMenu();
        if (cmd === 'edit') {
          openStickyEditModal(d.id);
        } else if (cmd === 'pin') {
          togglePin(d.id);
          renderStickyList(state.docs.filter(function (x) { return !x.deleted && x.kind === 'sticky'; }));
        } else if (cmd === 'unpin') {
          togglePin(d.id);
          renderStickyList(state.docs.filter(function (x) { return !x.deleted && x.kind === 'sticky'; }));
        } else if (cmd === 'delete') {
          openDocDelConfirm(d.id);
        }
      });
    });
  }
  function closeStickyMenu() {
    if (_stickyMenu) { try { _stickyMenu.parentNode.removeChild(_stickyMenu); } catch (e) {} _stickyMenu = null; }
  }
  document.addEventListener('click', function (e) {
    if (!_stickyMenu) return;
    if (e.target.closest('.doc-menu')) return;
    closeStickyMenu();
  });

  /* ================= 便签模块：弹窗 ================= */

  // ---- 编辑标签弹窗 ----
  function openTagEditModal(docId) {
    var d = findDoc(docId);
    if (!d) return;
    state.tagEditDocId = docId;
    if (els.tagEditDocname) els.tagEditDocname.textContent = '文档：' + (d.title || '无标题');
    renderTagEditModal();
    els.tagEditModal.style.display = 'flex';
    if (els.tagEditInput) setTimeout(function () { els.tagEditInput.focus(); }, 100);
  }
  function closeTagEditModal() {
    state.tagEditDocId = null;
    els.tagEditModal.style.display = 'none';
  }
  // 填充标签编辑弹窗内容
  function renderTagEditModal() {
    var d = findDoc(state.tagEditDocId);
    if (!d) return;
    var cur = d.tags || [];
    // 当前标签
    if (els.tagEditChips) {
      els.tagEditChips.innerHTML = '';
      cur.forEach(function (t) {
        var c = document.createElement('span');
        c.className = 'tag-chip';
        c.innerHTML = '#' + escapeHtml(t) + ' <span class="tag-chip-x" data-tag="' + encodeURIComponent(t) + '">×</span>';
        c.querySelector('.tag-chip-x').addEventListener('click', function (e) {
          e.stopPropagation();
          var raw = this.getAttribute('data-tag');
          var tt = raw ? decodeURIComponent(raw) : raw;
          var next = cur.filter(function (x) { return x !== tt; });
          saveDocTags(state.tagEditDocId, next);
          renderTagEditModal();
          renderSideSub();
          renderList();
        });
        els.tagEditChips.appendChild(c);
      });
      if (els.tagEditEmpty) els.tagEditEmpty.style.display = cur.length ? 'none' : '';
    }
    // 全部标签候选
    var tagMap = collectAllTags();
    var allNames = Object.keys(tagMap);
    if (els.tagEditAllchips) {
      els.tagEditAllchips.innerHTML = '';
      var added = 0;
      allNames.forEach(function (t) {
        if (cur.indexOf(t) >= 0) return;
        added++;
        var c = document.createElement('span');
        c.className = 'tag-chip tag-chip-add';
        c.textContent = '#' + t;
        c.addEventListener('click', function () {
          var next = (findDoc(state.tagEditDocId).tags || []).slice();
          if (next.indexOf(t) < 0 && next.length < 20) { next.push(t); saveDocTags(state.tagEditDocId, next); }
          renderTagEditModal();
          renderSideSub();
          renderList();
        });
        els.tagEditAllchips.appendChild(c);
      });
      if (els.tagEditAllempty) els.tagEditAllempty.style.display = added ? 'none' : '';
    }
  }

  // 从输入框添加标签
  function tagAddFromInput() {
    var t = (els.tagEditInput.value || '').trim();
    if (!t) return;
    if (t.length > 20) { toast('标签最长 20 字', 'error'); return; }
    var d = findDoc(state.tagEditDocId);
    if (!d) return;
    var next = (d.tags || []).slice();
    if (next.indexOf(t) >= 0) { toast('标签已存在', 'error'); els.tagEditInput.value = ''; return; }
    if (next.length >= 20) { toast('最多 20 个标签', 'error'); return; }
    next.push(t);
    saveDocTags(state.tagEditDocId, next);
    els.tagEditInput.value = '';
    renderTagEditModal();
    renderSideSub();
    renderList();
  }

  // ---- 便利贴编辑弹窗 ----
  function openStickyEditModal(id) {
    var d = findDoc(id);
    if (!d) return;
    state.stickyEditId = id;
    openStickyEditor(d);
  }
  function closeStickyEditModal() {
    state.stickyEditId = null;
    els.stickyEditModal.style.display = 'none';
  }
  // 收集编辑浮层中的提醒配置
  function collectReminderFromUI() {
    if (!els.stickyEditRemEnabled || !els.stickyEditRemEnabled.checked) return null;
    var rem = { enabled: true, type: els.stickyEditRemType.value, time: els.stickyEditRemTime.value || '09:00' };
    if (rem.type === 'once') rem.date = els.stickyEditRemDate.value || '';
    if (rem.type === 'weekly') {
      var days = [];
      Array.prototype.forEach.call(els.stickyRemWeekly.querySelectorAll('input[type=checkbox]:checked'), function (cb) {
        days.push(Number(cb.value));
      });
      rem.days = days;
    }
    if (rem.type === 'monthly') rem.day = els.stickyEditRemDay.value || '';
    return rem;
  }
  function stickyEditSave() {
    if (!state.stickyEditId) return;
    var ok = saveSticky(state.stickyEditId, {
      title: els.stickyEditTitle.value,
      content: els.stickyEditContent.value,
      color: state.stickyColor,
      pinned: els.stickyEditPin.checked,
      reminder: collectReminderFromUI(),
      dueAt: fromLocalInput(els.stickyEditDue.value)
    });
    if (ok) {
      closeStickyEditModal();
      renderList();
      toast('便利贴已保存', 'success');
    }
  }
