/* [esm] 导出本模块顶层绑定 */
export { STORAGE_KEY, ACTIVE_KEY, LANGS, SAMPLE_DIAGRAM, SAMPLE_MINDMAP, DOC_ICONS, MINDMAP_ICON, $, els, bus, state };
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

  /* ---------------- 文档类型图标（统一线性风格） ----------------
   * 单色线性图标：stroke 取 currentColor，随父级文字颜色与字号走（1em），
   * 不依赖额外 CSS。文档列表 / 回收站 / 面包屑 / 新建菜单 / 右键菜单 / AI 图表菜单共用。
   * 每个类型保留一个独占的轮廓特征，保证 16px 下仍可区分：
   *   文档 = 竖版页面 + 右上折角 + 3 行   ｜ 富文档 = 页面 + 实心内容块 ｜ Word = 页面 + W
   *   流程图 = 矩形 → 箭头 → 菱形         ｜ 思维导图 = 根节点 + 扇形曲线分支 + 圆点
   *   思维笔记 = 圆点列 + 等长横线         ｜ 便利贴 = 右下卷角
   *   PDF = 横版页面 + 折角 + 2 行         ｜ 图表 = 三根柱状
   * 颜色：每类挂 .ico-<type> 类型色（9 色 token 见 css/base.css），列表 / 面包屑 /
   * 新建菜单 / AI 图表菜单共用同一套色，无需各处重复声明。 */
  var ICON_ATTR = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

  /* key = 类型名，挂上 .ico-<key> 类型色（token 见 css/base.css 的 --ico-*）。
   * stroke 仍取 currentColor，所以需要整体置灰的状态（回收站 / AI 菜单禁用态）
   * 只要在对应状态选择器里覆盖 svg 自身的 color 即可，不必改图标本身。 */
  function svgIcon(body, key) {
    return '<svg viewBox="0 0 24 24" class="doc-svg' + (key ? ' ico-' + key : '') + '" ' +
      'style="width:1em;height:1em;vertical-align:-0.15em" ' +
      'aria-hidden="true" ' + ICON_ATTR + '>' + body + '</svg>';
  }

  var DOC_ICONS = {
    doc: svgIcon(
      '<path d="M6 3h7.5L18 7.5V21H6Z"/>' +
      '<path d="M13.5 3v4.5H18"/>' +
      '<path d="M9 12.4h6"/><path d="M9 15.6h6"/><path d="M9 18.8h3.6"/>',
      'doc'
    ),
    rich: svgIcon(
      '<path d="M6 3h7.5L18 7.5V21H6Z"/>' +
      '<path d="M13.5 3v4.5H18"/>' +
      '<rect x="9" y="12.4" width="6" height="6.4" rx="1.1" fill="currentColor" stroke="none"/>',
      'rich'
    ),
    word: svgIcon(
      '<path d="M6 3h7.5L18 7.5V21H6Z"/>' +
      '<path d="M13.5 3v4.5H18"/>' +
      '<path d="M8.6 12.6l1.5 5.4 1.9-3.8 1.9 3.8 1.5-5.4"/>',
      'word'
    ),
    flow: svgIcon(
      '<rect x="7.8" y="2.8" width="8.4" height="4.4" rx="1.2"/>' +
      '<path d="M12 7.2v2.1"/>' +
      '<path d="M10.8 8.2 12 9.3l1.2-1.1"/>' +
      '<path d="M12 11.4 16 15.4 12 19.4 8 15.4Z"/>',
      'flow'
    ),
    /* 思维导图：变体 1 · 扇形（分支取短版，曲线端点正好落在圆点左边缘） */
    mind: svgIcon(
      '<rect x="4.6" y="9.2" width="5.4" height="5.6" rx="1.8"/>' +
      '<path d="M10 12c2.9 0 2.7-5.6 5.6-5.6"/>' +
      '<path d="M10 12h5.6"/>' +
      '<path d="M10 12c2.9 0 2.7 5.6 5.6 5.6"/>' +
      '<circle cx="17.4" cy="6.4" r="1.8"/>' +
      '<circle cx="17.4" cy="12" r="1.8"/>' +
      '<circle cx="17.4" cy="17.6" r="1.8"/>',
      'mind'
    ),
    note: svgIcon(
      '<circle cx="4.8" cy="6.4" r="1.3" fill="currentColor" stroke="none"/>' +
      '<circle cx="4.8" cy="12" r="1.3" fill="currentColor" stroke="none"/>' +
      '<circle cx="4.8" cy="17.6" r="1.3" fill="currentColor" stroke="none"/>' +
      '<path d="M8.6 6.4h10.8"/><path d="M8.6 12h10.8"/><path d="M8.6 17.6h10.8"/>',
      'note'
    ),
    sticky: svgIcon(
      '<path d="M4.6 4.2h14.8v10.2l-5.2 5.4H4.6Z"/>' +
      '<path d="M14.2 19.8v-5.4h5.2"/>',
      'sticky'
    ),
    pdf: svgIcon(
      '<path d="M3.6 6.4h13.2l3.6 3.6V18H3.6Z"/>' +
      '<path d="M16.8 6.4v3.6h3.6"/>' +
      '<path d="M7 13.4h7"/><path d="M7 16.2h4.4"/>',
      'pdf'
    ),
    chart: svgIcon(
      '<path d="M4.8 19.6v-7.2"/><path d="M12 19.6V4.8"/><path d="M19.2 19.6v-4.8"/>',
      'chart'
    )
  };

  /* 兼容既有引用：思维导图图标与 DOC_ICONS.mind 同一个 SVG */
  var MINDMAP_ICON = DOC_ICONS.mind;

  /* ---------------- DOM 引用 ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var els = {
    sidebar: $('sidebar'), docList: $('doc-list'),
    title: $('doc-title'), breadcrumb: $('breadcrumb'),
    langSelect: $('lang-select'), editor: $('editor'),
    editorPane: $('editor-pane'),
    visualPane: $('visual-pane'), visualToolbar: $('visual-toolbar'), visualCanvas: $('visual-canvas'),
    richPane: $('rich-pane'), richCanvas: $('rich-canvas'),
    abToolbar: $('abToolbar'),
    // 富文档大纲（飞书式左侧 TOC）
    richOutline: $('rich-outline'), outlineList: $('outline-list'),
    outlineEmpty: $('outline-empty'), outlineCount: $('outline-count'),
    outlineSearch: $('outline-search'),
    richOutlineSplitter: $('rich-outline-splitter'),
    btnRichOutline: $('btn-rich-outline'),
    btnCloseOutline: $('btn-close-outline'),
    // 文档地图（右侧小地图）
    docMap: $('doc-map'), docMapScroll: $('doc-map-scroll'), docMapContent: $('doc-map-content'), docMapCanvas: $('doc-map-canvas'), docMapViewport: $('doc-map-viewport'),
    btnDocMap: $('btn-doc-map'),
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
    btnStylePanel: $('btn-style-panel'),
    btnInsertImage: $('btn-insert-image'),
    btnExpandSidebar: $('btn-toggle-sidebar2'),
    btnSave: $('btn-save'),
    btnSaveAs: $('btn-save-as'),
    imageModal: $('image-modal'), imageView: $('image-view'), imageStage: $('image-stage'),
    imageName: $('image-name'), imgZoomReset: $('img-zoom-reset'),
    imgClose: $('img-close'), imgZoomIn: $('img-zoom-in'), imgZoomOut: $('img-zoom-out'), imgFit: $('img-fit'),
    // PDF 查看器
    pdfModal: $('pdf-modal'), pdfName: $('pdf-name'), pdfPageInfo: $('pdf-page-info'),
    pdfPrev: $('pdf-prev'), pdfNext: $('pdf-next'),
    pdfZoomOut: $('pdf-zoom-out'), pdfZoomReset: $('pdf-zoom-reset'), pdfZoomIn: $('pdf-zoom-in'),
    pdfFit: $('pdf-fit'), pdfExtract: $('pdf-extract'), pdfClose: $('pdf-close'),
    pdfCopy: $('pdf-copy'),
    pdfStage: $('pdf-stage'), pdfCanvasWrap: $('pdf-canvas-wrap'),
    // DOC 查看器
    docModal: $('doc-modal'), docName: $('doc-name'), docPageInfo: $('doc-page-info'),
    docClose: $('doc-close'), docCopy: $('doc-copy'),
    docImportRich: $('doc-import-rich'), docImportText: $('doc-import-text'),
    docStage: $('doc-stage'), docBody: $('doc-body'),
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
      if (a) a.slice().forEach(function (fn) { try { fn(data); } catch (e) { console.warn('[L.Note] bus handler error on ' + ev, e); } });
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
    // 文档地图（右侧小地图）
    docMapOn: false,      // 文档地图是否显示（启动时由 25-doc-map 从 localStorage 恢复）
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
