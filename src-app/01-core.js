/* [esm] 导出本模块顶层绑定 */
export { STORAGE_KEY, ACTIVE_KEY, LANGS, SAMPLE_DIAGRAM, SAMPLE_MINDMAP, $, els, bus, state };
  var STORAGE_KEY = 'inkpad.docs.v1';
  var ACTIVE_KEY = 'inkpad.active.v1';

  /* ---------------- 语言配置 ---------------- */
  var LANGS = {
    plaintext:  { label: '纯文本',       mime: 'text/plain',             ext: '.txt' },
    markdown:   { label: 'Markdown',     mime: 'text/x-markdown',        ext: '.md' },
    json:       { label: 'JSON',         mime: 'application/json',       ext: '.json' },
    xml:        { label: 'XML',          mime: 'xml',                    ext: '.xml' },
    html:       { label: 'HTML',         mime: 'text/html',              ext: '.html' },
    javascript: { label: 'JavaScript',   mime: 'text/javascript',        ext: '.js' },
    python:     { label: 'Python',       mime: 'text/x-python',          ext: '.py' },
    css:        { label: 'CSS',          mime: 'text/css',               ext: '.css' },
    sql:        { label: 'SQL',          mime: 'text/x-sql',             ext: '.sql' },
    yaml:       { label: 'YAML',         mime: 'text/x-yaml',            ext: '.yaml' },
    shell:      { label: 'Shell',        mime: 'text/x-sh',              ext: '.sh' },
    clike:      { label: 'C / Java / C++', mime: 'text/x-c++src',        ext: '.c' },
    mermaid:    { label: 'Mermaid 图表', mime: 'text/plain',             ext: '.mmd' }
  };

  var SAMPLE_DIAGRAM = 'flowchart TD\n' +
    '    A([开始]) --> B{条件判断}\n' +
    '    B -- 是 --> C[处理数据]\n' +
    '    B -- 否 --> D[记录日志]\n' +
    '    C --> E[(写入数据库)]\n' +
    '    D --> E\n' +
    '    E --> F([结束])\n';

  var SAMPLE_MINDMAP = 'mindmap\n' +
    '  root((项目规划))\n' +
    '    前端\n' +
    '      界面设计\n' +
    '      交互逻辑\n' +
    '    后端\n' +
    '      API 设计\n' +
    '      数据库\n' +
    '    测试\n' +
    '      单元测试\n' +
    '      集成测试\n';

  /* ---------------- DOM 引用 ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var els = {
    sidebar: $('sidebar'), docList: $('doc-list'),
    title: $('doc-title'), breadcrumb: $('breadcrumb'),
    langSelect: $('lang-select'), editor: $('editor'),
    editorPane: $('editor-pane'),
    visualPane: $('visual-pane'), visualToolbar: $('visual-toolbar'), visualCanvas: $('visual-canvas'),
    richPane: $('rich-pane'), richCanvas: $('rich-canvas'),
    // 富文档大纲（飞书式左侧 TOC）
    richOutline: $('rich-outline'), outlineList: $('outline-list'),
    outlineEmpty: $('outline-empty'), outlineCount: $('outline-count'),
    outlineSearch: $('outline-search'),
    richOutlineSplitter: $('rich-outline-splitter'),
    btnRichOutline: $('btn-rich-outline'),
    btnCloseOutline: $('btn-close-outline'),
    btnOutlineUp: $('btn-outline-up'), btnOutlineDown: $('btn-outline-down'),
    btnOutlineReload: $('btn-outline-reload'), outlineFoot: $('outline-foot'),
    toolsWrap: $('tools-wrap'), toolsWrap2: $('tools-wrap2'), btnFormatXml: $('btn-format-xml'), btnFind: $('btn-find'),
    btnEncoding: $('btn-encoding'), btnCompare: $('btn-compare'),
    fileTree: $('file-tree'), tabDocs: $('tab-docs'), tabFiles: $('tab-files'),
    previewPane: $('preview-pane'), mermaidOut: $('mermaid-out'),
    splitter: $('pane-splitter'),
    sideSplitter: $('sidebar-splitter'),
    previewEmpty: $('preview-empty'),
    previewTitle: $('preview-title'), previewHint: $('preview-hint'), mdOut: $('md-out'),
    htmlOut: $('html-out'), htmlFrame: $('html-frame'),
    clipList: $('clip-list'), snippetList: $('snippet-list'),
    statLang: $('stat-lang'), statCount: $('stat-count'),
    statCursor: $('stat-cursor'), statSaved: $('stat-saved'),
    statEdit: $('stat-edit'), statEnc: $('stat-enc'), statEditSep: $('stat-edit-sep'),
    toast: $('toast'), fileInput: $('file-input'),
    btnTogglePreview: $('btn-toggle-preview'),
    btnPreviewTop: $('btn-preview-top'),
    btnInsertImage: $('btn-insert-image'),
    btnExpandSidebar: $('btn-toggle-sidebar2'),
    btnSave: $('btn-save'),
    btnSaveAs: $('btn-save-as'),
    imageModal: $('image-modal'), imageView: $('image-view'), imageStage: $('image-stage'),
    imageName: $('image-name'), imgZoomReset: $('img-zoom-reset'),
    imgClose: $('img-close'), imgZoomIn: $('img-zoom-in'), imgZoomOut: $('img-zoom-out'), imgFit: $('img-fit'),
    // 批量管理工具栏
    batchToggle: $('btn-batch-toggle'),
    btnSortToggle: $('btn-sort-toggle'),   // 文档按时间分组排序开关
    sbBatchBar: $('sbBatchBar'),
    batchSelectAll: $('sbBatchSelectAll'),
    batchCount: $('sbBatchCount'),
    batchExport: $('btn-batch-export'),
    batchDel: $('btn-batch-del'),
    batchExit: $('btn-batch-exit'),
    // 重命名弹窗
    docRenameModal: $('doc-rename-modal'),
    docRenameInput: $('doc-rename-input'),
    docRenameConfirm: $('doc-rename-confirm'),
    docRenameCancel: $('doc-rename-cancel'),
    docRenameClose: $('doc-rename-close'),
    // 批量删除弹窗
    docBatchDelModal: $('doc-batch-del-modal'),
    docBatchDelName: $('doc-batch-del-name'),
    docBatchDelConfirm: $('doc-batch-del-confirm'),
    docBatchDelCancel: $('doc-batch-del-cancel'),
    docBatchDelClose: $('doc-batch-del-close'),
    // 便签模块：标签区
    tagSection: $('sb-tag-section'), tagHead: $('sb-tag-head'), tagList: $('sb-tag-list'), tagCount: $('sb-tag-count'),
    // 便签模块：模态框
    tagEditModal: $('tag-edit-modal'), tagEditDocname: $('tag-edit-docname'),
    tagEditChips: $('tag-edit-chips'), tagEditEmpty: $('tag-edit-empty'),
    tagEditAllchips: $('tag-edit-allchips'), tagEditAllempty: $('tag-edit-allempty'),
    tagEditInput: $('tag-edit-input'),
    stickyEditModal: $('sticky-edit-modal'), stickyEditTitle: $('sticky-edit-title'),
    stickyEditContent: $('sticky-edit-content'), stickyEditPin: $('sticky-edit-pin'),
    stickyColorRow: $('sticky-color-row'),
    // 定时提醒 / 到期时间
    stickyEditRemEnabled: $('sticky-edit-rem-enabled'), stickyRemRow: $('sticky-rem-row'),
    stickyEditRemType: $('sticky-edit-rem-type'), stickyEditRemTime: $('sticky-edit-rem-time'),
    stickyEditRemDate: $('sticky-edit-rem-date'), stickyEditRemDay: $('sticky-edit-rem-day'),
    stickyRemOnce: $('sticky-rem-once'), stickyRemWeekly: $('sticky-rem-weekly'), stickyRemMonthly: $('sticky-rem-monthly'),
    stickyEditDue: $('sticky-edit-due'),
    stickyReminderModal: $('sticky-reminder-modal'), stickyReminderTitle: $('sticky-reminder-title'), stickyReminderContent: $('sticky-reminder-content')
  };

  /* ---------------- 事件总线（pub/sub，UI 更新解耦） ----------------
   * Phase 2 引入：模块间不再手动链式调用 UI 更新，改为 emit 事件、
   * 订阅方自行刷新。任何 emit 出错都不会中断调用方。 */
  var bus = {
    _map: {},
    on: function (ev, fn) { (this._map[ev] = this._map[ev] || []).push(fn); return this; },
    off: function (ev, fn) {
      var a = this._map[ev];
      if (a) { var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
      return this;
    },
    emit: function (ev, data) {
      var a = this._map[ev];
      if (a) a.slice().forEach(function (fn) { try { fn(data); } catch (e) { console.warn('[inkpad] bus handler error on ' + ev, e); } });
      return this;
    }
  };

  /* ---------------- 集中式状态（唯一数据真源） ----------------
   * Phase 2：把散落在各模块的核心状态收拢到 state 对象，
   * 所有读写统一走 state.*，便于追踪变更与后续真正模块化。
   * Phase ESM：UI 瞬态（debounce 定时器 / 渲染序号）也被跨模块
   * 赋值，ESM 的 import 只读，因此一并收拢进 state。 */
  var state = {
    docs: [],           // 文档列表（索引 + 正文）
    activeId: null,     // 当前文档 id
    previewOn: false,   // 预览默认不打开，点工具栏「👁 预览」手动开启
    currentVisual: null, // { kind, doc, model, module }
    // UI 瞬态（跨模块赋值的可变变量，见上）
    renderTimer: null,  // 预览渲染 debounce
    saveTimer: null,    // 富文档保存 debounce
    mermaidSeq: 0,      // mermaid 渲染序号（防过期渲染）
    // 批量管理
    batchMode: false,   // 是否进入批量选择模式
    batchSelected: {},   // { docId: true } 已选中的文档 id 集合
    docFilter: 'recent',  // 当前侧栏过滤模式：recent / my-space / wiki / favorites / trash / sticky
    sortGroup: false,     // 文档列表是否按时间分组排序（今天/昨天/本周/更早），默认关闭
    // 便签模块：标签 / 便利贴
    tagFilter: null,      // 当前标签过滤（null 表示未过滤）
    tagEditDocId: null,   // 正在编辑标签的文档 id
    stickyEditId: null,   // 正在编辑的便利贴 id
    stickyColor: '#FFD43B', // 便利贴当前选中颜色
    // 定时标签：标签过期时间 / 提醒状态
    tagMeta: {},          // { [tag]: { expiresAt: ts } } 标签过期时间
    remindedKeys: {},     // { [key]: true } 已提醒过的提醒 key（避免同一分钟重复）
    reminderTimer: null,  // 提醒轮询定时器
    reminderSeq: 0        // 提醒弹窗序号（防止过期渲染）
  };
