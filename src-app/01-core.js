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
    btnInsertImage: $('btn-insert-image'),
    btnExpandSidebar: $('btn-expand-sidebar'),
    btnSave: $('btn-save'),
    btnSaveAs: $('btn-save-as'),
    imageModal: $('image-modal'), imageView: $('image-view'), imageStage: $('image-stage'),
    imageName: $('image-name'), imgZoomReset: $('img-zoom-reset'),
    imgClose: $('img-close'), imgZoomIn: $('img-zoom-in'), imgZoomOut: $('img-zoom-out'), imgFit: $('img-fit')
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
    mermaidSeq: 0       // mermaid 渲染序号（防过期渲染）
  };
