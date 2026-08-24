/* [esm] 导出本模块顶层绑定 */
export { FR_STORAGE, frState, FR_HL_HARD_CAP, FR_HL_DOC_CAP, FR_HL_EST_CAP, FR_HL_BATCH, FR_BACK_MAX, initApp, cleanupRichOrphans, openPendingExternal };
/* [esm] 导入依赖模块绑定 */
import { bus, state } from './01-core.js';
import { bindRichOutline } from './02-rich-outline.js';
import { bindRichBubble } from './03-rich-bubble.js';
import { loadDocs } from './05-store.js';
import { renderList } from './06-doc-list.js';
import { openDoc } from './07-doc-open.js';
import { bindCodeModal, bindTsModal } from './11-format-tools.js';
import { getApi, hasApi } from './13-api-path.js';
import { openDiskFile } from './14-filetree-image.js';
import { toast } from './16-doc-ops.js';
import { bindFindReplaceModal } from './19-find-replace.js';
import { initDocMap } from './25-doc-map.js';
  /* ---------------- 启动 ---------------- */
  // 查找替换面板状态（必须在调用前初始化，否则 var 提升为 undefined 会让
  // bindFindReplaceModal 内 frLoad/syncFrStateToUi 直接抛错中断，所有按钮失效）
  var FR_STORAGE = 'inkpad.fr.v1';
  var frState = {
    caseSens: false,
    wholeWord: false,
    regex: false,
    cycle: true,
    expand: true,             // 默认开启：replacement / query 中的 \n \t \r 自动展开为真实字符
                              //   符合 sed / perl / VS Code 等主流编辑器惯例。
                              //   关闭此开关后，输入 \n 将作为字面两字符保留（罕见场景）。
    continueNext: false,
    highlight: true,
    fast: false,
    scope: 'current',
    collapsed: true,          // false=替换面板, true=仅查找
    findHistory: [],          // 字符串数组（最新在前）
    replaceHistory: [],
    favorites: [],            // [{find, replace}]
    pos: null                 // {left, top} 浮层拖动后位置
  };
  // 高亮标记状态（Phase ESM：收拢进 state，供 19-find-replace 读写）
  state.frMarks = [];         // 当前高亮匹配的文本标记
  state.frHlTimer = null;     // 高亮 debounce 定时器
  state.frHlRunning = false;  // 是否正在分批标记中
  state.frHlToken = 0;        // 每次调度递增；分批 step 检查 token 不一致就主动放弃
  // 高亮硬上限：超过这个数量只标记前 N 个，避免对超大文档卡死
  var FR_HL_HARD_CAP = 800;
  // 文本长度阈值：超过此值直接跳过全文档高亮（仍支持查找下一个 / 替换）
  var FR_HL_DOC_CAP = 500 * 1024;
  // 匹配数快速估算上限：超过此数直接放弃高亮
  var FR_HL_EST_CAP = 50000;
  // 分批创建 markText 的批大小；每批结束 setTimeout(0) 让出主线程
  var FR_HL_BATCH = 80;
  // 反向查找迭代上限（防止大文档 findNext 跑死）
  var FR_BACK_MAX = 50000;

  /* ---------------- 启动序列 ----------------
   * Phase ESM：从模块顶层收敛为显式 initApp()，由入口模块
   * 20-craft-init 在所有依赖求值完成后调用，消除 ESM 环内
   * 模块求值顺序的不确定性（此前在模块求值期执行，可能早于
   * CodeMirror 初始化，导致 openDoc 内 cm 未就绪）。 */
  function initApp() {
    dbgLog('initApp enter');
    // 右键「打开方式」→ L.Note 启动时：主编辑器加载完成后，
    // 自动打开外部传入的非图片文件（图片已由 main.py 分流到图片编辑器）。
    // 必须最先调度：后续初始化异常不能阻断自动打开。openPendingExternal
    // 会异步查询外部文件——有则直接打开它并跳过默认文档（避免「默认文档
    // 先显示再被切换」的闪烁与重复渲染，卡顿也随之减少）；无则按原逻辑
    // 打开上次/默认文档。因此这里不再同步 openDoc。
    openPendingExternal();
    try {
      bindTsModal();
      bindCodeModal();
      bindFindReplaceModal();
      loadDocs();
      // Phase 2：文档列表数据变更（增删改/保存）统一走 docs:changed 事件驱动刷新
      bus.on('docs:changed', renderList);
      renderList();
    } catch (e) {
      dbgLog('initApp main error: ' + (e && e.message));
      console.warn('[inkpad] initApp main init error, continue', e);
    }

    // 【v0.18 新增】富文档大纲（飞书式侧栏）：按钮 + splitter + IntersectionObserver
    bindRichOutline();

    // 【v0.18.1 新增】启动时清理 InkpadRich 目录下的 orphan .json 文件
    // （v0.17 标题跟随 bug 会在改标题过程中残留多份同内容副本）
    setTimeout(function () { cleanupRichOrphans(); }, 800);

    // 【v0.18.4 新增】富文档 bubble menu：选中文本后浮出横条菜单
    bindRichBubble();

    // 【v0.20.x 新增】文档地图（右侧小地图）：恢复开关状态并绑定渲染/跳转事件
    try { initDocMap(); } catch (e) {
      dbgLog('initDocMap error: ' + (e && e.message));
      console.warn('[inkpad] initDocMap error', e);
    }
  }

  function dbgLog(m) {
    try {
      if (getApi() && getApi().debug_log) getApi().debug_log(String(m));
    } catch (e) { /* ignore */ }
  }

  var pendingOpenBusy = false;
  function openPendingExternal() {
    if (pendingOpenBusy) return;
    dbgLog('openPendingExternal enter, hasApi=' + hasApi());
    if (!hasApi()) {
      window.addEventListener('pywebviewready', function h() {
        window.removeEventListener('pywebviewready', h);
        dbgLog('pywebviewready fired -> retry');
        openPendingExternal();
      }, { once: true });
      return;
    }
    pendingOpenBusy = true;
    openInitialDoc();
  }

  // 启动首个文档的决策入口：异步查询右键「打开方式」传入的外部文件，
  // 有则直接打开它（跳过默认文档，避免「默认文档先显示再被切换」的闪烁）；
  // 无则按原逻辑打开上次/默认文档。查询是跨进程 IPC，返回时机天然晚于
  // 同步初始化（loadDocs / renderList），因此无需 setTimeout 延迟。
  function openInitialDoc() {
    getApi().get_pending_open_file().then(function (pf) {
      dbgLog('get_pending_open_file -> ' + JSON.stringify(pf));
      var p = pf && pf.path ? pf.path : null;
      var name = (pf && pf.name) || (p ? p.split(/[\\/]/).pop() || '文件' : '');
      // 图片由单独的图片编辑窗口处理（main.py 已分流），此处只打开文档
      if (p && !/\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i.test(name)) {
        dbgLog('skip default doc, open external: ' + p);
        openDiskFile(p, name);
      } else {
        dbgLog('open default doc, activeId=' + state.activeId);
        openDoc(state.activeId);
      }
    }).catch(function (e) {
      dbgLog('openPendingExternal failed: ' + (e && e.message));
      console.warn('[inkpad] open pending file failed', e);
      openDoc(state.activeId);
    });
  }

  function cleanupRichOrphans() {
    if (!hasApi()) return;
    var occupied = state.docs.map(function (d) { return d && d.diskPath; }).filter(Boolean);
    getApi().cleanup_rich_orphans(occupied).then(function (res) {
      if (!res) return;
      var del = (res.deleted || []).length;
      var skp = (res.skipped || []).length;
      if (del > 0) toast('已清理 ' + del + ' 个历史残留富文档文件（忽略 ' + skp + ' 个非富文档 JSON）', 'success');
      else if (skp > 0) {} // 用户自己的 .json 不打扰
    }).catch(function (e) { console.warn('[inkpad] cleanup orphans failed', e); });
  }
