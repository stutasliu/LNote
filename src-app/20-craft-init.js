/* [esm] 导出本模块顶层绑定 */
export { initCraftSidebar };
/* [esm] 导入依赖模块绑定 */
import { els, state } from './01-core.js';
import { activeDoc } from './05-store.js';
import { refreshDocFromDisk } from './07-doc-open.js';
import { richChanged } from './09-rich-save.js';
import { dirOf, resolveImgSrc, getCachedRichDir } from './13-api-path.js';
import { openSingleModal } from './15-insert.js';
import { _guessMimeFromPath } from './15-insert.js';
import { toast, renameDoc, newSticky, matchReminder, fmtStamp, revealInFolder } from './16-doc-ops.js';
import { initEvents } from './17-events.js';
import { initSettings, openSettingsModal } from './26-settings.js';
import { initApp, openPendingExternal } from './18-bootstrap.js';
import { openDocDelConfirm, closeDocDelConfirm, deleteDoc, toggleBatchMode, refreshBatchCount, getBatchSelectedIds, batchDelete, batchDestroy, batchExport, renameDocId, closeDocMenu, pendingDelId, renderList, renderSideSub, openTagEditModal, closeTagEditModal, openStickyEditModal, closeStickyEditModal, tagAddFromInput, stickyEditSave, syncSortButton, toggleSortGroup } from './06-doc-list.js';

  // 暴露给块编辑器（block-editor.js）使用的辅助函数
  window.InkpadApp = {
    dirOf: dirOf,
    resolveImgSrc: resolveImgSrc,
    guessMime: _guessMimeFromPath,
    toast: toast,
    richChanged: richChanged,
    getRichDir: getCachedRichDir
  };

  /* ---------------- v0.20.32 Craft 风格：搜索框 ---------------- */
  // 搜索框：点击容器聚焦 input；输入时实时过滤文档列表
  function initCraftSidebar() {
    // 窗口重新聚焦 / 页面重新可见时，刷新当前文档为磁盘最新内容
    // （用户在其它软件修改了磁盘文件后切回本应用，能立即看到最新版本）
    var refreshOnFocus = function () {
      var d = activeDoc();
      if (d) refreshDocFromDisk(d);
    };
    window.addEventListener('focus', function () { setTimeout(refreshOnFocus, 150); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') setTimeout(refreshOnFocus, 150);
    });

    var sbBtn = document.getElementById('btn-sb-search');
    var sbInput = document.getElementById('sbSearchInput');
    if (sbBtn && sbInput) {
      sbBtn.addEventListener('click', function (e) {
        // 点击容器空白处 → 聚焦输入框（不是触发 toast）
        if (e.target !== sbInput) sbInput.focus();
      });
      sbInput.addEventListener('click', function (e) { e.stopPropagation(); });
      sbInput.addEventListener('input', function () {
        var q = (sbInput.value || '').trim().toLowerCase();
        // 兼容普通文档条目与便利贴卡片
        var items = els.docList.querySelectorAll('.doc-item, .sticky-card');
        items.forEach(function (it) {
          if (!q) { it.style.display = ''; return; }
          var nameEl = it.querySelector('.doc-name') || it.querySelector('.sticky-card-title');
          var name = (nameEl ? nameEl.textContent : '').toLowerCase();
          // 标签匹配：读取条目上的标签文本
          var tagsTxt = '';
          Array.prototype.forEach.call(it.querySelectorAll('.doc-tag'), function (t) { tagsTxt += ' ' + t.textContent; });
          var match = name.indexOf(q) >= 0 || tagsTxt.toLowerCase().indexOf(q) >= 0;
          it.style.display = match ? '' : 'none';
        });
        // 同步隐藏空分组标签
        var labels = els.docList.querySelectorAll('.doc-group-label');
        labels.forEach(function (lab) {
          var next = lab.nextElementSibling;
          var any = false;
          while (next && (next.classList.contains('doc-item') || next.classList.contains('sticky-card'))) {
            if (next.style.display !== 'none') { any = true; break; }
            next = next.nextElementSibling;
          }
          lab.style.display = any ? '' : 'none';
        });
      });
    }
    var wsBtn = document.getElementById('btn-workspace');
    if (wsBtn) wsBtn.addEventListener('click', function () { toast('L.Note 工作台', 'success'); });

    // v0.20.36：飞书风格主导航绑定
    function markNavActive(id) {
      ['nav-recent', 'nav-my-space', 'nav-wiki', 'nav-favorites', 'nav-trash', 'nav-sticky', 'tab-docs', 'tab-files'].forEach(function (n) {
        var el = document.getElementById(n);
        if (el) el.classList.remove('active');
      });
      var a = document.getElementById(id);
      if (a) a.classList.add('active');
    }
    var navRecent = document.getElementById('nav-recent');
    if (navRecent) navRecent.addEventListener('click', function () {
      state.docFilter = 'recent';
      state.tagFilter = null;
      markNavActive('nav-recent');
      closeDocMenu();
      if (state.batchMode) toggleBatchMode(false);
      renderList();
      toast('已切换到「最近」', 'success');
    });
    var navMySpace = document.getElementById('nav-my-space');
    if (navMySpace) navMySpace.addEventListener('click', function () {
      state.docFilter = 'my-space';
      state.tagFilter = null;
      markNavActive('nav-my-space');
      closeDocMenu();
      if (state.batchMode) toggleBatchMode(false);
      renderList();
      toast('已切换到「我的空间」', 'success');
    });
    var navWiki = document.getElementById('nav-wiki');
    if (navWiki) navWiki.addEventListener('click', function () {
      state.docFilter = 'wiki';
      state.tagFilter = null;
      markNavActive('nav-wiki');
      closeDocMenu();
      if (state.batchMode) toggleBatchMode(false);
      renderList();
      toast('已切换到「知识库」', 'success');
    });
    var navFavorites = document.getElementById('nav-favorites');
    if (navFavorites) navFavorites.addEventListener('click', function () {
      state.docFilter = 'favorites';
      state.tagFilter = null;
      markNavActive('nav-favorites');
      closeDocMenu();
      if (state.batchMode) toggleBatchMode(false);
      renderList();
      toast('已切换到「收藏」', 'success');
    });
    var navTrash = document.getElementById('nav-trash');
    if (navTrash) navTrash.addEventListener('click', function () {
      state.docFilter = 'trash';
      state.tagFilter = null;
      markNavActive('nav-trash');
      closeDocMenu();
      if (state.batchMode) toggleBatchMode(false);
      renderList();
      toast('已切换到「回收站」', 'success');
    });
    var navSticky = document.getElementById('nav-sticky');
    if (navSticky) navSticky.addEventListener('click', function () {
      state.docFilter = 'sticky';
      state.tagFilter = null;
      markNavActive('nav-sticky');
      closeDocMenu();
      if (state.batchMode) toggleBatchMode(false);
      renderList();
      toast('已切换到「便利贴」', 'success');
    });

    /* ================== 便签模块：标签区 / 弹窗 / 便利贴 事件绑定 ================== */

    // 标签区折叠切换
    if (els.tagHead) els.tagHead.addEventListener('click', function () {
      var s = els.tagSection;
      s.classList.toggle('collapsed');
      if (s.classList.contains('collapsed')) els.tagList.style.display = 'none';
      else els.tagList.style.display = '';
    });

    // FAB：新建便利贴
    var btnNewSticky = document.getElementById('btn-new-sticky');
    if (btnNewSticky) btnNewSticky.addEventListener('click', function () {
      var d = newSticky();
      renderList();
      if (d) toast('已新建便利贴', 'success');
    });

    // ---- 标签编辑弹窗 ----
    if (els.tagEditModal) {
      if (document.getElementById('tag-edit-close')) document.getElementById('tag-edit-close').addEventListener('click', closeTagEditModal);
      if (document.getElementById('tag-edit-cancel')) document.getElementById('tag-edit-cancel').addEventListener('click', closeTagEditModal);
      if (document.getElementById('tag-edit-confirm')) document.getElementById('tag-edit-confirm').addEventListener('click', function () { closeTagEditModal(); renderSideSub(); renderList(); });
      var tagAddBtn = document.getElementById('tag-edit-add');
      if (tagAddBtn) tagAddBtn.addEventListener('click', function () { tagAddFromInput(); });
      if (els.tagEditInput) {
        els.tagEditInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); tagAddFromInput(); }
        });
      }
      els.tagEditModal.addEventListener('click', function (e) { if (e.target === els.tagEditModal) closeTagEditModal(); });
    }

    // ---- 便利贴编辑弹窗 ----
    if (els.stickyEditModal) {
      if (document.getElementById('sticky-edit-close')) document.getElementById('sticky-edit-close').addEventListener('click', closeStickyEditModal);
      if (document.getElementById('sticky-edit-cancel')) document.getElementById('sticky-edit-cancel').addEventListener('click', closeStickyEditModal);
      if (document.getElementById('sticky-edit-confirm')) document.getElementById('sticky-edit-confirm').addEventListener('click', stickyEditSave);
      if (els.stickyColorRow) {
        Array.prototype.forEach.call(els.stickyColorRow.children, function (el) {
          el.addEventListener('click', function () {
            state.stickyColor = el.getAttribute('data-color');
            Array.prototype.forEach.call(els.stickyColorRow.children, function (x) { x.classList.toggle('active', x === el); });
          });
        });
      }
      // 定时提醒控件
      if (els.stickyEditRemEnabled) {
        els.stickyEditRemEnabled.addEventListener('change', function () {
          els.stickyRemRow.style.display = els.stickyEditRemEnabled.checked ? '' : 'none';
        });
      }
      if (els.stickyEditRemType) {
        els.stickyEditRemType.addEventListener('change', function () {
          var t = els.stickyEditRemType.value;
          if (els.stickyRemOnce) els.stickyRemOnce.style.display = t === 'once' ? '' : 'none';
          if (els.stickyRemWeekly) els.stickyRemWeekly.style.display = t === 'weekly' ? '' : 'none';
          if (els.stickyRemMonthly) els.stickyRemMonthly.style.display = t === 'monthly' ? '' : 'none';
        });
      }
      els.stickyEditModal.addEventListener('click', function (e) { if (e.target === els.stickyEditModal) closeStickyEditModal(); });
    }

    // ---- 定时提醒弹窗 ----
    if (els.stickyReminderModal) {
      if (document.getElementById('sticky-reminder-close')) document.getElementById('sticky-reminder-close').addEventListener('click', function () { els.stickyReminderModal.style.display = 'none'; });
      if (document.getElementById('sticky-reminder-ok')) document.getElementById('sticky-reminder-ok').addEventListener('click', function () { els.stickyReminderModal.style.display = 'none'; });
      els.stickyReminderModal.addEventListener('click', function (e) { if (e.target === els.stickyReminderModal) els.stickyReminderModal.style.display = 'none'; });
    }

    // ---- 提醒轮询：每分钟检查便利贴定时提醒 ----
    function checkReminders() {
      var now = new Date();
      var hit = null;
      state.docs.forEach(function (d) {
        if (d.deleted || d.kind !== 'sticky') return;
        var rem = d.reminder;
        if (!rem || !rem.enabled) return;
        if (!matchReminder(rem, now)) return;
        var key = d.id + '|' + rem.type + '|' + rem.time + '|' + (rem.date || '') + '|' + (rem.day || '') + '|' + (rem.days || []).join(',');
        if (state.remindedKeys[key]) return;
        state.remindedKeys[key] = true;
        hit = d;
      });
      if (hit) {
        if (els.stickyReminderTitle) els.stickyReminderTitle.textContent = (hit.title || '无标题') + ' · ' + fmtStamp(Date.now());
        if (els.stickyReminderContent) els.stickyReminderContent.textContent = hit.content || '（无内容）';
        if (els.stickyReminderModal) els.stickyReminderModal.style.display = 'flex';
        toast('提醒：' + (hit.title || '便利贴'), 'success');
      }
    }
    // 启动轮询：立即执行一次 + 每 30 秒检查（分钟级精度足够）
    checkReminders();
    state.reminderTimer = setInterval(checkReminders, 30000);

    // 初始化：渲染标签区 / 便签集区
    renderSideSub();

    // v0.20.37：底部「＋ 新建文档」FAB → 展开/收起弹出菜单（内含原"新建"分组全部功能）
    var fabNew = document.getElementById('fabNewDoc');
    var drawerFab = document.getElementById('drawerFab');
    var fabMenu = document.getElementById('fabMenu');
    if (fabNew && drawerFab && fabMenu) {
      fabNew.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = drawerFab.classList.toggle('open');
        fabMenu.style.display = open ? '' : 'none';
      });
      // 点击菜单内任意"新建"项后收起菜单（各 btn 自身 click 已绑定真实逻辑）
      fabMenu.querySelectorAll('.fab-menu-item').forEach(function (it) {
        it.addEventListener('click', function () {
          drawerFab.classList.remove('open');
          fabMenu.style.display = 'none';
        });
      });
      // 点击 FAB 之外区域收起菜单
      document.addEventListener('click', function (e) {
        if (drawerFab.classList.contains('open') && !drawerFab.contains(e.target)) {
          drawerFab.classList.remove('open');
          fabMenu.style.display = 'none';
        }
      });
    }

    // v0.20.35：信息面板开关
    var infoBtn = document.getElementById('btn-info-panel');
    var infoPanel = document.getElementById('info-panel');
    if (infoBtn && infoPanel) {
      var syncInfoBtnState = function () {
        if (infoPanel.classList.contains('collapsed')) {
          infoBtn.classList.remove('active');
        } else {
          infoBtn.classList.add('active');
        }
      };
      syncInfoBtnState();
      infoBtn.addEventListener('click', function () {
        infoPanel.classList.toggle('collapsed');
        syncInfoBtnState();
      });
    }

    // v0.20.36：流程图样式设置面板开关（右上角，仅流程图显示）
    var styleBtn = document.getElementById('btn-style-panel');
    if (styleBtn) {
      styleBtn.addEventListener('click', function () {
        if (!state.currentVisual || !state.currentVisual.module || !state.currentVisual.module.toggleStylePanel) return;
        var open = state.currentVisual.module.toggleStylePanel();
        styleBtn.classList.toggle('active', open);
      });
      styleBtn.addEventListener('mouseenter', function () {
        styleBtn.classList.add('tip-show');
      });
      styleBtn.addEventListener('mouseleave', function () {
        styleBtn.classList.remove('tip-show');
      });
      document.addEventListener('mouseover', function (e) {
        if (styleBtn.classList.contains('tip-show') && e.target !== styleBtn && !styleBtn.contains(e.target)) {
          styleBtn.classList.remove('tip-show');
        }
      });
      document.addEventListener('mousedown', function (e) {
        if (!styleBtn.classList.contains('active')) return;
        if (e.target.closest && e.target.closest('.flow-style-bar')) return;
        if (e.target === styleBtn || styleBtn.contains(e.target)) return;
        if (e.target.closest && e.target.closest('.flow-node, .flow-edge, .flow-lane')) return;
        var mod = state.currentVisual && state.currentVisual.module;
        if (mod && mod.setStylePanelOpen) {
          mod.setStylePanelOpen(false);
          styleBtn.classList.remove('active');
        }
      });
    }

    // v0.20.35：信息面板快捷操作 → 复用「更多」菜单映射
    var qaMap = {
      json: 'btn-tools', xml: 'btn-format-xml', convert: 'btn-convert',
      compare: 'btn-compare', encoding: 'btn-encoding'
    };
    Array.prototype.forEach.call(document.querySelectorAll('#info-panel .quick-action'), function (qa) {
      qa.addEventListener('click', function (e) {
        // v0.20.45：阻止冒泡，避免 document click 立即关闭刚展开的下拉菜单
        e.stopPropagation();
        var ab = qa.getAttribute('data-ab');
        var t = qaMap[ab] && document.getElementById(qaMap[ab]);
        if (t) t.click();
      });
    });

    // v0.20.33：顶层 App Bar 更多菜单
    var btnMore = document.getElementById('btn-more');
    var appbarMenu = document.getElementById('appbar-menu');
    // v0.20.33：单按钮动态切换（折叠/展开图标）
    var btnSide2 = document.getElementById('btn-toggle-sidebar2');
    if (btnSide2 && els.sidebar) {
      var iconCollapsed = '<svg viewBox="0 0 24 24" class="ico"><path d="M3 6h13M3 12h13M3 18h13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18 6l3 6-3 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      var iconExpanded = '<svg viewBox="0 0 24 24" class="ico"><path d="M3 6h13M3 12h13M3 18h13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M21 6l-3 6 3 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      var splitter = document.getElementById('sidebar-splitter');
      var syncBtnIcon = function () {
        var collapsed = els.sidebar.classList.contains('collapsed');
        if (collapsed) {
          btnSide2.innerHTML = iconExpanded;
          btnSide2.title = '展开侧栏';
          if (splitter) splitter.style.display = 'none';
        } else {
          btnSide2.innerHTML = iconCollapsed;
          btnSide2.title = '收起侧栏';
          if (splitter) splitter.style.display = '';
        }
      };
      syncBtnIcon();
      btnSide2.addEventListener('click', function () {
        els.sidebar.classList.toggle('collapsed');
        syncBtnIcon();
      });
    }
    if (btnMore && appbarMenu) {
      btnMore.addEventListener('click', function (e) {
        e.stopPropagation();
        appbarMenu.style.display = appbarMenu.style.display === 'none' ? 'block' : 'none';
      });
      Array.prototype.forEach.call(appbarMenu.querySelectorAll('.menu-item'), function (it) {
        it.addEventListener('click', function (e) {
          appbarMenu.style.display = 'none';
          var ab = it.getAttribute('data-ab');
          // v0.20.45：阻止冒泡到 document，避免 closeAllToolMenus 立即关闭
          // 通过 target.click() 展开的 JSON/转换/文本/插入子菜单
          e.stopPropagation();
          // 复用原工具栏按钮的点击逻辑（id 保持不变，事件绑定依然生效）
          var map = {
            encoding: 'btn-encoding',
            compare: 'btn-compare',
            xml: 'btn-format-xml',
            json: 'btn-tools',
            convert: 'btn-convert',
            texttools: 'btn-texttools',
            insert: 'btn-insert',
            preview: 'btn-toggle-preview',
            export: 'btn-export',
            saveas: 'btn-save-as',
            delete: 'btn-delete',
            reveal: '' // v0.21.4：打开所在文件夹（无对应工具栏按钮，走自定义逻辑）
          };
          var target = map[ab] && document.getElementById(map[ab]);
          if (target) target.click();
          else if (ab === 'reveal') revealInFolder();
          else if (ab === 'settings') openSettingsModal();
        });
      });
      document.addEventListener('click', function (e) {
        if (!appbarMenu.contains(e.target) && e.target.id !== 'btn-more') appbarMenu.style.display = 'none';
      });
    }

    /* ================== 批量管理 / 三点菜单 / 重命名 / 批量删除 事件绑定 ================== */

    // 1) 进入批量管理
    if (els.batchToggle) {
      els.batchToggle.addEventListener('click', function () { closeDocMenu(); toggleBatchMode(true); });
    }
    // 0) 按时间分组排序开关
    if (els.btnSortToggle) {
      els.btnSortToggle.addEventListener('click', function () { closeDocMenu(); toggleSortGroup(); });
    }
    // 2) 退出批量管理
    if (els.batchExit) {
      els.batchExit.addEventListener('click', function () { toggleBatchMode(false); });
    }
    // 3) 全选/取消全选
    if (els.batchSelectAll) {
      els.batchSelectAll.addEventListener('change', function () {
        var on = els.batchSelectAll.checked;
        // 只对当前视图（普通列表 / 回收站 / 便利贴）下的可见文档全选
        (state.docs || []).forEach(function (d) {
          var inView = state.docFilter === 'trash' ? !!d.deleted
            : state.docFilter === 'sticky' ? d.kind === 'sticky'
            : !d.deleted;
          if (inView) state.batchSelected[d.id] = on ? true : false;
        });
        // 直接刷新列表 DOM 里的复选框状态（不走全量重渲染，避免焦点丢失）
        els.docList.querySelectorAll('.doc-item').forEach(function (it) {
          var id = it.getAttribute('data-doc-id');
          var cb = it.querySelector('.doc-batch-check input');
          if (cb) cb.checked = !!state.batchSelected[id];
        });
        refreshBatchCount();
      });
    }
    // 4) 批量删除 / 批量彻底删除（回收站）
    if (els.batchDel) {
      els.batchDel.addEventListener('click', function () {
        var ids = getBatchSelectedIds();
        if (ids.length === 0) { toast('请先选择要删除的文档', 'error'); return; }
        var inTrash = state.docFilter === 'trash';
        var titleEl = document.getElementById('doc-batch-del-title');
        var hintEl = document.getElementById('doc-batch-del-hint');
        var footEl = document.getElementById('doc-batch-del-foot');
        if (inTrash) {
          if (titleEl) titleEl.textContent = '批量彻底删除';
          if (hintEl) hintEl.textContent = '选中的文档将被彻底删除，且无法恢复。';
          if (footEl) footEl.textContent = 'ⓘ 此操作不可撤销。';
        } else {
          if (titleEl) titleEl.textContent = '批量删除文档';
          if (hintEl) hintEl.textContent = '确定要从「我的文档」中移除选中的文档吗？';
          if (footEl) footEl.textContent = 'ⓘ 删除后无法恢复，磁盘文件不会被删除。';
        }
        if (els.docBatchDelName) els.docBatchDelName.textContent = '共 ' + ids.length + ' 篇文档';
        openSingleModal('doc-batch-del-modal');
      });
    }
    if (els.docBatchDelCancel) els.docBatchDelCancel.addEventListener('click', function () { if (els.docBatchDelModal) els.docBatchDelModal.style.display = 'none'; });
    if (els.docBatchDelClose) els.docBatchDelClose.addEventListener('click', function () { if (els.docBatchDelModal) els.docBatchDelModal.style.display = 'none'; });
    if (els.docBatchDelConfirm) els.docBatchDelConfirm.addEventListener('click', function () {
      var ids = getBatchSelectedIds();
      var c = state.docFilter === 'trash' ? batchDestroy(ids) : batchDelete(ids);
      if (els.docBatchDelModal) els.docBatchDelModal.style.display = 'none';
      // 批量操作完成 → 自动退出批量模式，关闭顶部批量工具栏
      if (c > 0 && state.batchMode) toggleBatchMode(false);
      toast(state.docFilter === 'trash' ? '批量彻底删除完成：共 ' + c + ' 项' : '批量删除完成：共 ' + c + ' 项', 'success');
    });

    // 5) 批量导出
    if (els.batchExport) {
      els.batchExport.addEventListener('click', function () {
        batchExport(getBatchSelectedIds());
      });
    }

    // 6) 重命名弹窗：关闭按钮 / 取消 / 确认 / 回车
    function closeRename() { if (els.docRenameModal) els.docRenameModal.style.display = 'none'; }
    if (els.docRenameClose) els.docRenameClose.addEventListener('click', closeRename);
    if (els.docRenameCancel) els.docRenameCancel.addEventListener('click', closeRename);
    function confirmRename() {
      if (!renameDocId) { closeRename(); return; }
      var val = els.docRenameInput ? els.docRenameInput.value : '';
      val = (val || '').trim();
      if (!val) { toast('文档名不能为空', 'error'); return; }
      if (renameDoc(renameDocId, val)) { toast('重命名成功', 'success'); }
      closeRename();
    }
    if (els.docRenameConfirm) els.docRenameConfirm.addEventListener('click', confirmRename);
    if (els.docRenameInput) {
      els.docRenameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); confirmRename(); }
        else if (e.key === 'Escape') { e.preventDefault(); closeRename(); }
      });
    }

    // 7) 单文档删除弹窗（18-bootstrap 中未绑定，这里做主绑定）
    if (document.getElementById('doc-del-close')) document.getElementById('doc-del-close').addEventListener('click', closeDocDelConfirm);
    if (document.getElementById('doc-del-cancel')) document.getElementById('doc-del-cancel').addEventListener('click', closeDocDelConfirm);
    if (document.getElementById('doc-del-confirm')) document.getElementById('doc-del-confirm').addEventListener('click', function () {
      // pendingDelId 通过 ESM live binding 导入，openDocDelConfirm() 修改后会同步
      var id = pendingDelId;
      if (id) {
        closeDocDelConfirm();
        deleteDoc(id);
      }
    });
  }

  /* ---------------- 初始装配（Phase ESM） ----------------
   * 显式装配顺序：入口模块求值完成时所有依赖已就绪（04 的 cm 已
   * 初始化、各模块函数/常量已绑定），按序执行：
   *   1. initEvents()  —— 17-events：绑定 cm 与 DOM 事件
   *   2. initApp()     —— 18-bootstrap：弹窗绑定 + loadDocs + renderList + openDoc
   *   3. initCraftSidebar() —— 本模块：Craft 侧栏 UI
   *   4. initSettings() —— 26-settings：设置弹窗绑定 + 应用持久化选项/快捷键 */
  // 兜底：在 initEvents/initApp 之前也调度一次「打开外部传入文件」。
  // 即使后续初始化异常中断，右键「打开方式」传入的文档也能被打开
  //（openPendingExternal 内部防重入，查询到外部文件时会跳过默认文档）。
  try { openPendingExternal(); } catch (e) {}

  initEvents();
  syncSortButton();   // 读取文档排序开关状态（默认关闭），供 initApp 内 renderList 使用
  initApp();
  initCraftSidebar();
  initSettings();
