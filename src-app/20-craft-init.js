/* [esm] 导出本模块顶层绑定 */
export { initCraftSidebar };
/* [esm] 导入依赖模块绑定 */
import { els } from './01-core.js';
import { richChanged } from './09-rich-save.js';
import { dirOf, resolveImgSrc } from './13-api-path.js';
import { _guessMimeFromPath } from './15-insert.js';
import { toast } from './16-doc-ops.js';
import { initEvents } from './17-events.js';
import { initApp } from './18-bootstrap.js';

  // 暴露给块编辑器（block-editor.js）使用的辅助函数
  window.InkpadApp = {
    dirOf: dirOf,
    resolveImgSrc: resolveImgSrc,
    guessMime: _guessMimeFromPath,
    toast: toast,
    richChanged: richChanged
  };

  /* ---------------- v0.20.32 Craft 风格：搜索框 ---------------- */
  // 搜索框：Ctrl+K / 点击 → 聚焦文档列表过滤输入
  function initCraftSidebar() {
    var sbBtn = document.getElementById('btn-sb-search');
    if (sbBtn) {
      sbBtn.addEventListener('click', function () {
        toast('搜索文档：可用顶部 🔍 查找替换（Ctrl+F）', 'success');
      });
    }
    var wsBtn = document.getElementById('btn-workspace');
    if (wsBtn) wsBtn.addEventListener('click', function () { toast('L.Note 工作台 · v0.20.44', 'success'); });

    // v0.20.36：对齐原型导航抽屉 —— 快捷入口行
    function markNavActive(id) {
      ['nav-recent', 'nav-starred', 'nav-shared', 'nav-tags', 'tab-docs', 'tab-files'].forEach(function (n) {
        var el = document.getElementById(n);
        if (el) el.classList.remove('active');
      });
      var a = document.getElementById(id);
      if (a) a.classList.add('active');
    }
    var navRecent = document.getElementById('nav-recent');
    if (navRecent) navRecent.addEventListener('click', function () { markNavActive('nav-recent'); toast('已切换到「最近文档」', 'success'); });
    var navStarred = document.getElementById('nav-starred');
    if (navStarred) navStarred.addEventListener('click', function () { markNavActive('nav-starred'); toast('已切换到「收藏」', 'success'); });
    var navShared = document.getElementById('nav-shared');
    if (navShared) navShared.addEventListener('click', function () { markNavActive('nav-shared'); toast('已切换到「共享」', 'success'); });
    var navTags = document.getElementById('nav-tags');
    if (navTags) navTags.addEventListener('click', function () { markNavActive('nav-tags'); toast('已切换到「标签」', 'success'); });

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
      infoBtn.addEventListener('click', function () {
        infoPanel.classList.toggle('collapsed');
      });
    }

    // v0.20.35：信息面板快捷操作 → 复用「更多」菜单映射
    var qaMap = {
      json: 'btn-tools', xml: 'btn-format-xml', convert: 'btn-convert',
      compare: 'btn-compare', encoding: 'btn-encoding'
    };
    Array.prototype.forEach.call(document.querySelectorAll('#info-panel .quick-action'), function (qa) {
      qa.addEventListener('click', function () {
        var ab = qa.getAttribute('data-ab');
        var t = qaMap[ab] && document.getElementById(qaMap[ab]);
        if (t) t.click();
      });
    });

    // v0.20.33：顶层 App Bar 更多菜单
    var btnMore = document.getElementById('btn-more');
    var appbarMenu = document.getElementById('appbar-menu');
    var btnSide2 = document.getElementById('btn-toggle-sidebar2');
    if (btnSide2 && els.sidebar) {
      btnSide2.addEventListener('click', function () {
        els.sidebar.classList.add('collapsed');
        var exp = document.getElementById('btn-expand-sidebar');
        if (exp) exp.style.display = '';
      });
    }
    if (btnMore && appbarMenu) {
      btnMore.addEventListener('click', function (e) {
        e.stopPropagation();
        appbarMenu.style.display = appbarMenu.style.display === 'none' ? 'block' : 'none';
      });
      Array.prototype.forEach.call(appbarMenu.querySelectorAll('.menu-item'), function (it) {
        it.addEventListener('click', function () {
          appbarMenu.style.display = 'none';
          var ab = it.getAttribute('data-ab');
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
            delete: 'btn-delete'
          };
          var target = map[ab] && document.getElementById(map[ab]);
          if (target) target.click();
        });
      });
      document.addEventListener('click', function (e) {
        if (!appbarMenu.contains(e.target) && e.target.id !== 'btn-more') appbarMenu.style.display = 'none';
      });
    }
  }

  /* ---------------- 初始装配（Phase ESM） ----------------
   * 显式装配顺序：入口模块求值完成时所有依赖已就绪（04 的 cm 已
   * 初始化、各模块函数/常量已绑定），按序执行：
   *   1. initEvents()  —— 17-events：绑定 cm 与 DOM 事件
   *   2. initApp()     —— 18-bootstrap：弹窗绑定 + loadDocs + renderList + openDoc
   *   3. initCraftSidebar() —— 本模块：Craft 侧栏 UI */
  initEvents();
  initApp();
  initCraftSidebar();
