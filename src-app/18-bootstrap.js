/* [esm] 导出本模块顶层绑定 */
export { FR_STORAGE, frState, FR_HL_HARD_CAP, FR_HL_DOC_CAP, FR_HL_EST_CAP, FR_HL_BATCH, FR_BACK_MAX, initApp, cleanupRichOrphans };
/* [esm] 导入依赖模块绑定 */
import { bus, state } from './01-core.js';
import { bindRichOutline } from './02-rich-outline.js';
import { bindRichBubble } from './03-rich-bubble.js';
import { loadDocs } from './05-store.js';
import { renderList } from './06-doc-list.js';
import { openDoc } from './07-doc-open.js';
import { bindCodeModal, bindTsModal } from './11-format-tools.js';
import { getApi, hasApi } from './13-api-path.js';
import { toast } from './16-doc-ops.js';
import { bindFindReplaceModal } from './19-find-replace.js';
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
    bindTsModal();
    bindCodeModal();
    bindFindReplaceModal();
    loadDocs();
    // Phase 2：文档列表数据变更（增删改/保存）统一走 docs:changed 事件驱动刷新
    bus.on('docs:changed', renderList);
    renderList();
    openDoc(state.activeId);

    // 【v0.18 新增】富文档大纲（飞书式侧栏）：按钮 + splitter + IntersectionObserver
    bindRichOutline();

    // 【v0.18.1 新增】启动时清理 InkpadRich 目录下的 orphan .json 文件
    // （v0.17 标题跟随 bug 会在改标题过程中残留多份同内容副本）
    setTimeout(function () { cleanupRichOrphans(); }, 800);

    // 【v0.18.4 新增】富文档 bubble menu：选中文本后浮出横条菜单
    bindRichBubble();
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
