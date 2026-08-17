(() => {
  // src-app/01-core.js
  var STORAGE_KEY = "inkpad.docs.v1";
  var ACTIVE_KEY = "inkpad.active.v1";
  var LANGS = {
    plaintext: { label: "\u7EAF\u6587\u672C", mime: "text/plain", ext: ".txt" },
    markdown: { label: "Markdown", mime: "text/x-markdown", ext: ".md" },
    json: { label: "JSON", mime: "application/json", ext: ".json" },
    xml: { label: "XML", mime: "xml", ext: ".xml" },
    html: { label: "HTML", mime: "text/html", ext: ".html" },
    javascript: { label: "JavaScript", mime: "text/javascript", ext: ".js" },
    python: { label: "Python", mime: "text/x-python", ext: ".py" },
    css: { label: "CSS", mime: "text/css", ext: ".css" },
    sql: { label: "SQL", mime: "text/x-sql", ext: ".sql" },
    yaml: { label: "YAML", mime: "text/x-yaml", ext: ".yaml" },
    shell: { label: "Shell", mime: "text/x-sh", ext: ".sh" },
    clike: { label: "C / Java / C++", mime: "text/x-c++src", ext: ".c" },
    mermaid: { label: "Mermaid \u56FE\u8868", mime: "text/plain", ext: ".mmd" }
  };
  var SAMPLE_DIAGRAM = "flowchart TD\n    A([\u5F00\u59CB]) --> B{\u6761\u4EF6\u5224\u65AD}\n    B -- \u662F --> C[\u5904\u7406\u6570\u636E]\n    B -- \u5426 --> D[\u8BB0\u5F55\u65E5\u5FD7]\n    C --> E[(\u5199\u5165\u6570\u636E\u5E93)]\n    D --> E\n    E --> F([\u7ED3\u675F])\n";
  var SAMPLE_MINDMAP = "mindmap\n  root((\u9879\u76EE\u89C4\u5212))\n    \u524D\u7AEF\n      \u754C\u9762\u8BBE\u8BA1\n      \u4EA4\u4E92\u903B\u8F91\n    \u540E\u7AEF\n      API \u8BBE\u8BA1\n      \u6570\u636E\u5E93\n    \u6D4B\u8BD5\n      \u5355\u5143\u6D4B\u8BD5\n      \u96C6\u6210\u6D4B\u8BD5\n";
  var $ = function(id) {
    return document.getElementById(id);
  };
  var els = {
    sidebar: $("sidebar"),
    docList: $("doc-list"),
    title: $("doc-title"),
    breadcrumb: $("breadcrumb"),
    langSelect: $("lang-select"),
    editor: $("editor"),
    editorPane: $("editor-pane"),
    visualPane: $("visual-pane"),
    visualToolbar: $("visual-toolbar"),
    visualCanvas: $("visual-canvas"),
    richPane: $("rich-pane"),
    richCanvas: $("rich-canvas"),
    // 富文档大纲（飞书式左侧 TOC）
    richOutline: $("rich-outline"),
    outlineList: $("outline-list"),
    outlineEmpty: $("outline-empty"),
    outlineCount: $("outline-count"),
    outlineSearch: $("outline-search"),
    richOutlineSplitter: $("rich-outline-splitter"),
    btnRichOutline: $("btn-rich-outline"),
    btnCloseOutline: $("btn-close-outline"),
    btnOutlineUp: $("btn-outline-up"),
    btnOutlineDown: $("btn-outline-down"),
    btnOutlineReload: $("btn-outline-reload"),
    outlineFoot: $("outline-foot"),
    toolsWrap: $("tools-wrap"),
    toolsWrap2: $("tools-wrap2"),
    btnFormatXml: $("btn-format-xml"),
    btnFind: $("btn-find"),
    btnEncoding: $("btn-encoding"),
    btnCompare: $("btn-compare"),
    fileTree: $("file-tree"),
    tabDocs: $("tab-docs"),
    tabFiles: $("tab-files"),
    previewPane: $("preview-pane"),
    mermaidOut: $("mermaid-out"),
    splitter: $("pane-splitter"),
    sideSplitter: $("sidebar-splitter"),
    previewEmpty: $("preview-empty"),
    previewTitle: $("preview-title"),
    previewHint: $("preview-hint"),
    mdOut: $("md-out"),
    htmlOut: $("html-out"),
    htmlFrame: $("html-frame"),
    clipList: $("clip-list"),
    snippetList: $("snippet-list"),
    statLang: $("stat-lang"),
    statCount: $("stat-count"),
    statCursor: $("stat-cursor"),
    statSaved: $("stat-saved"),
    statEdit: $("stat-edit"),
    statEnc: $("stat-enc"),
    statEditSep: $("stat-edit-sep"),
    toast: $("toast"),
    fileInput: $("file-input"),
    btnTogglePreview: $("btn-toggle-preview"),
    btnPreviewTop: $("btn-preview-top"),
    btnInsertImage: $("btn-insert-image"),
    btnExpandSidebar: $("btn-toggle-sidebar2"),
    btnSave: $("btn-save"),
    btnSaveAs: $("btn-save-as"),
    imageModal: $("image-modal"),
    imageView: $("image-view"),
    imageStage: $("image-stage"),
    imageName: $("image-name"),
    imgZoomReset: $("img-zoom-reset"),
    imgClose: $("img-close"),
    imgZoomIn: $("img-zoom-in"),
    imgZoomOut: $("img-zoom-out"),
    imgFit: $("img-fit"),
    // 批量管理工具栏
    batchToggle: $("btn-batch-toggle"),
    btnSortToggle: $("btn-sort-toggle"),
    // 文档按时间分组排序开关
    sbBatchBar: $("sbBatchBar"),
    batchSelectAll: $("sbBatchSelectAll"),
    batchCount: $("sbBatchCount"),
    batchExport: $("btn-batch-export"),
    batchDel: $("btn-batch-del"),
    batchExit: $("btn-batch-exit"),
    // 重命名弹窗
    docRenameModal: $("doc-rename-modal"),
    docRenameInput: $("doc-rename-input"),
    docRenameConfirm: $("doc-rename-confirm"),
    docRenameCancel: $("doc-rename-cancel"),
    docRenameClose: $("doc-rename-close"),
    // 批量删除弹窗
    docBatchDelModal: $("doc-batch-del-modal"),
    docBatchDelName: $("doc-batch-del-name"),
    docBatchDelConfirm: $("doc-batch-del-confirm"),
    docBatchDelCancel: $("doc-batch-del-cancel"),
    docBatchDelClose: $("doc-batch-del-close"),
    // 便签模块：标签区
    tagSection: $("sb-tag-section"),
    tagHead: $("sb-tag-head"),
    tagList: $("sb-tag-list"),
    tagCount: $("sb-tag-count"),
    // 便签模块：模态框
    tagEditModal: $("tag-edit-modal"),
    tagEditDocname: $("tag-edit-docname"),
    tagEditChips: $("tag-edit-chips"),
    tagEditEmpty: $("tag-edit-empty"),
    tagEditAllchips: $("tag-edit-allchips"),
    tagEditAllempty: $("tag-edit-allempty"),
    tagEditInput: $("tag-edit-input"),
    stickyEditModal: $("sticky-edit-modal"),
    stickyEditTitle: $("sticky-edit-title"),
    stickyEditContent: $("sticky-edit-content"),
    stickyEditPin: $("sticky-edit-pin"),
    stickyColorRow: $("sticky-color-row"),
    // 定时提醒 / 到期时间
    stickyEditRemEnabled: $("sticky-edit-rem-enabled"),
    stickyRemRow: $("sticky-rem-row"),
    stickyEditRemType: $("sticky-edit-rem-type"),
    stickyEditRemTime: $("sticky-edit-rem-time"),
    stickyEditRemDate: $("sticky-edit-rem-date"),
    stickyEditRemDay: $("sticky-edit-rem-day"),
    stickyRemOnce: $("sticky-rem-once"),
    stickyRemWeekly: $("sticky-rem-weekly"),
    stickyRemMonthly: $("sticky-rem-monthly"),
    stickyEditDue: $("sticky-edit-due"),
    stickyReminderModal: $("sticky-reminder-modal"),
    stickyReminderTitle: $("sticky-reminder-title"),
    stickyReminderContent: $("sticky-reminder-content")
  };
  var bus = {
    _map: {},
    on: function(ev, fn) {
      (this._map[ev] = this._map[ev] || []).push(fn);
      return this;
    },
    off: function(ev, fn) {
      var a = this._map[ev];
      if (a) {
        var i = a.indexOf(fn);
        if (i >= 0) a.splice(i, 1);
      }
      return this;
    },
    emit: function(ev, data) {
      var a = this._map[ev];
      if (a) a.slice().forEach(function(fn) {
        try {
          fn(data);
        } catch (e) {
          console.warn("[inkpad] bus handler error on " + ev, e);
        }
      });
      return this;
    }
  };
  var state = {
    docs: [],
    // 文档列表（索引 + 正文）
    activeId: null,
    // 当前文档 id
    previewOn: false,
    // 预览默认不打开，点工具栏「👁 预览」手动开启
    currentVisual: null,
    // { kind, doc, model, module }
    // UI 瞬态（跨模块赋值的可变变量，见上）
    renderTimer: null,
    // 预览渲染 debounce
    saveTimer: null,
    // 富文档保存 debounce
    mermaidSeq: 0,
    // mermaid 渲染序号（防过期渲染）
    // 批量管理
    batchMode: false,
    // 是否进入批量选择模式
    batchSelected: {},
    // { docId: true } 已选中的文档 id 集合
    docFilter: "recent",
    // 当前侧栏过滤模式：recent / my-space / wiki / favorites / trash / sticky
    sortGroup: false,
    // 文档列表是否按时间分组排序（今天/昨天/本周/更早），默认关闭
    // 便签模块：标签 / 便利贴
    tagFilter: null,
    // 当前标签过滤（null 表示未过滤）
    tagEditDocId: null,
    // 正在编辑标签的文档 id
    stickyEditId: null,
    // 正在编辑的便利贴 id
    stickyColor: "#FFD43B",
    // 便利贴当前选中颜色
    // 定时标签：标签过期时间 / 提醒状态
    tagMeta: {},
    // { [tag]: { expiresAt: ts } } 标签过期时间
    remindedKeys: {},
    // { [key]: true } 已提醒过的提醒 key（避免同一分钟重复）
    reminderTimer: null,
    // 提醒轮询定时器
    reminderSeq: 0
    // 提醒弹窗序号（防止过期渲染）
  };

  // src-app/05-store.js
  var TAGMETA_KEY = "inkpad.tagmeta.v1";
  function loadDocs() {
    var raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
    }
    var had = raw != null;
    try {
      state.docs = JSON.parse(raw) || [];
    } catch (e) {
      state.docs = [];
    }
    if (!Array.isArray(state.docs)) state.docs = [];
    state.docs.forEach(function(d) {
      if (!d || !d.id) return;
      try {
        var c = localStorage.getItem("inkpad.content." + d.id);
        if (c != null) d.content = c;
      } catch (e) {
      }
    });
    state.activeId = null;
    try {
      state.activeId = localStorage.getItem(ACTIVE_KEY);
    } catch (e) {
    }
    if (!state.docs.length && !had) {
      var welcome = {
        id: uid(),
        title: "\u6B22\u8FCE\u4F7F\u7528 L.Note",
        lang: "markdown",
        content: "# \u6B22\u8FCE\u4F7F\u7528 L.Note \u{1F58B}\uFE0F\n\n\u4E00\u4E2A\u7EAF\u672C\u5730\u7684 Notion \u98CE\u6587\u672C\u7F16\u8F91\u5668\u3002\n\n## \u5B83\u80FD\u505A\u4EC0\u4E48\n\n- **\u8BED\u6CD5\u9AD8\u4EAE** \u2014\u2014 \u652F\u6301 Markdown / JSON / XML / JS / Python \u7B49\u5341\u4F59\u79CD\u8BED\u8A00\n- **\u4E00\u952E\u683C\u5F0F\u5316** \u2014\u2014 \u5DE5\u5177\u680F\u70B9 `{ } JSON \u683C\u5F0F\u5316` \u6216 `< / > XML \u683C\u5F0F\u5316`\n- **\u753B\u56FE\u8868** \u2014\u2014 \u65B0\u5EFA\u300C\u56FE\u8868\u6587\u6863\u300D\uFF0C\u7528 Mermaid \u753B\u6D41\u7A0B\u56FE\u3001\u65F6\u5E8F\u56FE\u3001\u601D\u7EF4\u5BFC\u56FE\n- **\u672C\u5730\u5B58\u50A8** \u2014\u2014 \u6240\u6709\u5185\u5BB9\u81EA\u52A8\u4FDD\u5B58\u5728\u6D4F\u89C8\u5668\u91CC\uFF0C\u53EF\u5BFC\u5165\u5BFC\u51FA\n\n## \u5FEB\u6377\u952E\n\n| \u5FEB\u6377\u952E | \u529F\u80FD |\n| --- | --- |\n| `Ctrl + S` | \u4FDD\u5B58 |\n| `Ctrl + Shift + F` | \u6309\u5F53\u524D\u8BED\u8A00\u683C\u5F0F\u5316 |\n",
        updated: Date.now()
      };
      state.docs.push(welcome);
      state.activeId = welcome.id;
      persist();
    }
    if (state.activeId && !state.docs.some(function(d) {
      return d.id === state.activeId && !d.deleted;
    })) {
      var firstAlive = null;
      for (var i = 0; i < state.docs.length; i++) {
        if (!state.docs[i].deleted) {
          firstAlive = state.docs[i];
          break;
        }
      }
      state.activeId = firstAlive ? firstAlive.id : null;
    }
    state.tagMeta = {};
    try {
      var traw = localStorage.getItem(TAGMETA_KEY);
      if (traw) {
        var tparsed = JSON.parse(traw);
        if (tparsed && typeof tparsed === "object") state.tagMeta = tparsed;
      }
    } catch (e) {
      state.tagMeta = {};
    }
  }
  function persist() {
    try {
      var index = state.docs.map(function(d) {
        var o = { id: d.id, title: d.title || "", updated: d.updated || Date.now() };
        if (d.kind) o.kind = d.kind;
        if (d.lang) o.lang = d.lang;
        if (d.diskPath) o.diskPath = d.diskPath;
        if (d.encoding) o.encoding = d.encoding;
        if (d.pinned) o.pinned = true;
        if (d.favorite) o.favorite = true;
        if (d.deleted) {
          o.deleted = true;
          if (d.deletedAt) o.deletedAt = d.deletedAt;
        }
        if (d.tags && d.tags.length) o.tags = d.tags.slice();
        if (d.color) o.color = d.color;
        if (d.reminder && d.reminder.enabled) o.reminder = d.reminder;
        if (d.dueAt) o.dueAt = d.dueAt;
        return o;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(index));
    } catch (e) {
      console.warn("[inkpad] \u7D22\u5F15\u6301\u4E45\u5316\u5931\u8D25", e);
    }
    try {
      localStorage.setItem(TAGMETA_KEY, JSON.stringify(state.tagMeta || {}));
    } catch (e) {
      console.warn("[inkpad] \u6807\u7B7E\u5143\u6570\u636E\u6301\u4E45\u5316\u5931\u8D25", e);
    }
    var seen = {};
    state.docs.forEach(function(d) {
      if (!d.id) return;
      seen[d.id] = true;
      try {
        localStorage.setItem("inkpad.content." + d.id, d.content || "");
      } catch (e) {
      }
    });
    try {
      var toRemove = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("inkpad.content.") === 0) {
          var cid = k.slice("inkpad.content.".length);
          if (!seen[cid]) toRemove.push(k);
        }
      }
      toRemove.forEach(function(k2) {
        try {
          localStorage.removeItem(k2);
        } catch (e) {
        }
      });
    } catch (e) {
    }
    try {
      localStorage.setItem(ACTIVE_KEY, state.activeId || "");
    } catch (e) {
    }
  }
  function uid() {
    return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function activeDoc() {
    for (var i = 0; i < state.docs.length; i++) {
      if (state.docs[i].id === state.activeId) return state.docs[i];
    }
    return null;
  }

  // src-app/13-api-path.js
  var API = null;
  function getApi() {
    if (!API && window.pywebview && window.pywebview.api) {
      API = window.pywebview.api;
    }
    return API;
  }
  function hasApi() {
    return !!getApi();
  }
  window.addEventListener("pywebviewready", function() {
    API = window.pywebview && window.pywebview.api ? window.pywebview.api : API;
  });
  var EXT_LANGS = {
    md: "markdown",
    markdown: "markdown",
    json: "json",
    xml: "xml",
    html: "html",
    htm: "html",
    js: "javascript",
    mjs: "javascript",
    py: "python",
    css: "css",
    sql: "sql",
    yaml: "yaml",
    yml: "yaml",
    sh: "shell",
    bat: "shell",
    c: "clike",
    h: "clike",
    java: "clike",
    cpp: "clike",
    cc: "clike",
    hpp: "clike",
    cs: "clike",
    mmd: "mermaid",
    mermaid: "mermaid",
    txt: "plaintext",
    log: "plaintext"
  };
  var RICH_BLOCK_TYPES = {
    text: 1,
    h1: 1,
    h2: 1,
    h3: 1,
    quote: 1,
    todo: 1,
    code: 1,
    table: 1,
    image: 1,
    mermaid: 1,
    math: 1,
    callout: 1,
    hr: 1,
    cols: 1,
    ulist: 1,
    olist: 1,
    link: 1
  };
  function isRichDocContent(content) {
    if (!content) return false;
    var s = String(content).trim();
    if (s.charAt(0) !== "[" || s.charAt(s.length - 1) !== "]") return false;
    try {
      var arr = JSON.parse(s);
      if (!Array.isArray(arr) || arr.length === 0) return false;
      var first = arr[0];
      if (!first || typeof first !== "object") return false;
      if (typeof first.id !== "string" || !first.id) return false;
      if (typeof first.type !== "string" || !RICH_BLOCK_TYPES[first.type]) return false;
      return true;
    } catch (e) {
      return false;
    }
  }
  var IMG_EXTS = { png: 1, jpg: 1, jpeg: 1, gif: 1, webp: 1, bmp: 1, svg: 1, ico: 1 };
  function isImageExt(name) {
    var m = (name || "").match(/\.([^.]+)$/);
    return !!(m && IMG_EXTS[m[1].toLowerCase()]);
  }
  function dirOf(p) {
    if (!p) return "";
    var i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return i < 0 ? "" : p.slice(0, i);
  }
  function joinPath(base, rel) {
    if (!base) return rel;
    var b = base.replace(/[\\\/]+$/, "");
    var r = rel.replace(/^\.\//, "").replace(/^[\\\/]+/, "");
    return b + "/" + r;
  }
  function normPath(p) {
    return (p || "").replace(/\\/g, "/");
  }
  function isAbsPath(p) {
    return /^[a-z]:[\\\/]/i.test(p) || /^\//.test(p);
  }
  function toFileUrl(p) {
    var s = normPath(p);
    return "file:///" + s.replace(/^\/?/, function(m) {
      return m;
    });
  }
  function resolveImgSrc(src, baseDir) {
    if (!src) return null;
    if (/^(https?:|data:|blob:)/i.test(src)) return null;
    if (isAbsPath(src)) return toFileUrl(src);
    if (baseDir) return toFileUrl(joinPath(baseDir, src));
    return null;
  }

  // src-app/14-filetree-image.js
  var folderState = { root: null, expanded: {}, openFiles: {} };
  function switchSideTab(tab) {
    var docsMode = tab === "docs";
    els.tabDocs.classList.toggle("active", docsMode);
    els.tabFiles.classList.toggle("active", !docsMode);
    els.docList.style.display = docsMode ? "" : "none";
    els.fileTree.style.display = docsMode ? "none" : "";
    if (!docsMode && !folderState.root) renderFileTree();
  }
  function openFolder() {
    if (!hasApi()) {
      toast("\u672C\u5730\u6587\u4EF6\u5939\u529F\u80FD\u9700\u5728\u684C\u9762\u7248\u4E2D\u4F7F\u7528", "error");
      return;
    }
    getApi().pick_folder().then(function(path) {
      if (!path) return;
      folderState.root = path;
      folderState.expanded = {};
      switchSideTab("files");
      renderFileTree();
      toast("\u5DF2\u6253\u5F00\u6587\u4EF6\u5939", "success");
    }).catch(function() {
      toast("\u6253\u5F00\u6587\u4EF6\u5939\u5931\u8D25", "error");
    });
  }
  function renderFileTree() {
    var tree = els.fileTree;
    tree.innerHTML = "";
    if (!folderState.root) {
      tree.innerHTML = '<div class="clip-empty">\u70B9\u51FB\u4E0A\u65B9\u300C\u{1F4C2} \u6253\u5F00\u6587\u4EF6\u5939\u300D<br>\u9009\u62E9\u672C\u5730\u76EE\u5F55</div>';
      return;
    }
    var rootPath = folderState.root;
    var rootOpen = folderState.expanded[rootPath] !== false;
    var rootEl = document.createElement("div");
    rootEl.className = "ft-root";
    rootEl.innerHTML = '<span class="ft-arrow">' + (rootOpen ? "\u25BE" : "\u25B8") + '</span><span class="ft-ico">' + (rootOpen ? "\u{1F4C2}" : "\u{1F4C1}") + '</span><span class="ft-root-name"></span>';
    rootEl.querySelector(".ft-root-name").textContent = rootPath;
    rootEl.title = rootPath + "\n\u70B9\u51FB\u6298\u53E0 / \u5C55\u5F00";
    rootEl.addEventListener("click", function() {
      folderState.expanded[rootPath] = !rootOpen;
      renderFileTree();
    });
    tree.appendChild(rootEl);
    if (!rootOpen) return;
    renderDirInto(rootPath, tree);
  }
  function renderDirInto(dirPath, parentEl) {
    getApi().list_dir(dirPath).then(function(entries) {
      var container = document.createElement("div");
      container.className = "ft-children";
      parentEl.appendChild(container);
      if (entries && entries.error) {
        container.innerHTML = '<div class="clip-empty">' + entries.error + "</div>";
        return;
      }
      (entries || []).forEach(function(item) {
        var row = document.createElement("div");
        if (item.isDir) {
          var open = !!folderState.expanded[item.path];
          row.className = "ft-item ft-dir";
          row.innerHTML = '<span class="ft-arrow">' + (open ? "\u25BE" : "\u25B8") + '</span><span class="ft-ico">' + (open ? "\u{1F4C2}" : "\u{1F4C1}") + '</span><span class="ft-name"></span>';
          row.querySelector(".ft-name").textContent = item.name;
          row.querySelector(".ft-name").title = item.path;
          row.addEventListener("click", function(e) {
            e.stopPropagation();
            if (folderState.expanded[item.path]) delete folderState.expanded[item.path];
            else folderState.expanded[item.path] = true;
            renderFileTree();
          });
          container.appendChild(row);
          if (open) renderDirInto(item.path, container);
        } else {
          var isImg = isImageExt(item.name);
          row.className = "ft-item ft-file" + (isImg ? " is-image" : "");
          row.innerHTML = '<span class="ft-arrow"></span><span class="ft-ico">' + (isImg ? "\u{1F5BC}\uFE0F" : "\u{1F4C4}") + '</span><span class="ft-name"></span><span class="ft-size"></span>';
          row.querySelector(".ft-name").textContent = item.name;
          row.querySelector(".ft-name").title = item.path;
          row.querySelector(".ft-size").textContent = item.size >= 1048576 ? (item.size / 1048576).toFixed(1) + "M" : item.size >= 1024 ? Math.round(item.size / 1024) + "K" : item.size + "B";
          row.addEventListener("click", function() {
            openDiskFile(item.path, item.name);
          });
          container.appendChild(row);
        }
      });
    }).catch(function() {
      var container = document.createElement("div");
      container.className = "ft-children";
      container.innerHTML = '<div class="clip-empty">\u8BFB\u53D6\u5931\u8D25</div>';
      parentEl.appendChild(container);
    });
  }
  function sameFile(a, b) {
    return !!a && !!b && normPath(a).toLowerCase() === normPath(b).toLowerCase();
  }
  function fileKey(p) {
    return normPath(p).toLowerCase();
  }
  function openDiskFile(path, name) {
    if (folderState.openFiles[fileKey(path)]) {
      openDoc(folderState.openFiles[fileKey(path)]);
      return;
    }
    if (isImageExt(name)) {
      openImageFile(path, name);
      return;
    }
    getApi().read_text_file(path).then(function(res) {
      if (!res || res.error) {
        toast("\u8BFB\u53D6\u5931\u8D25\uFF1A" + (res && res.error || "\u672A\u77E5\u9519\u8BEF"), "error");
        return;
      }
      var ext = (name.match(/\.([^.]+)$/) || [])[1] || "";
      if (ext.toLowerCase() === "json" && isRichDocContent(res.content)) {
        var titleFromName = name.replace(/\.[^.]+$/, "");
        var existing = state.docs.find(function(x) {
          return sameFile(x && x.diskPath, path);
        });
        if (existing) {
          existing.content = res.content;
          existing.kind = "rich";
          existing.encoding = res.encoding || "UTF-8";
          existing.updated = Date.now();
          if (!existing.title) existing.title = titleFromName;
          persist();
          folderState.openFiles[fileKey(path)] = existing.id;
          openDoc(existing.id);
          toast("\u5DF2\u6253\u5F00\u5BCC\u6587\u6863\uFF1A" + name, "success");
          return;
        }
        var d2 = {
          id: uid(),
          title: titleFromName,
          kind: "rich",
          encoding: res.encoding || "UTF-8",
          content: res.content,
          diskPath: path,
          updated: Date.now()
        };
        state.docs.push(d2);
        persist();
        folderState.openFiles[fileKey(path)] = d2.id;
        openDoc(d2.id);
        toast("\u5DF2\u6253\u5F00\u5BCC\u6587\u6863\uFF1A" + name, "success");
        return;
      }
      var existing = state.docs.find(function(x) {
        return sameFile(x && x.diskPath, path);
      });
      if (existing) {
        existing.content = res.content;
        existing.encoding = res.encoding || "UTF-8";
        existing.lang = EXT_LANGS[ext.toLowerCase()] || "plaintext";
        existing.updated = Date.now();
        persist();
        folderState.openFiles[fileKey(path)] = existing.id;
        if (existing.lang === "html") state.previewOn = true;
        openDoc(existing.id);
        toast("\u5DF2\u6253\u5F00\uFF1A" + name + "\uFF08\u5DF2\u52A0\u8F7D\u78C1\u76D8\u6700\u65B0\u5185\u5BB9\uFF09", "success");
        return;
      }
      var d = {
        id: uid(),
        title: name,
        kind: "text",
        lang: EXT_LANGS[ext.toLowerCase()] || "plaintext",
        content: res.content,
        encoding: res.encoding || "UTF-8",
        diskPath: path,
        updated: Date.now()
      };
      state.docs.push(d);
      persist();
      folderState.openFiles[fileKey(path)] = d.id;
      if (d.lang === "html") state.previewOn = true;
      openDoc(d.id);
      toast("\u5DF2\u6253\u5F00\uFF1A" + name + "\uFF08" + (res.encoding || "UTF-8") + "\uFF09", "success");
    }).catch(function() {
      toast("\u8BFB\u53D6\u6587\u4EF6\u5931\u8D25", "error");
    });
  }
  function openImageFile(path, name) {
    if (!hasApi()) {
      showImageModal(path, name, toFileUrl(path));
      return;
    }
    getApi().read_file_b64(path).then(function(res) {
      if (res && res.b64) showImageModal(path, name, "data:" + (res.mime || "image/png") + ";base64," + res.b64);
      else if (res && res.error) toast("\u65E0\u6CD5\u9884\u89C8\u56FE\u7247\uFF1A" + res.error, "error");
      else toast("\u56FE\u7247\u8BFB\u53D6\u5931\u8D25", "error");
    }).catch(function() {
      toast("\u56FE\u7247\u8BFB\u53D6\u5931\u8D25", "error");
    });
  }
  function showImageModal(path, name, url) {
    els.imageName.textContent = name || path;
    els.imageView.src = url;
    openSingleModal("image-modal");
    state.imgZoom = 1;
    state.imgPanX = 0;
    state.imgPanY = 0;
    applyImgZoom();
    els.imageView.onload = function() {
      fitImage();
    };
  }
  function closeImageModal() {
    els.imageModal.style.display = "none";
    els.imageView.src = "";
  }
  state.imgZoom = 1;
  state.imgPanX = 0;
  state.imgPanY = 0;
  state.imgDragging = false;
  state.imgLastX = 0;
  state.imgLastY = 0;
  function applyImgZoom() {
    els.imageView.style.transform = "translate(" + state.imgPanX + "px," + state.imgPanY + "px) scale(" + state.imgZoom + ")";
    if (els.imgZoomReset) els.imgZoomReset.textContent = Math.round(state.imgZoom * 100) + "%";
  }
  function fitImage() {
    var img = els.imageView;
    if (!img.naturalWidth) {
      state.imgZoom = 1;
      state.imgPanX = 0;
      state.imgPanY = 0;
      applyImgZoom();
      return;
    }
    var stage = els.imageStage;
    var z = Math.min(stage.clientWidth / img.naturalWidth, stage.clientHeight / img.naturalHeight, 1) * 0.95;
    state.imgZoom = z > 0 ? z : 1;
    state.imgPanX = 0;
    state.imgPanY = 0;
    applyImgZoom();
  }

  // src-app/06-doc-list.js
  function renderList() {
    els.docList.innerHTML = "";
    renderSideSub();
    var filter = state.docFilter || "recent";
    var filtered = state.docs.filter(function(d) {
      if (filter === "trash") return d.deleted;
      if (d.deleted) return false;
      if (filter === "sticky") return d.kind === "sticky";
      if (d.kind === "sticky") return false;
      if (state.tagFilter) {
        return (d.tags || []).indexOf(state.tagFilter) >= 0;
      }
      if (filter === "recent") return true;
      if (filter === "my-space") return true;
      if (filter === "wiki") return d.lang === "markdown" || d.kind === "doc" || !d.lang && !d.kind;
      if (filter === "favorites") return d.favorite;
      return true;
    });
    if (filter === "trash") {
      renderTrashList(filtered);
      return;
    }
    if (filter === "sticky") {
      if (els.batchToggle) els.batchToggle.style.display = "none";
      renderStickyList(filtered);
      return;
    }
    if (els.batchToggle) els.batchToggle.style.display = "";
    var sorted = filtered.slice().sort(function(a, b) {
      var ap = a.pinned ? 1 : 0, bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      if (state.sortGroup) return (b.updated || 0) - (a.updated || 0);
      return 0;
    });
    if (sorted.length === 0) {
      var empty = document.createElement("div");
      empty.className = "doc-item empty-hint";
      empty.style.color = "#86909C";
      empty.style.fontSize = "12px";
      empty.style.padding = "8px 12px";
      var hints = {
        "recent": "\u6682\u65E0\u6587\u6863\uFF0C\u70B9\u51FB\u4E0B\u65B9 + \u65B0\u5EFA",
        "my-space": "\u6682\u65E0\u6587\u6863",
        "wiki": "\u6682\u65E0\u77E5\u8BC6\u5E93\u6587\u6863\uFF08Markdown \u6587\u6863\u4F1A\u663E\u793A\u5728\u6B64\uFF09",
        "favorites": "\u6682\u65E0\u6536\u85CF\u6587\u6863\uFF0C\u53F3\u952E\u6587\u6863\u53EF\u6536\u85CF"
      };
      if (state.tagFilter) {
        empty.textContent = "\u6682\u65E0\u300C#" + state.tagFilter + "\u300D\u6807\u7B7E\u7684\u6587\u6863";
      } else {
        empty.textContent = hints[filter] || "\u6682\u65E0\u6587\u6863";
      }
      els.docList.appendChild(empty);
      return;
    }
    var pinnedDocs = sorted.filter(function(d) {
      return d.pinned;
    });
    if (pinnedDocs.length > 0) {
      var pinnedLabel = document.createElement("div");
      pinnedLabel.className = "doc-group-label";
      pinnedLabel.textContent = "\u7F6E\u9876";
      els.docList.appendChild(pinnedLabel);
      pinnedDocs.forEach(function(d) {
        els.docList.appendChild(createDocItem(d));
      });
    }
    if (!state.sortGroup) {
      sorted.forEach(function(d) {
        if (d.pinned) return;
        els.docList.appendChild(createDocItem(d));
      });
      refreshBatchCount();
      return;
    }
    var groups = { "\u4ECA\u5929": [], "\u6628\u5929": [], "\u672C\u5468": [], "\u66F4\u65E9": [] };
    var now = /* @__PURE__ */ new Date();
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var yesterdayStart = todayStart - 864e5;
    var weekStart = todayStart - now.getDay() * 864e5;
    sorted.forEach(function(d) {
      if (d.pinned) return;
      var ts = d.updated || 0;
      if (ts >= todayStart) {
        groups["\u4ECA\u5929"].push(d);
      } else if (ts >= yesterdayStart) {
        groups["\u6628\u5929"].push(d);
      } else if (ts >= weekStart) {
        groups["\u672C\u5468"].push(d);
      } else {
        groups["\u66F4\u65E9"].push(d);
      }
    });
    var groupOrder = ["\u4ECA\u5929", "\u6628\u5929", "\u672C\u5468", "\u66F4\u65E9"];
    groupOrder.forEach(function(label) {
      var docs = groups[label];
      if (docs.length === 0) return;
      var labelEl = document.createElement("div");
      labelEl.className = "doc-group-label";
      labelEl.textContent = label;
      els.docList.appendChild(labelEl);
      docs.forEach(function(d) {
        els.docList.appendChild(createDocItem(d));
      });
    });
    refreshBatchCount();
  }
  var SORT_KEY = "inkpad.sortgroup";
  function syncSortButton() {
    try {
      var v = localStorage.getItem(SORT_KEY);
      state.sortGroup = v === "1";
    } catch (e) {
      state.sortGroup = false;
    }
    if (els.btnSortToggle) els.btnSortToggle.classList.toggle("active", !!state.sortGroup);
  }
  function toggleSortGroup() {
    state.sortGroup = !state.sortGroup;
    try {
      localStorage.setItem(SORT_KEY, state.sortGroup ? "1" : "0");
    } catch (e) {
    }
    if (els.btnSortToggle) els.btnSortToggle.classList.toggle("active", !!state.sortGroup);
    renderList();
    toast(state.sortGroup ? "\u5DF2\u5F00\u542F\u6309\u6700\u8FD1\u4F7F\u7528\u6392\u5E8F\uFF08\u65F6\u95F4\u5206\u7EC4\uFF09" : "\u5DF2\u5173\u95ED\u6392\u5E8F\uFF0C\u5217\u8868\u4FDD\u6301\u521B\u5EFA\u987A\u5E8F", "success");
  }
  function createDocItem(d) {
    var item = document.createElement("div");
    item.className = "doc-item" + (d.id === state.activeId ? " active" : "") + (state.batchMode ? " batch-mode" : "");
    item.dataset.docId = d.id;
    item.dataset.docPath = d.diskPath || "";
    var batchChk = state.batchMode ? '<label class="doc-batch-check" title="\u9009\u62E9"><input type="checkbox" ' + (state.batchSelected[d.id] ? "checked" : "") + "></label>" : "";
    var badgeFavorite = d.favorite ? '<span class="doc-badge doc-fav" title="\u5DF2\u6536\u85CF">\u2605</span>' : "";
    var badgePinned = d.pinned ? '<span class="doc-badge doc-pin" title="\u5DF2\u7F6E\u9876">\u{1F4CC}</span>' : "";
    var threeDotBtn = state.batchMode ? "" : '<button class="doc-more-btn" title="\u66F4\u591A\u64CD\u4F5C"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg></button>';
    item.innerHTML = batchChk + '<span class="doc-emoji">' + docIcon(d) + '</span><span class="doc-mid"><span class="doc-name-wrap">' + badgePinned + badgeFavorite + '<span class="doc-name"></span></span><span class="doc-time">' + shortTime(d.updated) + "</span>" + (d.tags && d.tags.length ? '<span class="doc-tags">' + d.tags.map(function(t) {
      return '<span class="doc-tag" data-tag="' + encodeURIComponent(t) + '">#' + escapeHtml(t) + "</span>";
    }).join("") + "</span>" : "") + "</span>" + threeDotBtn;
    item.querySelector(".doc-name").textContent = d.title || "\u65E0\u6807\u9898";
    var tagEls = item.querySelectorAll(".doc-tag");
    Array.prototype.forEach.call(tagEls, function(te) {
      te.addEventListener("click", function(e) {
        e.stopPropagation();
        var t = te.getAttribute("data-tag");
        t = t ? decodeURIComponent(t) : t;
        state.tagFilter = t;
        state.docFilter = "recent";
        markNavClean();
        renderList();
      });
    });
    item.addEventListener("click", function(e) {
      if (e.target.closest(".doc-more-btn") || e.target.closest(".doc-menu") || e.target.closest(".doc-batch-check")) {
        return;
      }
      if (state.batchMode) {
        var cb = item.querySelector(".doc-batch-check input");
        if (cb) {
          cb.checked = !cb.checked;
          state.batchSelected[d.id] = cb.checked ? true : false;
          refreshBatchCount();
        }
      } else {
        openDoc(d.id);
      }
    });
    if (state.batchMode) {
      var cb2 = item.querySelector(".doc-batch-check input");
      if (cb2) {
        cb2.addEventListener("click", function(e) {
          e.stopPropagation();
          state.batchSelected[d.id] = cb2.checked ? true : false;
          refreshBatchCount();
        });
      }
    }
    var moreBtn = item.querySelector(".doc-more-btn");
    if (moreBtn) {
      moreBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        closeDocMenu();
        openDocMenu(item, d);
      });
    }
    return item;
  }
  var _openMenu = null;
  function closeDocMenu() {
    if (_openMenu) {
      try {
        _openMenu.parentNode.removeChild(_openMenu);
      } catch (e) {
      }
      _openMenu = null;
    }
  }
  document.addEventListener("click", function(e) {
    if (!_openMenu) return;
    if (e.target.closest(".doc-menu") || e.target.closest(".doc-more-btn")) return;
    closeDocMenu();
  });
  function openDocMenu(itemEl, d) {
    var menu = document.createElement("div");
    menu.className = "doc-menu";
    menu.innerHTML = '<div class="doc-menu-item" data-cmd="duplicate"><svg viewBox="0 0 24 24"><path d="M8 4h8a2 2 0 0 1 2 2v8M16 8H8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>\u521B\u5EFA\u526F\u672C</span></div><div class="doc-menu-item" data-cmd="rename"><svg viewBox="0 0 24 24"><path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>\u91CD\u547D\u540D</span></div><div class="doc-menu-divider"></div><div class="doc-menu-item" data-cmd="' + (d.favorite ? "unfavorite" : "favorite") + '"><svg viewBox="0 0 24 24"><path d="M12 17.3l-6.18 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73 1.64 7.03z" stroke="currentColor" stroke-width="1.6" fill="' + (d.favorite ? "currentColor" : "none") + '" stroke-linecap="round" stroke-linejoin="round"/></svg><span>' + (d.favorite ? "\u53D6\u6D88\u6536\u85CF" : "\u6536\u85CF") + '</span></div><div class="doc-menu-item" data-cmd="' + (d.pinned ? "unpin" : "pin") + '"><svg viewBox="0 0 24 24"><path d="M6 4h12M12 4v6m-5 0h10l-2 6h-6l-2-6zM12 16v5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>' + (d.pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u6DFB\u52A0\u5230\u7F6E\u9876") + '</span></div><div class="doc-menu-divider"></div><div class="doc-menu-item" data-cmd="tag"><svg viewBox="0 0 24 24"><path d="M20 12l-8 8-8-8V4h8l8 8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg><span>\u7F16\u8F91\u6807\u7B7E</span></div><div class="doc-menu-divider"></div><div class="doc-menu-item" data-cmd="export"><svg viewBox="0 0 24 24"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>\u5BFC\u51FA</span></div><div class="doc-menu-item doc-menu-danger" data-cmd="delete"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>\u5220\u9664</span></div>';
    document.body.appendChild(menu);
    var rect = itemEl.getBoundingClientRect();
    var sb = els.sidebar.getBoundingClientRect();
    var mw = 180, mh = menu.offsetHeight;
    var top = rect.top;
    var left = rect.right - mw - 2;
    if (left < sb.left + 4) left = sb.left + 4;
    if (top + mh > window.innerHeight) top = Math.max(sb.top, rect.bottom - mh);
    menu.style.top = top + "px";
    menu.style.left = left + "px";
    _openMenu = menu;
    menu.querySelectorAll(".doc-menu-item").forEach(function(mi) {
      mi.addEventListener("click", function() {
        var cmd = mi.getAttribute("data-cmd");
        closeDocMenu();
        handleDocCmd(cmd, d);
      });
    });
  }
  function handleDocCmd(cmd, d) {
    switch (cmd) {
      case "duplicate":
        var cp = duplicateDoc(d.id);
        bus.emit("docs:changed");
        toast("\u5DF2\u521B\u5EFA\u526F\u672C\uFF1A" + (cp ? cp.title || "\u65E0\u6807\u9898" : ""), "success");
        break;
      case "rename":
        renameDocId = d.id;
        if (els.docRenameInput) els.docRenameInput.value = d.title || "";
        openSingleModal("doc-rename-modal");
        setTimeout(function() {
          if (els.docRenameInput) els.docRenameInput.focus();
        }, 100);
        break;
      case "favorite":
        toggleFavorite(d.id);
        bus.emit("docs:changed");
        toast("\u5DF2\u6536\u85CF", "success");
        break;
      case "unfavorite":
        toggleFavorite(d.id);
        bus.emit("docs:changed");
        toast("\u5DF2\u53D6\u6D88\u6536\u85CF", "success");
        break;
      case "pin":
        togglePin(d.id);
        bus.emit("docs:changed");
        toast("\u5DF2\u7F6E\u9876", "success");
        break;
      case "unpin":
        togglePin(d.id);
        bus.emit("docs:changed");
        toast("\u5DF2\u53D6\u6D88\u7F6E\u9876", "success");
        break;
      case "export":
        exportDocById(d.id);
        break;
      case "tag":
        openTagEditModal(d.id);
        break;
      case "delete":
        openDocDelConfirm(d.id);
        break;
    }
  }
  var renameDocId = null;
  function renderTrashList(trashedDocs) {
    var sorted = trashedDocs.slice().sort(function(a, b) {
      return (b.deletedAt || 0) - (a.deletedAt || 0);
    });
    if (sorted.length === 0) {
      var empty = document.createElement("div");
      empty.className = "doc-item empty-hint";
      empty.style.color = "#86909C";
      empty.style.fontSize = "12px";
      empty.style.padding = "8px 12px";
      empty.textContent = "\u56DE\u6536\u7AD9\u4E3A\u7A7A";
      els.docList.appendChild(empty);
      return;
    }
    sorted.forEach(function(d) {
      var item = document.createElement("div");
      item.className = "doc-item trash-item" + (state.batchMode ? " batch-mode" : "");
      item.dataset.docId = d.id;
      var icon = docIcon(d);
      var title = d.title || "\u65E0\u6807\u9898";
      var delTime = d.deletedAt ? fullTime(d.deletedAt) : "";
      var batchChk = state.batchMode ? '<label class="doc-batch-check" title="\u9009\u62E9"><input type="checkbox" ' + (state.batchSelected[d.id] ? "checked" : "") + "></label>" : "";
      var moreBtn = state.batchMode ? "" : '<button class="trash-more" title="\u66F4\u591A\u64CD\u4F5C"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg></button>';
      item.innerHTML = batchChk + '<span class="doc-icon">' + icon + '</span><div class="doc-info"><div class="doc-title-row"><span class="doc-title">' + escapeHtml(title) + '</span></div><div class="doc-meta-row"><span class="doc-time">\u5220\u9664\u4E8E ' + delTime + "</span></div></div>" + moreBtn;
      item.addEventListener("click", function(e) {
        if (e.target.closest(".trash-more") || e.target.closest(".doc-menu") || e.target.closest(".doc-batch-check")) return;
        if (state.batchMode) {
          var cb = item.querySelector(".doc-batch-check input");
          if (cb) {
            cb.checked = !cb.checked;
            state.batchSelected[d.id] = cb.checked ? true : false;
            refreshBatchCount();
          }
        }
      });
      if (state.batchMode) {
        var cb2 = item.querySelector(".doc-batch-check input");
        if (cb2) {
          cb2.addEventListener("click", function(e) {
            e.stopPropagation();
            state.batchSelected[d.id] = cb2.checked ? true : false;
            refreshBatchCount();
          });
        }
      }
      if (!state.batchMode) {
        item.querySelector(".trash-more").addEventListener("click", function(e) {
          e.stopPropagation();
          openTrashMenu(this, d);
        });
      }
      els.docList.appendChild(item);
    });
    if (state.batchMode) refreshBatchCount();
  }
  var _trashMenu = null;
  function openTrashMenu(btnEl, d) {
    closeTrashMenu();
    var menu = document.createElement("div");
    menu.className = "doc-menu";
    menu.innerHTML = '<div class="doc-menu-item" data-cmd="restore"><svg viewBox="0 0 24 24"><path d="M4 9h13a4 4 0 0 1 0 8H9" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 6l-4 3 4 3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>\u6062\u590D</span></div><div class="doc-menu-divider"></div><div class="doc-menu-item doc-menu-danger" data-cmd="destroy"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>\u5F7B\u5E95\u5220\u9664</span></div>';
    document.body.appendChild(menu);
    var r = btnEl.getBoundingClientRect();
    var mw = menu.offsetWidth || 184;
    var mh = menu.offsetHeight;
    var left = Math.min(Math.max(8, r.right - mw), window.innerWidth - mw - 8);
    var top = r.bottom + mh + 8 > window.innerHeight ? Math.max(8, r.top - mh - 8) : r.bottom + 4;
    menu.style.top = top + "px";
    menu.style.left = left + "px";
    _trashMenu = menu;
    menu.querySelectorAll(".doc-menu-item").forEach(function(mi) {
      mi.addEventListener("click", function() {
        var cmd = mi.getAttribute("data-cmd");
        closeTrashMenu();
        if (cmd === "restore") {
          restoreDoc(d.id);
        } else if (cmd === "destroy") {
          destroyDoc(d.id);
        }
      });
    });
  }
  function closeTrashMenu() {
    if (_trashMenu) {
      try {
        _trashMenu.parentNode.removeChild(_trashMenu);
      } catch (e) {
      }
      _trashMenu = null;
    }
  }
  document.addEventListener("click", function(e) {
    if (!_trashMenu) return;
    if (e.target.closest(".doc-menu")) return;
    closeTrashMenu();
  });
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function restoreDoc(id) {
    var d = state.docs.find(function(x) {
      return x.id === id;
    });
    if (!d) return;
    d.deleted = false;
    d.deletedAt = null;
    d.updated = Date.now();
    persist();
    renderList();
    toast("\u5DF2\u6062\u590D\uFF1A" + (d.title || "\u65E0\u6807\u9898"), "success");
  }
  function destroyDoc(id) {
    var idx = -1;
    for (var i = 0; i < state.docs.length; i++) {
      if (state.docs[i].id === id) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    var removed = state.docs[idx];
    if (removed.diskPath && folderState.openFiles) {
      for (var p in folderState.openFiles) {
        if (folderState.openFiles[p] === id) delete folderState.openFiles[p];
      }
    }
    state.docs.splice(idx, 1);
    if (removed.id) {
      try {
        localStorage.removeItem("inkpad.content." + removed.id);
      } catch (e) {
      }
    }
    persist();
    renderList();
    toast("\u5DF2\u5F7B\u5E95\u5220\u9664\uFF1A" + (removed.title || "\u65E0\u6807\u9898"));
  }
  var pendingDelId = null;
  function openDocDelConfirm(id) {
    var d = null;
    for (var i = 0; i < state.docs.length; i++) {
      if (state.docs[i].id === id) {
        d = state.docs[i];
        break;
      }
    }
    if (!d) return;
    pendingDelId = id;
    var name = d.title || "\u65E0\u6807\u9898";
    var foot = $("doc-del-foot");
    if (d.kind === "sticky") {
      if (foot) foot.textContent = "\u4FBF\u5229\u8D34\u5C06\u79FB\u5165\u56DE\u6536\u7AD9\uFF0C\u53EF\u5728\u5DE6\u4FA7\u300C\u56DE\u6536\u7AD9\u300D\u4E2D\u6062\u590D\u6216\u5F7B\u5E95\u5220\u9664\u3002";
    } else {
      if (d.diskPath) name += "\uFF08\u78C1\u76D8\u6587\u4EF6\uFF09";
      if (foot) foot.textContent = "\u6587\u6863\u5C06\u79FB\u5165\u56DE\u6536\u7AD9\uFF0C\u53EF\u5728\u5DE6\u4FA7\u300C\u56DE\u6536\u7AD9\u300D\u4E2D\u6062\u590D\u6216\u5F7B\u5E95\u5220\u9664\u3002";
    }
    $("doc-del-name").textContent = name;
    openSingleModal("doc-del-modal");
  }
  function closeDocDelConfirm() {
    pendingDelId = null;
    $("doc-del-modal").style.display = "none";
  }
  function deleteDoc(id) {
    var idx = -1;
    for (var i = 0; i < state.docs.length; i++) {
      if (state.docs[i].id === id) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    var d = state.docs[idx];
    if (d.diskPath && folderState.openFiles) {
      for (var p in folderState.openFiles) {
        if (folderState.openFiles[p] === id) delete folderState.openFiles[p];
      }
    }
    d.deleted = true;
    d.deletedAt = Date.now();
    if (state.batchSelected && state.batchSelected[id]) delete state.batchSelected[id];
    if (state.activeId === id) {
      var nextDoc = null;
      for (var j = 0; j < state.docs.length; j++) {
        if (state.docs[j].id !== id && !state.docs[j].deleted) {
          nextDoc = state.docs[j];
          break;
        }
      }
      state.activeId = nextDoc ? nextDoc.id : null;
    }
    persist();
    bus.emit("docs:changed");
    if (state.activeId) {
      openDoc(state.activeId);
    } else {
      els.title.value = "";
      els.statEdit.textContent = "";
      els.statEnc.textContent = "";
      els.statEditSep.style.display = "none";
      if (cm) {
        cm.setValue("");
      }
      els.breadcrumb.textContent = "\u{1F4DD}";
    }
    renderList();
    toast("\u5DF2\u79FB\u5165\u56DE\u6536\u7AD9\uFF1A" + (d.title || "\u65E0\u6807\u9898"));
  }
  function getBatchSelectedIds() {
    var ids = [];
    for (var k in state.batchSelected) {
      if (state.batchSelected[k]) ids.push(k);
    }
    return ids;
  }
  function toggleBatchMode(on) {
    state.batchMode = on === false ? false : on === true ? true : !state.batchMode;
    if (!state.batchMode) {
      state.batchSelected = {};
    }
    if (els.batchToggle) els.batchToggle.style.display = state.batchMode ? "none" : "";
    if (els.sbBatchBar) els.sbBatchBar.style.display = state.batchMode ? "" : "none";
    if (els.batchSelectAll) els.batchSelectAll.checked = false;
    if (els.batchExport) els.batchExport.style.display = state.docFilter === "trash" ? "none" : "";
    renderList();
  }
  function currentViewDocs() {
    return (state.docs || []).filter(function(d) {
      if (state.docFilter === "trash") return !!d.deleted;
      if (state.docFilter === "sticky") return d.kind === "sticky";
      return !d.deleted;
    });
  }
  function refreshBatchCount() {
    var ids = getBatchSelectedIds();
    if (els.batchCount) els.batchCount.textContent = "\u5DF2\u9009 " + ids.length + " \u9879";
    if (els.batchSelectAll) {
      var viewDocs = currentViewDocs();
      var selInView = viewDocs.filter(function(d) {
        return state.batchSelected[d.id];
      }).length;
      els.batchSelectAll.checked = viewDocs.length > 0 && selInView === viewDocs.length;
      els.batchSelectAll.indeterminate = selInView > 0 && selInView < viewDocs.length;
    }
  }
  function batchDelete(ids) {
    if (!ids || ids.length === 0) {
      toast("\u8BF7\u5148\u9009\u62E9\u8981\u5220\u9664\u7684\u6587\u6863", "error");
      return 0;
    }
    var count = 0;
    ids.forEach(function(id) {
      var idx = -1;
      for (var i = 0; i < state.docs.length; i++) {
        if (state.docs[i].id === id) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return;
      var d = state.docs[idx];
      if (d.diskPath && folderState.openFiles) {
        for (var p in folderState.openFiles) {
          if (folderState.openFiles[p] === id) delete folderState.openFiles[p];
        }
      }
      d.deleted = true;
      d.deletedAt = Date.now();
      if (state.batchSelected[id]) delete state.batchSelected[id];
      count++;
    });
    if (state.activeId && !state.docs.some(function(d) {
      return d.id === state.activeId && !d.deleted;
    })) {
      var nextDoc = null;
      for (var j = 0; j < state.docs.length; j++) {
        if (!state.docs[j].deleted) {
          nextDoc = state.docs[j];
          break;
        }
      }
      state.activeId = nextDoc ? nextDoc.id : null;
    }
    persist();
    bus.emit("docs:changed");
    if (state.activeId) {
      openDoc(state.activeId);
    } else {
      els.title.value = "";
      els.statEdit.textContent = "";
      els.statEnc.textContent = "";
      els.statEditSep.style.display = "none";
      if (cm) {
        cm.setValue("");
      }
      els.breadcrumb.textContent = "\u{1F4DD}";
    }
    return count;
  }
  function batchDestroy(ids) {
    if (!ids || ids.length === 0) {
      toast("\u8BF7\u5148\u9009\u62E9\u8981\u5F7B\u5E95\u5220\u9664\u7684\u6587\u6863", "error");
      return 0;
    }
    var count = 0;
    ids.forEach(function(id) {
      var idx = -1;
      for (var i = 0; i < state.docs.length; i++) {
        if (state.docs[i].id === id) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return;
      var removed = state.docs[idx];
      if (removed.diskPath && folderState.openFiles) {
        for (var p in folderState.openFiles) {
          if (folderState.openFiles[p] === id) delete folderState.openFiles[p];
        }
      }
      state.docs.splice(idx, 1);
      if (removed.id) {
        try {
          localStorage.removeItem("inkpad.content." + removed.id);
        } catch (e) {
        }
      }
      if (state.batchSelected[id]) delete state.batchSelected[id];
      count++;
    });
    persist();
    bus.emit("docs:changed");
    renderList();
    return count;
  }
  function batchExport(ids) {
    if (!ids || ids.length === 0) {
      toast("\u8BF7\u5148\u9009\u62E9\u8981\u5BFC\u51FA\u7684\u6587\u6863", "error");
      return 0;
    }
    var count = 0;
    ids.forEach(function(id) {
      try {
        exportDocById(id);
        count++;
      } catch (e) {
        console.warn(e);
      }
    });
    if (count > 0) toast("\u6279\u91CF\u5BFC\u51FA\u5B8C\u6210\uFF1A\u5171 " + count + " \u9879", "success");
    return count;
  }
  function shortTime(ts) {
    var diff = Date.now() - ts;
    if (diff < 6e4) return "\u521A\u521A";
    if (diff < 36e5) return Math.floor(diff / 6e4) + "\u5206\u949F\u524D";
    if (diff < 864e5) return Math.floor(diff / 36e5) + "\u5C0F\u65F6\u524D";
    var dt = new Date(ts);
    return dt.getMonth() + 1 + "/" + dt.getDate();
  }
  function fullTime(ts) {
    var dt = new Date(ts);
    function pad(n) {
      return (n < 10 ? "0" : "") + n;
    }
    return dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate()) + " " + pad(dt.getHours()) + ":" + pad(dt.getMinutes());
  }
  function markNavClean() {
    ["nav-recent", "nav-my-space", "nav-wiki", "nav-favorites", "nav-trash", "nav-sticky", "tab-docs", "tab-files"].forEach(function(n) {
      var el = document.getElementById(n);
      if (el) el.classList.remove("active");
    });
  }
  function renderSideSub() {
    if (!els.tagList) return;
    cleanupExpiredTags();
    var tagMap = collectAllTags();
    var tagNames = Object.keys(tagMap);
    els.tagList.innerHTML = "";
    if (tagNames.length) {
      tagNames.sort(function(a, b) {
        return tagMap[b] - tagMap[a] || a.localeCompare(b);
      });
      tagNames.forEach(function(t) {
        var it = document.createElement("div");
        var meta = state.tagMeta[t];
        var expMark = meta && meta.expiresAt ? ' <span class="sb-tag-exp" title="\u5230\u671F ' + fmtStamp(meta.expiresAt) + '">\u23F3</span>' : "";
        it.className = "sb-tag-item" + (state.tagFilter === t ? " active" : "");
        it.innerHTML = '<span class="sb-tag-name"><span class="sb-tag-hash">#</span>' + escapeHtml(t) + expMark + '</span><span class="sb-tag-num">' + tagMap[t] + "</span>";
        it.addEventListener("click", function() {
          state.tagFilter = state.tagFilter === t ? null : t;
          state.docFilter = "recent";
          markNavClean();
          renderList();
        });
        it.addEventListener("contextmenu", function(e) {
          e.preventDefault();
          e.stopPropagation();
          openTagMenu(it, t, meta);
        });
        els.tagList.appendChild(it);
      });
    } else {
      var te = document.createElement("div");
      te.className = "sb-sub-empty";
      te.textContent = "\u6682\u65E0\u6807\u7B7E";
      els.tagList.appendChild(te);
    }
    if (els.tagCount) els.tagCount.textContent = tagNames.length ? String(tagNames.length) : "";
  }
  var _tagMenu = null;
  function openTagMenu(itemEl, tag, meta) {
    closeTagMenu();
    var menu = document.createElement("div");
    menu.className = "doc-menu";
    menu.innerHTML = '<div class="doc-menu-item" data-cmd="setexp"><svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 9v4l2.5 2.5M9 3h6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg><span>\u8BBE\u7F6E\u8FC7\u671F\u65F6\u95F4</span></div>' + (meta && meta.expiresAt ? '<div class="doc-menu-item" data-cmd="clearexp"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>\u6E05\u9664\u8FC7\u671F\u65F6\u95F4</span></div>' : "");
    if (!menu.innerHTML.trim()) {
      menu.innerHTML = '<div class="doc-menu-item" data-cmd="setexp"><span>\u8BBE\u7F6E\u8FC7\u671F\u65F6\u95F4</span></div>';
    }
    document.body.appendChild(menu);
    var rect = itemEl.getBoundingClientRect();
    menu.style.top = rect.bottom + "px";
    menu.style.left = Math.max(8, rect.left) + "px";
    _tagMenu = menu;
    menu.querySelectorAll(".doc-menu-item").forEach(function(mi) {
      mi.addEventListener("click", function() {
        var cmd = mi.getAttribute("data-cmd");
        closeTagMenu();
        if (cmd === "setexp") {
          var cur = meta && meta.expiresAt ? Math.max(1, Math.round((meta.expiresAt - Date.now()) / 864e5)) : "";
          var days = prompt("\u6807\u7B7E #" + tag + " \u591A\u5C11\u5929\u540E\u8FC7\u671F\uFF1F\uFF08\u8F93\u5165\u6570\u5B57\u5929\u6570\uFF09", cur);
          if (days == null) return;
          setTagExpiry(tag, days);
          renderSideSub();
          renderList();
        } else if (cmd === "clearexp") {
          clearTagExpiry(tag);
          renderSideSub();
          renderList();
        }
      });
    });
  }
  function closeTagMenu() {
    if (_tagMenu) {
      try {
        _tagMenu.parentNode.removeChild(_tagMenu);
      } catch (e) {
      }
      _tagMenu = null;
    }
  }
  document.addEventListener("click", function(e) {
    if (!_tagMenu) return;
    if (e.target.closest(".doc-menu")) return;
    closeTagMenu();
  });
  function remText(rem) {
    if (!rem || !rem.enabled) return "";
    var t = rem.time || "";
    if (rem.type === "once") return (rem.date || "") + " " + t;
    if (rem.type === "daily") return "\u6BCF\u5929 " + t;
    if (rem.type === "weekly") {
      var names = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"];
      var ds = (rem.days || []).slice().sort();
      return "\u6BCF\u5468" + ds.map(function(d) {
        return "\u5468" + names[d];
      }).join("\u3001") + " " + t;
    }
    if (rem.type === "monthly") return "\u6BCF\u6708" + (rem.day || "?") + "\u65E5 " + t;
    return t;
  }
  function renderStickyList(stickies) {
    var sorted = stickies.slice().sort(function(a, b) {
      var ap = a.pinned ? 1 : 0, bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return (b.updated || 0) - (a.updated || 0);
    });
    if (sorted.length === 0) {
      var empty = document.createElement("div");
      empty.className = "doc-item empty-hint";
      empty.style.color = "#86909C";
      empty.style.fontSize = "12px";
      empty.style.padding = "8px 12px";
      empty.textContent = "\u8FD8\u6CA1\u6709\u4FBF\u5229\u8D34\uFF0C\u70B9\u51FB\u4E0B\u65B9 + \u65B0\u5EFA";
      els.docList.appendChild(empty);
      return;
    }
    sorted.forEach(function(d) {
      var item = document.createElement("div");
      item.className = "sticky-card" + (d.pinned ? " pinned" : "");
      item.style.background = d.color || "#FFD43B";
      item.dataset.docId = d.id;
      var title = d.title || "\u65E0\u6807\u9898";
      var content = (d.content || "").replace(/\n/g, " ").slice(0, 60);
      var statusHtml = "";
      if (d.reminder && d.reminder.enabled) {
        statusHtml += '<span class="sticky-card-rem" title="\u5B9A\u65F6\u63D0\u9192">\u23F0 ' + remText(d.reminder) + "</span>";
      }
      if (d.dueAt) {
        var nowTs = Date.now();
        if (d.dueAt < nowTs) statusHtml += '<span class="sticky-card-due overdue" title="\u5DF2\u5230\u671F">\u5DF2\u5230\u671F</span>';
        else if (d.dueAt - nowTs < 864e5) statusHtml += '<span class="sticky-card-due near" title="\u5373\u5C06\u5230\u671F">\u5373\u5C06\u5230\u671F</span>';
        else statusHtml += '<span class="sticky-card-due" title="\u5230\u671F\u65F6\u95F4">' + fmtStamp(d.dueAt) + "</span>";
      }
      item.innerHTML = '<div class="sticky-card-head">' + (d.pinned ? '<span class="sticky-pin-badge" title="\u5DF2\u7F6E\u9876">\u{1F4CC}</span>' : "") + '<span class="sticky-card-title">' + escapeHtml(title) + "</span></div>" + (content ? '<div class="sticky-card-content">' + escapeHtml(content) + "</div>" : "") + (statusHtml ? '<div class="sticky-card-status">' + statusHtml + "</div>" : "") + '<div class="sticky-card-foot"><span class="sticky-card-time">' + shortTime(d.updated) + '</span><button class="sticky-card-more" title="\u66F4\u591A\u64CD\u4F5C"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg></button></div>';
      item.addEventListener("click", function(e) {
        if (e.target.closest(".sticky-card-more") || e.target.closest(".doc-menu")) return;
        openStickyEditModal(d.id);
      });
      item.querySelector(".sticky-card-more").addEventListener("click", function(e) {
        e.stopPropagation();
        openStickyMenu(this, d);
      });
      els.docList.appendChild(item);
    });
  }
  var _stickyMenu = null;
  function openStickyMenu(btnEl, d) {
    closeStickyMenu();
    var menu = document.createElement("div");
    menu.className = "doc-menu";
    menu.innerHTML = '<div class="doc-menu-item" data-cmd="edit"><svg viewBox="0 0 24 24"><path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>\u7F16\u8F91</span></div><div class="doc-menu-item" data-cmd="' + (d.pinned ? "unpin" : "pin") + '"><svg viewBox="0 0 24 24"><path d="M6 4h12M12 4v6m-5 0h10l-2 6h-6l-2-6zM12 16v5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>' + (d.pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876") + '</span></div><div class="doc-menu-divider"></div><div class="doc-menu-item doc-menu-danger" data-cmd="delete"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>\u5220\u9664</span></div>';
    document.body.appendChild(menu);
    var r = btnEl.getBoundingClientRect();
    var mw = menu.offsetWidth || 184;
    var mh = menu.offsetHeight;
    var left = Math.min(Math.max(8, r.right - mw), window.innerWidth - mw - 8);
    var top = r.bottom + mh + 8 > window.innerHeight ? Math.max(8, r.top - mh - 8) : r.bottom + 4;
    menu.style.top = top + "px";
    menu.style.left = left + "px";
    _stickyMenu = menu;
    menu.querySelectorAll(".doc-menu-item").forEach(function(mi) {
      mi.addEventListener("click", function() {
        var cmd = mi.getAttribute("data-cmd");
        closeStickyMenu();
        if (cmd === "edit") {
          openStickyEditModal(d.id);
        } else if (cmd === "pin") {
          togglePin(d.id);
          renderStickyList(state.docs.filter(function(x) {
            return !x.deleted && x.kind === "sticky";
          }));
        } else if (cmd === "unpin") {
          togglePin(d.id);
          renderStickyList(state.docs.filter(function(x) {
            return !x.deleted && x.kind === "sticky";
          }));
        } else if (cmd === "delete") {
          openDocDelConfirm(d.id);
        }
      });
    });
  }
  function closeStickyMenu() {
    if (_stickyMenu) {
      try {
        _stickyMenu.parentNode.removeChild(_stickyMenu);
      } catch (e) {
      }
      _stickyMenu = null;
    }
  }
  document.addEventListener("click", function(e) {
    if (!_stickyMenu) return;
    if (e.target.closest(".doc-menu")) return;
    closeStickyMenu();
  });
  function openTagEditModal(docId) {
    var d = findDoc(docId);
    if (!d) return;
    state.tagEditDocId = docId;
    if (els.tagEditDocname) els.tagEditDocname.textContent = "\u6587\u6863\uFF1A" + (d.title || "\u65E0\u6807\u9898");
    renderTagEditModal();
    els.tagEditModal.style.display = "flex";
    if (els.tagEditInput) setTimeout(function() {
      els.tagEditInput.focus();
    }, 100);
  }
  function closeTagEditModal() {
    state.tagEditDocId = null;
    els.tagEditModal.style.display = "none";
  }
  function renderTagEditModal() {
    var d = findDoc(state.tagEditDocId);
    if (!d) return;
    var cur = d.tags || [];
    if (els.tagEditChips) {
      els.tagEditChips.innerHTML = "";
      cur.forEach(function(t) {
        var c = document.createElement("span");
        c.className = "tag-chip";
        c.innerHTML = "#" + escapeHtml(t) + ' <span class="tag-chip-x" data-tag="' + encodeURIComponent(t) + '">\xD7</span>';
        c.querySelector(".tag-chip-x").addEventListener("click", function(e) {
          e.stopPropagation();
          var raw = this.getAttribute("data-tag");
          var tt = raw ? decodeURIComponent(raw) : raw;
          var next = cur.filter(function(x) {
            return x !== tt;
          });
          saveDocTags(state.tagEditDocId, next);
          renderTagEditModal();
          renderSideSub();
          renderList();
        });
        els.tagEditChips.appendChild(c);
      });
      if (els.tagEditEmpty) els.tagEditEmpty.style.display = cur.length ? "none" : "";
    }
    var tagMap = collectAllTags();
    var allNames = Object.keys(tagMap);
    if (els.tagEditAllchips) {
      els.tagEditAllchips.innerHTML = "";
      var added = 0;
      allNames.forEach(function(t) {
        if (cur.indexOf(t) >= 0) return;
        added++;
        var c = document.createElement("span");
        c.className = "tag-chip tag-chip-add";
        c.textContent = "#" + t;
        c.addEventListener("click", function() {
          var next = (findDoc(state.tagEditDocId).tags || []).slice();
          if (next.indexOf(t) < 0 && next.length < 20) {
            next.push(t);
            saveDocTags(state.tagEditDocId, next);
          }
          renderTagEditModal();
          renderSideSub();
          renderList();
        });
        els.tagEditAllchips.appendChild(c);
      });
      if (els.tagEditAllempty) els.tagEditAllempty.style.display = added ? "none" : "";
    }
  }
  function tagAddFromInput() {
    var t = (els.tagEditInput.value || "").trim();
    if (!t) return;
    if (t.length > 20) {
      toast("\u6807\u7B7E\u6700\u957F 20 \u5B57", "error");
      return;
    }
    var d = findDoc(state.tagEditDocId);
    if (!d) return;
    var next = (d.tags || []).slice();
    if (next.indexOf(t) >= 0) {
      toast("\u6807\u7B7E\u5DF2\u5B58\u5728", "error");
      els.tagEditInput.value = "";
      return;
    }
    if (next.length >= 20) {
      toast("\u6700\u591A 20 \u4E2A\u6807\u7B7E", "error");
      return;
    }
    next.push(t);
    saveDocTags(state.tagEditDocId, next);
    els.tagEditInput.value = "";
    renderTagEditModal();
    renderSideSub();
    renderList();
  }
  function openStickyEditModal(id) {
    var d = findDoc(id);
    if (!d) return;
    state.stickyEditId = id;
    openStickyEditor(d);
  }
  function closeStickyEditModal() {
    state.stickyEditId = null;
    els.stickyEditModal.style.display = "none";
  }
  function collectReminderFromUI() {
    if (!els.stickyEditRemEnabled || !els.stickyEditRemEnabled.checked) return null;
    var rem = { enabled: true, type: els.stickyEditRemType.value, time: els.stickyEditRemTime.value || "09:00" };
    if (rem.type === "once") rem.date = els.stickyEditRemDate.value || "";
    if (rem.type === "weekly") {
      var days = [];
      Array.prototype.forEach.call(els.stickyRemWeekly.querySelectorAll("input[type=checkbox]:checked"), function(cb) {
        days.push(Number(cb.value));
      });
      rem.days = days;
    }
    if (rem.type === "monthly") rem.day = els.stickyEditRemDay.value || "";
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
      toast("\u4FBF\u5229\u8D34\u5DF2\u4FDD\u5B58", "success");
    }
  }

  // src-app/08-visual.js
  function openVisual(d, kind) {
    var mod = window[VISUAL_MODULES[kind]];
    var meta = KIND_META[kind];
    var model = null;
    try {
      model = JSON.parse(d.content);
    } catch (e) {
      model = null;
    }
    if (!model || typeof model !== "object") model = mod.defaultModel();
    state.currentVisual = { kind, doc: d, model, module: mod };
    mod.init(els.visualCanvas, model, onVisualChange);
    mod.renderToolbar(els.visualToolbar);
    buildVisualExportMenu(els.visualToolbar, kind);
    els.breadcrumb.textContent = meta.icon;
    els.statLang.textContent = meta.label;
    els.statCursor.textContent = "";
    updateVisualStatus();
  }
  function onVisualChange() {
    if (!state.currentVisual) return;
    state.currentVisual.doc.content = JSON.stringify(state.currentVisual.model);
    state.currentVisual.doc.title = els.title.value;
    state.currentVisual.doc.updated = Date.now();
    els.statSaved.textContent = "\u4FDD\u5B58\u4E2D\u2026";
    els.statSaved.style.color = "";
    els.statEdit.textContent = "\u6700\u540E\u7F16\u8F91 " + fullTime(state.currentVisual.doc.updated);
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function() {
      persist();
      els.statSaved.textContent = "\u5DF2\u4FDD\u5B58";
      els.statSaved.style.color = "#0f7b0f";
      bus.emit("docs:changed");
    }, 400);
    updateVisualStatus();
  }
  function updateVisualStatus() {
    if (!state.currentVisual) return;
    els.statCount.textContent = state.currentVisual.module.count(state.currentVisual.model);
  }
  var VISUAL_EXPORTS = {
    flow: [
      ["PNG \u56FE\u7247", "png", ".png"],
      ["\u9AD8\u6E05 PNG", "png-hd", ".png"],
      ["JPG \u56FE\u7247", "jpg", ".jpg"],
      ["\u9AD8\u6E05 JPG", "jpg-hd", ".jpg"],
      ["SVG \u77E2\u91CF\u56FE", "svg", ".svg"],
      ["\u9AD8\u6E05 PDF", "pdf", ".pdf"],
      ["Word\uFF08.docx\uFF09", "docx", ".docx"],
      ["PPT\uFF08.pptx\uFF09", "pptx", ".pptx"],
      ["Markdown", "md", ".md"],
      ["Excel\uFF08.csv\uFF09", "csv", ".csv"],
      ["JSON \u5DE5\u7A0B\u6587\u4EF6", "json", ".json"]
    ],
    mind: [
      ["PNG \u56FE\u7247", "png", ".png"],
      ["\u9AD8\u6E05 PNG", "png-hd", ".png"],
      ["JPG \u56FE\u7247", "jpg", ".jpg"],
      ["\u9AD8\u6E05 JPG", "jpg-hd", ".jpg"],
      ["SVG \u77E2\u91CF\u56FE", "svg", ".svg"],
      ["\u9AD8\u6E05 PDF", "pdf", ".pdf"],
      ["Word\uFF08.docx\uFF09", "docx", ".docx"],
      ["PPT\uFF08.pptx\uFF09", "pptx", ".pptx"],
      ["Markdown", "md", ".md"],
      ["Excel\uFF08.csv\uFF09", "csv", ".csv"],
      ["XMind \u6587\u4EF6", "xmind", ".xmind"],
      ["FreeMind \u6587\u4EF6\uFF08.mm\uFF09", "mm", ".mm"],
      ["JSON \u5DE5\u7A0B\u6587\u4EF6", "json", ".json"]
    ]
  };
  function buildVisualExportMenu(bar, kind) {
    var list = VISUAL_EXPORTS[kind];
    if (!list) return;
    var wrap = document.createElement("div");
    wrap.className = "tool-menu-wrap";
    var btn = document.createElement("button");
    btn.className = "tool-btn";
    btn.innerHTML = "\u2B07 \u5BFC\u51FA\u4E3A \u25BE";
    var menu = document.createElement("div");
    menu.className = "tool-menu visual-export-menu";
    menu.style.display = "none";
    list.forEach(function(item) {
      var mi = document.createElement("button");
      mi.className = "menu-item";
      mi.textContent = item[0];
      mi.setAttribute("data-fmt", item[1]);
      mi.setAttribute("data-ext", item[2]);
      menu.appendChild(mi);
    });
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    bar.appendChild(wrap);
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      menu.style.display = menu.style.display === "none" ? "block" : "none";
    });
    document.addEventListener("click", function() {
      menu.style.display = "none";
    });
    menu.addEventListener("click", function(e) {
      var mi = e.target.closest(".menu-item");
      if (!mi) return;
      menu.style.display = "none";
      exportVisual(mi.getAttribute("data-fmt"), mi.getAttribute("data-ext"));
    });
  }
  function exportVisual(fmt, ext) {
    var cv = state.currentVisual;
    if (!cv) return;
    var X = window.InkpadExporter;
    var title = (cv.doc.title || KIND_META[cv.kind].label).replace(/[\\/:*?"<>|]/g, "_");
    var svg = els.visualCanvas.querySelector("svg");
    function done(path) {
      if (path) toast("\u5DF2\u5BFC\u51FA\uFF1A" + path, "success");
    }
    function fail(err) {
      toast("\u5BFC\u51FA\u5931\u8D25\uFF1A" + (err && err.message ? err.message : err), "error");
    }
    function saveText(text) {
      saveUniversal(title + ext, text, false).then(done, fail);
    }
    function saveBinary(u8) {
      saveUniversal(title + ext, u8, true).then(done, fail);
    }
    try {
      switch (fmt) {
        case "json":
          saveText(JSON.stringify(cv.model, null, 2));
          break;
        case "svg":
          saveText(X.exportSvgText(svg));
          break;
        case "png":
        case "png-hd":
          X.rasterize(svg, fmt === "png-hd" ? 3 : 1, "png").then(function(r) {
            saveBinary(r.data);
          }, fail);
          break;
        case "jpg":
        case "jpg-hd":
          X.rasterize(svg, fmt === "jpg-hd" ? 3 : 1, "jpeg").then(function(r) {
            saveBinary(r.data);
          }, fail);
          break;
        case "pdf":
          X.rasterize(svg, 3, "jpeg").then(function(r) {
            saveBinary(X.makePdf(r.data, r.width, r.height));
          }, fail);
          break;
        case "docx":
          X.rasterize(svg, 2, "png").then(function(r) {
            saveBinary(X.makeDocx(r.data, r.width, r.height));
          }, fail);
          break;
        case "pptx":
          X.rasterize(svg, 2, "png").then(function(r) {
            saveBinary(X.makePptx(r.data, r.width, r.height));
          }, fail);
          break;
        case "md":
          saveText(cv.kind === "mind" ? X.mindToMarkdown(cv.model.root, cv.doc.title) : X.flowToMarkdown(cv.model, cv.doc.title));
          break;
        case "csv":
          saveText(cv.kind === "mind" ? X.mindToCSV(cv.model.root) : X.flowToCSV(cv.model));
          break;
        case "mm":
          saveText(X.makeFreeMind(cv.model.root));
          break;
        case "xmind":
          saveBinary(X.makeXMind(cv.model.root, cv.doc.title));
          break;
      }
    } catch (e) {
      fail(e);
    }
  }
  function saveUniversal(filename, content, isBinary) {
    if (window.pywebview && window.pywebview.api) {
      if (isBinary && window.pywebview.api.save_file_binary) {
        return window.pywebview.api.save_file_binary(filename, window.InkpadExporter.u8ToBase64(content));
      }
      if (!isBinary && window.pywebview.api.save_file) {
        return window.pywebview.api.save_file(filename, content);
      }
    }
    var blob = isBinary ? new Blob([content]) : new Blob([content], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    return Promise.resolve(filename);
  }

  // src-app/09-rich-save.js
  function newVisualDoc(kind) {
    var mod = window[VISUAL_MODULES[kind]];
    var d = {
      id: uid(),
      title: "",
      kind,
      lang: "json",
      content: JSON.stringify(mod.defaultModel()),
      updated: Date.now()
    };
    state.docs.push(d);
    persist();
    openDoc(d.id);
    els.title.focus();
  }
  function newRichDoc() {
    var d = {
      id: uid(),
      title: "",
      kind: "rich",
      encoding: "utf-8",
      content: JSON.stringify([
        { id: uid(), type: "h1", text: "\u65E0\u6807\u9898\u6587\u6863" },
        { id: uid(), type: "text", text: "\u5728\u8FD9\u91CC\u8F93\u5165\u5185\u5BB9\u3002\u628A\u9F20\u6807\u79FB\u5230\u5757\u5DE6\u4FA7\u53EF<b>\u62D6\u62FD\u6392\u5E8F</b>\uFF0C\u70B9 <b>+</b> \u63D2\u5165\u65B0\u5757\u3002\u5DE5\u5177\u680F\u300C\u2728 \u63D2\u5165\u300D\u4E5F\u80FD\u8FFD\u52A0\u7EC4\u4EF6\u3002" }
      ]),
      updated: Date.now()
    };
    state.docs.push(d);
    persist();
    openDoc(d.id);
    els.title.focus();
  }
  function ensureRichDiskPath(d) {
    if (!d || d.diskPath || !hasApi()) return Promise.resolve(false);
    return getApi().get_rich_dir().then(function(dir) {
      if (!dir) return false;
      var dirNorm = dir.replace(/\\/g, "/");
      var desired = d.title && d.title.trim() || "\u672A\u547D\u540D\u6587\u6863";
      d.diskPath = computeRichFilePath(dirNorm, d, desired);
      d.encoding = d.encoding || "utf-8";
      return true;
    }).catch(function() {
      return false;
    });
  }
  function syncRichDiskPath(d) {
    if (!d || d.kind !== "rich" || !hasApi()) return Promise.resolve();
    if (!d.diskPath) return ensureRichDiskPath(d).then(function() {
      return null;
    });
    var dir = dirOf(d.diskPath);
    if (!dir) return Promise.resolve();
    var desired = d.title && d.title.trim() || "\u672A\u547D\u540D\u6587\u6863";
    var newPath = computeRichFilePath(dir, d, desired);
    if (newPath === d.diskPath) return Promise.resolve();
    var oldPath = d.diskPath;
    d.diskPath = newPath;
    return getApi().write_text_file(newPath, d.content || "", d.encoding || "utf-8").then(function(ok) {
      if (!ok) {
        d.diskPath = oldPath;
        throw new Error("write_text_file \u8FD4\u56DE\u5931\u8D25");
      }
      return getApi().delete_rich_file(oldPath).catch(function() {
        return null;
      });
    }).then(function() {
      persist();
      els.statSaved.textContent = "\u5DF2\u4FDD\u5B58\u5230\u78C1\u76D8";
      els.statSaved.style.color = "#0f7b0f";
    });
  }
  var _richSaveChain = Promise.resolve();
  function runRichSaveChain(d) {
    var self = _richSaveChain.then(function() {
      if (!d || d.kind !== "rich") return null;
      return syncRichDiskPath(d).then(function() {
        if (!d.diskPath) return null;
        return saveDiskDoc(d);
      });
    }).then(function() {
      if (!d) return;
      persist();
      bus.emit("docs:changed");
      els.statSaved.textContent = "\u5DF2\u4FDD\u5B58\u5230\u78C1\u76D8";
      els.statSaved.style.color = "#0f7b0f";
    }).catch(function(err) {
      console.warn("[inkpad] \u5BCC\u6587\u6863\u4FDD\u5B58\u5931\u8D25\uFF1A", err);
      els.statSaved.textContent = "\u4FDD\u5B58\u5931\u8D25";
      els.statSaved.style.color = "var(--danger)";
    });
    _richSaveChain = self.then(function() {
      return null;
    }, function() {
      return null;
    });
    return self;
  }
  function sanitizeFileName(name) {
    var t = (name == null ? "" : String(name)).trim();
    t = t.replace(/[\\/:*?"<>|\r\n\t]/g, "_");
    t = t.replace(/[\x00-\x1f\x7f]/g, "");
    t = t.replace(/[.\s]+$/, "");
    if (t.length > 80) t = t.slice(0, 80);
    t = t.replace(/[.\s]+$/, "");
    if (!t) t = "\u672A\u547D\u540D\u6587\u6863";
    return t;
  }
  function computeRichFilePath(dir, d, desiredName) {
    var base = sanitizeFileName(desiredName);
    var ext = ".json";
    var occupied = {};
    (state.docs || []).forEach(function(other) {
      if (other && other !== d && other.diskPath) occupied[other.diskPath] = true;
    });
    var candidate = dir + "/" + base + ext;
    if (!occupied[candidate] || candidate === d.diskPath) return candidate;
    var n = 1;
    while (n < 1e3) {
      candidate = dir + "/" + base + "_" + n + ext;
      if (!occupied[candidate] || candidate === d.diskPath) return candidate;
      n++;
    }
    return dir + "/" + base + "_" + Date.now() + ext;
  }
  function richChanged() {
    var d = activeDoc();
    if (!d || d.kind !== "rich") return;
    d.title = els.title.value;
    d.updated = Date.now();
    els.statEdit.textContent = "\u6700\u540E\u7F16\u8F91 " + fullTime(d.updated);
    els.statSaved.textContent = "\u4FDD\u5B58\u4E2D\u2026";
    els.statSaved.style.color = "";
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function() {
      runRichSaveChain(d);
    }, 400);
  }
  function syncFromEditor() {
    var d = activeDoc();
    if (!d) return;
    d.content = cm.getValue();
    d.title = els.title.value;
    d.updated = Date.now();
    els.statSaved.textContent = "\u4FDD\u5B58\u4E2D\u2026";
    els.statSaved.style.color = "";
    els.statEdit.textContent = "\u6700\u540E\u7F16\u8F91 " + fullTime(d.updated);
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function() {
      if (d.kind === "rich") {
        runRichSaveChain(d);
      } else {
        persist();
        if (d.diskPath) saveDiskDoc(d);
        else {
          els.statSaved.textContent = "\u5DF2\u4FDD\u5B58";
          els.statSaved.style.color = "#0f7b0f";
        }
        bus.emit("docs:changed");
      }
    }, 400);
  }
  function docSaveName(d) {
    var t = (d.title || "").trim();
    if (!t) t = "\u672A\u547D\u540D";
    if (d.kind === "rich") {
      if (!/\.[a-z0-9]+$/i.test(t)) t += ".json";
      return t;
    }
    var meta = LANGS[d.lang];
    var ext = meta && meta.ext ? meta.ext : ".txt";
    if (!/\.[a-z0-9]+$/i.test(t)) t += ext;
    return t;
  }
  function richDocSaveFilters() {
    return ["Inkpad \u5BCC\u6587\u6863 (*.json)", "JSON \u683C\u5F0F (*.json)", "\u6240\u6709\u6587\u4EF6 (*.*)"];
  }
  function richDocSaveInitialDir(d) {
    if (d && d.diskPath) return dirOf(d.diskPath);
    return null;
  }
  function saveDoc(forceAsk) {
    var d = activeDoc();
    if (!d) {
      toast("\u6CA1\u6709\u53EF\u4FDD\u5B58\u7684\u6587\u6863", "error");
      return;
    }
    clearTimeout(state.saveTimer);
    if (d.kind === "rich") {
      d.title = els.title.value;
      persist();
      var doRichSaveAs = forceAsk || !d.diskPath;
      if (!doRichSaveAs && d.diskPath) {
        runRichSaveChain(d).then(function() {
          els.statSaved.textContent = "\u5DF2\u4FDD\u5B58\u5230\u78C1\u76D8";
          els.statSaved.style.color = "#0f7b0f";
          bus.emit("docs:changed");
          toast("\u5DF2\u4FDD\u5B58\uFF1A" + d.diskPath, "success");
        }).catch(function() {
          toast("\u4FDD\u5B58\u5931\u8D25", "error");
        });
        return;
      }
      if (!forceAsk && !d.diskPath) toast("\u8BE5\u6587\u6863\u5C1A\u672A\u5173\u8054\u78C1\u76D8\u6587\u4EF6\uFF0C\u8BF7\u9009\u62E9\u4FDD\u5B58\u4F4D\u7F6E\uFF08\u4EC5\u9996\u6B21\u4FDD\u5B58\u9700\u8981\u9009\u62E9\uFF09", "info");
      var oldPath = d.diskPath || null;
      var initialName = docSaveName(d);
      var richContent = d.content || "";
      getApi().save_file_encoded(initialName, richContent, d.encoding || "UTF-8", richDocSaveFilters()).then(function(newPath) {
        if (!newPath) {
          toast("\u5DF2\u53D6\u6D88\u4FDD\u5B58", "info");
          return;
        }
        d.diskPath = newPath;
        d.encoding = d.encoding || "UTF-8";
        d.updated = Date.now();
        persist();
        if (!folderState.openFiles) folderState.openFiles = {};
        folderState.openFiles[normPath(newPath).toLowerCase()] = d.id;
        if (oldPath && oldPath !== newPath) {
          getApi().delete_rich_file(oldPath).catch(function() {
          });
        }
        els.statSaved.textContent = "\u5DF2\u4FDD\u5B58\u5230\u78C1\u76D8";
        els.statSaved.style.color = "#0f7b0f";
        bus.emit("docs:changed");
        toast((forceAsk ? "\u5DF2\u53E6\u5B58\u4E3A\uFF1A" : "\u5DF2\u4FDD\u5B58\uFF1A") + newPath, "success");
      }).catch(function() {
        toast("\u4FDD\u5B58\u5931\u8D25", "error");
      });
      return;
    }
    if (state.currentVisual) onVisualChange();
    else syncFromEditor();
    persist();
    if (!hasApi()) {
      saveUniversal(docSaveName(d), d.content, false);
      return;
    }
    if (!forceAsk && d.diskPath) {
      getApi().write_text_file(d.diskPath, d.content, d.encoding || "UTF-8").then(function(ok) {
        if (ok) {
          d.updated = Date.now();
          els.statSaved.textContent = "\u5DF2\u4FDD\u5B58\u5230\u78C1\u76D8";
          els.statSaved.style.color = "#0f7b0f";
          bus.emit("docs:changed");
          toast("\u5DF2\u4FDD\u5B58\uFF1A" + d.diskPath, "success");
        } else {
          toast("\u4FDD\u5B58\u5931\u8D25", "error");
        }
      }).catch(function() {
        els.statSaved.textContent = "\u78C1\u76D8\u4FDD\u5B58\u5931\u8D25";
        els.statSaved.style.color = "var(--danger)";
        toast("\u78C1\u76D8\u4FDD\u5B58\u5931\u8D25", "error");
      });
      return;
    }
    if (!forceAsk && !d.diskPath) toast("\u8BE5\u6587\u6863\u5C1A\u672A\u5173\u8054\u78C1\u76D8\u6587\u4EF6\uFF0C\u8BF7\u9009\u62E9\u4FDD\u5B58\u4F4D\u7F6E\uFF08\u4EC5\u9996\u6B21\u4FDD\u5B58\u9700\u8981\u9009\u62E9\uFF09", "info");
    getApi().save_file_encoded(docSaveName(d), d.content, d.encoding || "UTF-8").then(function(path) {
      if (!path) {
        toast("\u5DF2\u53D6\u6D88\u4FDD\u5B58", "info");
        return;
      }
      d.diskPath = path;
      d.encoding = d.encoding || "UTF-8";
      d.updated = Date.now();
      persist();
      if (!folderState.openFiles) folderState.openFiles = {};
      folderState.openFiles[normPath(path).toLowerCase()] = d.id;
      els.statSaved.textContent = "\u5DF2\u4FDD\u5B58\u5230\u78C1\u76D8";
      els.statSaved.style.color = "#0f7b0f";
      bus.emit("docs:changed");
      toast((forceAsk ? "\u5DF2\u53E6\u5B58\u4E3A\uFF1A" : "\u5DF2\u4FDD\u5B58\uFF1A") + path, "success");
    }).catch(function() {
      toast("\u4FDD\u5B58\u5931\u8D25", "error");
    });
  }
  function saveNow() {
    saveDoc(false);
  }

  // src-app/03-rich-bubble.js
  var bubbleMenu = {
    root: null,
    bar: null,
    dropdown: null,
    linkInput: null,
    colorBar: null,
    colorItems: null,
    visible: false,
    currentBlock: null
  };
  function richBubbleTypeLabel(t) {
    return {
      text: "\u6B63\u6587",
      h1: "\u4E00\u7EA7\u6807\u9898",
      h2: "\u4E8C\u7EA7\u6807\u9898",
      h3: "\u4E09\u7EA7\u6807\u9898",
      quote: "\u5F15\u7528",
      todo: "\u4EFB\u52A1",
      code: "\u4EE3\u7801\u5757",
      callout: "\u9AD8\u4EAE\u5757",
      ulist: "\u65E0\u5E8F\u5217\u8868",
      olist: "\u6709\u5E8F\u5217\u8868",
      link: "\u94FE\u63A5\u5757",
      cols: "\u5206\u680F"
    }[t] || t;
  }
  var BUBBLE_BLOCK_ITEMS = [
    { type: "text", label: "\u6B63\u6587", icon: "T" },
    { type: "h1", label: "\u4E00\u7EA7\u6807\u9898", icon: "H1" },
    { type: "h2", label: "\u4E8C\u7EA7\u6807\u9898", icon: "H2" },
    { type: "h3", label: "\u4E09\u7EA7\u6807\u9898", icon: "H3" },
    { type: "hn", label: "\u5176\u4ED6\u6807\u9898", icon: "Hn", flyout: true },
    { type: "olist", label: "\u6709\u5E8F\u5217\u8868", icon: "\u2261" },
    { type: "ulist", label: "\u65E0\u5E8F\u5217\u8868", icon: "\u2630" },
    { type: "todo", label: "\u4EFB\u52A1", icon: "\u2611" },
    { type: "code", label: "\u4EE3\u7801\u5757", icon: "{}" },
    { type: "quote", label: "\u5F15\u7528", icon: "\u275D" },
    { type: "callout", label: "\u9AD8\u4EAE\u5757", icon: "\u{1F4A1}" },
    { type: "sync", label: "\u540C\u6B65\u5757", icon: "\u2225" }
  ];
  var BUBBLE_BLOCK_FLYOUT = [
    { type: "h4", label: "\u56DB\u7EA7\u6807\u9898", icon: "H4" },
    { type: "h5", label: "\u4E94\u7EA7\u6807\u9898", icon: "H5" },
    { type: "h6", label: "\u516D\u7EA7\u6807\u9898", icon: "H6" }
  ];
  var BUBBLE_TEXT_COLORS = [
    { name: "\u9ED8\u8BA4", hex: "default" },
    // 清除字体颜色
    { name: "\u7070", hex: "#787774" },
    { name: "\u68D5", hex: "#976d57" },
    { name: "\u6A59", hex: "#cc782f" },
    { name: "\u9EC4", hex: "#c29243" },
    { name: "\u7EFF", hex: "#548164" },
    { name: "\u84DD", hex: "#477da5" },
    { name: "\u7D2B", hex: "#7a459c" }
  ];
  var BUBBLE_BG_COLORS = [
    { name: "\u9ED8\u8BA4", hex: "default" },
    // 清除背景色
    { name: "\u6D45\u7070", hex: "#e9e9ed" },
    { name: "\u6D45\u7C73", hex: "#f3eada" },
    { name: "\u6D45\u7C89", hex: "#fbe1e3" },
    { name: "\u6D45\u9EC4", hex: "#fbf0c8" },
    { name: "\u6D45\u7EFF", hex: "#dde9dd" },
    { name: "\u6D45\u84DD", hex: "#dde6ee" },
    { name: "\u6D45\u7D2B", hex: "#e6dfee" },
    { name: "\u7070", hex: "#bfc1c4" },
    { name: "\u68D5", hex: "#d9c0a8" },
    { name: "\u6A59", hex: "#f5cdb0" },
    { name: "\u9EC4", hex: "#fae09c" },
    { name: "\u7EFF", hex: "#abd2ab" },
    { name: "\u84DD", hex: "#a8c3d0" },
    { name: "\u7D2B", hex: "#c1add3" }
  ];
  var BUBBLE_COLORS = BUBBLE_TEXT_COLORS.concat(BUBBLE_BG_COLORS).filter(function(c, idx, arr) {
    return arr.indexOf(c) === idx;
  });
  function ensureBubbleRoot() {
    if (bubbleMenu.root) return bubbleMenu.root;
    var root = document.createElement("div");
    root.id = "ink-bubble";
    root.style.display = "none";
    root.setAttribute("role", "toolbar");
    var bar = document.createElement("div");
    bar.className = "ink-bubble-bar";
    root.appendChild(bar);
    var typeBtn = document.createElement("button");
    typeBtn.className = "ink-bubble-btn ink-bubble-type";
    typeBtn.setAttribute("data-act", "type");
    typeBtn.innerHTML = '<span class="ink-bubble-type-label">H3</span><span class="ink-bubble-caret">\u25BE</span>';
    typeBtn.addEventListener("mousedown", function(e) {
      e.preventDefault();
      toggleBubbleDropdown();
    });
    bar.appendChild(typeBtn);
    bar.appendChild(makeBubbleSep());
    [["bold", "B", false], ["italic", "I", true], ["underline", "U", false], ["strikeThrough", "S", false]].forEach(function(p) {
      var b = document.createElement("button");
      b.className = "ink-bubble-btn";
      if (p[2]) b.innerHTML = "<i>" + p[1] + "</i>";
      else b.textContent = p[1];
      b.title = {
        bold: "\u52A0\u7C97 (Ctrl+B)",
        italic: "\u659C\u4F53 (Ctrl+I)",
        underline: "\u4E0B\u5212\u7EBF (Ctrl+U)",
        strikeThrough: "\u5220\u9664\u7EBF"
      }[p[0]];
      b.addEventListener("mousedown", function(e) {
        e.preventDefault();
        runBubbleInline(p[0]);
      });
      bar.appendChild(b);
    });
    bar.appendChild(makeBubbleSep());
    var linkBtn = document.createElement("button");
    linkBtn.className = "ink-bubble-btn";
    linkBtn.title = "\u6DFB\u52A0\u94FE\u63A5";
    linkBtn.innerHTML = "\u{1F517}";
    linkBtn.addEventListener("mousedown", function(e) {
      e.preventDefault();
      toggleBubbleLinkInput();
    });
    bar.appendChild(linkBtn);
    var colorBtn = document.createElement("button");
    colorBtn.className = "ink-bubble-btn ink-bubble-color";
    colorBtn.title = "\u6587\u5B57/\u80CC\u666F\u989C\u8272";
    colorBtn.innerHTML = '<span class="ink-bubble-color-letter">A</span><span class="ink-bubble-color-letter ink-bubble-color-letter-bg">A</span><span class="ink-bubble-caret">\u25BE</span>';
    colorBtn.addEventListener("mousedown", function(e) {
      e.preventDefault();
      toggleBubbleColorBar();
    });
    bar.appendChild(colorBtn);
    bar.appendChild(makeBubbleSep());
    [["quote", "\u275D", "\u5F15\u7528"], ["callout", "\u{1F4A1}", "\u9AD8\u4EAE\u5757"]].forEach(function(p) {
      var b = document.createElement("button");
      b.className = "ink-bubble-btn ink-bubble-block-act";
      b.title = p[2];
      b.textContent = p[1];
      if (p[0] === "quote") b.addEventListener("mousedown", function(e) {
        e.preventDefault();
        var b2 = bubbleMenu.currentBlock;
        if (b2 && window.InkpadBlocks) window.InkpadBlocks.transformBlockType(b2.id, "quote");
        hideRichBubble();
      });
      else if (p[0] === "callout") b.addEventListener("mousedown", function(e) {
        e.preventDefault();
        var b2 = bubbleMenu.currentBlock;
        if (b2 && window.InkpadBlocks) window.InkpadBlocks.transformBlockType(b2.id, "callout");
        hideRichBubble();
      });
      bar.appendChild(b);
    });
    var closeBtn = document.createElement("button");
    closeBtn.className = "ink-bubble-btn ink-bubble-close";
    closeBtn.title = "\u5173\u95ED";
    closeBtn.textContent = "\u2715";
    closeBtn.addEventListener("mousedown", function(e) {
      e.preventDefault();
      hideRichBubble();
    });
    bar.appendChild(closeBtn);
    var dd = document.createElement("div");
    dd.className = "ink-bubble-dropdown";
    dd.style.display = "none";
    BUBBLE_BLOCK_ITEMS.forEach(function(it) {
      var row = document.createElement("div");
      row.className = "ink-bubble-dd-item" + (it.flyout ? " has-flyout" : "");
      row.setAttribute("data-type", it.type);
      row.innerHTML = '<span class="ink-bubble-dd-mark">' + it.icon + '</span><span class="ink-bubble-dd-text">' + it.label + '</span><span class="ink-bubble-dd-spacer"></span><span class="ink-bubble-dd-check">\u2713</span>';
      if (it.flyout) {
        row.addEventListener("mouseenter", function() {
          if (bubbleMenu.dropdown) {
            Array.prototype.forEach.call(
              bubbleMenu.dropdown.querySelectorAll(".ink-bubble-dd-item.has-flyout"),
              function(it2) {
                it2.classList.remove("show-flyout");
              }
            );
          }
          row.classList.add("show-flyout");
        });
        row.addEventListener("mouseleave", function() {
          row.classList.remove("show-flyout");
        });
        row.addEventListener("mousedown", function(e) {
          e.preventDefault();
        });
      } else {
        row.addEventListener("mousedown", function(e) {
          e.preventDefault();
          var b = bubbleMenu.currentBlock;
          if (!b) return;
          if (it.type === "sync") {
            window.InkpadBlocks.transformBlockType(b.id, "callout");
            toast("\u540C\u6B65\u5757\u662F\u534F\u4F5C\u6982\u5FF5\uFF0C\u672C\u5730\u7248\u6682\u4EE5\u9AD8\u4EAE\u5757\u627F\u8F7D", "info");
          } else {
            window.InkpadBlocks.transformBlockType(b.id, it.type);
          }
          hideBubbleDropdown();
        });
      }
      dd.appendChild(row);
      if (it.flyout) {
        var flyout = document.createElement("div");
        flyout.className = "ink-bubble-flyout";
        BUBBLE_BLOCK_FLYOUT.forEach(function(sub) {
          var srow = document.createElement("div");
          srow.className = "ink-bubble-flyout-item";
          srow.setAttribute("data-type", sub.type);
          srow.innerHTML = '<span class="ink-bubble-dd-mark">' + sub.icon + '</span><span class="ink-bubble-dd-text">' + sub.label + "</span>";
          srow.addEventListener("mousedown", function(e) {
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
    var linkWrap = document.createElement("div");
    linkWrap.className = "ink-bubble-link-row";
    linkWrap.style.display = "none";
    var linkInput = document.createElement("input");
    linkInput.type = "text";
    linkInput.placeholder = "\u8F93\u5165\u94FE\u63A5\u5730\u5740\uFF0C\u56DE\u8F66\u5E94\u7528";
    linkInput.className = "ink-bubble-link-input";
    linkInput.addEventListener("keydown", function(ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        var url = linkInput.value.trim();
        if (window.InkpadBlocks) window.InkpadBlocks.applyInlineFormat("createLink", url || null);
        hideBubbleLinkInput();
      } else if (ev.key === "Escape") {
        hideBubbleLinkInput();
      }
    });
    var unlinkBtn = document.createElement("button");
    unlinkBtn.className = "ink-bubble-btn";
    unlinkBtn.title = "\u53D6\u6D88\u94FE\u63A5";
    unlinkBtn.textContent = "\u2715\u94FE";
    unlinkBtn.addEventListener("mousedown", function(ev) {
      ev.preventDefault();
      if (window.InkpadBlocks) window.InkpadBlocks.applyInlineFormat("createLink", null);
      hideBubbleLinkInput();
    });
    linkWrap.appendChild(linkInput);
    linkWrap.appendChild(unlinkBtn);
    root.appendChild(linkWrap);
    var colorBar = document.createElement("div");
    colorBar.className = "ink-bubble-colors";
    colorBar.style.display = "none";
    function buildColorSection(headerText, items, mode) {
      var section = document.createElement("div");
      section.className = "ink-bubble-color-section";
      var h = document.createElement("div");
      h.className = "ink-bubble-color-header";
      h.textContent = headerText;
      section.appendChild(h);
      var grid = document.createElement("div");
      grid.className = "ink-bubble-color-grid";
      items.forEach(function(c) {
        var s = document.createElement("span");
        s.className = "ink-bubble-color-chip";
        s.title = c.name;
        if (c.hex === "default") {
          s.classList.add("ink-bubble-color-chip-default");
        } else {
          s.style.background = c.hex;
        }
        s.setAttribute("data-hex", c.hex);
        s.setAttribute("data-mode", mode);
        s.addEventListener("mousedown", function(e) {
          e.preventDefault();
          if (!window.InkpadBlocks) return;
          if (c.hex === "default") {
            window.InkpadBlocks.applyInlineFormat(
              mode === "bg" ? "clearHiliteColor" : "clearForeColor",
              null
            );
          } else {
            window.InkpadBlocks.applyInlineFormat(
              mode === "bg" ? "hiliteColor" : "foreColor",
              c.hex
            );
          }
        });
        grid.appendChild(s);
      });
      section.appendChild(grid);
      return section;
    }
    colorBar.appendChild(buildColorSection("\u5B57\u4F53\u989C\u8272", BUBBLE_TEXT_COLORS, "fg"));
    colorBar.appendChild(buildColorSection("\u80CC\u666F\u989C\u8272", BUBBLE_BG_COLORS, "bg"));
    var resetWrap = document.createElement("div");
    resetWrap.className = "ink-bubble-color-reset-wrap";
    var resetBtn = document.createElement("div");
    resetBtn.className = "ink-bubble-color-reset";
    resetBtn.textContent = "\u6062\u590D\u9ED8\u8BA4";
    resetBtn.addEventListener("mousedown", function(e) {
      e.preventDefault();
      if (!window.InkpadBlocks) return;
      window.InkpadBlocks.applyInlineFormat("clearForeColor", null);
      window.InkpadBlocks.applyInlineFormat("clearHiliteColor", null);
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
    var s = document.createElement("span");
    s.className = "ink-bubble-sep";
    return s;
  }
  function showRichBubble(info) {
    var root = ensureBubbleRoot();
    if (!info || !info.range) {
      hideRichBubble();
      return;
    }
    var rect = info.range.getBoundingClientRect();
    if (!rect || rect.width === 0 && rect.height === 0) {
      hideRichBubble();
      return;
    }
    root.style.display = "";
    root.style.visibility = "hidden";
    var w = root.offsetWidth;
    var h = root.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight;
    var top = rect.top - h - 8;
    var left = rect.left + rect.width / 2 - w / 2;
    if (top < 36) top = rect.bottom + 8;
    if (left < 8) left = 8;
    if (left + w > vw - 8) left = vw - 8 - w;
    if (top + h > vh - 8) top = Math.max(8, vh - 8 - h);
    root.style.top = top + "px";
    root.style.left = left + "px";
    root.style.visibility = "visible";
    var b = info.block;
    bubbleMenu.currentBlock = b;
    var lab = root.querySelector(".ink-bubble-type-label");
    if (lab) lab.textContent = richBubbleTypeLabel(b.type);
    var rows = root.querySelectorAll(".ink-bubble-dd-item");
    rows.forEach(function(r) {
      var t = r.getAttribute("data-type");
      var match = t === b.type;
      r.classList.toggle("active", match);
    });
    bubbleMenu.visible = true;
    bubbleMenu.lastRect = rect;
  }
  function repositionBubbleForPanel() {
    var root = bubbleMenu.root;
    if (!root || root.style.display === "none") return;
    var vw = window.innerWidth, vh = window.innerHeight;
    var w = root.offsetWidth;
    var h = root.offsetHeight;
    var rect = bubbleMenu.lastRect;
    if (!rect) return;
    var top;
    var selMid = rect.top + (rect.bottom - rect.top) / 2;
    top = rect.top - h - 8;
    var anchorAbove = top + h + 8;
    if (top < 36) {
      top = rect.bottom + 8;
    }
    if (top + h > vh - 8) {
      top = Math.max(8, vh - 8 - h);
    }
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
    root.style.top = top + "px";
    root.style.left = left + "px";
  }
  function hideRichBubble() {
    if (!bubbleMenu.root) return;
    bubbleMenu.root.style.display = "none";
    hideBubbleDropdown();
    hideBubbleLinkInput();
    hideBubbleColorBar();
    bubbleMenu.visible = false;
    bubbleMenu.currentBlock = null;
  }
  function toggleBubbleDropdown() {
    if (!bubbleMenu.dropdown) return;
    var v = bubbleMenu.dropdown.style.display;
    hideBubbleLinkInput();
    hideBubbleColorBar();
    bubbleMenu.dropdown.style.display = v === "none" || v === "" ? "block" : "none";
    if (bubbleMenu.dropdown.style.display !== "none") repositionBubbleForPanel();
  }
  function hideBubbleDropdown() {
    if (bubbleMenu.dropdown) bubbleMenu.dropdown.style.display = "none";
  }
  function toggleBubbleLinkInput() {
    if (!bubbleMenu.linkRow) return;
    var v = bubbleMenu.linkRow.style.display;
    hideBubbleDropdown();
    hideBubbleColorBar();
    bubbleMenu.linkRow.style.display = v === "none" || v === "" ? "flex" : "none";
    if (bubbleMenu.linkRow.style.display !== "none") {
      setTimeout(function() {
        bubbleMenu.linkInput.focus();
      }, 30);
      repositionBubbleForPanel();
    }
  }
  function hideBubbleLinkInput() {
    if (bubbleMenu.linkRow) bubbleMenu.linkRow.style.display = "none";
    if (bubbleMenu.linkInput) bubbleMenu.linkInput.value = "";
  }
  function toggleBubbleColorBar() {
    if (!bubbleMenu.colorBar) return;
    var v = bubbleMenu.colorBar.style.display;
    hideBubbleDropdown();
    hideBubbleLinkInput();
    bubbleMenu.colorBar.style.display = v === "none" || v === "" ? "flex" : "none";
    if (bubbleMenu.colorBar.style.display !== "none") repositionBubbleForPanel();
  }
  function hideBubbleColorBar() {
    if (bubbleMenu.colorBar) bubbleMenu.colorBar.style.display = "none";
  }
  function runBubbleInline(cmd) {
    if (window.InkpadBlocks) window.InkpadBlocks.applyInlineFormat(cmd, null);
  }
  function bindRichBubble() {
    if (window.InkpadBlocks) {
      window.InkpadBlocks.setBubbleListener(function(info) {
        if (!info) {
          hideRichBubble();
          return;
        }
        if (!info.visible) {
          hideRichBubble();
          return;
        }
        showRichBubble(info);
      });
    }
    document.addEventListener("mousedown", function(ev) {
      if (!bubbleMenu.root || bubbleMenu.root.style.display === "none") return;
      if (bubbleMenu.root.contains(ev.target)) return;
      setTimeout(function() {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed) hideRichBubble();
        else if (bubbleMenu.dropdown && bubbleMenu.dropdown.style.display !== "none") hideBubbleDropdown();
      }, 0);
    }, true);
    document.addEventListener("keydown", function(ev) {
      if (ev.key === "Escape" && bubbleMenu.visible) hideRichBubble();
    });
  }

  // src-app/18-bootstrap.js
  var FR_STORAGE = "inkpad.fr.v1";
  var frState = {
    caseSens: false,
    wholeWord: false,
    regex: false,
    cycle: true,
    expand: true,
    // 默认开启：replacement / query 中的 \n \t \r 自动展开为真实字符
    //   符合 sed / perl / VS Code 等主流编辑器惯例。
    //   关闭此开关后，输入 \n 将作为字面两字符保留（罕见场景）。
    continueNext: false,
    highlight: true,
    fast: false,
    scope: "current",
    collapsed: true,
    // false=替换面板, true=仅查找
    findHistory: [],
    // 字符串数组（最新在前）
    replaceHistory: [],
    favorites: [],
    // [{find, replace}]
    pos: null
    // {left, top} 浮层拖动后位置
  };
  state.frMarks = [];
  state.frHlTimer = null;
  state.frHlRunning = false;
  state.frHlToken = 0;
  var FR_HL_HARD_CAP = 800;
  var FR_HL_DOC_CAP = 500 * 1024;
  var FR_HL_EST_CAP = 5e4;
  var FR_HL_BATCH = 80;
  var FR_BACK_MAX = 5e4;
  function initApp() {
    bindTsModal();
    bindCodeModal();
    bindFindReplaceModal();
    loadDocs();
    bus.on("docs:changed", renderList);
    renderList();
    openDoc(state.activeId);
    bindRichOutline();
    setTimeout(function() {
      cleanupRichOrphans();
    }, 800);
    bindRichBubble();
  }
  function cleanupRichOrphans() {
    if (!hasApi()) return;
    var occupied = state.docs.map(function(d) {
      return d && d.diskPath;
    }).filter(Boolean);
    getApi().cleanup_rich_orphans(occupied).then(function(res) {
      if (!res) return;
      var del = (res.deleted || []).length;
      var skp = (res.skipped || []).length;
      if (del > 0) toast("\u5DF2\u6E05\u7406 " + del + " \u4E2A\u5386\u53F2\u6B8B\u7559\u5BCC\u6587\u6863\u6587\u4EF6\uFF08\u5FFD\u7565 " + skp + " \u4E2A\u975E\u5BCC\u6587\u6863 JSON\uFF09", "success");
      else if (skp > 0) {
      }
    }).catch(function(e) {
      console.warn("[inkpad] cleanup orphans failed", e);
    });
  }

  // src-app/19-find-replace.js
  var FR_VERSION = 2;
  function frSave() {
    frState._ver = FR_VERSION;
    try {
      localStorage.setItem(FR_STORAGE, JSON.stringify(frState));
    } catch (_) {
    }
  }
  function frLoad() {
    try {
      var s = JSON.parse(localStorage.getItem(FR_STORAGE) || "{}");
      if (s._ver !== FR_VERSION) {
        s.collapsed = true;
        s._ver = FR_VERSION;
      }
      if (typeof s.expand === "undefined") s.expand = true;
      if (typeof s.collapsed === "undefined") s.collapsed = true;
      Object.assign(frState, s);
    } catch (_) {
    }
  }
  function bindFindReplaceModal() {
    frLoad();
    syncFrStateToUi();
    cm.on && cm.on("change", function() {
      clearTimeout(window.__frStarT);
      window.__frStarT = setTimeout(function() {
        var q = $("fr-find").value;
        var has = frState.favorites.some(function(f) {
          return f.find === q;
        });
        $("fr-fav").classList.toggle("on", has);
      }, 200);
    });
    $("fr-close").addEventListener("click", closeFindModal);
    $("fr-overlay").addEventListener("mousedown", function(e) {
      if (e.target.id === "fr-overlay") closeFindModal();
    });
    (function() {
      var card = $("fr-card");
      var header = card.querySelector(".fr-header");
      var dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
      header.addEventListener("mousedown", function(e) {
        if (e.target.closest(".fr-close-btn")) return;
        dragging = true;
        sx = e.clientX;
        sy = e.clientY;
        var rect = card.getBoundingClientRect();
        sl = rect.left;
        st = rect.top;
        card.style.left = sl + "px";
        card.style.top = st + "px";
        card.style.right = "auto";
        e.preventDefault();
      });
      document.addEventListener("mousemove", function(e) {
        if (!dragging) return;
        var nl = sl + (e.clientX - sx);
        var nt = st + (e.clientY - sy);
        nl = Math.max(0, Math.min(window.innerWidth - 100, nl));
        nt = Math.max(0, Math.min(window.innerHeight - 40, nt));
        card.style.left = nl + "px";
        card.style.top = nt + "px";
      });
      document.addEventListener("mouseup", function() {
        if (!dragging) return;
        dragging = false;
        var rect = card.getBoundingClientRect();
        frState.pos = { left: rect.left, top: rect.top };
        frSave();
      });
    })();
    document.addEventListener("mousedown", function(e) {
      if (!e.target.closest(".fr-popup") && !e.target.closest(".fr-btn-icon")) {
        closeFrPopups();
      }
    });
    $("fr-find").addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) frFindNext(true);
        else frFindNext(false);
      } else if (e.key === "Escape") {
        closeFindModal();
      }
    });
    $("fr-find").addEventListener("input", function() {
      var has = frState.favorites.some(function(f) {
        return f.find === this.value;
      });
      $("fr-fav").classList.toggle("on", has);
    });
    $("fr-replace").addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) frReplaceAll();
        else frReplaceOne();
      } else if (e.key === "Escape") {
        closeFindModal();
      }
    });
    $("fr-next").addEventListener("click", function() {
      frFindNext(false);
    });
    $("fr-find-arrow").addEventListener("click", function() {
      frFindNext(false);
    });
    var prevBtn = $("fr-find-prev");
    if (prevBtn) prevBtn.addEventListener("click", function() {
      frFindNext(true);
    });
    $("fr-replace-one").addEventListener("click", frReplaceOne);
    $("fr-replace-all").addEventListener("click", frReplaceAll);
    $("fr-batch").addEventListener("click", frOpenBatchModal);
    $("fr-collapse").addEventListener("click", toggleFindOnly);
    $("fr-find-hist").addEventListener("click", function(e) {
      e.stopPropagation();
      showFrPopup("find");
    });
    $("fr-replace-hist").addEventListener("click", function(e) {
      e.stopPropagation();
      showFrPopup("replace");
    });
    $("fr-fav").addEventListener("click", toggleFavorite2);
    $("fr-more").addEventListener("click", function(e) {
      e.stopPropagation();
      showFrPopup("more");
    });
    ["case", "whole", "regex", "cycle", "expand", "continue", "highlight", "fast"].forEach(function(k) {
      var el = $("fr-" + k);
      el.checked = !!frState[k === "case" ? "caseSens" : k === "whole" ? "wholeWord" : k === "regex" ? "regex" : k === "cycle" ? "cycle" : k === "expand" ? "expand" : k === "continue" ? "continueNext" : k === "highlight" ? "highlight" : "fast"];
      el.addEventListener("change", function() {
        frState[k === "case" ? "caseSens" : k === "whole" ? "wholeWord" : k === "regex" ? "regex" : k === "cycle" ? "cycle" : k === "expand" ? "expand" : k === "continue" ? "continueNext" : k === "highlight" ? "highlight" : "fast"] = el.checked;
        frSave();
        applyFrHighlight();
      });
    });
    var scopeRadios = document.querySelectorAll('input[name="fr-scope"]');
    scopeRadios.forEach(function(r) {
      if (r.value === frState.scope) r.checked = true;
      r.addEventListener("change", function() {
        if (r.checked) {
          frState.scope = r.value;
          frSave();
        }
      });
    });
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape" && $("fr-overlay").style.display !== "none") {
        var open = document.querySelector('.modal-overlay[style*="flex"]') || document.querySelector('.modal-overlay[style*="block"]');
        if (!open) closeFindModal();
      }
    });
    $("fr-batch-close").addEventListener("click", function() {
      $("fr-batch-modal").style.display = "none";
    });
    $("fr-batch-clear").addEventListener("click", function() {
      $("fr-batch-text").value = "";
    });
    $("fr-batch-from-find").addEventListener("click", function() {
      var lines = frState.findHistory.slice(0, 20).map(function(s) {
        return s + " \u21E8 ";
      });
      $("fr-batch-text").value = lines.join("\n");
      $("fr-batch-text").focus();
    });
    $("fr-batch-ok").addEventListener("click", frBatchRun);
    $("fr-batch-text").addEventListener("keydown", function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        frBatchRun();
      }
    });
  }
  function syncFrStateToUi() {
    var replaceRow = $("fr-replace-row");
    var replaceAllBtn = $("fr-replace-all");
    var batchBtn = $("fr-batch");
    var collapseBtn = $("fr-collapse");
    var headerTitle = $("fr-header-title");
    if (frState.collapsed) {
      replaceRow.style.display = "none";
      replaceAllBtn.style.display = "none";
      batchBtn.style.display = "none";
      collapseBtn.textContent = "\u226A \u66FF\u6362";
      if (headerTitle) headerTitle.textContent = "\u67E5\u627E";
    } else {
      replaceRow.style.display = "";
      replaceAllBtn.style.display = "";
      batchBtn.style.display = "";
      collapseBtn.textContent = "\u226A \u67E5\u627E";
      if (headerTitle) headerTitle.textContent = "\u66FF\u6362";
    }
  }
  function closeFrPopups() {
    document.querySelectorAll(".fr-popup").forEach(function(n) {
      n.remove();
    });
  }
  function showFrPopup(which) {
    closeFrPopups();
    var anchor, items;
    if (which === "find") {
      anchor = $("fr-find-hist");
      items = frState.findHistory.slice(0, 30).map(function(s) {
        return { kind: "find", label: s, val: s };
      });
      if (frState.findHistory.length === 0) {
        return showFrEmptyPopup(anchor, "\u6682\u65E0\u67E5\u627E\u5386\u53F2");
      }
    } else if (which === "replace") {
      anchor = $("fr-replace-hist");
      items = frState.replaceHistory.slice(0, 30).map(function(s) {
        return { kind: "replace", label: s || "(\u7A7A)", val: s };
      });
      if (frState.replaceHistory.length === 0) {
        return showFrEmptyPopup(anchor, "\u6682\u65E0\u66FF\u6362\u5386\u53F2");
      }
    } else {
      anchor = $("fr-more");
      items = [];
      (frState.favorites || []).forEach(function(f, i) {
        items.push({ kind: "fav", label: f.find + "  \u21E8  " + (f.replace || ""), val: i });
      });
      items.push({ kind: "op", label: "\u6E05\u7A7A\u67E5\u627E\u5386\u53F2", val: "clear-find" });
      items.push({ kind: "op", label: "\u6E05\u7A7A\u66FF\u6362\u5386\u53F2", val: "clear-replace" });
      items.push({ kind: "op", label: "\u6E05\u7A7A\u6536\u85CF", val: "clear-fav" });
      if (!frState.favorites || frState.favorites.length === 0) items.unshift({ kind: "empty", label: "\uFF08\u6682\u65E0\u6536\u85CF\uFF0C\u2605 \u8F93\u5165\u67E5\u627E\u8BCD\u53EF\u6536\u85CF\uFF09", val: "" });
    }
    var popup = document.createElement("div");
    popup.className = "fr-popup";
    items.forEach(function(it) {
      var row = document.createElement("div");
      row.className = "fr-popup-item";
      if (it.kind === "fav") row.innerHTML = '<span class="fav-star">\u2605</span>' + escHtml(it.label);
      else if (it.kind === "op") row.textContent = it.label;
      else if (it.kind === "empty") {
        row.textContent = it.label;
        row.style.color = "var(--text-secondary)";
        row.style.cursor = "default";
      } else row.textContent = it.label;
      if (it.kind !== "empty") {
        row.addEventListener("click", function() {
          if (it.kind === "find") {
            $("fr-find").value = it.val;
            frFindNext(false);
            closeFrPopups();
          } else if (it.kind === "replace") {
            $("fr-replace").value = it.val;
            closeFrPopups();
          } else if (it.kind === "fav") {
            var fav = frState.favorites[it.val];
            $("fr-find").value = fav.find;
            $("fr-replace").value = fav.replace || "";
            closeFrPopups();
            frFindNext(false);
          } else if (it.kind === "op") {
            if (it.val === "clear-find") frState.findHistory = [];
            else if (it.val === "clear-replace") frState.replaceHistory = [];
            else if (it.val === "clear-fav") frState.favorites = [];
            frSave();
            closeFrPopups();
            setFrStatus("\u5DF2\u6E05\u7406", "ok");
          }
        });
        if (it.kind === "find" || it.kind === "replace") {
          var del = document.createElement("button");
          del.className = "del";
          del.textContent = "\u2715";
          del.title = "\u4ECE\u5386\u53F2\u5220\u9664";
          del.addEventListener("click", function(e) {
            e.stopPropagation();
            if (it.kind === "find") frState.findHistory = frState.findHistory.filter(function(x) {
              return x !== it.val;
            });
            else frState.replaceHistory = frState.replaceHistory.filter(function(x) {
              return x !== it.val;
            });
            frSave();
            row.remove();
          });
          row.appendChild(del);
        }
      }
      popup.appendChild(row);
    });
    document.body.appendChild(popup);
    var posAnchor = anchor;
    var alignMode = "anchor";
    if (which === "find") {
      posAnchor = $("fr-find").closest(".fr-input-wrap");
      alignMode = "input";
    } else if (which === "replace") {
      posAnchor = $("fr-replace").closest(".fr-input-wrap");
      alignMode = "input";
    } else if (which === "more") {
      alignMode = "right";
    }
    var r = posAnchor.getBoundingClientRect();
    popup.style.top = r.bottom + window.scrollY + 4 + "px";
    if (alignMode === "input") {
      popup.style.left = r.left + window.scrollX + "px";
      popup.style.minWidth = r.width + "px";
    } else if (alignMode === "right") {
      var popupW = popup.offsetWidth;
      popup.style.left = r.right - popupW + window.scrollX + "px";
    } else {
      popup.style.left = r.left + window.scrollX + "px";
    }
    var popupR = popup.getBoundingClientRect();
    if (alignMode === "right") {
      if (popupR.left < 8) {
        popup.style.left = 8 + window.scrollX + "px";
      }
    } else if (popupR.right > window.innerWidth - 8) {
      popup.style.left = Math.max(8, window.innerWidth - popupR.width - 8 + window.scrollX) + "px";
    }
  }
  function showFrEmptyPopup(anchor, text) {
    closeFrPopups();
    var popup = document.createElement("div");
    popup.className = "fr-popup";
    var row = document.createElement("div");
    row.className = "fr-popup-empty";
    row.textContent = text;
    popup.appendChild(row);
    document.body.appendChild(popup);
    var posAnchor = anchor.closest(".fr-input-wrap") || anchor;
    var r = posAnchor.getBoundingClientRect();
    popup.style.left = r.left + window.scrollX + "px";
    popup.style.top = r.bottom + window.scrollY + 4 + "px";
    popup.style.minWidth = r.width + "px";
  }
  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toggleFavorite2() {
    var q = $("fr-find").value;
    if (!q) {
      setFrStatus("\u5148\u8F93\u5165\u67E5\u627E\u8BCD\u518D\u6536\u85CF", "error");
      return;
    }
    var r = $("fr-replace").value;
    var idx = -1;
    frState.favorites.forEach(function(f, i) {
      if (f.find === q) idx = i;
    });
    if (idx >= 0) {
      frState.favorites.splice(idx, 1);
      $("fr-fav").classList.remove("on");
      setFrStatus("\u5DF2\u53D6\u6D88\u6536\u85CF", "ok");
    } else {
      frState.favorites.unshift({ find: q, replace: r });
      $("fr-fav").classList.add("on");
      setFrStatus("\u5DF2\u6536\u85CF \u2605", "ok");
    }
    frSave();
  }
  function toggleFindOnly() {
    frState.collapsed = !frState.collapsed;
    frSave();
    syncFrStateToUi();
  }
  function openFindModal(replaceMode) {
    openSingleModal("fr-overlay");
    if (replaceMode) {
      frState.collapsed = false;
    }
    if (frState.pos) {
      var card = $("fr-card");
      var cw = card.offsetWidth || 520;
      var ch = card.offsetHeight || 340;
      var vw = window.innerWidth, vh = window.innerHeight;
      var left = frState.pos.left, top = frState.pos.top;
      if (left + cw < 0 || left > vw - 40 || top + ch < 0 || top > vh - 20) {
        left = Math.max(8, Math.round((vw - cw) / 2));
        top = Math.max(8, Math.round(vh / 3));
      }
      card.style.left = left + "px";
      card.style.top = top + "px";
      card.style.right = "auto";
    }
    syncFrStateToUi();
    var sel = cm.getSelection();
    if (sel && !$("fr-find").value) $("fr-find").value = sel;
    var q = $("fr-find").value;
    var has = frState.favorites.some(function(f) {
      return f.find === q;
    });
    $("fr-fav").classList.toggle("on", has);
    setTimeout(function() {
      $("fr-find").focus();
      $("fr-find").select();
    }, 0);
    applyFrHighlight();
  }
  function closeFindModal() {
    $("fr-overlay").style.display = "none";
    closeFrPopups();
    clearCurrentMatchMark();
    clearFrMarks();
    state.frLastQuery = null;
    cm.focus();
  }
  function pushHistory(list, val) {
    if (!val) return list;
    list = list.filter(function(x) {
      return x !== val;
    });
    list.unshift(val);
    if (list.length > 30) list = list.slice(0, 30);
    return list;
  }
  function setFrStatus(msg, cls) {
    var el = $("fr-status");
    el.textContent = msg || "";
    el.className = "fr-status" + (cls ? " " + cls : "");
  }
  function makeCursor(fromPos, query) {
    var opts = {
      caseFold: !frState.caseSens,
      wholeWord: frState.wholeWord,
      multiline: true
    };
    if (frState.expand) {
      query = query.replace(/\\n/g, "\n").replace(/\\t/g, "	").replace(/\\r/g, "\r");
    }
    if (frState.regex) {
      try {
        query = new RegExp(query, frState.caseSens ? "" : "i");
      } catch (e) {
        setFrStatus("\u6B63\u5219\u65E0\u6548: " + e.message, "error");
        return null;
      }
    }
    return cm.getSearchCursor(query, fromPos, opts);
  }
  function getScopeRange() {
    if (frState.scope === "selection") {
      var sel = cm.listSelections()[0];
      if (sel) {
        var a = cm.getCursor("from"), b = cm.getCursor("to");
        if (a.line !== b.line || a.ch !== b.ch) return { from: a, to: b };
        setFrStatus("\u6CA1\u6709\u9009\u4E2D\u8303\u56F4\uFF0C\u5DF2\u5207\u6362\u5230\u5F53\u524D\u6587\u4EF6", "");
        return null;
      }
    } else if (frState.scope === "all") {
      setFrStatus("\u300C\u6240\u6709\u6253\u5F00\u7684\u6587\u4EF6\u300D\u6682\u9000\u5316\u4E3A\u5F53\u524D\u6587\u4EF6", "");
      return null;
    }
    return null;
  }
  function findOne(fromPos, backward) {
    var q = $("fr-find").value;
    if (!q) {
      setFrStatus("\u8BF7\u8F93\u5165\u67E5\u627E\u5185\u5BB9", "error");
      return null;
    }
    if (frState.regex) {
      try {
        new RegExp(q);
      } catch (e) {
        setFrStatus("\u6B63\u5219\u9519\u8BEF: " + e.message, "error");
        return null;
      }
    }
    function advancePos(p2) {
      var line = cm.getLine(p2.line);
      if (line == null) return { line: p2.line, ch: p2.ch + 1 };
      if (p2.ch < line.length) return { line: p2.line, ch: p2.ch + 1 };
      return { line: p2.line + 1, ch: 0 };
    }
    function posKey(p2) {
      return p2.line + "," + p2.ch;
    }
    if (frState.regex && /[\^$]|\\b/.test(q)) {
      var re;
      try {
        re = new RegExp(q, frState.caseSens ? "gm" : "gim");
      } catch (e) {
        setFrStatus("\u6B63\u5219\u9519\u8BEF: " + e.message, "error");
        return null;
      }
      var totalLines = cm.lineCount();
      var startLine = backward ? Math.max(0, fromPos.line) : fromPos.line;
      if (backward) {
        for (var l = startLine; l >= 0; l--) {
          re.lastIndex = 0;
          var m = re.exec(cm.getLine(l));
          if (m && m.index === 0) {
            if (comparePos({ line: l, ch: 0 }, fromPos) <= 0) return { from: { line: l, ch: 0 }, to: { line: l, ch: 0 } };
          }
        }
        return null;
      } else {
        for (var l = startLine; l < totalLines; l++) {
          re.lastIndex = 0;
          var m = re.exec(cm.getLine(l));
          if (m && m.index === 0) {
            var hitPos = { line: l, ch: 0 };
            if (comparePos(hitPos, fromPos) > 0) return { from: hitPos, to: hitPos };
          }
        }
        return null;
      }
    }
    var cursor = makeCursor(fromPos, q);
    if (!cursor) return null;
    var hit;
    if (backward) {
      hit = null;
      var iter = 0;
      var c2 = makeCursor({ line: 0, ch: 0 }, q);
      var prevK = "";
      while (c2.findNext()) {
        if (++iter > FR_BACK_MAX) {
          setFrStatus("\u53CD\u5411\u67E5\u627E\u8FED\u4EE3\u8D85\u8FC7 " + FR_BACK_MAX + " \u6B65\uFF0C\u8BF7\u7F29\u5C0F\u8303\u56F4\u6216\u6539\u7528\u300C\u4E0B\u4E00\u4E2A\u300D", "error");
          return hit;
        }
        var p = c2.from(), k = posKey(p) + "-" + posKey(c2.to());
        if (k === prevK) break;
        prevK = k;
        if (comparePos(p, fromPos) < 0) hit = { from: p, to: c2.to() };
        else break;
      }
    } else {
      hit = null;
      var iterF = 0;
      var prevKF = "";
      while (cursor.findNext()) {
        if (++iterF > FR_BACK_MAX) break;
        var pF = cursor.from(), kF = posKey(pF) + "-" + posKey(cursor.to());
        if (kF === prevKF) break;
        prevKF = kF;
        if (comparePos(pF, fromPos) > 0) {
          hit = { from: pF, to: cursor.to() };
          break;
        }
      }
    }
    return hit;
  }
  function comparePos(a, b) {
    if (a.line !== b.line) return a.line - b.line;
    return a.ch - b.ch;
  }
  function frFindNext(backward) {
    var q = $("fr-find").value;
    if (!q) {
      setFrStatus("\u8BF7\u8F93\u5165\u67E5\u627E\u5185\u5BB9", "error");
      return;
    }
    frState.findHistory = pushHistory(frState.findHistory, q);
    frSave();
    var cur = cm.getCursor("from");
    var hit = findOne(cur, backward);
    if (!hit) {
      var restart = backward ? { line: cm.lineCount() - 1, ch: cm.getLine(cm.lineCount() - 1).length } : { line: 0, ch: 0 };
      hit = findOne(restart, backward);
      if (hit && frState.cycle) {
        setFrStatus("\u5DF2\u4ECE\u6587\u4EF6" + (backward ? "\u672B\u5C3E" : "\u5F00\u5934") + "\u56DE\u73AF\u67E5\u627E", "ok");
      }
    }
    if (!hit) {
      setFrStatus("\u672A\u627E\u5230\u5339\u914D\u9879", "error");
      cm.focus();
      return;
    }
    var scope = getScopeRange();
    if (scope) {
      if (comparePos(hit.from, scope.from) < 0 || comparePos(hit.to, scope.to) > 0) {
        let posKey2 = function(p) {
          return p.line + "," + p.ch;
        }, advancePos2 = function(p) {
          var line = cm.getLine(p.line);
          if (line == null) return { line: p.line, ch: p.ch + 1 };
          if (p.ch < line.length) return { line: p.line, ch: p.ch + 1 };
          return { line: p.line + 1, ch: 0 };
        };
        var cursor = makeCursor(scope.from, q);
        var inside = null;
        var prevK = "";
        while (cursor && cursor.findNext()) {
          var f = cursor.from(), t = cursor.to();
          var k = posKey2(f) + "-" + posKey2(t);
          if (k === prevK) break;
          prevK = k;
          if (comparePos(f, scope.to) > 0) break;
          if (comparePos(f, hit.from) >= 0) {
            inside = { from: f, to: t };
            break;
          }
          cursor = makeCursor(advancePos2(t), q);
        }
        if (!inside) {
          setFrStatus("\u8303\u56F4\u5185\u5DF2\u65E0\u53EF\u5339\u914D\u9879", "error");
          return;
        }
        hit = inside;
      }
    }
    cm.setSelection(hit.from, hit.to);
    cm.scrollIntoView({ from: hit.from, to: hit.to }, 80);
    setCurrentMatchMark(hit.from, hit.to);
    cm.focus();
    if (state.frLastQuery !== q) {
      state.frLastQuery = q;
      setTimeout(function() {
        frCountMatches(q);
        applyFrHighlight();
      }, 0);
    }
  }
  function clearFrMarks() {
    for (var i = 0; i < state.frMarks.length; i++) {
      try {
        state.frMarks[i].clear();
      } catch (_) {
      }
    }
    state.frMarks = [];
  }
  function clearCurrentMatchMark() {
    if (state.frCurrentMark) {
      try {
        state.frCurrentMark.clear();
      } catch (_) {
      }
      state.frCurrentMark = null;
    }
  }
  function setCurrentMatchMark(from, to) {
    clearCurrentMatchMark();
    if (!from || !to) return;
    try {
      state.frCurrentMark = cm.markText(from, to, {
        className: "cm-fr-current",
        clearWhenEmpty: false
      });
    } catch (_) {
    }
  }
  function applyFrHighlight() {
    var myToken = ++state.frHlToken;
    state.frHlRunning = true;
    function finish() {
      state.frHlRunning = false;
    }
    function aborted() {
      return myToken !== state.frHlToken;
    }
    try {
      let hlPosKey = function(p) {
        return p.line + "," + p.ch;
      }, hlAdvance = function(p) {
        var line = cm.getLine(p.line);
        if (line == null) return { line: p.line, ch: p.ch + 1 };
        if (p.ch < line.length) return { line: p.line, ch: p.ch + 1 };
        return { line: p.line + 1, ch: 0 };
      }, step = function() {
        if (aborted()) return;
        var done = false, truncated2 = false;
        try {
          for (var k = 0; k < FR_HL_BATCH; k++) {
            if (!cursor.findNext()) {
              done = true;
              break;
            }
            var f = cursor.from(), t = cursor.to();
            var key = hlPosKey(f) + "-" + hlPosKey(t);
            if (key === prevHlKey) {
              done = true;
              break;
            }
            prevHlKey = key;
            if (comparePos(f, t) !== 0) {
              try {
                var m = cm.markText(f, t, {
                  className: "cm-fr-searching",
                  clearWhenEmpty: false
                });
                state.frMarks.push(m);
              } catch (_) {
              }
              n++;
              if (n >= FR_HL_HARD_CAP) {
                truncated2 = true;
                break;
              }
            }
            cursor = makeCursor(hlAdvance(t), q);
            if (!cursor) {
              done = true;
              break;
            }
          }
        } catch (e) {
          done = true;
        }
        if (aborted()) return;
        if (done) {
          finish();
          return;
        }
        if (truncated2) {
          setFrStatus("\u5339\u914D\u8FC7\u591A\uFF08>" + FR_HL_HARD_CAP + "\uFF09\uFF0C\u4EC5\u9AD8\u4EAE\u524D " + FR_HL_HARD_CAP + " \u4E2A\u3002\u70B9\u51FB\u300C\u4E0B\u4E00\u4E2A\u300D\u4ECD\u53EF\u9010\u4E2A\u5B9A\u4F4D", "");
          finish();
          return;
        }
        setTimeout(step, 0);
      };
      clearFrMarks();
      if (!frState.highlight) return finish();
      var q = $("fr-find").value;
      if (!q) return finish();
      var docLen = cm.getValue().length;
      if (docLen > FR_HL_DOC_CAP) {
        setFrStatus("\u6587\u6863\u8F83\u5927\uFF08>" + Math.round(FR_HL_DOC_CAP / 1024) + "KB\uFF09\uFF0C\u5DF2\u8DF3\u8FC7\u5168\u6587\u6863\u9AD8\u4EAE\uFF08\u67E5\u627E/\u66FF\u6362\u4ECD\u53EF\u7528\uFF09", "");
        return finish();
      }
      if (frState.regex) {
        try {
          new RegExp(q);
        } catch (_) {
          return finish();
        }
      }
      if (!frState.regex && !frState.wholeWord && !frState.expand) {
        var text0 = cm.getValue();
        var count = 0, idx = 0;
        if (!frState.caseSens) {
          var lt = text0.toLowerCase();
          var lq = q.toLowerCase();
          while ((idx = lt.indexOf(lq, idx)) !== -1) {
            count++;
            idx += lq.length || 1;
            if (count > FR_HL_EST_CAP) break;
          }
        } else {
          count = text0.split(q).length - 1;
        }
        if (count > FR_HL_EST_CAP) {
          setFrStatus("\u5339\u914D\u8FC7\u591A\uFF08>" + FR_HL_EST_CAP + "\uFF09\uFF0C\u5DF2\u8DF3\u8FC7\u5168\u6587\u6863\u9AD8\u4EAE\uFF08\u67E5\u627E/\u66FF\u6362\u4ECD\u53EF\u7528\uFF09", "");
          return finish();
        }
      }
      var useAnchorShortcut = frState.regex && /[\^$]|\\b/.test(q);
      if (useAnchorShortcut) {
        var reHl;
        try {
          reHl = new RegExp(q, frState.caseSens ? "gm" : "gim");
        } catch (_) {
          return finish();
        }
        var totalLinesHl = cm.lineCount();
        for (var lh = 0; lh < totalLinesHl && n < FR_HL_HARD_CAP; lh++) {
          reHl.lastIndex = 0;
          var lineStrHl = cm.getLine(lh);
          var mmh;
          while ((mmh = reHl.exec(lineStrHl)) !== null) {
            var f2 = { line: lh, ch: mmh.index };
            var t2 = { line: lh, ch: mmh.index + mmh[0].length };
            try {
              var m2 = cm.markText(f2, t2, {
                className: "cm-fr-searching",
                clearWhenEmpty: false
              });
              state.frMarks.push(m2);
              n++;
            } catch (_) {
            }
            if (n >= FR_HL_HARD_CAP) {
              truncated = true;
              break;
            }
            if (mmh[0].length === 0) reHl.lastIndex++;
          }
        }
        if (aborted()) return;
        if (truncated) setFrStatus("\u5339\u914D\u8FC7\u591A\uFF08>" + FR_HL_HARD_CAP + "\uFF09\uFF0C\u4EC5\u9AD8\u4EAE\u524D " + FR_HL_HARD_CAP + " \u4E2A\u3002\u70B9\u51FB\u300C\u4E0B\u4E00\u4E2A\u300D\u4ECD\u53EF\u9010\u4E2A\u5B9A\u4F4D", "");
        finish();
        return;
      }
      var cursor = makeCursor({ line: 0, ch: 0 }, q);
      if (!cursor) return finish();
      var n = 0;
      var prevHlKey = "";
      step();
    } catch (e) {
      finish();
    }
  }
  function scheduleFrHighlight() {
    if (state.frHlTimer) clearTimeout(state.frHlTimer);
    state.frHlTimer = setTimeout(function() {
      state.frHlTimer = null;
      applyFrHighlight();
    }, 200);
  }
  function frCountMatches(q) {
    if (!q) return setFrStatus("", "");
    var n;
    if (!frState.regex && !frState.wholeWord && !frState.expand) {
      var text = cm.getValue();
      if (!frState.caseSens) {
        var lowerText = text.toLowerCase();
        var lowerQ = q.toLowerCase();
        var idx = 0, cnt = 0;
        while ((idx = lowerText.indexOf(lowerQ, idx)) !== -1) {
          cnt++;
          idx += lowerQ.length || 1;
          if (cnt > 99999) break;
        }
        n = cnt;
      } else {
        n = text.split(q).length - 1;
        if (n > 1e5) n = 1e5;
      }
    } else if (frState.regex && /[\^$]|\\b/.test(q)) {
      var reCount;
      try {
        reCount = new RegExp(q, frState.caseSens ? "gm" : "gim");
      } catch (_) {
        return setFrStatus("\u6B63\u5219\u65E0\u6548", "error");
      }
      var totalLines = cm.lineCount();
      n = 0;
      for (var l = 0; l < totalLines && n < 99999; l++) {
        reCount.lastIndex = 0;
        var lineStr = cm.getLine(l);
        var mm;
        while ((mm = reCount.exec(lineStr)) !== null) {
          n++;
          if (mm[0].length === 0) reCount.lastIndex++;
          else if (reCount.lastIndex === mm.index) reCount.lastIndex++;
          if (n >= 99999) break;
        }
      }
    } else {
      let posKey = function(p) {
        return p.line + "," + p.ch;
      }, advancePos = function(p) {
        var line = cm.getLine(p.line);
        if (line == null) return { line: p.line, ch: p.ch + 1 };
        if (p.ch < line.length) return { line: p.line, ch: p.ch + 1 };
        return { line: p.line + 1, ch: 0 };
      };
      var cursor = makeCursor({ line: 0, ch: 0 }, q);
      if (!cursor) return setFrStatus("\u6B63\u5219\u65E0\u6548", "error");
      n = 0;
      var prevKey = "";
      var HARD = 9999;
      while (cursor.findNext()) {
        var f = cursor.from(), t = cursor.to();
        var key = posKey(f) + "-" + posKey(t);
        if (key === prevKey) break;
        prevKey = key;
        n++;
        if (n > HARD) break;
        cursor = makeCursor(advancePos(t), q);
      }
    }
    if (n === 0) setFrStatus("\u672A\u627E\u5230", "error");
    else if (n >= 99999) setFrStatus("\u5339\u914D\u6570 \u2265 100000\uFF08\u4EC5\u4F30\u7B97\uFF09", "");
    else setFrStatus("\u5171 " + n + " \u5904\u5339\u914D \xB7 \u5F53\u524D\u5DF2\u9009\u4E2D", "ok");
  }
  function getReplaceInput() {
    var r = $("fr-replace").value;
    r = r.replace(/\\n/g, "\n").replace(/\\t/g, "	").replace(/\\r/g, "\r");
    frState.replaceHistory = pushHistory(frState.replaceHistory, r);
    frSave();
    return r;
  }
  function frDoReplace(from, to, q, replacement) {
    var text;
    if (frState.regex) {
      try {
        var re = new RegExp(q, frState.caseSens ? "" : "i");
        text = cm.getRange(from, to).replace(re, replacement);
      } catch (e) {
        setFrStatus("\u6B63\u5219\u9519\u8BEF: " + e.message, "error");
        return false;
      }
    } else {
      text = replacement;
    }
    cm.replaceRange(text, from, to);
    return true;
  }
  function frReplaceOne() {
    var q = $("fr-find").value;
    if (!q) {
      setFrStatus("\u8BF7\u8F93\u5165\u67E5\u627E\u5185\u5BB9", "error");
      return;
    }
    var replacement = getReplaceInput();
    var sel = cm.listSelections()[0];
    var isMatch = false;
    if (sel && (sel.anchor.line !== sel.head.line || sel.anchor.ch !== sel.head.ch)) {
      var hit = findOne(sel.anchor, false);
      if (hit && comparePos(hit.from, sel.anchor) === 0 && comparePos(hit.to, sel.head) === 0) {
        isMatch = true;
      }
    }
    if (isMatch) {
      frDoReplace(sel.anchor, sel.head, q, replacement);
      setFrStatus("\u5DF2\u66FF\u6362 1 \u5904", "ok");
      state.frLastQuery = null;
      setTimeout(function() {
        frFindNext(false);
      }, 0);
    } else {
      frFindNext(false);
      setFrStatus("\u5DF2\u9009\u4E2D\u5339\u914D\u9879\uFF0C\u518D\u6B21\u70B9\u51FB\u300C\u66FF\u6362\u300D\u8FDB\u884C\u66FF\u6362", "");
    }
  }
  function frReplaceAll() {
    var q = $("fr-find").value;
    if (!q) {
      setFrStatus("\u8BF7\u8F93\u5165\u67E5\u627E\u5185\u5BB9", "error");
      return;
    }
    var replacement = getReplaceInput();
    var scope = getScopeRange();
    var from = scope ? scope.from : { line: 0, ch: 0 };
    var to = scope ? scope.to : { line: cm.lineCount() - 1, ch: cm.getLine(cm.lineCount() - 1).length };
    var regex;
    if (frState.regex) {
      try {
        regex = new RegExp(q, frState.caseSens ? "g" : "gi");
      } catch (e) {
        setFrStatus("\u6B63\u5219\u9519\u8BEF: " + e.message, "error");
        return;
      }
    }
    var edits = [];
    var count = 0;
    var HARD = 5e4;
    function posKey(p) {
      return p.line + "," + p.ch;
    }
    function advancePos(p) {
      var line = cm.getLine(p.line);
      if (line == null) return { line: p.line, ch: p.ch + 1 };
      if (p.ch < line.length) return { line: p.line, ch: p.ch + 1 };
      return { line: p.line + 1, ch: 0 };
    }
    var cursor;
    var useAnchorShortcut = frState.regex && /[\^$]|\\b/.test(q);
    if (useAnchorShortcut) {
      try {
        regex = new RegExp(q, frState.caseSens ? "gm" : "gim");
      } catch (e) {
        setFrStatus("\u6B63\u5219\u9519\u8BEF: " + e.message, "error");
        return;
      }
      var totalLines = cm.lineCount();
      for (var l = 0; l < totalLines; l++) {
        regex.lastIndex = 0;
        var lineStr = cm.getLine(l);
        var mm;
        while ((mm = regex.exec(lineStr)) !== null) {
          var hitFrom = { line: l, ch: mm.index };
          var hitTo = { line: l, ch: mm.index + mm[0].length };
          if (scope && comparePos(hitFrom, scope.to) >= 0) break;
          if (scope && comparePos(hitTo, scope.from) <= 0) {
          } else {
            var text = hitFrom.ch === hitTo.ch ? replacement : cm.getRange(hitFrom, hitTo).replace(regex, replacement);
            edits.push({ from: hitFrom, to: hitTo, text });
            count++;
            if (count >= HARD) break;
          }
          if (mm[0].length === 0) regex.lastIndex++;
        }
        if (count >= HARD) break;
      }
    } else {
      cursor = makeCursor(from, q);
      if (!cursor) return;
      var prevKey = "";
      while (cursor.findNext()) {
        var f = cursor.from(), t = cursor.to();
        if (scope && comparePos(t, scope.to) > 0) break;
        if (scope && comparePos(f, scope.from) < 0) {
          cursor = makeCursor(advancePos(f), q);
          continue;
        }
        var curKey = posKey(f) + "-" + posKey(t);
        if (curKey === prevKey) break;
        prevKey = curKey;
        var text;
        if (frState.regex) {
          text = cm.getRange(f, t).replace(regex, replacement);
        } else {
          text = replacement;
        }
        edits.push({ from: f, to: t, text });
        count++;
        if (count >= HARD) break;
        cursor = makeCursor(advancePos(t), q);
      }
    }
    if (count === 0) {
      setFrStatus("\u672A\u627E\u5230\u5339\u914D\u9879", "error");
      return;
    }
    cm.operation(function() {
      var B = 200;
      for (var i = edits.length - 1; i >= 0; i -= B) {
        var from2 = Math.max(0, i - B + 1);
        for (var j = i; j >= from2; j--) {
          var ed = edits[j];
          cm.replaceRange(ed.text, ed.from, ed.to);
        }
        if (from2 > 0) {
        }
      }
    });
    setFrStatus("\u5171\u66FF\u6362 " + count + (count >= HARD ? "+\uFF08\u8FBE\u5230\u4E0A\u9650\uFF09" : "") + " \u5904", "ok");
    state.frLastQuery = null;
    applyFrHighlight();
  }
  function frOpenBatchModal() {
    openSingleModal("fr-batch-modal");
    setTimeout(function() {
      $("fr-batch-text").focus();
    }, 0);
  }
  function frBatchRun() {
    var txt = $("fr-batch-text").value;
    if (!txt.trim()) {
      setFrStatus("\u6279\u91CF\u66FF\u6362\u5185\u5BB9\u4E3A\u7A7A", "error");
      return;
    }
    var pairs = [];
    txt.split(/\r?\n/).forEach(function(line) {
      var m = line.match(/^(.*?)\s*(?:⇨|=>|=>|->|=|⇨|⇢)\s*(.*)$/);
      if (m) {
        var f = m[1], r = m[2];
        if (f) pairs.push({ find: f, replace: r });
      }
    });
    if (pairs.length === 0) {
      setFrStatus("\u672A\u89E3\u6790\u5230\u6709\u6548\u89C4\u5219\uFF08\u683C\u5F0F\uFF1Aold \u21E8 new\uFF09", "error");
      return;
    }
    var ok = 0;
    cm.operation(function() {
      pairs.forEach(function(p) {
        var cursor = makeCursor({ line: 0, ch: 0 }, p.find);
        var edits = [];
        while (cursor.findNext()) {
          var f = cursor.from(), t = cursor.to();
          var text;
          if (frState.regex) {
            try {
              var re = new RegExp(p.find, frState.caseSens ? "g" : "gi");
              text = cm.getRange(f, t).replace(re, p.replace);
            } catch (_) {
              continue;
            }
          } else {
            text = p.replace;
          }
          edits.push({ from: f, to: t, text });
          if (edits.length > 5e4) break;
        }
        for (var i = edits.length - 1; i >= 0; i--) {
          cm.replaceRange(edits[i].text, edits[i].from, edits[i].to);
        }
        ok += edits.length;
      });
    });
    setFrStatus("\u6279\u91CF\u5B8C\u6210\uFF1A" + pairs.length + " \u6761\u89C4\u5219\uFF0C\u5171\u66FF\u6362 " + ok + " \u5904", "ok");
    $("fr-batch-modal").style.display = "none";
    applyFrHighlight();
  }

  // src-app/15-insert.js
  function insertAtCursor(text) {
    var pos = cm.getCursor();
    cm.replaceRange(text, pos);
    cm.setCursor({ line: pos.line, ch: pos.ch + text.length });
    cm.focus();
    syncFromEditor();
  }
  function canInsertBlock() {
    var d = activeDoc();
    if (!d) {
      toast("\u8BF7\u5148\u6253\u5F00\u6587\u6863", "error");
      return false;
    }
    if (d.lang !== "markdown" && d.lang !== "html") {
      toast("\u300C\u63D2\u5165\u300D\u7EC4\u4EF6\u4EC5\u9002\u7528\u4E8E Markdown / HTML \u6587\u6863", "error");
      return false;
    }
    return true;
  }
  function insertBlock(text) {
    if (!canInsertBlock()) return;
    var pos = cm.getCursor();
    var curLine = cm.getLine(pos.line) || "";
    var prefix = pos.ch === 0 && curLine.trim() === "" ? "" : "\n\n";
    insertAtCursor(prefix + text + "\n");
  }
  var CALLOUT_PREVIEW = {
    note: "\u8FD9\u91CC\u5199\u8BF4\u660E\u6216\u8865\u5145\u4FE1\u606F\uFF0C\u53EF\u7528\u4E8E\u5907\u6CE8\u3001\u80CC\u666F\u8BF4\u660E\u7B49\u3002",
    tip: "\u8FD9\u91CC\u5199\u6280\u5DE7\u6216\u5EFA\u8BAE\uFF0C\u5E2E\u52A9\u8BFB\u8005\u66F4\u5FEB\u4E0A\u624B\u3002",
    important: "\u8FD9\u91CC\u5199\u91CD\u8981\u63D0\u9192\uFF0C\u8BFB\u8005\u52A1\u5FC5\u7559\u610F\u3002",
    warning: "\u8FD9\u91CC\u5199\u8B66\u544A\u5185\u5BB9\uFF0C\u63D0\u793A\u6F5C\u5728\u98CE\u9669\u3002",
    caution: "\u8FD9\u91CC\u5199\u5371\u9669 / \u7981\u6B62\u5185\u5BB9\uFF0C\u52A1\u5FC5\u907F\u514D\u3002"
  };
  function insertCallout(type) {
    var body = CALLOUT_PREVIEW[type] || "\u8FD9\u91CC\u5199\u6807\u6CE8\u5185\u5BB9\u3002";
    insertBlock("> [!" + type.toUpperCase() + "]\n> " + body + "\n");
    closeAllInsertModals();
  }
  function insertCode(lang) {
    insertBlock("```" + lang + "\n// \u5728\u6B64\u7C98\u8D34 " + lang + " \u4EE3\u7801\n\n```");
  }
  function insertTable(rows, cols, header) {
    rows = Math.max(1, +rows || 3);
    cols = Math.max(1, +cols || 3);
    var i, j, lines = [], head = [], sep = [], blank = [];
    for (j = 0; j < cols; j++) {
      head.push("\u8868\u5934" + (j + 1));
      sep.push("---");
      blank.push("\u5185\u5BB9" + (j + 1));
    }
    lines.push("| " + head.join(" | ") + " |");
    lines.push("| " + sep.join(" | ") + " |");
    for (i = 0; i < rows - (header ? 1 : 0); i++) {
      lines.push("| " + blank.join(" | ") + " |");
    }
    insertBlock(lines.join("\n"));
    closeAllInsertModals();
  }
  function insertCols() {
    insertBlock('<div class="md-cols"><div class="md-col">\n\n**\u5DE6\u680F** \u5185\u5BB9\n\n</div><div class="md-col">\n\n**\u53F3\u680F** \u5185\u5BB9\n\n</div></div>');
  }
  function openInsertMenu() {
    var m = $("insert-menu");
    if (!m) return;
    var willOpen = m.style.display === "none" || !m.style.display;
    if (willOpen) closeAllToolMenus();
    if (willOpen) showMenuAtMoreBtn(m);
    else m.style.display = "none";
  }
  function closeInsertMenu() {
    var m = $("insert-menu");
    if (m) m.style.display = "none";
  }
  function showMenuAtMoreBtn(menu) {
    if (!menu) return;
    var moreBtn = document.getElementById("btn-more");
    var host = moreBtn && moreBtn.parentNode ? moreBtn.parentNode : document.body;
    if (menu.parentNode !== host) host.appendChild(menu);
    menu.style.display = "block";
    if (!moreBtn) {
      menu.style.position = "fixed";
      menu.style.top = "52px";
      menu.style.right = "16px";
      menu.style.left = "auto";
    }
  }
  function closeAllToolMenus() {
    var tm = $("tool-menu");
    if (tm) tm.style.display = "none";
    var cv = $("convert-menu");
    if (cv) cv.style.display = "none";
    var ttm = $("texttool-menu");
    if (ttm) ttm.style.display = "none";
    var im = $("insert-menu");
    if (im) im.style.display = "none";
  }
  function openIconModal() {
    if (!canInsertBlock()) return;
    buildIconGrids();
    openSingleModal("icon-modal");
    setTimeout(function() {
      if ($("icon-search")) $("icon-search").focus();
    }, 0);
  }
  function closeIconModal() {
    if ($("icon-modal")) $("icon-modal").style.display = "none";
  }
  function buildIconGrids() {
    var ge = $("icon-grid-emoji");
    if (!ge || ge.dataset.built) return;
    if (typeof InkpadIcons !== "undefined") {
      InkpadIcons.EMOJI.forEach(function(e) {
        var b = document.createElement("button");
        b.className = "icon-cell";
        b.textContent = e;
        b.title = e;
        b.addEventListener("click", function() {
          insertAtCursor(e);
          closeIconModal();
        });
        ge.appendChild(b);
      });
      ge.dataset.built = "1";
      var gv = $("icon-grid-vector");
      InkpadIcons.names.forEach(function(name) {
        var b = document.createElement("button");
        b.className = "icon-cell icon-cell-vector";
        b.innerHTML = InkpadIcons.svg(name);
        b.title = ":icon-" + name + ":";
        b.addEventListener("click", function() {
          insertAtCursor(":icon-" + name + ":");
          closeIconModal();
        });
        gv.appendChild(b);
      });
    }
  }
  function filterIcons(q) {
    q = (q || "").trim().toLowerCase();
    var ge = $("icon-grid-emoji"), gv = $("icon-grid-vector");
    if (ge) Array.prototype.forEach.call(ge.children, function(b) {
      b.style.display = !q || (b.textContent || "").toLowerCase().indexOf(q) !== -1 ? "" : "none";
    });
    if (gv) Array.prototype.forEach.call(gv.children, function(b) {
      b.style.display = !q || (b.title || "").toLowerCase().indexOf(q) !== -1 ? "" : "none";
    });
  }
  function openCalloutModal() {
    if (!canInsertBlock()) return;
    openSingleModal("callout-modal");
  }
  function closeCalloutModal() {
    if ($("callout-modal")) $("callout-modal").style.display = "none";
  }
  function openCodeModal() {
    if (!canInsertBlock()) return;
    openSingleModal("code-ins-modal");
    setTimeout(function() {
      if ($("code-ins-lang")) $("code-ins-lang").focus();
    }, 0);
  }
  function closeCodeModal() {
    if ($("code-ins-modal")) $("code-ins-modal").style.display = "none";
  }
  function openTableModal() {
    if (!canInsertBlock()) return;
    openSingleModal("table-ins-modal");
  }
  function closeTableModal() {
    if ($("table-ins-modal")) $("table-ins-modal").style.display = "none";
  }
  function closeAllInsertModals() {
    closeCodeModal();
    closeTableModal();
    closeIconModal();
    closeCalloutModal();
    closeInsertMenu();
  }
  function openSingleModal(id) {
    if (!id) return;
    if (id !== "ts-modal") closeTsModal();
    if (id !== "fr-overlay") closeFindModal();
    if (id !== "doc-del-modal") closeDocDelConfirm();
    var all = document.querySelectorAll(".modal-overlay, #fr-overlay");
    Array.prototype.forEach.call(all, function(el) {
      if (el.id !== id) el.style.display = "none";
    });
    closeInsertMenu();
    var target = $(id);
    if (!target) return;
    target.style.display = id === "fr-overlay" ? "block" : "flex";
  }
  function routeInsert(kind) {
    closeInsertMenu();
    var d = activeDoc();
    if (d && d.kind === "rich") {
      if (window.InkpadBlocks) {
        var rk = kind === "task" ? "todo" : kind;
        var SUPPORTED = ["text", "h1", "h2", "h3", "todo", "quote", "code", "table", "image", "mermaid", "math", "callout", "hr", "cols"];
        if (SUPPORTED.indexOf(rk) >= 0) window.InkpadBlocks.insertBlock(rk);
        else toast("\u8BE5\u7EC4\u4EF6\u5728\u5BCC\u6587\u6863\u6A21\u5F0F\u4E0B\u6682\u4E0D\u652F\u6301\uFF0C\u53EF\u5728\u6587\u672C\u5757\u4E2D\u76F4\u63A5\u7528 :icon-\u540D\u79F0: \u5D4C\u5165\u56FE\u6807", "info");
      }
      return;
    }
    switch (kind) {
      case "code":
        openCodeModal();
        break;
      case "image":
        insertImageFile();
        break;
      case "table":
        openTableModal();
        break;
      case "mermaid":
        insertBlock("```mermaid\ngraph TD\n  A[\u5F00\u59CB] --> B{\u6761\u4EF6\u5224\u65AD}\n  B -->|\u662F| C[\u6267\u884C\u64CD\u4F5C]\n  B -->|\u5426| D[\u7ED3\u675F]\n```");
        break;
      case "icon":
        openIconModal();
        break;
      case "math":
        insertBlock("$$\nE = mc^2\n$$");
        break;
      case "callout":
        openCalloutModal();
        break;
      case "task":
        insertBlock("- [ ] \u5F85\u529E\u4E8B\u9879\u4E00\n- [ ] \u5F85\u529E\u4E8B\u9879\u4E8C\n- [x] \u5DF2\u5B8C\u6210\u4E8B\u9879");
        break;
      case "quote":
        insertBlock("> \u5F15\u7528\u5185\u5BB9\uFF1A\u8FD9\u91CC\u5199\u5F15\u7528\u6587\u5B57\u3002");
        break;
      case "toc":
        insertBlock("[TOC]");
        break;
      case "hr":
        insertBlock("---");
        break;
      case "cols":
        insertCols();
        break;
    }
  }
  function scheduleFoldDataUris() {
    if (!cm) return;
    if (scheduleFoldDataUris._t) return;
    scheduleFoldDataUris._t = setTimeout(function() {
      scheduleFoldDataUris._t = null;
      try {
        foldDataUris(cm);
      } catch (e) {
      }
    }, 60);
  }
  function foldDataUris(cm2) {
    if (!cm2) return;
    try {
      var marks = cm2.getAllMarks();
      for (var i = 0; i < marks.length; i++) {
        if (marks[i].__inkpadDataUriFold) marks[i].clear();
      }
    } catch (e) {
    }
    var text = cm2.getValue();
    if (!text) return;
    var re = /!\[[^\]]*\]\(data:([^;,)]+);base64,([A-Za-z0-9+/=]+)\)/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var urlStart = m.index + m[0].indexOf("(data:") + 1;
      var urlLen = ("data:" + m[1] + ";base64," + m[2]).length;
      var fromIdx = urlStart;
      var toIdx = urlStart + urlLen;
      var from = cm2.posFromIndex(fromIdx);
      var to = cm2.posFromIndex(toIdx);
      if (!from || !to) continue;
      try {
        var sizeKB = m[2].length * 0.75 / 1024;
        var sizeTxt = sizeKB >= 1024 ? (sizeKB / 1024).toFixed(2) + " MB" : sizeKB.toFixed(1) + " KB";
        var widget = document.createElement("span");
        widget.className = "ink-datauri-fold";
        widget.contentEditable = false;
        var lbl = document.createElement("span");
        lbl.className = "ink-datauri-fold-label";
        lbl.textContent = "\u{1F5BC} \u5D4C\u5165\u56FE\u7247 \xB7 " + m[1] + " \xB7 " + sizeTxt;
        widget.appendChild(lbl);
        var btn = document.createElement("span");
        btn.className = "ink-datauri-fold-btn";
        btn.textContent = "\u5C55\u5F00";
        btn.title = "\u5C55\u5F00/\u6536\u8D77\u5185\u8054\u56FE\u7247\u6570\u636E";
        widget.appendChild(btn);
        var mk = cm2.markText(from, to, {
          collapsed: true,
          replacement: widget,
          inclusiveLeft: false,
          inclusiveRight: false,
          clearWhenEmpty: false
        });
        mk.__inkpadDataUriFold = true;
        (function(mref) {
          widget.addEventListener("click", function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            try {
              mref.clear();
            } catch (e) {
            }
          });
        })(mk);
      } catch (e) {
      }
    }
  }
  function extFromType(type) {
    return { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/bmp": "bmp" }[type] || "png";
  }
  function insertImageFile() {
    var d = activeDoc();
    if (!d || d.kind && d.kind !== "text") {
      toast("\u8BF7\u5148\u6253\u5F00\u6587\u672C\u6587\u6863", "error");
      return;
    }
    if (d.lang !== "markdown" && d.lang !== "html") {
      toast("\u63D2\u5165\u56FE\u7247\u9700\u5207\u6362\u5230 Markdown \u6216 HTML \u6587\u6863", "error");
      return;
    }
    if (!hasApi()) {
      toast("\u63D2\u5165\u56FE\u7247\u9700\u5728\u684C\u9762\u7248\u4E2D\u4F7F\u7528", "error");
      return;
    }
    var hasDisk = !!d.diskPath;
    var baseDir = hasDisk ? dirOf(d.diskPath) : null;
    getApi().pick_files().then(function(paths) {
      if (!paths || !paths.length) return;
      var queue = Promise.resolve();
      paths.forEach(function(p) {
        queue = queue.then(function() {
          if (hasDisk) {
            return getApi().copy_image_to_assets(baseDir, p).then(function(res) {
              if (res && res.path) {
                insertAtCursor("![](" + res.rel + ")");
                toast("\u5DF2\u63D2\u5165\uFF1A" + res.rel, "success");
              } else if (res && res.error) {
                toast("\u63D2\u5165\u5931\u8D25\uFF1A" + res.error, "error");
              }
            });
          } else {
            return getApi().read_file_b64(p).then(function(res) {
              if (!res || !res.b64) {
                toast("\u8BFB\u53D6\u56FE\u7247\u5931\u8D25\uFF1A" + p, "error");
                return;
              }
              insertAtCursor("![image](" + buildDataUri(res.mime || _guessMimeFromPath(p), res.b64) + ")");
              toast("\u5DF2\u63D2\u5165\u5185\u8054\u56FE\u7247\uFF08\u4FDD\u5B58\u6587\u6863\u540E\u56FE\u7247\u5C06\u968F\u6587\u6863\u4E00\u8D77\u4FDD\u5B58\uFF09", "success");
            });
          }
        });
      });
    }).catch(function() {
      toast("\u9009\u62E9\u56FE\u7247\u5931\u8D25", "error");
    });
  }
  function _guessMimeFromPath(p) {
    var ext = (p.split(".").pop() || "").toLowerCase();
    return ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : ext === "svg" ? "image/svg+xml" : "image/png";
  }
  function buildDataUri(mime, b64) {
    if (typeof b64 !== "string") {
      console.warn("[inkpad] buildDataUri: b64 is not string, got", typeof b64, b64);
      b64 = "";
    }
    return "data:" + (mime || "image/png") + ";base64," + b64;
  }
  function handlePastedImage(file) {
    var d = activeDoc();
    if (!d) return;
    if (d.lang !== "markdown" && d.lang !== "html") {
      toast("\u7C98\u8D34\u56FE\u7247\u9700\u4E3A Markdown / HTML \u6587\u6863", "error");
      return;
    }
    if (!hasApi()) {
      toast("\u7C98\u8D34\u56FE\u7247\u9700\u5728\u684C\u9762\u7248\u4E2D\u4F7F\u7528", "error");
      return;
    }
    var reader = new FileReader();
    reader.onload = function() {
      var b64;
      try {
        var arr = new Uint8Array(reader.result);
        var bin = "";
        for (var i = 0; i < arr.length; i += 32768) {
          bin += String.fromCharCode.apply(null, arr.subarray(i, i + 32768));
        }
        b64 = btoa(bin);
      } catch (e) {
        toast("\u8BFB\u53D6\u7C98\u8D34\u56FE\u7247\u5931\u8D25", "error");
        return;
      }
      if (typeof b64 !== "string" || !b64) {
        toast("\u8BFB\u53D6\u7C98\u8D34\u56FE\u7247\u5931\u8D25", "error");
        return;
      }
      var mime = file && file.type || "image/png";
      if (d.diskPath) {
        var ext = extFromType(mime);
        var fname = "paste_" + Date.now() + "." + ext;
        var baseDir = dirOf(d.diskPath);
        getApi().save_image_binary(baseDir, fname, b64).then(function(res) {
          if (res && res.path) {
            insertAtCursor("![](" + res.rel + ")");
            toast("\u5DF2\u7C98\u8D34\u56FE\u7247", "success");
          } else if (res && res.error) toast("\u7C98\u8D34\u5931\u8D25\uFF1A" + res.error, "error");
        }).catch(function() {
          toast("\u7C98\u8D34\u56FE\u7247\u5931\u8D25", "error");
        });
      } else {
        insertAtCursor("![image](" + buildDataUri(mime, b64) + ")");
        toast("\u5DF2\u7C98\u8D34\u5185\u8054\u56FE\u7247\uFF08\u4FDD\u5B58\u6587\u6863\u540E\u56FE\u7247\u5C06\u968F\u6587\u6863\u4E00\u8D77\u4FDD\u5B58\uFF09", "success");
      }
    };
    reader.onerror = function() {
      toast("\u8BFB\u53D6\u7C98\u8D34\u56FE\u7247\u5931\u8D25", "error");
    };
    reader.readAsArrayBuffer(file);
  }

  // src-app/12-snippet-clip.js
  var SNIPPETS = {
    javascript: [
      { name: "log", desc: "console.log", text: "console.log(${1});" },
      { name: "func", desc: "function \u58F0\u660E", text: "function ${1:name}(${2}) {\n  ${3}\n}" },
      { name: "for", desc: "for \u5FAA\u73AF", text: "for (let ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n  ${3}\n}" },
      { name: "if", desc: "if \u5224\u65AD", text: "if (${1:condition}) {\n  ${2}\n}" },
      { name: "arr", desc: "\u7BAD\u5934\u51FD\u6570", text: "(${1:args}) => ${2:expr}" },
      { name: "import", desc: "import", text: "import ${1:name} from '${2:module}';" }
    ],
    python: [
      { name: "def", desc: "\u51FD\u6570\u5B9A\u4E49", text: "def ${1:name}(${2:args}):\n    ${3:pass}" },
      { name: "for", desc: "for \u5FAA\u73AF", text: "for ${1:i} in ${2:range(10)}:\n    ${3:pass}" },
      { name: "if", desc: "if \u5224\u65AD", text: "if ${1:condition}:\n    ${2:pass}" },
      { name: "class", desc: "\u7C7B\u5B9A\u4E49", text: "class ${1:Name}:\n    def __init__(self):\n        ${2:pass}" },
      { name: "main", desc: "main \u5165\u53E3", text: 'if __name__ == "__main__":\n    ${1:pass}' }
    ],
    html: [
      { name: "html5", desc: "HTML5 \u9AA8\u67B6", text: '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${1:\u6807\u9898}</title>\n</head>\n<body>\n  ${2:\u5185\u5BB9}\n</body>\n</html>' },
      { name: "div", desc: "div \u5BB9\u5668", text: '<div class="${1:cls}">\n  ${2}\n</div>' },
      { name: "a", desc: "\u94FE\u63A5", text: '<a href="${1:url}" target="_blank">${2:\u6587\u5B57}</a>' },
      { name: "img", desc: "\u56FE\u7247", text: '<img src="${1:url}" alt="${2:\u63CF\u8FF0}">' },
      { name: "script", desc: "script \u6807\u7B7E", text: "<script>\n  ${1}\n<\/script>" }
    ],
    markdown: [
      { name: "code", desc: "\u4EE3\u7801\u5757", text: "```${1:language}\n${2}\n```" },
      { name: "table", desc: "\u8868\u683C", text: "| ${1:\u52171} | ${2:\u52172} |\n| --- | --- |\n| ${3:\u6570\u636E} | ${4:\u6570\u636E} |" },
      { name: "link", desc: "\u94FE\u63A5", text: "[${1:\u6587\u5B57}](${2:url})" },
      { name: "img", desc: "\u56FE\u7247", text: "![${1:alt}](${2:url})" },
      { name: "task", desc: "\u4EFB\u52A1\u5217\u8868", text: "- [ ] ${1:\u5F85\u529E}" }
    ],
    json: [
      { name: "obj", desc: "JSON \u5BF9\u8C61", text: '{\n  "${1:key}": ${2:value}\n}' },
      { name: "arr", desc: "JSON \u6570\u7EC4", text: "[\n  ${1}\n]" }
    ],
    xml: [
      { name: "node", desc: "XML \u8282\u70B9", text: "<${1:tag}>\n  ${2}\n</${1:tag}>" },
      { name: "comment", desc: "\u6CE8\u91CA", text: "<!-- ${1:\u6CE8\u91CA} -->" }
    ],
    css: [
      { name: "flex", desc: "Flex \u5E03\u5C40", text: "display: flex;\njustify-content: ${1:center};\nalign-items: ${2:center};" },
      { name: "media", desc: "\u5A92\u4F53\u67E5\u8BE2", text: "@media (max-width: ${1:768px}) {\n  ${2}\n}" }
    ],
    plaintext: [],
    sql: [],
    yaml: [],
    shell: [],
    clike: [],
    mermaid: []
  };
  var snippetState = null;
  function handleTabKey(cm2) {
    if (snippetState) {
      var st = snippetState;
      if (st.idx < st.stops.length) {
        var pos = st.stops[st.idx];
        st.idx++;
        cm2.setSelection(pos.from, pos.to);
        return;
      }
      snippetState = null;
    }
    cm2.execCommand("indentMore");
  }
  function insertSnippet(snippet) {
    var text = snippet.text;
    var stops = [];
    var seq = 0;
    var expanded = text.replace(/\$\{(\d+)(?::([^}]*))?\}/g, function(m, n, def) {
      if (Number(n) === 0) return "";
      var sentinel = "" + ++seq + "";
      stops.push({ n: Number(n), def: def !== void 0 ? def : "", sentinel });
      return sentinel;
    });
    var fromPos = cm.getCursor("from");
    cm.replaceSelection(expanded);
    var baseOffset = cm.indexFromPos(fromPos);
    stops.forEach(function(st) {
      var idx = expanded.indexOf(st.sentinel);
      if (idx === -1) return;
      var pos = cm.posFromIndex(baseOffset + idx);
      var end = cm.posFromIndex(baseOffset + idx + st.sentinel.length);
      cm.replaceRange(st.def, pos, end);
      st.from = pos;
      st.to = cm.posFromIndex(baseOffset + idx + st.def.length);
    });
    stops.sort(function(a, b) {
      return a.n - b.n;
    });
    if (stops.length) {
      snippetState = {
        stops: stops.map(function(s) {
          return { from: s.from, to: s.to };
        }),
        idx: 0
      };
      cm.setSelection(stops[0].from, stops[0].to);
    } else {
      snippetState = null;
      cm.setCursor(cm.posFromIndex(baseOffset + expanded.length));
    }
  }
  function openSnippetModal() {
    var d = activeDoc();
    var lang = d && d.lang ? d.lang : "plaintext";
    if (d && d.kind && d.kind !== "text") lang = "plaintext";
    var list = SNIPPETS[lang] || SNIPPETS.plaintext;
    els.snippetList.innerHTML = "";
    if (!list.length) {
      els.snippetList.innerHTML = '<div class="clip-empty">\u5F53\u524D\u8BED\u8A00\u6CA1\u6709\u5185\u7F6E\u4EE3\u7801\u6BB5\uFF08\u8BF7\u5207\u6362\u4E3A JS / Python / HTML \u7B49\uFF09</div>';
    }
    list.forEach(function(s) {
      var item = document.createElement("div");
      item.className = "snippet-item";
      item.innerHTML = '<span class="snippet-name">' + s.name + '</span><span class="snippet-desc">' + s.desc + "</span>";
      item.addEventListener("click", function() {
        insertSnippet(s);
        $("snippet-modal").style.display = "none";
        toast("\u5DF2\u63D2\u5165\u300C" + s.name + "\u300D\uFF0C\u6309 Tab \u8DF3\u8F6C\u5360\u4F4D", "success");
      });
      els.snippetList.appendChild(item);
    });
    openSingleModal("snippet-modal");
  }
  var CLIP_KEY = "inkpad.clip.v1";
  var CLIP_MAX = 20;
  function getClips() {
    try {
      return JSON.parse(localStorage.getItem(CLIP_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function recordClip(text) {
    if (!text || text.length > 5e3) return;
    var list = getClips();
    list = list.filter(function(t) {
      return t !== text;
    });
    list.unshift(text);
    if (list.length > CLIP_MAX) list.length = CLIP_MAX;
    localStorage.setItem(CLIP_KEY, JSON.stringify(list));
  }
  function renderClipList() {
    var list = getClips();
    els.clipList.innerHTML = "";
    if (!list.length) {
      els.clipList.innerHTML = '<div class="clip-empty">\u8FD8\u6CA1\u6709\u590D\u5236\u8BB0\u5F55</div>';
      return;
    }
    list.forEach(function(t) {
      var item = document.createElement("div");
      item.className = "clip-item";
      var preview = t.replace(/\s+/g, " ");
      if (preview.length > 60) preview = preview.slice(0, 60) + "\u2026";
      item.innerHTML = '<span class="clip-text"></span><button class="clip-del" title="\u5220\u9664">\u2715</button>';
      item.querySelector(".clip-text").textContent = preview;
      item.querySelector(".clip-text").title = t.slice(0, 200);
      item.addEventListener("click", function(e) {
        if (e.target.classList.contains("clip-del")) {
          e.stopPropagation();
          var rest = getClips().filter(function(x) {
            return x !== t;
          });
          localStorage.setItem(CLIP_KEY, JSON.stringify(rest));
          renderClipList();
          return;
        }
        if (cm.getSelection()) cm.replaceSelection(t);
        else cm.replaceRange(t, cm.getCursor());
        $("clip-modal").style.display = "none";
        toast("\u5DF2\u63D2\u5165\u526A\u8D34\u677F\u5185\u5BB9 \u2713", "success");
      });
      els.clipList.appendChild(item);
    });
  }

  // src-app/11-format-tools.js
  function formatJSON() {
    var raw = cm.getValue().trim();
    if (!raw) {
      toast("\u5185\u5BB9\u4E3A\u7A7A", "error");
      return;
    }
    try {
      cm.setValue(jsonFormat(raw));
      if (isWholeJson(raw)) setLang("json", true);
      var warns = countRecovered(raw);
      if (warns) highlightRecovered();
      toast(warns ? "JSON \u683C\u5F0F\u5316\u5B8C\u6210 \u2713 \u68C0\u6D4B\u5230 " + warns + " \u5904\u6570\u636E\u4E0D\u5B8C\u6574\uFF0C\u5DF2\u9AD8\u4EAE\u5B9A\u4F4D" : "JSON \u683C\u5F0F\u5316\u5B8C\u6210 \u2713", "success");
    } catch (e) {
      if (/未找到可序列化的 JSON 数据/.test(e && e.message || "")) {
        toast(e.message, "error");
      } else {
        highlightJSONError(e, raw);
      }
    }
  }
  function highlightJSONError(err, content) {
    if (!err || !err.message) {
      toast("JSON \u89E3\u6790\u5931\u8D25\uFF1A" + (err && err.message || "\u672A\u77E5\u9519\u8BEF"), "error");
      return;
    }
    var posMatch = err.message.match(/position\s+(\d+)/);
    var pos = posMatch ? +posMatch[1] : -1;
    var line = 0, ch = 0;
    if (pos >= 0 && pos <= content.length) {
      for (var i = 0; i < pos; i++) {
        if (content.charCodeAt(i) === 10) {
          line++;
          ch = 0;
        } else {
          ch++;
        }
      }
    }
    var hint = "";
    if (pos > 0 && pos <= content.length) {
      var cAt = content.charAt(pos);
      if (cAt === "}" || cAt === "]" || cAt === ")") {
        var j = pos - 1;
        while (j >= 0 && (content.charCodeAt(j) === 10 || content.charCodeAt(j) === 32 || content.charCodeAt(j) === 9 || content.charCodeAt(j) === 13)) j--;
        if (j >= 0 && content.charAt(j) !== "{" && content.charAt(j) !== "[") {
          line = 0;
          ch = 0;
          for (var k = 0; k < j; k++) {
            if (content.charCodeAt(k) === 10) {
              line++;
              ch = 0;
            } else {
              ch++;
            }
          }
          hint = "\uFF08\u56DE\u6EAF\u5230\u4E0A\u4E00\u884C\u672B\u5C3E\u7684\u9017\u53F7/\u5192\u53F7\u7B49\u975E\u6CD5\u5B57\u7B26\uFF09";
        } else {
          hint = "\uFF08\u8BF7\u68C0\u67E5\u4E0A\u4E00\u884C\u672B\u5C3E\u662F\u5426\u591A\u4F59\u4E86\u9017\u53F7\u3001\u5192\u53F7\u7B49\uFF09";
        }
      }
    }
    clearJSONErrorHighlight();
    var lineHandle = cm.addLineClass(line, "background", "json-err-line");
    var lineText = cm.getLine(line) || "";
    var safeEnd = Math.min(ch + 1, lineText.length);
    if (lineText.charAt(ch) === "," || lineText.charAt(ch) === ":" || lineText.charAt(ch) === ";") {
      var k = ch;
      while (k < lineText.length && /[,:;\s]/.test(lineText.charAt(k))) k++;
      safeEnd = Math.min(k, lineText.length);
    }
    var mark = cm.markText(
      { line, ch },
      { line, ch: safeEnd },
      { className: "json-err-char" }
    );
    jsonErrMarks.push({ lineHandle, mark });
    cm.scrollIntoView({ line, ch: Math.max(0, ch - 4) }, 80);
    cm.setSelection({ line, ch }, { line, ch: safeEnd });
    cm.focus();
    toast(
      "JSON \u89E3\u6790\u5931\u8D25\uFF1A\u7B2C " + (line + 1) + " \u884C \u7B2C " + (ch + 1) + " \u5217\uFF08\u5B57\u7B26\u4F4D\u7F6E " + pos + "\uFF09" + hint,
      "error"
    );
    if (jsonErrTimer) clearTimeout(jsonErrTimer);
    jsonErrTimer = setTimeout(clearJSONErrorHighlight, 8e3);
  }
  var jsonErrMarks = [];
  var jsonErrTimer = 0;
  function clearJSONErrorHighlight() {
    if (jsonErrTimer) {
      clearTimeout(jsonErrTimer);
      jsonErrTimer = 0;
    }
    jsonErrMarks.forEach(function(it) {
      try {
        if (it.lineHandle) cm.removeLineClass(it.lineHandle, "background", "json-err-line");
        if (it.mark) it.mark.clear();
      } catch (e) {
      }
    });
    jsonErrMarks = [];
  }
  function highlightRecovered() {
    clearJSONErrorHighlight();
    var val = cm.getValue();
    if (!val) return;
    var lines = val.split("\n");
    var first = -1;
    for (var i = 0; i < lines.length; i++) {
      var idx = lines[i].indexOf("/* \u6570\u636E\u4E0D\u5B8C\u6574");
      if (idx >= 0) {
        var handle = cm.addLineClass(i, "background", "json-err-line");
        var mark = cm.markText(
          { line: i, ch: idx },
          { line: i, ch: lines[i].length },
          { className: "json-err-char" }
        );
        jsonErrMarks.push({ lineHandle: handle, mark });
        if (first < 0) first = i;
      }
    }
    if (first >= 0) {
      cm.setCursor({ line: first, ch: 0 });
      cm.scrollIntoView({ line: first, ch: 0 }, 120);
      cm.focus();
    }
  }
  function formatXML() {
    var raw = cm.getValue().trim();
    if (!raw) {
      toast("\u5185\u5BB9\u4E3A\u7A7A", "error");
      return;
    }
    var parser = new DOMParser();
    var doc = parser.parseFromString(raw, "text/xml");
    if (doc.getElementsByTagName("parsererror").length) {
      toast("XML \u8BED\u6CD5\u6709\u8BEF\uFF0C\u8BF7\u68C0\u67E5\u6807\u7B7E\u662F\u5426\u95ED\u5408", "error");
      return;
    }
    cm.setValue(prettyXML(raw));
    setLang("xml");
    toast("XML \u683C\u5F0F\u5316\u5B8C\u6210 \u2713", "success");
  }
  function prettyXML(xml) {
    var padded = xml.replace(/(>)(<)/g, "$1\n$2");
    var lines = padded.split("\n");
    var indent = 0;
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.indexOf("</") === 0) indent = Math.max(0, indent - 1);
      var pad = "";
      for (var j = 0; j < indent; j++) pad += "  ";
      out.push(pad + line);
      if (/^<[^!?\/]/.test(line) && !/\/>$/.test(line) && line.indexOf("</") === -1) {
        indent++;
      }
    }
    return out.join("\n");
  }
  function formatCurrent() {
    if (state.currentVisual) return;
    var d = activeDoc();
    if (!d) return;
    if (d.lang === "json") formatJSON();
    else if (d.lang === "xml") formatXML();
    else toast("\u5F53\u524D\u8BED\u8A00\u6682\u4E0D\u652F\u6301\u81EA\u52A8\u683C\u5F0F\u5316\uFF0C\u53EF\u5207\u6362\u4E3A JSON / XML \u540E\u518D\u8BD5", "error");
  }
  function withContent(fn) {
    var sel = cm.getSelection();
    if (sel) cm.replaceSelection(fn(sel));
    else cm.setValue(fn(cm.getValue()));
  }
  function isWholeJson(t) {
    try {
      JSON.parse(t.trim());
      return true;
    } catch (e) {
      return false;
    }
  }
  function matchBalanced(text, start) {
    var openCh = text[start];
    var closeCh = openCh === "{" ? "}" : "]";
    var depth = 0;
    var inStr = false;
    var esc2 = false;
    for (var i = start; i < text.length; i++) {
      var c = text[i];
      if (inStr) {
        if (esc2) esc2 = false;
        else if (c === "\\") esc2 = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') {
        inStr = true;
        continue;
      }
      if (c === openCh) depth++;
      else if (c === closeCh) {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }
  function tryClose(text, start, end) {
    var stack = [];
    var inStr = false, esc2 = false;
    for (var i = start; i < end; i++) {
      var c = text[i];
      if (inStr) {
        if (esc2) esc2 = false;
        else if (c === "\\") esc2 = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') {
        inStr = true;
        continue;
      }
      if (c === "{" || c === "[") stack.push(c);
      else if (c === "}" || c === "]") {
        var want = c === "}" ? "{" : "[";
        if (stack.length && stack[stack.length - 1] === want) stack.pop();
        else return null;
      }
    }
    if (!stack.length) return null;
    var closers = "";
    for (var k = stack.length - 1; k >= 0; k--) closers += stack[k] === "{" ? "}" : "]";
    try {
      var p = JSON.parse(text.slice(start, end) + closers);
      if (p !== null && typeof p === "object") return { end, value: p, closed: stack.length };
    } catch (e) {
    }
    return null;
  }
  function longestJsonPrefix(text, start, limit) {
    var n = limit >= 0 ? limit : text.length;
    if (n - start > 3e4) return null;
    var r = tryClose(text, start, n);
    if (r) return r;
    for (var j = n - 1; j > start; j--) {
      var c = text[j];
      if (c === "," || c === ":" || c === "{" || c === "[" || c === "}" || c === "]" || c === " " || c === "\n" || c === "\r" || c === "	") {
        r = tryClose(text, start, j);
        if (r) return r;
      }
    }
    return null;
  }
  function extractJsonFragments(text) {
    var frags = [];
    var i = 0;
    var n = text.length;
    while (i < n) {
      var c = text[i];
      if (c === "{" || c === "[") {
        var end = matchBalanced(text, i);
        var segEnd = -1;
        var parsed = null;
        var recovered = false;
        var closed = 0;
        if (end >= 0) {
          var sub = text.slice(i, end + 1);
          try {
            parsed = JSON.parse(sub);
            segEnd = end + 1;
          } catch (e) {
            parsed = null;
          }
        }
        if (!parsed) {
          var rec = longestJsonPrefix(text, i, end >= 0 ? end + 1 : n);
          if (rec && rec.end > i) {
            parsed = rec.value;
            segEnd = rec.end;
            recovered = rec.closed > 0;
            closed = rec.closed || 0;
          }
        }
        if (parsed && parsed !== null && typeof parsed === "object") {
          frags.push({ start: i, end: segEnd, parsed, recovered, closed });
          i = segEnd;
          continue;
        }
      }
      i++;
    }
    return frags;
  }
  function isJsonResidue(t) {
    var s = t.trim();
    if (!s) return false;
    if (/^[,:}]/.test(s)) return true;
    var q = 0;
    for (var i = 0; i < s.length; i++) if (s[i] === '"') q++;
    return q % 2 === 1;
  }
  function countRecovered(t) {
    var n = 0;
    var frags = extractJsonFragments(t);
    var last = 0;
    for (var k = 0; k < frags.length; k++) {
      var f = frags[k];
      if (isJsonResidue(t.slice(last, f.start))) n++;
      if (f.recovered) n++;
      last = f.end;
    }
    if (isJsonResidue(t.slice(last))) n++;
    return n;
  }
  function jsonFormat(t) {
    try {
      return JSON.stringify(JSON.parse(t.trim()), null, 2);
    } catch (e) {
    }
    var frags = extractJsonFragments(t);
    if (!frags.length) throw new Error("\u672A\u627E\u5230\u53EF\u5E8F\u5217\u5316\u7684 JSON \u6570\u636E");
    var out = "";
    var last = 0;
    for (var k = 0; k < frags.length; k++) {
      var f = frags[k];
      var pre = t.slice(last, f.start);
      if (isJsonResidue(pre)) out += "\n/* \u6570\u636E\u4E0D\u5B8C\u6574\uFF1A\u6B64\u5904\u5B58\u5728\u672A\u5B8C\u6210\u7684 JSON \u6B8B\u7559\u5185\u5BB9 */";
      out += pre + JSON.stringify(f.parsed, null, 2);
      if (f.recovered) out += "\n/* \u6570\u636E\u4E0D\u5B8C\u6574\uFF1A\u6B64\u6BB5 JSON \u539F\u6587\u88AB\u622A\u65AD\uFF0C\u5DF2\u81EA\u52A8\u8865\u5168\u95ED\u5408 */";
      last = f.end;
    }
    var tail = t.slice(last);
    if (isJsonResidue(tail)) out += "\n/* \u6570\u636E\u4E0D\u5B8C\u6574\uFF1A\u6B64\u5904\u5B58\u5728\u672A\u5B8C\u6210\u7684 JSON \u6B8B\u7559\u5185\u5BB9 */";
    out += tail;
    return out;
  }
  function jsonCompress(t) {
    try {
      return JSON.stringify(JSON.parse(t.trim()));
    } catch (e) {
    }
    var frags = extractJsonFragments(t);
    if (!frags.length) throw new Error("\u672A\u627E\u5230\u53EF\u538B\u7F29\u7684 JSON \u6570\u636E");
    var out = "";
    var last = 0;
    for (var k = 0; k < frags.length; k++) {
      var f = frags[k];
      out += t.slice(last, f.start) + JSON.stringify(f.parsed);
      last = f.end;
    }
    out += t.slice(last);
    return out;
  }
  function strEscape(t) {
    return JSON.stringify(t).slice(1, -1);
  }
  function strUnescape(t) {
    var s = t.trim();
    try {
      return JSON.parse(s);
    } catch (e) {
    }
    try {
      return JSON.parse('"' + s + '"');
    } catch (e) {
      throw new Error("\u65E0\u6CD5\u53BB\u8F6C\u4E49\uFF1A\u5185\u5BB9\u4E0D\u662F\u5408\u6CD5\u7684\u8F6C\u4E49\u5B57\u7B26\u4E32");
    }
  }
  function unicodeToZh(t) {
    return t.replace(/\\u([0-9a-fA-F]{4})/g, function(m, g) {
      return String.fromCharCode(parseInt(g, 16));
    });
  }
  function zhToUnicode(t) {
    return t.replace(/[^\x00-\x7F]/g, function(ch) {
      return "\\u" + ("0000" + ch.charCodeAt(0).toString(16)).slice(-4);
    });
  }
  function jsonToGet(t) {
    var obj = JSON.parse(t.trim());
    if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
      throw new Error('\u9700\u8981 JSON \u5BF9\u8C61\uFF0C\u4F8B\u5982 {"a":1,"b":"x"}');
    }
    var pairs = [];
    Object.keys(obj).forEach(function(k) {
      var v = obj[k];
      if (v === null || v === void 0) return;
      if (typeof v === "object") v = JSON.stringify(v);
      pairs.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
    });
    if (!pairs.length) throw new Error("JSON \u5BF9\u8C61\u4E3A\u7A7A\uFF0C\u6CA1\u6709\u53EF\u8F6C\u6362\u7684\u53C2\u6570");
    return pairs.join("&");
  }
  function b64Encode(t) {
    var u8 = new TextEncoder().encode(t);
    var s = "";
    for (var i = 0; i < u8.length; i += 32768) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
    }
    return btoa(s);
  }
  function b64Decode(t) {
    var bin = atob(t.trim());
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(u8);
    } catch (e) {
      throw new Error("Base64 \u89E3\u7801\u7ED3\u679C\u4E0D\u662F\u5408\u6CD5 UTF-8 \u6587\u672C");
    }
  }
  function urlEncodeText(t) {
    return encodeURIComponent(t);
  }
  function urlDecodeText(t) {
    try {
      return decodeURIComponent(t.trim());
    } catch (e) {
      throw new Error("URL \u89E3\u7801\u5931\u8D25\uFF1A\u5185\u5BB9\u5305\u542B\u975E\u6CD5\u7684 % \u7F16\u7801");
    }
  }
  function copyToClipboard(text) {
    recordClip(text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function() {
          return true;
        },
        function() {
          return legacyCopy(text);
        }
      );
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {
    }
    ta.remove();
    return ok;
  }
  var TOOL_FNS = {
    "format": jsonFormat,
    "compress": jsonCompress,
    "escape": strEscape,
    "unescape": strUnescape,
    "unicode-zh": unicodeToZh,
    "zh-unicode": zhToUnicode,
    "to-get": jsonToGet
  };
  var TOOL_NAMES = {
    "format": "JSON \u683C\u5F0F\u5316",
    "compress": "JSON \u538B\u7F29",
    "escape": "\u8F6C\u4E49",
    "unescape": "\u53BB\u8F6C\u4E49",
    "unicode-zh": "Unicode \u2192 \u4E2D\u6587",
    "zh-unicode": "\u4E2D\u6587 \u2192 Unicode",
    "to-get": "\u8F6C GET \u53C2\u6570",
    "b64-encode": "Base64 \u7F16\u7801",
    "b64-decode": "Base64 \u89E3\u7801",
    "url-encode": "URL \u7F16\u7801",
    "url-decode": "URL \u89E3\u7801"
  };
  var MODAL_TOOLS = {
    "b64-encode": ["base64", "encode"],
    "b64-decode": ["base64", "decode"],
    "url-encode": ["url", "encode"],
    "url-decode": ["url", "decode"]
  };
  function runTool(name) {
    if (name === "copy") {
      var text = cm.getSelection() || cm.getValue();
      if (!text) {
        toast("\u6CA1\u6709\u53EF\u590D\u5236\u7684\u5185\u5BB9", "error");
        return;
      }
      copyToClipboard(text).then(function(ok) {
        toast(ok ? "\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F \u2713" : "\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8 Ctrl+C", ok ? "success" : "error");
      });
      return;
    }
    if (name === "ts-convert") {
      openTsModal();
      return;
    }
    if (MODAL_TOOLS[name]) {
      openCodeToolModal(MODAL_TOOLS[name][0], MODAL_TOOLS[name][1]);
      return;
    }
    var fn = TOOL_FNS[name];
    if (!fn) return;
    if (!cm.getValue().trim()) {
      toast("\u5185\u5BB9\u4E3A\u7A7A", "error");
      return;
    }
    var rawText = cm.getValue();
    try {
      var hadSelection = !!cm.getSelection();
      var scopeText = hadSelection ? cm.getSelection() : rawText;
      withContent(fn);
      if (!hadSelection && (name === "format" || name === "compress") && isWholeJson(rawText)) setLang("json", true);
      var warns = countRecovered(scopeText);
      if (warns && name === "format") highlightRecovered();
      toast(warns ? TOOL_NAMES[name] + " \u5B8C\u6210 \u2713 \u68C0\u6D4B\u5230 " + warns + " \u5904\u6570\u636E\u4E0D\u5B8C\u6574\uFF0C\u5DF2\u9AD8\u4EAE\u5B9A\u4F4D" : TOOL_NAMES[name] + " \u5B8C\u6210 \u2713", "success");
    } catch (e) {
      var em = e && e.message || String(e);
      if (/未找到可序列化的 JSON 数据/.test(em)) {
        toast(em, "error");
      } else if (e instanceof SyntaxError || /JSON|JSON\.|position\s+\d+/.test(em)) {
        highlightJSONError(e, rawText);
      } else {
        toast(em, "error");
      }
    }
  }
  function codeMode() {
    var r = document.querySelector('input[name="code-mode"]:checked');
    return r ? r.value : "base64";
  }
  function codeDo(op) {
    var t = $("code-input").value;
    if (!t) {
      toast("\u8BF7\u5148\u8F93\u5165\u8981\u8F6C\u6362\u7684\u5185\u5BB9", "error");
      return;
    }
    var out;
    try {
      if (codeMode() === "base64") {
        out = op === "encode" ? b64Encode(t) : b64Decode(t);
      } else {
        out = op === "encode" ? urlEncodeText(t) : urlDecodeText(t);
      }
      $("code-output").value = out;
    } catch (e) {
      toast(e && e.message ? e.message : "\u8F6C\u6362\u5931\u8D25", "error");
    }
  }
  function openCodeToolModal(mode, op) {
    document.querySelectorAll('input[name="code-mode"]').forEach(function(r) {
      r.checked = r.value === mode;
    });
    var sel = cm.getSelection();
    if (sel) $("code-input").value = sel;
    openSingleModal("code-modal");
    if (op) codeDo(op);
    $("code-input").focus();
  }
  function closeCodeToolModal() {
    $("code-modal").style.display = "none";
  }
  function bindCodeModal() {
    $("code-close").addEventListener("click", closeCodeToolModal);
    $("code-modal").addEventListener("click", function(e) {
      if (e.target === $("code-modal")) closeCodeToolModal();
    });
    $("code-encode").addEventListener("click", function() {
      codeDo("encode");
    });
    $("code-decode").addEventListener("click", function() {
      codeDo("decode");
    });
    $("code-swap").addEventListener("click", function() {
      $("code-input").value = $("code-output").value;
    });
    $("code-clear").addEventListener("click", function() {
      $("code-input").value = "";
      $("code-output").value = "";
      $("code-input").focus();
    });
    $("code-copy").addEventListener("click", function() {
      var v = $("code-output").value;
      if (!v) {
        toast("\u8FD8\u6CA1\u6709\u8F6C\u6362\u7ED3\u679C", "error");
        return;
      }
      copyToClipboard(v).then(function(ok) {
        toast(ok ? "\u5DF2\u590D\u5236 \u2713" : "\u590D\u5236\u5931\u8D25", ok ? "success" : "error");
      });
    });
    $("code-apply").addEventListener("click", function() {
      var v = $("code-output").value;
      if (!v) {
        toast("\u8FD8\u6CA1\u6709\u8F6C\u6362\u7ED3\u679C", "error");
        return;
      }
      if (cm.getSelection()) cm.replaceSelection(v);
      else cm.replaceRange(v, cm.getCursor());
      toast("\u5DF2\u5E94\u7528\u5230\u7F16\u8F91\u5668 \u2713", "success");
      closeCodeToolModal();
    });
  }
  var tsTimer = null;
  function tsIsMs() {
    var r = document.querySelector('input[name="ts-unit"]:checked');
    return r && r.value === "ms";
  }
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function formatBeijing(ms) {
    var d = new Date(ms + 8 * 36e5);
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) + " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + ":" + pad2(d.getUTCSeconds());
  }
  function refreshTsNow() {
    var now = Date.now();
    $("ts-now").value = tsIsMs() ? String(now) : String(Math.floor(now / 1e3));
  }
  function openTsModal() {
    openSingleModal("ts-modal");
    refreshTsNow();
    var bj = new Date(Date.now() + 8 * 36e5);
    $("ts-y").value = bj.getUTCFullYear();
    $("ts-mo").value = bj.getUTCMonth() + 1;
    $("ts-d").value = bj.getUTCDate();
    $("ts-h").value = bj.getUTCHours();
    $("ts-mi").value = bj.getUTCMinutes();
    $("ts-s").value = bj.getUTCSeconds();
    clearInterval(tsTimer);
    tsTimer = setInterval(refreshTsNow, 500);
  }
  function closeTsModal() {
    $("ts-modal").style.display = "none";
    clearInterval(tsTimer);
  }
  function bindTsModal() {
    $("ts-close").addEventListener("click", closeTsModal);
    $("ts-modal").addEventListener("click", function(e) {
      if (e.target === $("ts-modal")) closeTsModal();
    });
    document.querySelectorAll('input[name="ts-unit"]').forEach(function(r) {
      r.addEventListener("change", refreshTsNow);
    });
    $("ts-to-date").addEventListener("click", function() {
      var raw = $("ts-input").value.trim();
      var ts = Number(raw);
      if (!raw || isNaN(ts)) {
        toast("\u8BF7\u8F93\u5165\u5408\u6CD5\u7684\u65F6\u95F4\u6233\u6570\u5B57", "error");
        return;
      }
      var ms = tsIsMs() ? ts : ts * 1e3;
      if (ms > 864e13 || ms < -864e13) {
        toast("\u65F6\u95F4\u6233\u8D85\u51FA\u53EF\u8868\u793A\u8303\u56F4", "error");
        return;
      }
      $("ts-date-out").value = formatBeijing(ms);
    });
    $("ts-to-ts").addEventListener("click", function() {
      var y = Number($("ts-y").value), mo = Number($("ts-mo").value), d = Number($("ts-d").value);
      var h = Number($("ts-h").value || 0), mi = Number($("ts-mi").value || 0), s = Number($("ts-s").value || 0);
      if (!y || !mo || !d) {
        toast("\u8BF7\u81F3\u5C11\u586B\u5199\u5B8C\u6574\u7684 \u5E74 / \u6708 / \u65E5", "error");
        return;
      }
      if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) {
        toast("\u65E5\u671F\u65F6\u95F4\u6570\u503C\u8D85\u51FA\u8303\u56F4", "error");
        return;
      }
      var ms = Date.UTC(y, mo - 1, d, h, mi, s) - 8 * 36e5;
      $("ts-ts-out").value = tsIsMs() ? String(ms) : String(Math.floor(ms / 1e3));
    });
    $("ts-now-copy").addEventListener("click", function() {
      copyToClipboard($("ts-now").value).then(function(ok) {
        toast(ok ? "\u5DF2\u590D\u5236 \u2713" : "\u590D\u5236\u5931\u8D25", ok ? "success" : "error");
      });
    });
    $("ts-date-copy").addEventListener("click", function() {
      var v = $("ts-date-out").value;
      if (!v) {
        toast("\u8FD8\u6CA1\u6709\u8F6C\u6362\u7ED3\u679C", "error");
        return;
      }
      copyToClipboard(v).then(function(ok) {
        toast(ok ? "\u5DF2\u590D\u5236 \u2713" : "\u590D\u5236\u5931\u8D25", ok ? "success" : "error");
      });
    });
    $("ts-ts-copy").addEventListener("click", function() {
      var v = $("ts-ts-out").value;
      if (!v) {
        toast("\u8FD8\u6CA1\u6709\u8F6C\u6362\u7ED3\u679C", "error");
        return;
      }
      copyToClipboard(v).then(function(ok) {
        toast(ok ? "\u5DF2\u590D\u5236 \u2713" : "\u590D\u5236\u5931\u8D25", ok ? "success" : "error");
      });
    });
  }
  function withText(fn) {
    var sel = cm.getSelection();
    if (sel) cm.replaceSelection(fn(sel));
    else cm.setValue(fn(cm.getValue()));
  }
  function titleCase(s) {
    return s.replace(/\b(\w)(\w*)/g, function(m, a, b) {
      return a.toUpperCase() + b.toLowerCase();
    });
  }
  function swapCase(s) {
    return s.replace(/[a-zA-Z]/g, function(c) {
      return c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
    });
  }
  function fullToHalf(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 12288) out += " ";
      else if (c >= 65281 && c <= 65374) out += String.fromCharCode(c - 65248);
      else out += s[i];
    }
    return out;
  }
  function halfToFull(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 32) out += "\u3000";
      else if (c >= 33 && c <= 126) out += String.fromCharCode(c + 65248);
      else out += s[i];
    }
    return out;
  }
  function withLines(fn) {
    var sel = cm.getSelection();
    var start, end;
    if (sel) {
      var from = cm.getCursor("from"), to = cm.getCursor("to");
      if (from.line !== to.line || sel.indexOf("\n") !== -1) {
        start = from.line;
        end = to.line;
      } else {
        start = from.line;
        end = to.line;
      }
    } else {
      start = 0;
      end = cm.lineCount() - 1;
    }
    var out = [];
    for (var i = start; i <= end; i++) {
      var line = cm.getLine(i);
      var res = fn(line);
      if (res !== null) out.push(res);
    }
    if (!out.length) {
      cm.replaceRange("", { line: start, ch: 0 }, { line: end, ch: cm.getLine(end).length });
      return;
    }
    cm.replaceRange(out.join("\n"), { line: start, ch: 0 }, { line: end, ch: cm.getLine(end).length });
    cm.setSelection({ line: start, ch: 0 }, { line: start + out.length - 1, ch: cm.getLine(start + out.length - 1).length });
  }
  function indentOf(line) {
    var m = /^[\t ]*/.exec(line || "");
    if (!m) return 0;
    var s = m[0], n = 0;
    for (var i = 0; i < s.length; i++) n += s[i] === "	" ? 2 : 1;
    return n;
  }
  function deleteLines() {
    var from = cm.getCursor("from"), to = cm.getCursor("to");
    var start = from.line, end = to.line;
    if (!cm.getSelection()) {
      start = end = cm.getCursor().line;
    }
    var last = cm.lineCount() - 1;
    var toPos = end < last ? { line: end + 1, ch: 0 } : { line: end, ch: cm.getLine(end).length };
    cm.replaceRange("", { line: start, ch: 0 }, toPos);
  }
  function deleteToSol() {
    var sel = cm.getSelection();
    if (!sel) {
      var c = cm.getCursor();
      cm.replaceRange("", { line: c.line, ch: 0 }, c);
      return;
    }
    var from = cm.getCursor("from"), to = cm.getCursor("to");
    cm.operation(function() {
      for (var i = to.line; i >= from.line; i--) {
        var col = i === from.line ? from.ch : 0;
        cm.replaceRange("", { line: i, ch: 0 }, { line: i, ch: col });
      }
    });
  }
  function deleteToEol() {
    var sel = cm.getSelection();
    if (!sel) {
      var c = cm.getCursor();
      cm.replaceRange("", c, { line: c.line, ch: cm.getLine(c.line).length });
      return;
    }
    var from = cm.getCursor("from"), to = cm.getCursor("to");
    cm.operation(function() {
      for (var i = from.line; i <= to.line; i++) {
        var col = i === to.line ? to.ch : cm.getLine(i).length;
        cm.replaceRange("", { line: i, ch: col }, { line: i, ch: cm.getLine(i).length });
      }
    });
  }
  function mergeLines() {
    var sel = cm.getSelection();
    var text = sel || cm.getValue();
    var merged = text.replace(/\s*\n\s*/g, " ").trim();
    if (sel) cm.replaceSelection(merged);
    else cm.setValue(merged);
  }
  function reindent() {
    if (cm.getSelection()) cm.indentSelection("smart");
    else cm.operation(function() {
      for (var i = 0; i < cm.lineCount(); i++) cm.indentLine(i, "smart");
    });
  }
  function foldAllDocs() {
    cm.foldAll();
  }
  function unfoldAllDocs() {
    cm.unfoldAll();
  }
  function foldToLevel(level) {
    cm.operation(function() {
      cm.unfoldAll();
      var total = cm.lineCount(), opens = [];
      for (var i = 0; i < total; i++) {
        var txt = cm.getLine(i), ind = indentOf(txt);
        while (opens.length && opens[opens.length - 1] >= ind) opens.pop();
        var depth = opens.length + 1;
        var hasDeeper = false;
        for (var j = i + 1; j < total; j++) {
          var jt = cm.getLine(j);
          if (jt.trim() === "") continue;
          var ji = indentOf(jt);
          if (ji > ind) {
            hasDeeper = true;
            break;
          }
          if (ji <= ind) break;
        }
        if (hasDeeper && depth <= level) {
          try {
            cm.foldCode({ line: i, ch: 0 }, { rangeFinder: CodeMirror.indentRangeFinder }, "fold");
          } catch (e) {
          }
        }
        opens.push(ind);
      }
    });
  }
  function execEditorCmd(cmd) {
    var contentOps = [
      "upper",
      "lower",
      "title",
      "swap",
      "full2half",
      "half2full",
      "del-empty",
      "del-dup",
      "del-sol-space",
      "del-eol-space",
      "del-line",
      "del-to-sol",
      "del-to-eol",
      "merge",
      "reindent",
      "sort",
      "sort-len",
      "reverse"
    ];
    if (contentOps.indexOf(cmd) !== -1 && !cm.getValue().trim()) {
      toast("\u5185\u5BB9\u4E3A\u7A7A", "error");
      return;
    }
    switch (cmd) {
      case "upper":
        withText(TEXT_TOOLS.upper.fn);
        break;
      case "lower":
        withText(TEXT_TOOLS.lower.fn);
        break;
      case "title":
        withText(TEXT_TOOLS.title.fn);
        break;
      case "swap":
        withText(TEXT_TOOLS.swap.fn);
        break;
      case "full2half":
        withText(TEXT_TOOLS.full2half.fn);
        break;
      case "half2full":
        withText(TEXT_TOOLS.half2full.fn);
        break;
      case "del-empty":
        withLines(function(l) {
          return l.trim() === "" ? null : l;
        });
        break;
      case "del-dup": {
        var sel2 = cm.getSelection(), from2, lines2;
        if (sel2) {
          from2 = cm.getCursor("from").line;
          var to2 = cm.getCursor("to").line;
          lines2 = [];
          for (var j = from2; j <= to2; j++) lines2.push(cm.getLine(j));
        } else {
          from2 = 0;
          lines2 = cm.getValue().split("\n");
        }
        var res2 = dedupeLines(lines2);
        cm.replaceRange(res2.join("\n"), { line: from2, ch: 0 }, { line: from2 + lines2.length - 1, ch: cm.getLine(from2 + lines2.length - 1).length });
        break;
      }
      case "sort":
      case "sort-len":
      case "reverse": {
        var sel = cm.getSelection(), start, lines;
        if (sel) {
          var f = cm.getCursor("from");
          start = f.line;
          var e = cm.getCursor("to").line;
          lines = [];
          for (var i = start; i <= e; i++) lines.push(cm.getLine(i));
        } else {
          start = 0;
          lines = cm.getValue().split("\n");
        }
        var sorted = TEXT_TOOLS[cmd].sort(lines);
        cm.replaceRange(sorted.join("\n"), { line: start, ch: 0 }, { line: start + lines.length - 1, ch: cm.getLine(start + lines.length - 1).length });
        break;
      }
      case "del-sol-space":
        withLines(function(l) {
          return l.replace(/^[\t ]+/, "");
        });
        break;
      case "del-eol-space":
        withLines(function(l) {
          return l.replace(/[\t ]+$/, "");
        });
        break;
      case "del-line":
        deleteLines();
        break;
      case "del-to-sol":
        deleteToSol();
        break;
      case "del-to-eol":
        deleteToEol();
        break;
      case "merge":
        mergeLines();
        break;
      case "reindent":
        reindent();
        break;
      case "fold-all":
        foldAllDocs();
        break;
      case "unfold-all":
        unfoldAllDocs();
        break;
      case "fold-1":
      case "fold-2":
      case "fold-3":
      case "fold-4":
      case "fold-5":
        foldToLevel(parseInt(cmd.split("-")[1], 10));
        break;
      default:
        return;
    }
    var labels = {
      "upper": "\u8F6C\u5927\u5199",
      "lower": "\u8F6C\u5C0F\u5199",
      "title": "\u5355\u8BCD\u9996\u5B57\u6BCD\u5927\u5199",
      "swap": "\u53CD\u8F6C\u5927\u5C0F\u5199",
      "full2half": "\u5168\u89D2\u2192\u534A\u89D2",
      "half2full": "\u534A\u89D2\u2192\u5168\u89D2",
      "del-empty": "\u5220\u9664\u7A7A\u884C",
      "del-dup": "\u5220\u9664\u91CD\u590D\u884C",
      "del-sol-space": "\u5220\u9664\u884C\u5934\u7A7A\u767D",
      "del-eol-space": "\u5220\u9664\u884C\u5C3E\u7A7A\u767D",
      "del-line": "\u5220\u9664\u6574\u884C",
      "del-to-sol": "\u5220\u9664\u5230\u884C\u5934",
      "del-to-eol": "\u5220\u9664\u5230\u884C\u5C3E",
      "merge": "\u5408\u5E76\u884C",
      "reindent": "\u91CD\u65B0\u7F29\u8FDB",
      "sort": "\u884C\u6392\u5E8F",
      "sort-len": "\u6309\u957F\u5EA6\u6392\u5E8F",
      "reverse": "\u53CD\u8F6C\u884C\u5E8F",
      "fold-all": "\u6298\u53E0\u5168\u90E8",
      "unfold-all": "\u5C55\u5F00\u5168\u90E8"
    };
    if (cmd.indexOf("fold-") === 0) toast("\u6298\u53E0\u7EA7\u522B " + cmd.split("-")[1] + " \u2713", "success");
    else if (labels[cmd]) toast(labels[cmd] + " \u5B8C\u6210 \u2713", "success");
  }
  var TEXT_TOOLS = {
    "upper": { name: "\u8F6C\u5927\u5199", fn: function(t) {
      return t.toUpperCase();
    } },
    "lower": { name: "\u8F6C\u5C0F\u5199", fn: function(t) {
      return t.toLowerCase();
    } },
    "title": { name: "\u5355\u8BCD\u9996\u5B57\u6BCD\u5927\u5199", fn: titleCase },
    "swap": { name: "\u53CD\u8F6C\u5927\u5C0F\u5199", fn: swapCase },
    "full2half": { name: "\u5168\u89D2\u2192\u534A\u89D2", fn: fullToHalf },
    "half2full": { name: "\u534A\u89D2\u2192\u5168\u89D2", fn: halfToFull },
    "del-empty": { name: "\u5220\u9664\u7A7A\u884C", fn: null, lines: function(l) {
      return l.trim() === "" ? null : l;
    } },
    "del-dup": { name: "\u5220\u9664\u91CD\u590D\u884C", fn: null, lines: dedupeLines },
    "sort": { name: "\u884C\u6392\u5E8F", fn: null, lines: null, sort: function(arr) {
      return arr.slice().sort(function(a, b) {
        return a.localeCompare(b, "zh");
      });
    } },
    "sort-len": { name: "\u6309\u957F\u5EA6\u6392\u5E8F", fn: null, lines: null, sort: function(arr) {
      return arr.slice().sort(function(a, b) {
        return a.length - b.length || a.localeCompare(b, "zh");
      });
    } },
    "reverse": { name: "\u53CD\u8F6C\u884C\u5E8F", fn: null, lines: null, sort: function(arr) {
      return arr.slice().reverse();
    } }
  };
  function dedupeLines(linesArr) {
    var seen = {};
    var out = [];
    linesArr.forEach(function(l) {
      if (!seen[l]) {
        seen[l] = true;
        out.push(l);
      }
    });
    return out;
  }
  function runTextTool(name) {
    execEditorCmd(name);
  }

  // src-app/04-editor-init.js
  var KIND_META = {
    flow: { icon: "\u{1F500}", label: "\u6D41\u7A0B\u56FE" },
    mind: { icon: "\u{1F9E0}", label: "\u601D\u7EF4\u5BFC\u56FE" },
    note: { icon: "\u{1F4CB}", label: "\u601D\u7EF4\u7B14\u8BB0" },
    sticky: { icon: "\u{1F5D2}\uFE0F", label: "\u4FBF\u5229\u8D34" }
  };
  var VISUAL_MODULES = { flow: "InkpadFlow", mind: "InkpadMind", note: "InkpadNote" };
  function docIcon(d) {
    if (d.kind && KIND_META[d.kind]) return KIND_META[d.kind].icon;
    return d.lang === "mermaid" ? "\u{1F4CA}" : "\u{1F4DD}";
  }
  var cm = CodeMirror.fromTextArea(els.editor, {
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 2,
    tabSize: 2,
    autoCloseBrackets: true,
    autoCloseTags: true,
    matchBrackets: true,
    styleActiveLine: true,
    multiSelect: true,
    rectangularSelection: true,
    foldGutter: true,
    gutters: ["CodeMirror-foldgutter", "CodeMirror-linenumbers"],
    foldOptions: { widget: "\u22EF" },
    highlightSelectionMatches: { showToken: /[\w$\u4e00-\u9fff]+/, annotateScrollbar: false },
    extraKeys: {
      "Ctrl-Shift-F": formatCurrent,
      "Cmd-Shift-F": formatCurrent,
      "Ctrl-F": function() {
        openFindModal(false);
      },
      "Cmd-F": function() {
        openFindModal(false);
      },
      "Ctrl-H": function() {
        openFindModal(true);
      },
      "Cmd-H": function() {
        openFindModal(true);
      },
      "F3": function(cm2) {
        frFindNext(false);
      },
      "Shift-F3": function(cm2) {
        frFindNext(true);
      },
      "Ctrl-Alt-Down": "selectNextOccurrence",
      "Cmd-Alt-Down": "selectNextOccurrence",
      "Ctrl-/": "toggleComment",
      "Cmd-/": "toggleComment",
      "Ctrl-Alt-F": "foldAll",
      "Ctrl-Alt-Shift-F": "unfoldAll",
      "Ctrl-Shift-J": function(cm2) {
        execEditorCmd("merge");
      },
      "Cmd-Shift-J": function(cm2) {
        execEditorCmd("merge");
      },
      "Tab": handleTabKey,
      "Shift-Tab": function(cm2) {
        cm2.execCommand("indentLess");
      }
    }
  });
  cm.on("keyup", function(cm2, e) {
    var tag = (e.key || "").length === 1 && /[\w$]/.test(e.key);
    if (tag && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      if (cm2.getOption("mode") !== "text/plain") CodeMirror.commands.autocomplete(cm2, null, { completeSingle: false });
    }
  });
  cm.on("gutterClick", function(cm2, line, gutter) {
    if (gutter === "CodeMirror-linenumbers") {
      cm2.setSelection({ line, ch: 0 }, { line, ch: cm2.getLine(line).length });
    }
  });
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "neutral",
    flowchart: { htmlLabels: true, curve: "basis" },
    fontFamily: "inherit"
  });

  // src-app/10-status-preview.js
  var statDebounceTimer = null;
  var STAT_DEBOUNCE_MS = 180;
  var STAT_BIG_DOC = 200 * 1024;
  function countCharsAndWords(text) {
    var chars = text.length;
    var cjk = 0, words = 0;
    var inWord = false;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      var isCjk = c >= 19968 && c <= 40959;
      var isWordChar = isCjk || c >= 48 && c <= 57 || c >= 65 && c <= 90 || c >= 97 && c <= 122 || c === 95 || c === 36;
      if (isCjk) cjk++;
      if (isWordChar) {
        if (!inWord) {
          words++;
          inWord = true;
        }
      } else {
        inWord = false;
      }
    }
    return { chars, cjk, words };
  }
  function updateStatus() {
    var cur = cm.getCursor();
    els.statCursor.textContent = "\u884C " + (cur.line + 1) + ", \u5217 " + (cur.ch + 1);
    if (statDebounceTimer) return;
    statDebounceTimer = setTimeout(function() {
      statDebounceTimer = null;
      var text = cm.getValue();
      var sel = cm.getSelection();
      var out;
      if (text.length > STAT_BIG_DOC) {
        out = {
          chars: text.length,
          cjk: "~",
          words: "~"
        };
      } else {
        out = countCharsAndWords(text);
      }
      var base = out.chars + " \u5B57\u7B26 \xB7 " + out.words + " \u8BCD";
      els.statCount.textContent = sel ? base + " \xB7 \u9009\u4E2D " + sel.length + " \u5B57\u7B26" : base;
    }, STAT_DEBOUNCE_MS);
  }
  function updatePreviewVisibility() {
    var d = activeDoc();
    var isMermaid = d && d.lang === "mermaid";
    var isMd = d && d.lang === "markdown";
    var isHtml = d && d.lang === "html";
    var show = state.previewOn && (isMermaid || isMd || isHtml);
    els.previewPane.style.display = show ? "flex" : "none";
    els.splitter.style.display = show ? "block" : "none";
    els.btnTogglePreview.classList.toggle("active", !!show);
    els.btnPreviewTop.classList.toggle("active", !!show);
    els.btnPreviewTop.title = show ? "\u5173\u95ED\u9884\u89C8" : "\u9884\u89C8";
    if (isMd) els.btnTogglePreview.textContent = "\u{1F441} MD\u9884\u89C8";
    else if (isHtml) els.btnTogglePreview.textContent = "\u{1F441} HTML\u9884\u89C8";
    else els.btnTogglePreview.textContent = "\u{1F441} \u56FE\u8868\u9884\u89C8";
    if (!show) return;
    if (isMermaid) {
      els.previewTitle.textContent = "\u56FE\u8868\u9884\u89C8";
      els.previewHint.textContent = "\u62D6\u62FD\u5E73\u79FB \xB7 Ctrl+\u6EDA\u8F6E\u7F29\u653E \xB7 \u53CC\u51FB\u590D\u4F4D";
      els.mdOut.style.display = "none";
      els.htmlOut.style.display = "none";
      els.mermaidOut.style.display = "";
    } else if (isHtml) {
      els.previewTitle.textContent = "HTML \u9884\u89C8";
      els.previewHint.textContent = "\u672C\u5730\u5B9E\u65F6\u6E32\u67D3 \xB7 \u4FEE\u6539\u81EA\u52A8\u5237\u65B0";
      els.mdOut.style.display = "none";
      els.htmlOut.style.display = "";
      els.mermaidOut.style.display = "none";
    } else {
      els.previewTitle.textContent = "Markdown \u9884\u89C8";
      els.previewHint.textContent = "\u652F\u6301 GFM \u8868\u683C \xB7 \u4EE3\u7801\u5757 \xB7 ```mermaid \u56FE\u8868";
      els.mermaidOut.style.display = "none";
      els.htmlOut.style.display = "none";
      els.mdOut.style.display = "";
    }
    scheduleRender();
  }
  function scheduleRender() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(function() {
      var d = activeDoc();
      if (!d || !state.previewOn) return;
      if (d.lang === "mermaid") renderMermaid();
      else if (d.lang === "markdown") renderMarkdownPreview();
      else if (d.lang === "html") renderHtmlPreview();
    }, 300);
  }
  function renderMermaid() {
    var d = activeDoc();
    if (!d || d.lang !== "mermaid" || !state.previewOn) return;
    var code = cm.getValue().trim();
    els.mermaidOut.innerHTML = "";
    var oldErr = document.querySelector(".mermaid-error");
    if (oldErr) oldErr.remove();
    if (!code) {
      els.previewEmpty.style.display = "";
      return;
    }
    els.previewEmpty.style.display = "none";
    var seq = ++state.mermaidSeq;
    mermaid.render("mmd-" + seq, code).then(function(res) {
      if (seq !== state.mermaidSeq) return;
      els.mermaidOut.innerHTML = res.svg;
      prepareSvg();
    }).catch(function(err) {
      if (seq !== state.mermaidSeq) return;
      var div = document.createElement("div");
      div.className = "mermaid-error";
      div.textContent = "\u56FE\u8868\u8BED\u6CD5\u9519\u8BEF\uFF1A\n" + (err && err.message ? err.message : String(err));
      els.previewPane.querySelector("#preview-body").appendChild(div);
    });
  }
  function renderHtmlPreview() {
    var d = activeDoc();
    if (!d || d.lang !== "html" || !state.previewOn) return;
    var src = cm.getValue();
    els.previewEmpty.style.display = "none";
    if (!src.trim()) {
      els.htmlFrame.srcdoc = '<body style="font-family:sans-serif;color:#999;padding:40px;text-align:center">\u5728\u5DE6\u4FA7\u8F93\u5165 HTML\uFF0C\u8FD9\u91CC\u5B9E\u65F6\u6E32\u67D3</body>';
      return;
    }
    var baseDir = d.diskPath ? dirOf(d.diskPath) : null;
    inlineHtmlImages(src, baseDir).then(function(html) {
      if (html) els.htmlFrame.srcdoc = html;
    });
  }
  function inlineHtmlImages(html, baseDir) {
    var re = /(<img\b[^>]*\ssrc\s*=\s*)(["'])(.*?)\2/gi;
    var found = [];
    var mm;
    while (mm = re.exec(html)) {
      var src = mm[3];
      if (/^(https?:|data:|blob:)/i.test(src)) continue;
      var abs = isAbsPath(src) ? normPath(src) : baseDir ? joinPath(baseDir, src) : null;
      if (!abs) continue;
      found.push({ full: mm[0], pre: mm[1], q: mm[2], abs });
    }
    if (!found.length) return Promise.resolve(html);
    var out = html;
    return Promise.all(found.map(function(it) {
      if (!hasApi()) {
        it.url = toFileUrl(it.abs);
        return Promise.resolve();
      }
      return getApi().read_file_b64(it.abs).then(function(res) {
        if (res && res.b64) it.url = "data:" + (res.mime || "image/png") + ";base64," + res.b64;
        else it.url = toFileUrl(it.abs);
      }).catch(function() {
        it.url = toFileUrl(it.abs);
      });
    })).then(function() {
      found.forEach(function(it) {
        if (it.url) out = out.split(it.full).join(it.pre + it.q + it.url + it.q);
      });
      return out;
    });
  }
  function renderMarkdownPreview() {
    var d = activeDoc();
    if (!d || d.lang !== "markdown" || !state.previewOn) return;
    var text = cm.getValue();
    var oldErr = document.querySelector(".mermaid-error");
    if (oldErr) oldErr.remove();
    els.previewEmpty.style.display = "none";
    if (!text.trim()) {
      els.mdOut.innerHTML = '<div class="preview-empty"><div class="preview-empty-icon">\u{1F4DD}</div><p>\u5728\u5DE6\u4FA7\u8F93\u5165 Markdown<br>\u8FD9\u91CC\u4F1A\u5B9E\u65F6\u6E32\u67D3\u9884\u89C8</p></div>';
      return;
    }
    window.InkpadMd.renderInto(els.mdOut, text);
    resolveMarkdownImages(d);
  }
  function resolveMarkdownImages(d) {
    var baseDir = d.diskPath ? dirOf(d.diskPath) : null;
    var imgs = els.mdOut.querySelectorAll("img");
    Array.prototype.forEach.call(imgs, function(img) {
      var src = img.getAttribute("src") || "";
      var url = resolveImgSrc(src, baseDir);
      if (url) img.src = url;
    });
  }
  var panState = { down: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 };
  state.zoomLevel = 1;
  var svgNatural = null;
  function prepareSvg() {
    var svg = els.mermaidOut.querySelector("svg");
    if (!svg) {
      svgNatural = null;
      return;
    }
    svg.style.maxWidth = "none";
    var vb = svg.viewBox && svg.viewBox.baseVal;
    var w = vb && vb.width ? vb.width : svg.getBoundingClientRect().width;
    var h = vb && vb.height ? vb.height : svg.getBoundingClientRect().height;
    if (!w || !h) {
      svgNatural = null;
      return;
    }
    svgNatural = { w, h };
    applyZoom();
  }
  function applyZoom() {
    if (!svgNatural) return;
    var svg = els.mermaidOut.querySelector("svg");
    if (!svg) return;
    svg.style.width = svgNatural.w * state.zoomLevel + "px";
    svg.style.height = svgNatural.h * state.zoomLevel + "px";
  }

  // src-app/16-doc-ops.js
  function saveDiskDoc(d) {
    if (!d || !d.diskPath || !hasApi()) return;
    getApi().write_text_file(d.diskPath, d.content, d.encoding).then(function(ok) {
      if (ok) {
        els.statSaved.textContent = "\u5DF2\u4FDD\u5B58\u5230\u78C1\u76D8";
        els.statSaved.style.color = "#0f7b0f";
      }
    }).catch(function() {
      els.statSaved.textContent = "\u78C1\u76D8\u4FDD\u5B58\u5931\u8D25";
      els.statSaved.style.color = "var(--danger)";
    });
  }
  function openEncModal() {
    var d = activeDoc();
    if (!d || d.kind && d.kind !== "text") {
      toast("\u8BF7\u5148\u6253\u5F00\u6587\u672C\u6587\u6863", "error");
      return;
    }
    $("enc-current").textContent = d.diskPath ? "\u78C1\u76D8\u6587\u4EF6 \xB7 " + (d.encoding || "UTF-8") : "\u672C\u5730\u6587\u6863\uFF08\u672A\u5173\u8054\u78C1\u76D8\u6587\u4EF6\uFF09";
    var sel = $("enc-select");
    var cur = d.encoding || "UTF-8";
    var matched = false;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === cur) {
        sel.selectedIndex = i;
        matched = true;
        break;
      }
    }
    if (!matched) sel.selectedIndex = 0;
    $("enc-reload").disabled = !d.diskPath;
    openSingleModal("enc-modal");
  }
  function openCompareWindow() {
    if (!hasApi()) {
      toast("\u6587\u4EF6\u6BD4\u8F83\u9700\u5728\u684C\u9762\u7248\u4E2D\u4F7F\u7528", "error");
      return;
    }
    var d = activeDoc();
    var aText = "", aName = "\u6587\u4EF6 A";
    if (d && (!d.kind || d.kind === "text")) {
      aText = cm.getValue();
      aName = (d.title || "\u5F53\u524D\u6587\u6863") + "\uFF08\u5F53\u524D\u6587\u6863\uFF09";
    }
    getApi().open_compare_window(aText, aName, "", "\u6587\u4EF6 B").then(function(ok) {
      if (ok) toast("\u6BD4\u8F83\u7A97\u53E3\u5DF2\u6253\u5F00\uFF0C\u53EF\u76F4\u63A5\u7C98\u8D34\u5185\u5BB9\u5BF9\u6BD4", "success");
      else toast("\u65B0\u7A97\u53E3\u6253\u5F00\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5", "error");
    }).catch(function() {
      toast("\u65B0\u7A97\u53E3\u6253\u5F00\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5", "error");
    });
  }
  function setLang(lang, skipAutoFormat) {
    var d = activeDoc();
    if (!d) return;
    d.lang = lang;
    if (lang === "json" && !skipAutoFormat && (!d.kind || d.kind === "text")) {
      var raw = cm.getValue();
      if (raw.trim()) {
        try {
          cm.setValue(JSON.stringify(JSON.parse(raw.trim()), null, 2));
          toast("\u5DF2\u81EA\u52A8\u683C\u5F0F\u5316 JSON \u2713", "success");
        } catch (e) {
          toast("\u5185\u5BB9\u4E0D\u662F\u5408\u6CD5 JSON\uFF0C\u5DF2\u5207\u6362\u8BED\u8A00\uFF08\u672A\u683C\u5F0F\u5316\uFF09", "error");
        }
      }
    }
    cm.setOption("mode", LANGS[lang] ? LANGS[lang].mime : "text/plain");
    els.langSelect.value = lang;
    els.statLang.textContent = LANGS[lang] ? LANGS[lang].label : "\u7EAF\u6587\u672C";
    els.breadcrumb.textContent = lang === "mermaid" ? "\u{1F4CA}" : "\u{1F4DD}";
    syncFromEditor();
    updatePreviewBtn();
    updatePreviewVisibility();
  }
  function nextAutoTitle() {
    var base = "\u672A\u547D\u540D\u6587\u6863";
    var max = 0;
    (state.docs || []).forEach(function(doc) {
      var t = doc.title || "";
      if (t === base) {
        max = Math.max(max, 1);
        return;
      }
      var m = t.match(/^未命名文档\s+(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return max ? base + " " + (max + 1) : base;
  }
  function newDoc(lang, title, content) {
    var d = {
      id: uid(),
      title: title || nextAutoTitle(),
      lang: lang || "plaintext",
      content: content || "",
      updated: Date.now()
    };
    state.docs.push(d);
    persist();
    openDoc(d.id);
    if (!title) els.title.focus();
    return d;
  }
  function exportDoc() {
    var d = activeDoc();
    if (!d) return;
    if (d.kind === "rich") {
      var md = window.InkpadBlocks ? window.InkpadBlocks.toMarkdown() : d.content;
      var rname = (d.title || "\u672A\u547D\u540D").replace(/[\\/:*?"<>|]/g, "_") + ".md";
      if (window.pywebview && window.pywebview.api && window.pywebview.api.save_file) {
        window.pywebview.api.save_file(rname, md).then(function(saved) {
          if (saved) toast("\u5DF2\u5BFC\u51FA\u5230 " + saved, "success");
        }).catch(function() {
          toast("\u5BFC\u51FA\u5931\u8D25", "error");
        });
      } else {
        var rblob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        var ra = document.createElement("a");
        ra.href = URL.createObjectURL(rblob);
        ra.download = rname;
        ra.click();
        URL.revokeObjectURL(ra.href);
        toast("\u5DF2\u5BFC\u51FA " + rname, "success");
      }
      return;
    }
    var isVisualDoc = d.kind && d.kind !== "text";
    if (isVisualDoc && state.currentVisual) {
      d.content = JSON.stringify(state.currentVisual.model);
    }
    var ext = isVisualDoc ? ".json" : LANGS[d.lang] ? LANGS[d.lang].ext : ".txt";
    var name = (d.title || "\u672A\u547D\u540D").replace(/[\\/:*?"<>|]/g, "_") + ext;
    var content = isVisualDoc ? d.content : cm.getValue();
    if (window.pywebview && window.pywebview.api && window.pywebview.api.save_file) {
      window.pywebview.api.save_file(name, content).then(function(saved) {
        if (saved) toast("\u5DF2\u5BFC\u51FA\u5230 " + saved, "success");
      }).catch(function() {
        toast("\u5BFC\u51FA\u5931\u8D25", "error");
      });
      return;
    }
    var blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("\u5DF2\u5BFC\u51FA " + name, "success");
  }
  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function() {
      var content = String(reader.result || "");
      var name = file.name.replace(/\.[^.]+$/, "");
      var ext = (file.name.match(/\.([^.]+)$/) || [])[1] || "";
      if (ext.toLowerCase() === "json" && isRichDocContent(content)) {
        var d2 = {
          id: uid(),
          title: name,
          kind: "rich",
          encoding: "utf-8",
          content,
          updated: Date.now()
        };
        state.docs.push(d2);
        persist();
        openDoc(d2.id);
        toast("\u5DF2\u5BFC\u5165\u5BCC\u6587\u6863\uFF1A" + file.name, "success");
        return;
      }
      var langMap = {
        md: "markdown",
        markdown: "markdown",
        json: "json",
        xml: "xml",
        html: "html",
        htm: "html",
        js: "javascript",
        mjs: "javascript",
        py: "python",
        css: "css",
        sql: "sql",
        yaml: "yaml",
        yml: "yaml",
        sh: "shell",
        bat: "shell",
        mmd: "mermaid",
        mermaid: "mermaid",
        c: "clike",
        h: "clike",
        java: "clike",
        cpp: "clike",
        cc: "clike",
        hpp: "clike",
        cs: "clike",
        txt: "plaintext",
        log: "plaintext",
        xhtml: "html"
      };
      var d = newDoc(langMap[ext.toLowerCase()] || "plaintext", name, content);
      toast("\u5DF2\u5BFC\u5165\u300C" + file.name + "\u300D", "success");
      if (d.lang === "html") state.previewOn = true;
      openDoc(d.id);
    };
    reader.readAsText(file);
  }
  var toastTimer = null;
  function toast(msg, type) {
    els.toast.textContent = msg;
    els.toast.className = "show" + (type ? " " + type : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function() {
      els.toast.className = "";
    }, 2600);
  }
  function findDoc(id) {
    for (var i = 0; i < state.docs.length; i++) {
      if (state.docs[i].id === id) return state.docs[i];
    }
    return null;
  }
  function renameDoc(id, newTitle) {
    var d = findDoc(id);
    if (!d) return false;
    d.title = newTitle || "\u65E0\u6807\u9898";
    d.updated = Date.now();
    persist();
    return true;
  }
  function duplicateDoc(id) {
    var d = findDoc(id);
    if (!d) return null;
    var copy = {
      id: uid(),
      title: (d.title || "\u65E0\u6807\u9898") + "\uFF08\u526F\u672C\uFF09",
      lang: d.lang,
      content: d.content || "",
      updated: Date.now()
    };
    if (d.kind) copy.kind = d.kind;
    if (d.encoding) copy.encoding = d.encoding;
    state.docs.push(copy);
    persist();
    return copy;
  }
  function exportDocById(id) {
    var d = findDoc(id);
    if (!d) {
      toast("\u6587\u6863\u4E0D\u5B58\u5728", "error");
      return;
    }
    if (d.kind === "rich") {
      var md = d.content || "";
      var rname = (d.title || "\u672A\u547D\u540D").replace(/[\\/:*?"<>|]/g, "_") + ".md";
      if (window.pywebview && window.pywebview.api && window.pywebview.api.save_file) {
        window.pywebview.api.save_file(rname, md).then(function(saved) {
          if (saved) toast("\u5DF2\u5BFC\u51FA\u5230 " + saved, "success");
        }).catch(function() {
          toast("\u5BFC\u51FA\u5931\u8D25", "error");
        });
      } else {
        var rblob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        var ra = document.createElement("a");
        ra.href = URL.createObjectURL(rblob);
        ra.download = rname;
        ra.click();
        URL.revokeObjectURL(ra.href);
        toast("\u5DF2\u5BFC\u51FA " + rname, "success");
      }
      return;
    }
    var isVisualDoc = d.kind && d.kind !== "text";
    var ext = isVisualDoc ? ".json" : LANGS[d.lang] ? LANGS[d.lang].ext : ".txt";
    var name = (d.title || "\u672A\u547D\u540D").replace(/[\\/:*?"<>|]/g, "_") + ext;
    var content = d.content || "";
    if (window.pywebview && window.pywebview.api && window.pywebview.api.save_file) {
      window.pywebview.api.save_file(name, content).then(function(saved) {
        if (saved) toast("\u5DF2\u5BFC\u51FA\u5230 " + saved, "success");
      }).catch(function() {
        toast("\u5BFC\u51FA\u5931\u8D25", "error");
      });
    } else {
      var blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("\u5DF2\u5BFC\u51FA " + name, "success");
    }
  }
  function toggleFavorite(id) {
    var d = findDoc(id);
    if (!d) return false;
    d.favorite = !d.favorite;
    d.updated = Date.now();
    persist();
    return d.favorite;
  }
  function togglePin(id) {
    var d = findDoc(id);
    if (!d) return false;
    d.pinned = !d.pinned;
    d.updated = Date.now();
    persist();
    return d.pinned;
  }
  function newSticky() {
    var d = {
      id: uid(),
      title: "",
      kind: "sticky",
      content: "",
      color: "#FFD43B",
      updated: Date.now()
    };
    state.docs.push(d);
    persist();
    state.stickyEditId = d.id;
    state.stickyColor = d.color || "#FFD43B";
    state.docFilter = "sticky";
    state.tagFilter = null;
    openStickyEditor(d);
    return d;
  }
  function saveSticky(id, opts) {
    var d = findDoc(id);
    if (!d || d.kind !== "sticky") return false;
    if (opts.title !== void 0) d.title = opts.title;
    if (opts.content !== void 0) d.content = opts.content;
    if (opts.color !== void 0) d.color = opts.color;
    if (opts.pinned !== void 0) d.pinned = !!opts.pinned;
    if (opts.reminder !== void 0) {
      if (opts.reminder && opts.reminder.enabled) d.reminder = opts.reminder;
      else delete d.reminder;
    }
    if (opts.dueAt !== void 0) {
      if (opts.dueAt) d.dueAt = opts.dueAt;
      else delete d.dueAt;
    }
    d.updated = Date.now();
    persist();
    return true;
  }
  function openStickyEditor(d) {
    if (!els.stickyEditModal) return;
    els.stickyEditTitle.value = d.title || "";
    els.stickyEditContent.value = d.content || "";
    els.stickyEditPin.checked = !!d.pinned;
    state.stickyColor = d.color || "#FFD43B";
    Array.prototype.forEach.call(els.stickyColorRow.children, function(el) {
      el.classList.toggle("active", el.getAttribute("data-color") === state.stickyColor);
    });
    var rem = d.reminder;
    if (els.stickyEditRemEnabled) {
      els.stickyEditRemEnabled.checked = !!(rem && rem.enabled);
      els.stickyRemRow.style.display = rem && rem.enabled ? "" : "none";
      els.stickyEditRemType.value = rem && rem.type || "once";
      els.stickyEditRemTime.value = rem && rem.time || "09:00";
      els.stickyEditRemDate.value = rem && rem.date || "";
      els.stickyEditRemDay.value = rem && rem.day || "";
      Array.prototype.forEach.call(els.stickyRemWeekly.querySelectorAll("input[type=checkbox]"), function(cb) {
        cb.checked = !!(rem && rem.type === "weekly" && rem.days && rem.days.indexOf(Number(cb.value)) >= 0);
      });
      syncRemSubUI();
    }
    if (els.stickyEditDue) els.stickyEditDue.value = d.dueAt ? toLocalInput(d.dueAt) : "";
    els.stickyEditModal.style.display = "flex";
  }
  function syncRemSubUI() {
    if (!els.stickyEditRemType) return;
    var t = els.stickyEditRemType.value;
    if (els.stickyRemOnce) els.stickyRemOnce.style.display = t === "once" ? "" : "none";
    if (els.stickyRemWeekly) els.stickyRemWeekly.style.display = t === "weekly" ? "" : "none";
    if (els.stickyRemMonthly) els.stickyRemMonthly.style.display = t === "monthly" ? "" : "none";
  }
  function pad22(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function toLocalInput(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "-" + pad22(d.getMonth() + 1) + "-" + pad22(d.getDate()) + "T" + pad22(d.getHours()) + ":" + pad22(d.getMinutes());
  }
  function fromLocalInput(v) {
    if (!v) return null;
    var t = new Date(v).getTime();
    return isNaN(t) ? null : t;
  }
  function fmtStamp(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "-" + pad22(d.getMonth() + 1) + "-" + pad22(d.getDate()) + " " + pad22(d.getHours()) + ":" + pad22(d.getMinutes());
  }
  function setTagExpiry(tag, days) {
    if (days == null) {
      clearTagExpiry(tag);
      return;
    }
    var n = Number(days);
    if (isNaN(n) || n < 1) {
      toast("\u8BF7\u8F93\u5165\u6709\u6548\u7684\u5929\u6570\uFF08\u22651\uFF09", "error");
      return;
    }
    state.tagMeta[tag] = { expiresAt: Date.now() + n * 864e5 };
    persist();
    toast("\u6807\u7B7E #" + tag + " \u5C06\u4E8E " + n + " \u5929\u540E\u8FC7\u671F", "success");
  }
  function clearTagExpiry(tag) {
    if (state.tagMeta[tag]) {
      delete state.tagMeta[tag];
      persist();
      toast("\u5DF2\u6E05\u9664\u6807\u7B7E #" + tag + " \u7684\u8FC7\u671F\u65F6\u95F4", "success");
    }
  }
  function cleanupExpiredTags() {
    var now = Date.now();
    var expired = [];
    for (var t in state.tagMeta) {
      if (state.tagMeta[t] && state.tagMeta[t].expiresAt && state.tagMeta[t].expiresAt < now) {
        expired.push(t);
      }
    }
    if (!expired.length) return [];
    var changed = false;
    state.docs.forEach(function(d) {
      if (!d.tags || !d.tags.length) return;
      var before = d.tags.length;
      d.tags = d.tags.filter(function(x) {
        return expired.indexOf(x) < 0;
      });
      if (d.tags.length !== before) changed = true;
    });
    expired.forEach(function(t2) {
      delete state.tagMeta[t2];
    });
    if (changed) {
      persist();
      toast("\u5DF2\u81EA\u52A8\u6E05\u7406\u8FC7\u671F\u6807\u7B7E\uFF1A#" + expired.join(" #"), "success");
    } else {
      persist();
    }
    return expired;
  }
  function matchReminder(rem, now) {
    if (!rem || !rem.enabled) return false;
    now = now || /* @__PURE__ */ new Date();
    var hhmm = pad22(now.getHours()) + ":" + pad22(now.getMinutes());
    if (rem.time !== hhmm) return false;
    if (rem.type === "once") {
      return rem.date === now.getFullYear() + "-" + pad22(now.getMonth() + 1) + "-" + pad22(now.getDate());
    }
    if (rem.type === "daily") return true;
    if (rem.type === "weekly") {
      return !!(rem.days && rem.days.indexOf(now.getDay()) >= 0);
    }
    if (rem.type === "monthly") {
      return Number(rem.day) === now.getDate();
    }
    return false;
  }
  function saveDocTags(id, tags) {
    var d = findDoc(id);
    if (!d) return false;
    d.tags = tags.slice();
    d.updated = Date.now();
    persist();
    return true;
  }
  function collectAllTags() {
    var map = {};
    state.docs.forEach(function(d) {
      if (d.deleted || d.kind === "sticky") return;
      (d.tags || []).forEach(function(t) {
        map[t] = (map[t] || 0) + 1;
      });
    });
    return map;
  }

  // src-app/02-rich-outline.js
  var richOutline = {
    visible: false,
    // 大纲面板是否显示
    items: [],
    // [{ id, type, text }]
    activeId: null,
    // 当前滚动所在标题
    observer: null,
    // IntersectionObserver 实例
    filterKw: "",
    // 搜索关键字
    dragState: null
    // splitter 拖拽
  };
  function richOutlineVisible(v) {
    v = !!v;
    richOutline.visible = v;
    if (els.richOutline) {
      els.richOutline.style.display = v ? "flex" : "none";
    }
    if (els.richOutlineSplitter) {
      els.richOutlineSplitter.style.display = v ? "" : "none";
    }
    if (els.btnRichOutline) {
      els.btnRichOutline.classList.toggle("primary", v);
      els.btnRichOutline.title = v ? "\u6536\u8D77\u5927\u7EB2\uFF08\u98DE\u4E66\u5F0F\u4FA7\u680F\uFF09" : "\u5BCC\u6587\u6863\u5927\u7EB2 / \u76EE\u5F55\uFF08\u98DE\u4E66\u5F0F\u4FA7\u680F\uFF09";
    }
    if (v && window.InkpadBlocks) {
      try {
        window.InkpadBlocks.notifyOutline();
      } catch (e) {
      }
      setupRichOutlineObserver();
    } else if (!v && richOutline.observer) {
      try {
        richOutline.observer.disconnect();
      } catch (e) {
      }
      richOutline.observer = null;
    }
  }
  function renderRichOutline(items) {
    if (!els.outlineList) return;
    richOutline.items = Array.isArray(items) ? items.slice() : [];
    var kw = (richOutline.filterKw || "").trim().toLowerCase();
    var i;
    els.outlineList.innerHTML = "";
    if (!richOutline.items.length) {
      els.outlineList.appendChild(els.outlineEmpty);
      els.outlineEmpty.style.display = "";
    } else {
      els.outlineEmpty.style.display = "none";
      for (i = 0; i < richOutline.items.length; i++) {
        var it = richOutline.items[i];
        var row = document.createElement("div");
        row.className = "outline-item outline-" + it.type;
        row.setAttribute("data-id", it.id);
        row.setAttribute("data-type", it.type);
        row.title = it.text;
        var mark = document.createElement("span");
        mark.className = "outline-mark";
        mark.textContent = it.type.toUpperCase();
        var txt = document.createElement("span");
        txt.className = "outline-text";
        txt.textContent = it.text;
        row.appendChild(mark);
        row.appendChild(txt);
        if (kw && it.text.toLowerCase().indexOf(kw) < 0) row.classList.add("hide");
        row.addEventListener("click", function(ev) {
          var id = ev.currentTarget.getAttribute("data-id");
          scrollToOutlineItem(id);
        });
        els.outlineList.appendChild(row);
      }
    }
    var shown = els.outlineList.querySelectorAll(".outline-item:not(.hide)").length;
    els.outlineCount.textContent = shown + (kw ? "/" + richOutline.items.length : "");
    if (richOutline.activeId) {
      var activeEl = els.outlineList.querySelector('[data-id="' + richOutline.activeId + '"]');
      if (activeEl) activeEl.classList.add("active");
    }
    if (els.outlineFoot) {
      els.outlineFoot.style.display = richOutline.items.length ? "" : "none";
    }
    if (richOutline.observer) {
      try {
        richOutline.observer.disconnect();
      } catch (e) {
      }
      setupRichOutlineObserver();
    }
  }
  function scrollToOutlineItem(id) {
    if (!window.InkpadBlocks) return;
    if (!richOutline.activeId || richOutline.activeId !== id) {
      var prev = els.outlineList.querySelectorAll(".outline-item.active");
      for (var i = 0; i < prev.length; i++) prev[i].classList.remove("active");
      var node = els.outlineList.querySelector('[data-id="' + id + '"]');
      if (node) {
        node.classList.add("active");
        if (node.scrollIntoView) {
          try {
            node.scrollIntoView({ block: "nearest" });
          } catch (e) {
          }
        }
      }
      richOutline.activeId = id;
    }
    window.InkpadBlocks.scrollToOutlineItem(id);
  }
  function setupRichOutlineObserver() {
    if (!els.richPane || !window.IntersectionObserver) return;
    if (richOutline.observer) {
      try {
        richOutline.observer.disconnect();
      } catch (e) {
      }
      richOutline.observer = null;
    }
    var anchors = els.richPane.querySelectorAll(".ink-anchor");
    if (!anchors.length) return;
    var visibleSet = {};
    richOutline.observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        var id = entry.target.id.replace(/^ink-/, "");
        if (entry.isIntersecting) visibleSet[id] = entry.intersectionRatio || 1e-4;
        else delete visibleSet[id];
      });
      var bestId = null, bestRatio = 0;
      Object.keys(visibleSet).forEach(function(id) {
        if (visibleSet[id] > bestRatio) {
          bestRatio = visibleSet[id];
          bestId = id;
        }
      });
      if (!bestId && richOutline.items.length) {
        var ids = richOutline.items.map(function(x) {
          return x.id;
        });
        if (richOutline.activeId) {
          var curIdx = ids.indexOf(richOutline.activeId);
          var paneTop = els.richPane.getBoundingClientRect().top;
          var bestDiff = Infinity;
          anchors.forEach(function(a) {
            var d = a.getBoundingClientRect().top - paneTop;
            if (d >= -8 && d < bestDiff) {
              bestDiff = d;
              bestId = a.id.replace(/^ink-/, "");
            }
          });
        }
      }
      if (bestId && bestId !== richOutline.activeId) {
        richOutline.activeId = bestId;
        var prev = els.outlineList.querySelectorAll(".outline-item.active");
        for (var i = 0; i < prev.length; i++) prev[i].classList.remove("active");
        var node = els.outlineList.querySelector('[data-id="' + bestId + '"]');
        if (node) {
          node.classList.add("active");
          if (node.scrollIntoView) {
            try {
              node.scrollIntoView({ block: "nearest" });
            } catch (e) {
            }
          }
        }
      }
    }, {
      root: els.richPane,
      rootMargin: "0px 0px -75% 0px",
      threshold: [0, 0.1, 0.5, 1]
    });
    anchors.forEach(function(a) {
      richOutline.observer.observe(a);
    });
  }
  function bindRichOutline() {
    if (!els.btnRichOutline) return;
    els.btnRichOutline.addEventListener("click", function() {
      if (!activeDoc() || activeDoc().kind !== "rich") {
        toast("\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A\u5BCC\u6587\u6863", "warn");
        return;
      }
      richOutlineVisible(!richOutline.visible);
    });
    els.btnCloseOutline && els.btnCloseOutline.addEventListener("click", function() {
      richOutlineVisible(false);
    });
    els.outlineSearch && els.outlineSearch.addEventListener("input", function() {
      richOutline.filterKw = els.outlineSearch.value;
      renderRichOutline(richOutline.items);
    });
    els.btnOutlineUp && els.btnOutlineUp.addEventListener("click", function() {
      var ids = richOutline.items.map(function(x) {
        return x.id;
      });
      if (!ids.length) return;
      var curIdx = ids.indexOf(richOutline.activeId);
      if (curIdx < 0) curIdx = ids.length;
      var prev = ids[Math.max(0, curIdx - 1)];
      if (prev) scrollToOutlineItem(prev);
    });
    els.btnOutlineDown && els.btnOutlineDown.addEventListener("click", function() {
      var ids = richOutline.items.map(function(x) {
        return x.id;
      });
      if (!ids.length) return;
      var curIdx = ids.indexOf(richOutline.activeId);
      var next = ids[(curIdx + 1) % ids.length];
      if (next) scrollToOutlineItem(next);
    });
    els.btnOutlineReload && els.btnOutlineReload.addEventListener("click", function() {
      if (window.InkpadBlocks) {
        try {
          window.InkpadBlocks.notifyOutline();
        } catch (e) {
        }
      }
    });
    if (els.richOutlineSplitter) {
      els.richOutlineSplitter.addEventListener("mousedown", function(ev) {
        ev.preventDefault();
        var rect = els.richOutline.getBoundingClientRect();
        richOutline.dragState = { startX: ev.clientX, startW: rect.width };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      });
    }
    window.addEventListener("mousemove", function(e) {
      if (!richOutline.dragState) return;
      var newW = richOutline.dragState.startW + (e.clientX - richOutline.dragState.startX);
      if (newW < 160) newW = 160;
      if (newW > 460) newW = 460;
      els.richOutline.style.flex = "0 0 " + newW + "px";
    });
    window.addEventListener("mouseup", function() {
      if (richOutline.dragState) {
        richOutline.dragState = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    });
    if (window.InkpadBlocks) {
      window.InkpadBlocks.setOutlineListener(renderRichOutline);
    }
  }

  // src-app/21-backlinks.js
  var blState = { fold: false, ctx: true, sortDesc: true, filter: "" };
  var _currentId = null;
  var _bound = false;
  function docText(doc) {
    if (!doc) return "";
    if (doc.kind === "rich") {
      var arr = doc.content;
      if (Array.isArray(arr)) {
        return arr.map(function(b) {
          return b && b.text || "";
        }).join("\n");
      }
      return "";
    }
    return typeof doc.content === "string" ? doc.content : "";
  }
  function contextOf(text, start, len) {
    var before = 40, after = 60;
    var s = Math.max(0, start - before);
    var e = Math.min(text.length, start + len + after);
    return (s > 0 ? "\u2026" : "") + text.slice(s, e).replace(/\s+/g, " ") + (e < text.length ? "\u2026" : "");
  }
  function linkRangesOf(text) {
    var out = [];
    var re = /\[\[([^\[\]]*)\]\]/g, m;
    while (m = re.exec(text)) {
      out.push({ s: m.index, e: m.index + m[0].length, inner: m[1] });
    }
    return out;
  }
  function scanBacklinks(d, docs) {
    var linked = [], mentioned = [];
    if (!d || !d.title) return { linked, mentioned };
    var title = d.title.trim();
    if (!title) return { linked, mentioned };
    (docs || []).forEach(function(doc) {
      if (!doc || doc.id === d.id || doc.deleted) return;
      var text = docText(doc);
      if (!text) return;
      var ranges = linkRangesOf(text);
      var explicit = ranges.filter(function(r) {
        var inner = r.inner.trim();
        return inner === title || inner.indexOf(title + "|") === 0;
      });
      if (explicit.length) {
        linked.push({
          docId: doc.id,
          title: doc.title,
          updated: doc.updated || 0,
          matches: explicit.map(function(r) {
            return { start: r.s, len: r.e - r.s, ctx: contextOf(text, r.s, r.e - r.s) };
          })
        });
      }
      var mentions = [];
      var idx = 0;
      while ((idx = text.indexOf(title, idx)) >= 0) {
        var inside = ranges.some(function(r) {
          return idx >= r.s && idx < r.e;
        });
        if (!inside) mentions.push({ start: idx, len: title.length, ctx: contextOf(text, idx, title.length) });
        idx += title.length;
      }
      if (mentions.length) {
        mentioned.push({ docId: doc.id, title: doc.title, updated: doc.updated || 0, matches: mentions });
      }
    });
    return { linked, mentioned };
  }
  function sortGroup(list) {
    var dir = blState.sortDesc ? -1 : 1;
    return list.slice().sort(function(a, b) {
      return (a.updated - b.updated) * dir;
    });
  }
  function matchFilter(list) {
    var f = blState.filter.trim().toLowerCase();
    if (!f) return list;
    return list.filter(function(it) {
      var kw = f.split(/\s+/).every(function(k) {
        return it.title.toLowerCase().indexOf(k) >= 0;
      });
      return kw;
    });
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function renderGroup(list, label, kind, title) {
    var rows = sortGroup(matchFilter(list));
    if (!rows.length) return "";
    var html = '<div class="bl-group"><div class="bl-group-title">' + label + ' <span class="bl-group-n">' + rows.length + "</span></div>";
    rows.forEach(function(it) {
      html += '<div class="bl-item" data-docid="' + it.docId + '" data-kind="' + kind + '" title="\u6253\u5F00 ' + esc(it.title) + '">';
      html += '<div class="bl-item-title">' + (it.title || "(\u672A\u547D\u540D)") + (blState.fold ? "" : ' <span class="bl-item-n">' + it.matches.length + "</span>") + "</div>";
      if (!blState.fold && (blState.ctx || kind === "linked")) {
        it.matches.slice(0, 2).forEach(function(mm, i) {
          html += '<div class="bl-item-ctx">' + esc(mm.ctx) + "</div>";
        });
      }
      if (kind === "mentioned") {
        html += '<button class="bl-link-btn" data-act="link" data-docid="' + it.docId + '" title="\u628A\u6B63\u6587\u4E2D\u7684\u300C' + esc(title) + "\u300D\u8F6C\u4E3A [[" + esc(title) + ']] \u94FE\u63A5">\u8F6C\u4E3A\u94FE\u63A5</button>';
      }
      html += "</div>";
    });
    html += "</div>";
    return html;
  }
  function render(d) {
    var card = document.getElementById("backlinksCard");
    var content = document.getElementById("bl-content");
    var countEl = document.getElementById("bl-count");
    if (!card || !content) return;
    if (!d || !d.title) {
      card.style.display = "none";
      content.innerHTML = "";
      return;
    }
    var res = scanBacklinks(d, state.docs);
    var total = res.linked.length + res.mentioned.length;
    card.style.display = "";
    if (countEl) countEl.textContent = total ? "\uFF08" + total + "\uFF09" : "";
    var html = "";
    if (!total) {
      html = '<div class="bl-empty">\u6682\u65E0\u53CD\u5411\u94FE\u63A5<br><small>\u5176\u4ED6\u6587\u6863\u300C\u63D0\u5230\u300D\u6216\u300C[[\u94FE\u63A5]]\u300D\u672C\u6807\u9898\u540E\u4F1A\u663E\u793A\u5728\u8FD9\u91CC</small></div>';
    } else {
      html += renderGroup(res.linked, "\u94FE\u63A5\u5F53\u524D\u6587\u4EF6", "linked", d.title);
      html += renderGroup(res.mentioned, "\u63D0\u5230\u5F53\u524D\u6587\u4EF6\u540D", "mentioned", d.title);
      if (!matchFilter(res.linked).length && !matchFilter(res.mentioned).length) {
        html = '<div class="bl-empty">\u6CA1\u6709\u7B26\u5408\u7B5B\u9009\u6761\u4EF6\u7684\u7ED3\u679C</div>';
      }
    }
    content.innerHTML = html;
  }
  function replaceTitleToLink(text, title) {
    var saved = [];
    var i = 0;
    var re = /\[\[([^\[\]]*)\]\]/g;
    var masked = text.replace(re, function(m) {
      saved.push(m);
      return "\0" + i++ + "\0";
    });
    masked = masked.split(title).join("[[" + title + "]]");
    return masked.replace(/\u0000(\d+)\u0000/g, function(_, n) {
      return saved[+n];
    });
  }
  function turnToLink(docId, title) {
    var doc = null;
    for (var i = 0; i < state.docs.length; i++) {
      if (state.docs[i].id === docId) {
        doc = state.docs[i];
        break;
      }
    }
    if (!doc) return;
    if (doc.kind === "rich" && Array.isArray(doc.content)) {
      doc.content.forEach(function(b) {
        if (b && typeof b.text === "string") b.text = replaceTitleToLink(b.text, title);
      });
    } else if (typeof doc.content === "string") {
      doc.content = replaceTitleToLink(doc.content, title);
    } else {
      return;
    }
    doc.updated = Date.now();
    persist();
    bus.emit("docs:changed");
  }
  function bindEvents() {
    if (_bound) return;
    _bound = true;
    var fold = document.getElementById("bl-fold");
    var ctx = document.getElementById("bl-ctx");
    var sort = document.getElementById("bl-sort");
    var filter = document.getElementById("bl-filter");
    var content = document.getElementById("bl-content");
    if (fold) fold.addEventListener("click", function() {
      blState.fold = !blState.fold;
      redraw();
    });
    if (ctx) ctx.addEventListener("click", function() {
      blState.ctx = !blState.ctx;
      redraw();
    });
    if (sort) sort.addEventListener("click", function() {
      blState.sortDesc = !blState.sortDesc;
      redraw();
    });
    if (filter) filter.addEventListener("input", function() {
      blState.filter = filter.value;
      redraw();
    });
    if (content) {
      content.addEventListener("click", function(e) {
        var linkBtn = e.target.closest('[data-act="link"]');
        if (linkBtn) {
          e.stopPropagation();
          turnToLink(linkBtn.getAttribute("data-docid"), currentTitle());
          redraw();
          return;
        }
        var item = e.target.closest(".bl-item");
        if (item) {
          var docId = item.getAttribute("data-docid");
          if (docId) openDoc(docId);
        }
      });
    }
  }
  function currentTitle() {
    for (var i = 0; i < state.docs.length; i++) {
      if (state.docs[i].id === _currentId) return state.docs[i].title || "";
    }
    return "";
  }
  function redraw() {
    var d = null;
    for (var i = 0; i < state.docs.length; i++) {
      if (state.docs[i].id === _currentId) {
        d = state.docs[i];
        break;
      }
    }
    render(d);
  }
  function renderBacklinks(d) {
    bindEvents();
    _currentId = d ? d.id : null;
    render(d);
  }
  function forceRecompute() {
    redraw();
  }

  // src-app/07-doc-open.js
  function updateInfoPanel(d, kind) {
    var fmtName = {
      text: "\u7EAF\u6587\u672C",
      markdown: "Markdown",
      rich: "\u5BCC\u6587\u6863",
      flow: "\u6D41\u7A0B\u56FE",
      mind: "\u601D\u7EF4\u5BFC\u56FE",
      note: "\u601D\u7EF4\u7B14\u8BB0"
    }[kind] || "\u7EAF\u6587\u672C";
    var langName = {
      plaintext: "\u7EAF\u6587\u672C",
      markdown: "Markdown",
      json: "JSON",
      xml: "XML",
      html: "HTML",
      javascript: "JavaScript",
      python: "Python",
      css: "CSS",
      sql: "SQL",
      yaml: "YAML",
      shell: "Shell",
      clike: "C/Java",
      mermaid: "Mermaid"
    }[d.lang] || "\u7EAF\u6587\u672C";
    var shownFmt = kind === "text" ? langName : fmtName;
    var _content = d.content;
    var _linesNum = d.lines;
    if (typeof _linesNum !== "number") {
      _linesNum = Array.isArray(_content) ? _content.length : typeof _content === "string" ? _content.split("\n").length : 0;
    }
    var lines = _linesNum;
    var chars = d.chars;
    if (typeof chars !== "number") {
      if (Array.isArray(_content)) {
        chars = _content.reduce(function(s, l) {
          return s + (l && l.text ? l.text : String(l || "")).length;
        }, 0);
      } else if (typeof _content === "string") {
        chars = _content.length;
      } else {
        chars = 0;
      }
    }
    var pFormat = document.getElementById("pFormat");
    var pEnc = document.getElementById("pEnc");
    var pPath = document.getElementById("pPath");
    var pLines = document.getElementById("pLines");
    var pChars = document.getElementById("pChars");
    var metaFormat = document.getElementById("metaFormat");
    var metaStat = document.getElementById("metaStat");
    if (pFormat) pFormat.textContent = shownFmt;
    if (pEnc) pEnc.textContent = d.diskPath ? d.encoding || "UTF-8" : "UTF-8";
    if (pPath) {
      pPath.textContent = d.diskPath ? dirOf(d.diskPath) || "/" : "\u672C\u5730\u6587\u6863";
      pPath.title = d.diskPath || "";
    }
    if (pLines) pLines.textContent = kind === "rich" ? d.blocks ? d.blocks.length + " \u5757" : "\u2014" : lines;
    if (pChars) pChars.textContent = chars;
    if (metaFormat) metaFormat.textContent = shownFmt;
    if (metaStat) metaStat.textContent = kind === "rich" ? (d.blocks ? d.blocks.length : 0) + " \u5757 \xB7 " + chars + " \u5B57\u7B26" : lines + " \u884C \xB7 " + chars + " \u5B57\u7B26";
    if (els.breadcrumb) els.breadcrumb.textContent = kind === "diagram" ? "\u{1F4CA}" : kind === "rich" ? "\u{1F4DD}" : "\u{1F4DD}";
    var outlineCard = document.getElementById("outlineCard");
    if (outlineCard) {
      if (kind === "rich") {
        outlineCard.innerHTML = "";
      } else {
        var _rows = Array.isArray(_content) ? _content : typeof _content === "string" ? _content.split("\n") : [];
        var items = _rows.slice(0, 12).map(function(l, i) {
          var txt = (l.text || l) + "";
          if (txt.indexOf("#") === 0 || /^[A-Za-z0-9_ ]{0,3}[：:]\s/.test(txt)) {
            var indent = txt.indexOf("##") === 0 ? " indent" : "";
            var safe = txt.replace(/</g, "&lt;");
            return '<div class="outline-item' + indent + '" onclick="goLine(' + (i + 1) + ')"><svg class="ol-icon" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg><span class="ol-text">' + (safe.slice(0, 24) || "\uFF08\u7A7A\u884C\uFF09") + "</span></div>";
          }
          return "";
        }).join("");
        outlineCard.innerHTML = items ? '<div class="card-title"><svg viewBox="0 0 24 24"><path d="M3 9h14V7H3v2zm0 4h14v-2H3v2zm0 4h14v-2H3v2z"/></svg>\u5927\u7EB2</div>' + items : '<div class="card-title"><svg viewBox="0 0 24 24"><path d="M3 9h14V7H3v2zm0 4h14v-2H3v2zm0 4h14v-2H3v2z"/></svg>\u5927\u7EB2</div><div style="font-size:12px;color:var(--text-faint);padding:4px 8px">\u6682\u65E0\u6807\u9898\u884C<br><small>\u4EE5\u300C#\u300D\u5F00\u5934\u7684\u884C\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC</small></div>';
      }
    }
    renderBacklinks(d);
  }
  function goLine(n) {
    try {
      if (cm && cm.setCursor) {
        cm.setCursor({ line: n - 1, ch: 0 });
        cm.focus();
      } else {
        var codeScroll = document.getElementById("codeScroll");
        var lines = document.querySelectorAll("#codeLines .code-line");
        if (lines[n - 1] && codeScroll) {
          codeScroll.scrollTop = lines[n - 1].offsetTop - 40;
        }
      }
      var items = document.querySelectorAll("#outlineCard .outline-item");
      Array.prototype.forEach.call(items, function(o) {
        o.classList.remove("active");
      });
      var ev = window.event;
      if (ev && ev.currentTarget) ev.currentTarget.classList.add("active");
    } catch (e) {
    }
  }
  function openDoc(id) {
    state.activeId = id;
    var d = activeDoc();
    if (!d) return;
    persist();
    var kind = d.kind || "text";
    if (state.currentVisual && state.currentVisual.module) state.currentVisual.module.destroy();
    state.currentVisual = null;
    if (window.InkpadBlocks && els.richPane && els.richPane.style.display !== "none") {
      window.InkpadBlocks.close();
    }
    els.editorPane.style.display = kind === "text" ? "flex" : "none";
    els.visualPane.style.display = kind === "flow" || kind === "mind" || kind === "note" ? "flex" : "none";
    els.richPane.style.display = kind === "rich" ? "flex" : "none";
    [els.langSelect, els.toolsWrap, els.toolsWrap2, els.btnFormatXml, els.btnFind, els.btnEncoding, els.btnCompare, els.btnTogglePreview].forEach(function(el) {
      el.style.display = kind === "text" ? "" : "none";
    });
    if (els.btnRichOutline) {
      els.btnRichOutline.style.display = kind === "rich" ? "" : "none";
    }
    if (kind !== "rich") {
      if (richOutline.visible) richOutlineVisible(false);
      if (richOutline.observer) {
        try {
          richOutline.observer.disconnect();
        } catch (e) {
        }
        richOutline.observer = null;
      }
      richOutline.activeId = null;
    }
    els.title.value = d.title || "";
    updateInfoPanel(d, kind);
    updatePreviewBtn();
    els.statEdit.textContent = "\u6700\u540E\u7F16\u8F91 " + fullTime(d.updated || Date.now());
    if (d.diskPath) {
      els.statEnc.textContent = "\u78C1\u76D8\u6587\u4EF6 \xB7 " + (d.encoding || "UTF-8");
      els.statEditSep.style.display = "";
    } else {
      els.statEnc.textContent = "\u672C\u5730\u6587\u6863";
      els.statEditSep.style.display = "none";
    }
    if (kind === "rich") {
      els.previewPane.style.display = "none";
      els.breadcrumb.textContent = "\u{1F4DD}";
      els.statLang.textContent = "\u5757\u7F16\u8F91\u5668";
      els.statCursor.textContent = "";
      els.btnInsertImage.style.display = "none";
      if (window.InkpadBlocks) {
        var finishOpen = function() {
          window.InkpadBlocks.open(els.richCanvas, d);
          renderList();
        };
        var loadFromDisk = function(cb) {
          if (!d.diskPath) {
            cb();
            return;
          }
          var doRead = function() {
            getApi().read_text_file(d.diskPath).then(function(res) {
              if (res && res.content != null && res.content !== "") {
                try {
                  JSON.parse(res.content);
                  d.content = res.content;
                } catch (e) {
                }
              }
              cb();
            }).catch(function() {
              cb();
            });
          };
          if (hasApi()) doRead();
          else {
            window.addEventListener("pywebviewready", function h() {
              window.removeEventListener("pywebviewready", h);
              doRead();
            }, { once: true });
          }
        };
        ensureRichDiskPath(d).then(function(assigned) {
          loadFromDisk(function() {
            finishOpen();
            if (assigned) {
              persist();
              saveDiskDoc(d);
            }
          });
        });
      }
      return;
    }
    if (kind !== "text") {
      els.previewPane.style.display = "none";
      openVisual(d, kind);
      renderList();
      return;
    }
    cm.setValue(d.content || "");
    cm.setOption("mode", LANGS[d.lang] ? LANGS[d.lang].mime : "text/plain");
    cm.clearHistory();
    els.langSelect.value = d.lang || "plaintext";
    var isDiagram = d.lang === "mermaid";
    els.breadcrumb.textContent = isDiagram ? "\u{1F4CA}" : "\u{1F4DD}";
    els.statLang.textContent = LANGS[d.lang] ? LANGS[d.lang].label : "\u7EAF\u6587\u672C";
    els.btnTogglePreview.classList.toggle("active", isDiagram && state.previewOn);
    updatePreviewVisibility();
    updateStatus();
    renderList();
    refreshTextDocFromDisk(d);
  }
  function refreshTextDocFromDisk(d) {
    if (!d || d.kind === "rich" || !d.diskPath) return;
    if (!hasApi()) {
      window.addEventListener("pywebviewready", function h() {
        window.removeEventListener("pywebviewready", h);
        refreshTextDocFromDisk(d);
      }, { once: true });
      return;
    }
    var prev = d.content || "";
    getApi().read_text_file(d.diskPath).then(function(res) {
      if (!res || res.error) return;
      var diskContent = res.content == null ? "" : res.content;
      if (diskContent === prev) return;
      var isCurrent = activeDoc() === d;
      if (isCurrent && cm.getValue() === prev) {
        d.content = diskContent;
        d.encoding = res.encoding || d.encoding || "UTF-8";
        d.updated = Date.now();
        persist();
        cm.setValue(diskContent);
        cm.setOption("mode", LANGS[d.lang] ? LANGS[d.lang].mime : "text/plain");
        cm.clearHistory();
        updatePreviewVisibility();
        updateStatus();
        renderList();
        toast("\u68C0\u6D4B\u5230\u78C1\u76D8\u5185\u5BB9\u5DF2\u66F4\u65B0\uFF0C\u5DF2\u52A0\u8F7D\u6700\u65B0\u7248\u672C", "info");
      } else if (isCurrent) {
        toast("\u78C1\u76D8\u5185\u5BB9\u5DF2\u53D8\u5316\uFF0C\u4F46\u5F53\u524D\u5B58\u5728\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u5DF2\u4FDD\u7559\u672C\u5730\u5185\u5BB9", "warn");
      } else {
        d.content = diskContent;
        d.encoding = res.encoding || d.encoding || "UTF-8";
        d.updated = Date.now();
        persist();
      }
    }).catch(function() {
    });
  }
  function refreshRichDocFromDisk(d) {
    if (!d || d.kind !== "rich" || !d.diskPath) return;
    if (!hasApi()) {
      window.addEventListener("pywebviewready", function h() {
        window.removeEventListener("pywebviewready", h);
        refreshRichDocFromDisk(d);
      }, { once: true });
      return;
    }
    var prev = d.content || "";
    getApi().read_text_file(d.diskPath).then(function(res) {
      if (!res || res.error) return;
      var diskContent = res.content == null ? "" : res.content;
      if (diskContent === prev) return;
      var isCurrent = activeDoc() === d;
      if (!isCurrent) {
        d.content = diskContent;
        d.updated = Date.now();
        persist();
        return;
      }
      var cur = "";
      try {
        cur = window.InkpadBlocks ? window.InkpadBlocks.serialize() : prev;
      } catch (e) {
      }
      var norm = function(s) {
        try {
          return JSON.stringify(JSON.parse(s));
        } catch (e) {
          return s;
        }
      };
      if (norm(diskContent) === norm(cur)) return;
      if (norm(cur) !== norm(prev)) {
        toast("\u78C1\u76D8\u5185\u5BB9\u5DF2\u53D8\u5316\uFF0C\u4F46\u5F53\u524D\u5B58\u5728\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u5DF2\u4FDD\u7559\u672C\u5730\u5185\u5BB9", "warn");
        return;
      }
      d.content = diskContent;
      d.encoding = res.encoding || d.encoding || "utf-8";
      d.updated = Date.now();
      persist();
      window.InkpadBlocks.open(els.richCanvas, d);
      renderList();
      toast("\u68C0\u6D4B\u5230\u78C1\u76D8\u5185\u5BB9\u5DF2\u66F4\u65B0\uFF0C\u5DF2\u52A0\u8F7D\u6700\u65B0\u7248\u672C", "info");
    }).catch(function() {
    });
  }
  function refreshDocFromDisk(d) {
    if (!d) return;
    if (d.kind === "rich") refreshRichDocFromDisk(d);
    else refreshTextDocFromDisk(d);
  }
  function updatePreviewBtn() {
    var d = activeDoc();
    var ok = d && (d.lang === "markdown" || d.lang === "html");
    els.btnPreviewTop.style.display = ok ? "" : "none";
    els.btnInsertImage.style.display = d && (d.lang === "markdown" || d.lang === "html") ? "" : "none";
  }

  // src-app/17-events.js
  function initEvents() {
    cm.on("change", function() {
      syncFromEditor();
      updateStatus();
      scheduleRender();
      clearJSONErrorHighlight();
      scheduleFoldDataUris();
    });
    cm.on("swapDoc", function() {
      scheduleFoldDataUris();
    });
    cm.on("cursorActivity", updateStatus);
  }
  els.title.addEventListener("input", function() {
    if (state.currentVisual) onVisualChange();
    else syncFromEditor();
  });
  els.langSelect.addEventListener("change", function() {
    setLang(els.langSelect.value);
  });
  $("btn-new-doc").addEventListener("click", function() {
    newDoc("plaintext");
  });
  $("btn-new-rich").addEventListener("click", function() {
    newRichDoc();
  });
  $("btn-new-flow").addEventListener("click", function() {
    newVisualDoc("flow");
  });
  $("btn-new-mind").addEventListener("click", function() {
    newVisualDoc("mind");
  });
  $("btn-new-note").addEventListener("click", function() {
    newVisualDoc("note");
  });
  $("btn-import").addEventListener("click", function() {
    if (hasApi()) {
      getApi().pick_file().then(function(path) {
        if (!path) return;
        var name = String(path).split(/[\\/]/).pop();
        openDiskFile(path, name);
      }).catch(function() {
      });
    } else {
      els.fileInput.click();
    }
  });
  els.fileInput.addEventListener("change", function() {
    if (els.fileInput.files[0]) importFile(els.fileInput.files[0]);
    els.fileInput.value = "";
  });
  $("btn-format-xml").addEventListener("click", formatXML);
  var toolMenu = $("tool-menu");
  $("btn-tools").addEventListener("click", function(e) {
    e.stopPropagation();
    var willOpen = toolMenu.style.display === "none";
    if (willOpen) closeAllToolMenus();
    if (willOpen) showMenuAtMoreBtn(toolMenu);
    else toolMenu.style.display = "none";
  });
  document.addEventListener("click", function() {
    closeAllToolMenus();
  });
  toolMenu.addEventListener("click", function(e) {
    var btn = e.target.closest(".menu-item");
    if (!btn) return;
    toolMenu.style.display = "none";
    runTool(btn.getAttribute("data-tool"));
  });
  var convertMenu = $("convert-menu");
  $("btn-convert").addEventListener("click", function(e) {
    e.stopPropagation();
    var willOpen = convertMenu.style.display === "none";
    if (willOpen) closeAllToolMenus();
    if (willOpen) showMenuAtMoreBtn(convertMenu);
    else convertMenu.style.display = "none";
  });
  convertMenu.addEventListener("click", function(e) {
    var btn = e.target.closest(".menu-item");
    if (!btn) return;
    convertMenu.style.display = "none";
    runTool(btn.getAttribute("data-tool"));
  });
  $("btn-export").addEventListener("click", exportDoc);
  els.btnSave.addEventListener("click", function() {
    saveDoc(false);
  });
  els.btnSaveAs.addEventListener("click", function() {
    saveDoc(true);
  });
  window.addEventListener("keydown", function(e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      saveDoc(false);
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "n" || e.key === "N")) {
      e.preventDefault();
      newDoc("plaintext");
    }
  });
  $("btn-delete").addEventListener("click", function() {
    var d = activeDoc();
    if (!d) {
      toast("\u6CA1\u6709\u53EF\u5220\u9664\u7684\u6587\u6863", "error");
      return;
    }
    openDocDelConfirm(d.id);
  });
  els.btnTogglePreview.addEventListener("click", function() {
    state.previewOn = !state.previewOn;
    updatePreviewVisibility();
  });
  els.btnPreviewTop.addEventListener("click", function() {
    state.previewOn = !state.previewOn;
    updatePreviewVisibility();
  });
  $("btn-insert-sample").addEventListener("click", function() {
    cm.setValue(SAMPLE_DIAGRAM + "\n\n" + SAMPLE_MINDMAP);
    scheduleRender();
  });
  var pb = document.getElementById("preview-body");
  pb.addEventListener("mousedown", function(e) {
    if (els.mdOut.style.display !== "none" || els.htmlOut.style.display !== "none") return;
    if (e.button !== 0) return;
    panState.down = true;
    panState.startX = e.clientX;
    panState.startY = e.clientY;
    panState.scrollLeft = pb.scrollLeft;
    panState.scrollTop = pb.scrollTop;
    pb.classList.add("panning");
    e.preventDefault();
  });
  window.addEventListener("mousemove", function(e) {
    if (!panState.down) return;
    pb.scrollLeft = panState.scrollLeft - (e.clientX - panState.startX);
    pb.scrollTop = panState.scrollTop - (e.clientY - panState.startY);
  });
  window.addEventListener("mouseup", function() {
    panState.down = false;
    pb.classList.remove("panning");
  });
  pb.addEventListener("wheel", function(e) {
    if (!e.ctrlKey || !svgNatural || els.mdOut.style.display !== "none") return;
    e.preventDefault();
    state.zoomLevel = Math.min(4, Math.max(0.2, state.zoomLevel * (e.deltaY < 0 ? 1.1 : 0.9)));
    applyZoom();
  }, { passive: false });
  pb.addEventListener("dblclick", function() {
    state.zoomLevel = 1;
    applyZoom();
  });
  var splitDrag = { down: false, startX: 0, startW: 0 };
  var MIN_PANE = 260;
  els.splitter.addEventListener("mousedown", function(e) {
    if (els.previewPane.style.display === "none") return;
    splitDrag.down = true;
    splitDrag.startX = e.clientX;
    var curW = els.previewPane.getBoundingClientRect().width;
    splitDrag.startW = curW;
    els.splitter.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    if (els.htmlFrame) els.htmlFrame.style.pointerEvents = "none";
    e.preventDefault();
  });
  window.addEventListener("mousemove", function(e) {
    if (!splitDrag.down) return;
    var wrapRect = els.editorPane.parentNode.getBoundingClientRect();
    var delta = splitDrag.startX - e.clientX;
    var newW = splitDrag.startW + delta;
    var maxW = wrapRect.width - MIN_PANE - els.splitter.offsetWidth;
    if (newW < MIN_PANE) newW = MIN_PANE;
    if (newW > maxW) newW = maxW;
    els.previewPane.style.width = newW + "px";
    if (cm) cm.refresh();
  });
  window.addEventListener("mouseup", function() {
    if (!splitDrag.down) return;
    splitDrag.down = false;
    els.splitter.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    if (els.htmlFrame) els.htmlFrame.style.pointerEvents = "";
    if (cm) cm.refresh();
  });
  var sideDrag = { down: false, startX: 0, startW: 0 };
  var SIDE_MIN = 200, SIDE_MAX = 620;
  function syncSideWidth(w) {
    els.sidebar.style.width = w + "px";
    els.sidebar.style.minWidth = w + "px";
    els.sidebar.style.flex = "0 0 " + w + "px";
    if (cm) cm.refresh();
  }
  els.sideSplitter.addEventListener("mousedown", function(e) {
    if (els.sidebar.classList.contains("collapsed")) return;
    sideDrag.down = true;
    sideDrag.startX = e.clientX;
    sideDrag.startW = els.sidebar.getBoundingClientRect().width;
    els.sideSplitter.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });
  window.addEventListener("mousemove", function(e) {
    if (!sideDrag.down) return;
    var delta = e.clientX - sideDrag.startX;
    var newW = sideDrag.startW + delta;
    if (newW < SIDE_MIN) newW = SIDE_MIN;
    if (newW > SIDE_MAX) newW = SIDE_MAX;
    syncSideWidth(newW);
  });
  window.addEventListener("mouseup", function() {
    if (!sideDrag.down) return;
    sideDrag.down = false;
    els.sideSplitter.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });
  $("btn-find").addEventListener("click", function() {
    openFindModal(false);
  });
  var ttMenu = $("texttool-menu");
  $("btn-texttools").addEventListener("click", function(e) {
    e.stopPropagation();
    var willOpen = ttMenu.style.display === "none";
    if (willOpen) closeAllToolMenus();
    if (willOpen) showMenuAtMoreBtn(ttMenu);
    else ttMenu.style.display = "none";
  });
  ttMenu.addEventListener("click", function(e) {
    var mi = e.target.closest(".menu-item");
    if (!mi) return;
    var tt = mi.getAttribute("data-tt");
    if (!tt) return;
    ttMenu.style.display = "none";
    if (tt === "snippet") openSnippetModal();
    else if (tt === "clipboard") {
      renderClipList();
      openSingleModal("clip-modal");
    } else runTextTool(tt);
  });
  var ctxMenu = null;
  var docCtxMenu = null;
  var docCtxId = null;
  var ctxDebug = null;
  var __ctxLast = { target: "", match: "?", opened: false, time: "", src: "" };
  function paintCtxDebug() {
    if (!ctxDebug) return;
    var c = __ctxLast;
    var status = c.opened ? "\u{1F7E2} \u5F39" : "\u{1F534} \u672A\u5F39";
    var src = c.src ? " \xB7 src=" + c.src : "";
    ctxDebug.textContent = "\u{1F5B1} " + status + " \xB7 target=" + c.target + " \xB7 in=" + c.match + src + (c.time ? " @" + c.time : "");
    ctxDebug.style.color = c.opened ? "#1aaa55" : "#d33";
  }
  function isPlainEditorTarget(node) {
    if (!node || typeof node.closest !== "function") return false;
    var n = node;
    while (n && n !== document.body) {
      if (n.id === "editor-wrap" || n.id === "editor" || n.classList && (n.classList.contains("CodeMirror") || n.classList.contains("CodeMirror-line") || n.classList.contains("CodeMirror-gutter"))) return true;
      n = n.parentNode;
    }
    return false;
  }
  function openCtxMenu(x, y) {
    if (!ctxMenu) return;
    if (docCtxMenu) docCtxMenu.style.display = "none";
    ctxMenu.style.display = "block";
    var w = ctxMenu.offsetWidth || 184;
    var h = ctxMenu.offsetHeight || 320;
    var left = Math.min(x, window.innerWidth - w - 8);
    var top = Math.min(y, window.innerHeight - h - 8);
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    ctxMenu.style.left = left + "px";
    ctxMenu.style.top = top + "px";
  }
  function openDocCtxMenu(x, y) {
    if (!docCtxMenu) return;
    if (ctxMenu) ctxMenu.style.display = "none";
    docCtxMenu.style.display = "block";
    var w = docCtxMenu.offsetWidth || 160;
    var h = docCtxMenu.offsetHeight || 180;
    var left = Math.min(x, window.innerWidth - w - 8);
    var top = Math.min(y, window.innerHeight - h - 8);
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    docCtxMenu.style.left = left + "px";
    docCtxMenu.style.top = top + "px";
  }
  function closeCtxMenu() {
    if (ctxMenu) ctxMenu.style.display = "none";
    if (docCtxMenu) docCtxMenu.style.display = "none";
  }
  function handleCtxCmd(cmd) {
    if (!cmd) return;
    switch (cmd) {
      case "undo":
        cm.undo();
        break;
      case "redo":
        cm.redo();
        break;
      case "cut":
        try {
          document.execCommand("cut");
        } catch (e) {
        }
        break;
      case "copy":
        try {
          document.execCommand("copy");
        } catch (e) {
        }
        break;
      case "paste":
        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(function(t) {
              if (t) cm.replaceSelection(t);
            }).catch(function() {
              try {
                document.execCommand("paste");
              } catch (e2) {
              }
            });
          } else {
            document.execCommand("paste");
          }
        } catch (e3) {
          try {
            document.execCommand("paste");
          } catch (e4) {
          }
        }
        break;
      case "selectall":
        cm.execCommand("selectAll");
        break;
      case "del":
        document.execCommand("delete");
        break;
      case "cmt":
        cm.execCommand("toggleComment");
        break;
      case "json-format":
        runTool("format");
        break;
      case "json-compress":
        runTool("compress");
        break;
      case "json-escape":
        runTool("escape");
        break;
      case "json-unescape":
        runTool("unescape");
        break;
      case "json-unicode-zh":
        runTool("unicode-zh");
        break;
      case "json-zh-unicode":
        runTool("zh-unicode");
        break;
      default:
        execEditorCmd(cmd);
    }
  }
  function handleDocCtxCmd(dcmd) {
    if (!dcmd || !docCtxId) return;
    var d = null;
    for (var i = 0; i < state.docs.length; i++) {
      if (state.docs[i].id === docCtxId) {
        d = state.docs[i];
        break;
      }
    }
    if (!d) {
      toast("\u6587\u6863\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u79FB\u9664", "error");
      return;
    }
    switch (dcmd) {
      case "open":
        openDoc(d.id);
        break;
      case "copy-title":
        copyToClipboard(d.title || "\u65E0\u6807\u9898").then(function() {
          toast("\u5DF2\u590D\u5236\u6807\u9898", "success");
        });
        break;
      case "copy-path":
        if (d.diskPath) copyToClipboard(d.diskPath).then(function() {
          toast("\u5DF2\u590D\u5236\u8DEF\u5F84", "success");
        });
        else toast("\u8BE5\u6587\u6863\u6CA1\u6709\u78C1\u76D8\u8DEF\u5F84", "error");
        break;
      case "del":
        openDocDelConfirm(d.id);
        break;
      case "tag":
        openTagEditModal(d.id);
        break;
    }
  }
  function initCtxMenu() {
    ctxMenu = document.getElementById("ctx-menu");
    docCtxMenu = document.getElementById("doc-ctx-menu");
    ctxDebug = document.getElementById("stat-ctx");
    if (!ctxMenu) return;
    paintCtxDebug();
    var __diag = { md: 0, mdR: 0, ctx: 0, key: 0, last: "" };
    function diagUpdate() {
      if (!ctxDebug) return;
      ctxDebug.textContent = "\u{1F5B1} md=" + __diag.md + "(\u53F3" + __diag.mdR + ") ctx=" + __diag.ctx + " key=" + __diag.key + " \xB7 " + __diag.last;
      ctxDebug.style.color = "#d33";
    }
    function openMenu(e) {
      if (e && ctxMenu.contains(e.target)) return;
      if (e && docCtxMenu && docCtxMenu.contains(e.target)) return;
      var sidebar = document.getElementById("sidebar");
      if (e && sidebar && sidebar.contains(e.target)) {
        var docItem = e.target && e.target.closest ? e.target.closest(".doc-item") : null;
        if (!docItem) return;
      }
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      var x = e && typeof e.clientX === "number" ? e.clientX : window.innerWidth / 2;
      var y = e && typeof e.clientY === "number" ? e.clientY : window.innerHeight / 2;
      var docItem = e && e.target && e.target.closest ? e.target.closest(".doc-item") : null;
      if (docItem) {
        docCtxId = docItem.dataset.docId || null;
        var hasPath = !!docItem.dataset.docPath;
        var cpBtn = document.getElementById("doc-ctx-copypath");
        if (cpBtn) cpBtn.style.display = hasPath ? "" : "none";
        openDocCtxMenu(x, y);
        __ctxLast.opened = true;
        __ctxLast.match = "doc-item";
        __ctxLast.src = e ? e.type : "key";
        paintCtxDebug();
        return;
      }
      openCtxMenu(x, y);
      __ctxLast.opened = true;
      __ctxLast.match = "Y";
      __ctxLast.src = e ? e.type : "key";
      paintCtxDebug();
    }
    document.addEventListener("mousedown", function(e) {
      __diag.md++;
      if (e.button === 2) {
        __diag.mdR++;
        __diag.last = "mousedown \u53F3\u952E";
      } else {
        __diag.last = "mousedown \u5DE6\u952E btn=" + e.button;
      }
      diagUpdate();
    }, true);
    document.addEventListener("mousedown", function(e) {
      if (e.button === 2) {
        __diag.last = "\u2192 \u5F00\u83DC\u5355(mousedown)";
        diagUpdate();
        openMenu(e);
      }
    }, true);
    window.addEventListener("mousedown", function(e) {
      if (e.button === 2) openMenu(e);
    }, true);
    document.addEventListener("contextmenu", function(e) {
      __diag.ctx++;
      __diag.last = "contextmenu";
      diagUpdate();
      openMenu(e);
    }, false);
    document.addEventListener("contextmenu", function(e) {
      openMenu(e);
    }, true);
    window.addEventListener("contextmenu", function(e) {
      openMenu(e);
    }, true);
    document.addEventListener("keydown", function(e) {
      if (e.key === "F10" && e.shiftKey || e.key === "ContextMenu") {
        __diag.key++;
        __diag.last = e.key === "ContextMenu" ? "Menu\u952E" : "Shift+F10";
        diagUpdate();
        if (e.preventDefault) e.preventDefault();
        openMenu(null);
      } else if ((e.ctrlKey || e.metaKey) && e.key === ".") {
        __diag.key++;
        __diag.last = "Ctrl+.";
        diagUpdate();
        if (e.preventDefault) e.preventDefault();
        openMenu(null);
      }
    });
    ctxMenu.addEventListener("click", function(e) {
      var item = e.target.closest(".ctx-item");
      if (!item) return;
      var cmd = item.getAttribute("data-cmd");
      closeCtxMenu();
      handleCtxCmd(cmd);
    });
    if (docCtxMenu) {
      docCtxMenu.addEventListener("click", function(e) {
        var item = e.target.closest(".ctx-item");
        if (!item) return;
        var dcmd = item.getAttribute("data-dcmd");
        closeCtxMenu();
        handleDocCtxCmd(dcmd);
      });
    }
    document.addEventListener("mousedown", function(e) {
      if (e.button === 2) return;
      var inCtx = ctxMenu.style.display !== "none" && ctxMenu.contains(e.target);
      var inDocCtx = docCtxMenu && docCtxMenu.style.display !== "none" && docCtxMenu.contains(e.target);
      if (ctxMenu.style.display !== "none" && !inCtx && !inDocCtx) closeCtxMenu();
      else if (docCtxMenu && docCtxMenu.style.display !== "none" && !inDocCtx && !inCtx) closeCtxMenu();
    });
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape") closeCtxMenu();
    });
    window.addEventListener("blur", closeCtxMenu);
    diagUpdate();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCtxMenu);
  } else {
    initCtxMenu();
  }
  $("clip-close").addEventListener("click", function() {
    $("clip-modal").style.display = "none";
  });
  $("clip-modal").addEventListener("click", function(e) {
    if (e.target === $("clip-modal")) $("clip-modal").style.display = "none";
  });
  $("clip-clear").addEventListener("click", function() {
    localStorage.removeItem(CLIP_KEY);
    renderClipList();
  });
  document.addEventListener("copy", function() {
    var t = cm.getSelection() || (window.getSelection() ? String(window.getSelection()) : "");
    if (t) recordClip(t);
  });
  $("snippet-close").addEventListener("click", function() {
    $("snippet-modal").style.display = "none";
  });
  $("snippet-modal").addEventListener("click", function(e) {
    if (e.target === $("snippet-modal")) $("snippet-modal").style.display = "none";
  });
  $("btn-open-folder").addEventListener("click", openFolder);
  els.tabDocs.addEventListener("click", function() {
    switchSideTab("docs");
  });
  els.tabFiles.addEventListener("click", function() {
    switchSideTab("files");
  });
  els.btnInsertImage.addEventListener("click", insertImageFile);
  $("btn-insert").addEventListener("click", function(e) {
    e.stopPropagation();
    openInsertMenu();
  });
  document.addEventListener("click", function(e) {
    var wrap = $("insert-wrap");
    if (wrap && !wrap.contains(e.target)) closeInsertMenu();
  });
  Array.prototype.forEach.call(document.querySelectorAll("#insert-menu .menu-item"), function(it) {
    it.addEventListener("click", function() {
      routeInsert(it.getAttribute("data-insert"));
    });
  });
  $("code-ins-ok").addEventListener("click", function() {
    var l = $("code-ins-lang").value;
    closeCodeModal();
    insertCode(l);
  });
  $("code-ins-cancel").addEventListener("click", closeCodeModal);
  $("code-ins-close").addEventListener("click", closeCodeModal);
  $("table-ins-ok").addEventListener("click", function() {
    insertTable($("table-ins-rows").value, $("table-ins-cols").value, $("table-ins-header").checked);
  });
  $("table-ins-cancel").addEventListener("click", closeTableModal);
  $("table-ins-close").addEventListener("click", closeTableModal);
  Array.prototype.forEach.call(document.querySelectorAll("#callout-modal .callout-pick"), function(it) {
    it.addEventListener("click", function() {
      insertCallout(it.getAttribute("data-co"));
    });
  });
  $("callout-close").addEventListener("click", closeCalloutModal);
  $("icon-close").addEventListener("click", closeIconModal);
  Array.prototype.forEach.call(document.querySelectorAll(".icon-tab"), function(t) {
    t.addEventListener("click", function() {
      document.querySelectorAll(".icon-tab").forEach(function(x) {
        x.classList.remove("active");
      });
      t.classList.add("active");
      var tab = t.getAttribute("data-icontab");
      if ($("icon-grid-emoji")) $("icon-grid-emoji").style.display = tab === "emoji" ? "" : "none";
      if ($("icon-grid-vector")) $("icon-grid-vector").style.display = tab === "vector" ? "" : "none";
    });
  });
  if ($("icon-search")) $("icon-search").addEventListener("input", function() {
    filterIcons(this.value);
  });
  els.imgClose.addEventListener("click", closeImageModal);
  els.imgZoomIn.addEventListener("click", function() {
    state.imgZoom = Math.min(state.imgZoom * 1.2, 8);
    applyImgZoom();
  });
  els.imgZoomOut.addEventListener("click", function() {
    state.imgZoom = Math.max(state.imgZoom / 1.2, 0.1);
    applyImgZoom();
  });
  els.imgZoomReset.addEventListener("click", function() {
    state.imgZoom = 1;
    state.imgPanX = 0;
    state.imgPanY = 0;
    applyImgZoom();
  });
  els.imgFit.addEventListener("click", fitImage);
  els.imageModal.addEventListener("click", function(e) {
    if (e.target === els.imageModal) closeImageModal();
  });
  els.imageStage.addEventListener("wheel", function(e) {
    if (els.imageModal.style.display !== "flex") return;
    e.preventDefault();
    var delta = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    state.imgZoom = Math.max(0.1, Math.min(state.imgZoom * delta, 8));
    applyImgZoom();
  }, { passive: false });
  els.imageStage.addEventListener("mousedown", function(e) {
    state.imgDragging = true;
    state.imgLastX = e.clientX;
    state.imgLastY = e.clientY;
    els.imageStage.classList.add("dragging");
  });
  window.addEventListener("mousemove", function(e) {
    if (!state.imgDragging) return;
    state.imgPanX += e.clientX - state.imgLastX;
    state.imgPanY += e.clientY - state.imgLastY;
    state.imgLastX = e.clientX;
    state.imgLastY = e.clientY;
    applyImgZoom();
  });
  window.addEventListener("mouseup", function() {
    state.imgDragging = false;
    els.imageStage.classList.remove("dragging");
  });
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape" && els.imageModal.style.display === "flex") closeImageModal();
  });
  cm.on("paste", function(cm2, e) {
    var cd = e.clipboardData || window.clipboardData;
    if (!cd || !cd.items) return;
    for (var i = 0; i < cd.items.length; i++) {
      var it = cd.items[i];
      if (it.kind === "file" && it.type && it.type.indexOf("image/") === 0) {
        var file = it.getAsFile();
        if (file) {
          e.preventDefault();
          handlePastedImage(file);
          return;
        }
      }
    }
  });
  $("btn-encoding").addEventListener("click", openEncModal);
  $("enc-close").addEventListener("click", function() {
    $("enc-modal").style.display = "none";
  });
  $("enc-modal").addEventListener("click", function(e) {
    if (e.target === $("enc-modal")) $("enc-modal").style.display = "none";
  });
  $("doc-del-close").addEventListener("click", closeDocDelConfirm);
  $("doc-del-cancel").addEventListener("click", closeDocDelConfirm);
  $("doc-del-modal").addEventListener("click", function(e) {
    if (e.target === $("doc-del-modal")) closeDocDelConfirm();
  });
  $("doc-del-confirm").addEventListener("click", function() {
    if (pendingDelId) deleteDoc(pendingDelId);
    closeDocDelConfirm();
  });
  $("enc-reload").addEventListener("click", function() {
    var d = activeDoc();
    if (!d || !d.diskPath) {
      toast("\u4EC5\u78C1\u76D8\u6587\u4EF6\u53EF\u91CD\u65B0\u8BFB\u53D6", "error");
      return;
    }
    var enc = $("enc-select").value;
    getApi().read_text_file(d.diskPath, enc).then(function(res) {
      if (!res || res.error) {
        toast("\u8BFB\u53D6\u5931\u8D25\uFF1A" + (res && res.error || ""), "error");
        return;
      }
      d.content = res.content;
      d.encoding = res.encoding || enc;
      cm.setValue(d.content);
      cm.clearHistory();
      syncFromEditor();
      $("enc-current").textContent = "\u78C1\u76D8\u6587\u4EF6 \xB7 " + (res.encoding || enc);
      toast("\u5DF2\u6309 " + (res.encoding || enc) + " \u91CD\u65B0\u8BFB\u53D6 \u2713", "success");
    }).catch(function() {
      toast("\u91CD\u65B0\u8BFB\u53D6\u5931\u8D25", "error");
    });
  });
  $("enc-saveas").addEventListener("click", function() {
    var d = activeDoc();
    if (!d) return;
    if (!hasApi()) {
      toast("\u53E6\u5B58\u9700\u5728\u684C\u9762\u7248\u4E2D\u4F7F\u7528", "error");
      return;
    }
    var ext = LANGS[d.lang] ? LANGS[d.lang].ext : ".txt";
    var name = (d.title || "\u672A\u547D\u540D").replace(/[\\/:*?"<>|]/g, "_") + ext;
    var enc = $("enc-select").value;
    getApi().save_file_encoded(name, cm.getValue(), enc).then(function(p) {
      if (p) toast("\u5DF2\u6309 " + enc + " \u53E6\u5B58\u4E3A \u2713", "success");
    }).catch(function() {
      toast("\u53E6\u5B58\u5931\u8D25", "error");
    });
  });
  $("btn-compare").addEventListener("click", openCompareWindow);
  var fontSize = parseInt(localStorage.getItem("inkpad.fontsize"), 10) || 14;
  function applyFontSize(px) {
    cm.getWrapperElement().style.fontSize = px + "px";
    cm.refresh();
    localStorage.setItem("inkpad.fontsize", String(px));
  }
  applyFontSize(fontSize);
  cm.getWrapperElement().addEventListener("wheel", function(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    fontSize = Math.min(26, Math.max(10, fontSize + (e.deltaY < 0 ? 1 : -1)));
    applyFontSize(fontSize);
  }, { passive: false });

  // src-app/20-craft-init.js
  window.InkpadApp = {
    dirOf,
    resolveImgSrc,
    guessMime: _guessMimeFromPath,
    toast,
    richChanged
  };
  function initCraftSidebar() {
    var refreshOnFocus = function() {
      var d = activeDoc();
      if (d) refreshDocFromDisk(d);
    };
    window.addEventListener("focus", function() {
      setTimeout(refreshOnFocus, 150);
    });
    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "visible") setTimeout(refreshOnFocus, 150);
    });
    var sbBtn = document.getElementById("btn-sb-search");
    var sbInput = document.getElementById("sbSearchInput");
    if (sbBtn && sbInput) {
      sbBtn.addEventListener("click", function(e) {
        if (e.target !== sbInput) sbInput.focus();
      });
      sbInput.addEventListener("click", function(e) {
        e.stopPropagation();
      });
      sbInput.addEventListener("input", function() {
        var q = (sbInput.value || "").trim().toLowerCase();
        var items = els.docList.querySelectorAll(".doc-item, .sticky-card");
        items.forEach(function(it) {
          if (!q) {
            it.style.display = "";
            return;
          }
          var nameEl = it.querySelector(".doc-name") || it.querySelector(".sticky-card-title");
          var name = (nameEl ? nameEl.textContent : "").toLowerCase();
          var tagsTxt = "";
          Array.prototype.forEach.call(it.querySelectorAll(".doc-tag"), function(t) {
            tagsTxt += " " + t.textContent;
          });
          var match = name.indexOf(q) >= 0 || tagsTxt.toLowerCase().indexOf(q) >= 0;
          it.style.display = match ? "" : "none";
        });
        var labels = els.docList.querySelectorAll(".doc-group-label");
        labels.forEach(function(lab) {
          var next = lab.nextElementSibling;
          var any = false;
          while (next && (next.classList.contains("doc-item") || next.classList.contains("sticky-card"))) {
            if (next.style.display !== "none") {
              any = true;
              break;
            }
            next = next.nextElementSibling;
          }
          lab.style.display = any ? "" : "none";
        });
      });
    }
    var wsBtn = document.getElementById("btn-workspace");
    if (wsBtn) wsBtn.addEventListener("click", function() {
      toast("L.Note \u5DE5\u4F5C\u53F0", "success");
    });
    function markNavActive(id) {
      ["nav-recent", "nav-my-space", "nav-wiki", "nav-favorites", "nav-trash", "nav-sticky", "tab-docs", "tab-files"].forEach(function(n) {
        var el = document.getElementById(n);
        if (el) el.classList.remove("active");
      });
      var a = document.getElementById(id);
      if (a) a.classList.add("active");
    }
    var navRecent = document.getElementById("nav-recent");
    if (navRecent) navRecent.addEventListener("click", function() {
      state.docFilter = "recent";
      state.tagFilter = null;
      markNavActive("nav-recent");
      closeDocMenu();
      if (state.batchMode) toggleBatchMode(false);
      renderList();
      toast("\u5DF2\u5207\u6362\u5230\u300C\u6700\u8FD1\u300D", "success");
    });
    var navMySpace = document.getElementById("nav-my-space");
    if (navMySpace) navMySpace.addEventListener("click", function() {
      state.docFilter = "my-space";
      state.tagFilter = null;
      markNavActive("nav-my-space");
      closeDocMenu();
      if (state.batchMode) toggleBatchMode(false);
      renderList();
      toast("\u5DF2\u5207\u6362\u5230\u300C\u6211\u7684\u7A7A\u95F4\u300D", "success");
    });
    var navWiki = document.getElementById("nav-wiki");
    if (navWiki) navWiki.addEventListener("click", function() {
      state.docFilter = "wiki";
      state.tagFilter = null;
      markNavActive("nav-wiki");
      closeDocMenu();
      if (state.batchMode) toggleBatchMode(false);
      renderList();
      toast("\u5DF2\u5207\u6362\u5230\u300C\u77E5\u8BC6\u5E93\u300D", "success");
    });
    var navFavorites = document.getElementById("nav-favorites");
    if (navFavorites) navFavorites.addEventListener("click", function() {
      state.docFilter = "favorites";
      state.tagFilter = null;
      markNavActive("nav-favorites");
      closeDocMenu();
      if (state.batchMode) toggleBatchMode(false);
      renderList();
      toast("\u5DF2\u5207\u6362\u5230\u300C\u6536\u85CF\u300D", "success");
    });
    var navTrash = document.getElementById("nav-trash");
    if (navTrash) navTrash.addEventListener("click", function() {
      state.docFilter = "trash";
      state.tagFilter = null;
      markNavActive("nav-trash");
      closeDocMenu();
      if (state.batchMode) toggleBatchMode(false);
      renderList();
      toast("\u5DF2\u5207\u6362\u5230\u300C\u56DE\u6536\u7AD9\u300D", "success");
    });
    var navSticky = document.getElementById("nav-sticky");
    if (navSticky) navSticky.addEventListener("click", function() {
      state.docFilter = "sticky";
      state.tagFilter = null;
      markNavActive("nav-sticky");
      closeDocMenu();
      if (state.batchMode) toggleBatchMode(false);
      renderList();
      toast("\u5DF2\u5207\u6362\u5230\u300C\u4FBF\u5229\u8D34\u300D", "success");
    });
    if (els.tagHead) els.tagHead.addEventListener("click", function() {
      var s = els.tagSection;
      s.classList.toggle("collapsed");
      if (s.classList.contains("collapsed")) els.tagList.style.display = "none";
      else els.tagList.style.display = "";
    });
    var btnNewSticky = document.getElementById("btn-new-sticky");
    if (btnNewSticky) btnNewSticky.addEventListener("click", function() {
      var d = newSticky();
      renderList();
      if (d) toast("\u5DF2\u65B0\u5EFA\u4FBF\u5229\u8D34", "success");
    });
    if (els.tagEditModal) {
      if (document.getElementById("tag-edit-close")) document.getElementById("tag-edit-close").addEventListener("click", closeTagEditModal);
      if (document.getElementById("tag-edit-cancel")) document.getElementById("tag-edit-cancel").addEventListener("click", closeTagEditModal);
      if (document.getElementById("tag-edit-confirm")) document.getElementById("tag-edit-confirm").addEventListener("click", function() {
        closeTagEditModal();
        renderSideSub();
        renderList();
      });
      var tagAddBtn = document.getElementById("tag-edit-add");
      if (tagAddBtn) tagAddBtn.addEventListener("click", function() {
        tagAddFromInput();
      });
      if (els.tagEditInput) {
        els.tagEditInput.addEventListener("keydown", function(e) {
          if (e.key === "Enter") {
            e.preventDefault();
            tagAddFromInput();
          }
        });
      }
      els.tagEditModal.addEventListener("click", function(e) {
        if (e.target === els.tagEditModal) closeTagEditModal();
      });
    }
    if (els.stickyEditModal) {
      if (document.getElementById("sticky-edit-close")) document.getElementById("sticky-edit-close").addEventListener("click", closeStickyEditModal);
      if (document.getElementById("sticky-edit-cancel")) document.getElementById("sticky-edit-cancel").addEventListener("click", closeStickyEditModal);
      if (document.getElementById("sticky-edit-confirm")) document.getElementById("sticky-edit-confirm").addEventListener("click", stickyEditSave);
      if (els.stickyColorRow) {
        Array.prototype.forEach.call(els.stickyColorRow.children, function(el) {
          el.addEventListener("click", function() {
            state.stickyColor = el.getAttribute("data-color");
            Array.prototype.forEach.call(els.stickyColorRow.children, function(x) {
              x.classList.toggle("active", x === el);
            });
          });
        });
      }
      if (els.stickyEditRemEnabled) {
        els.stickyEditRemEnabled.addEventListener("change", function() {
          els.stickyRemRow.style.display = els.stickyEditRemEnabled.checked ? "" : "none";
        });
      }
      if (els.stickyEditRemType) {
        els.stickyEditRemType.addEventListener("change", function() {
          var t = els.stickyEditRemType.value;
          if (els.stickyRemOnce) els.stickyRemOnce.style.display = t === "once" ? "" : "none";
          if (els.stickyRemWeekly) els.stickyRemWeekly.style.display = t === "weekly" ? "" : "none";
          if (els.stickyRemMonthly) els.stickyRemMonthly.style.display = t === "monthly" ? "" : "none";
        });
      }
      els.stickyEditModal.addEventListener("click", function(e) {
        if (e.target === els.stickyEditModal) closeStickyEditModal();
      });
    }
    if (els.stickyReminderModal) {
      if (document.getElementById("sticky-reminder-close")) document.getElementById("sticky-reminder-close").addEventListener("click", function() {
        els.stickyReminderModal.style.display = "none";
      });
      if (document.getElementById("sticky-reminder-ok")) document.getElementById("sticky-reminder-ok").addEventListener("click", function() {
        els.stickyReminderModal.style.display = "none";
      });
      els.stickyReminderModal.addEventListener("click", function(e) {
        if (e.target === els.stickyReminderModal) els.stickyReminderModal.style.display = "none";
      });
    }
    function checkReminders() {
      var now = /* @__PURE__ */ new Date();
      var hit = null;
      state.docs.forEach(function(d) {
        if (d.deleted || d.kind !== "sticky") return;
        var rem = d.reminder;
        if (!rem || !rem.enabled) return;
        if (!matchReminder(rem, now)) return;
        var key = d.id + "|" + rem.type + "|" + rem.time + "|" + (rem.date || "") + "|" + (rem.day || "") + "|" + (rem.days || []).join(",");
        if (state.remindedKeys[key]) return;
        state.remindedKeys[key] = true;
        hit = d;
      });
      if (hit) {
        if (els.stickyReminderTitle) els.stickyReminderTitle.textContent = (hit.title || "\u65E0\u6807\u9898") + " \xB7 " + fmtStamp(Date.now());
        if (els.stickyReminderContent) els.stickyReminderContent.textContent = hit.content || "\uFF08\u65E0\u5185\u5BB9\uFF09";
        if (els.stickyReminderModal) els.stickyReminderModal.style.display = "flex";
        toast("\u63D0\u9192\uFF1A" + (hit.title || "\u4FBF\u5229\u8D34"), "success");
      }
    }
    checkReminders();
    state.reminderTimer = setInterval(checkReminders, 3e4);
    renderSideSub();
    var fabNew = document.getElementById("fabNewDoc");
    var drawerFab = document.getElementById("drawerFab");
    var fabMenu = document.getElementById("fabMenu");
    if (fabNew && drawerFab && fabMenu) {
      fabNew.addEventListener("click", function(e) {
        e.stopPropagation();
        var open = drawerFab.classList.toggle("open");
        fabMenu.style.display = open ? "" : "none";
      });
      fabMenu.querySelectorAll(".fab-menu-item").forEach(function(it) {
        it.addEventListener("click", function() {
          drawerFab.classList.remove("open");
          fabMenu.style.display = "none";
        });
      });
      document.addEventListener("click", function(e) {
        if (drawerFab.classList.contains("open") && !drawerFab.contains(e.target)) {
          drawerFab.classList.remove("open");
          fabMenu.style.display = "none";
        }
      });
    }
    var infoBtn = document.getElementById("btn-info-panel");
    var infoPanel = document.getElementById("info-panel");
    if (infoBtn && infoPanel) {
      var syncInfoBtnState = function() {
        if (infoPanel.classList.contains("collapsed")) {
          infoBtn.classList.remove("active");
        } else {
          infoBtn.classList.add("active");
        }
      };
      syncInfoBtnState();
      infoBtn.addEventListener("click", function() {
        infoPanel.classList.toggle("collapsed");
        syncInfoBtnState();
      });
    }
    var qaMap = {
      json: "btn-tools",
      xml: "btn-format-xml",
      convert: "btn-convert",
      compare: "btn-compare",
      encoding: "btn-encoding"
    };
    Array.prototype.forEach.call(document.querySelectorAll("#info-panel .quick-action"), function(qa) {
      qa.addEventListener("click", function(e) {
        e.stopPropagation();
        var ab = qa.getAttribute("data-ab");
        var t = qaMap[ab] && document.getElementById(qaMap[ab]);
        if (t) t.click();
      });
    });
    var btnMore = document.getElementById("btn-more");
    var appbarMenu = document.getElementById("appbar-menu");
    var btnSide2 = document.getElementById("btn-toggle-sidebar2");
    if (btnSide2 && els.sidebar) {
      var iconCollapsed = '<svg viewBox="0 0 24 24" class="ico"><path d="M3 6h13M3 12h13M3 18h13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18 6l3 6-3 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      var iconExpanded = '<svg viewBox="0 0 24 24" class="ico"><path d="M3 6h13M3 12h13M3 18h13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M21 6l-3 6 3 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      var splitter = document.getElementById("sidebar-splitter");
      var syncBtnIcon = function() {
        var collapsed = els.sidebar.classList.contains("collapsed");
        if (collapsed) {
          btnSide2.innerHTML = iconExpanded;
          btnSide2.title = "\u5C55\u5F00\u4FA7\u680F";
          if (splitter) splitter.style.display = "none";
        } else {
          btnSide2.innerHTML = iconCollapsed;
          btnSide2.title = "\u6536\u8D77\u4FA7\u680F";
          if (splitter) splitter.style.display = "";
        }
      };
      syncBtnIcon();
      btnSide2.addEventListener("click", function() {
        els.sidebar.classList.toggle("collapsed");
        syncBtnIcon();
      });
    }
    if (btnMore && appbarMenu) {
      btnMore.addEventListener("click", function(e) {
        e.stopPropagation();
        appbarMenu.style.display = appbarMenu.style.display === "none" ? "block" : "none";
      });
      Array.prototype.forEach.call(appbarMenu.querySelectorAll(".menu-item"), function(it) {
        it.addEventListener("click", function(e) {
          appbarMenu.style.display = "none";
          var ab = it.getAttribute("data-ab");
          e.stopPropagation();
          var map = {
            encoding: "btn-encoding",
            compare: "btn-compare",
            xml: "btn-format-xml",
            json: "btn-tools",
            convert: "btn-convert",
            texttools: "btn-texttools",
            insert: "btn-insert",
            preview: "btn-toggle-preview",
            export: "btn-export",
            saveas: "btn-save-as",
            delete: "btn-delete"
          };
          var target = map[ab] && document.getElementById(map[ab]);
          if (target) target.click();
        });
      });
      document.addEventListener("click", function(e) {
        if (!appbarMenu.contains(e.target) && e.target.id !== "btn-more") appbarMenu.style.display = "none";
      });
    }
    if (els.batchToggle) {
      els.batchToggle.addEventListener("click", function() {
        closeDocMenu();
        toggleBatchMode(true);
      });
    }
    if (els.btnSortToggle) {
      els.btnSortToggle.addEventListener("click", function() {
        closeDocMenu();
        toggleSortGroup();
      });
    }
    if (els.batchExit) {
      els.batchExit.addEventListener("click", function() {
        toggleBatchMode(false);
      });
    }
    if (els.batchSelectAll) {
      els.batchSelectAll.addEventListener("change", function() {
        var on = els.batchSelectAll.checked;
        (state.docs || []).forEach(function(d) {
          var inView = state.docFilter === "trash" ? !!d.deleted : state.docFilter === "sticky" ? d.kind === "sticky" : !d.deleted;
          if (inView) state.batchSelected[d.id] = on ? true : false;
        });
        els.docList.querySelectorAll(".doc-item").forEach(function(it) {
          var id = it.getAttribute("data-doc-id");
          var cb = it.querySelector(".doc-batch-check input");
          if (cb) cb.checked = !!state.batchSelected[id];
        });
        refreshBatchCount();
      });
    }
    if (els.batchDel) {
      els.batchDel.addEventListener("click", function() {
        var ids = getBatchSelectedIds();
        if (ids.length === 0) {
          toast("\u8BF7\u5148\u9009\u62E9\u8981\u5220\u9664\u7684\u6587\u6863", "error");
          return;
        }
        var inTrash = state.docFilter === "trash";
        var titleEl = document.getElementById("doc-batch-del-title");
        var hintEl = document.getElementById("doc-batch-del-hint");
        var footEl = document.getElementById("doc-batch-del-foot");
        if (inTrash) {
          if (titleEl) titleEl.textContent = "\u6279\u91CF\u5F7B\u5E95\u5220\u9664";
          if (hintEl) hintEl.textContent = "\u9009\u4E2D\u7684\u6587\u6863\u5C06\u88AB\u5F7B\u5E95\u5220\u9664\uFF0C\u4E14\u65E0\u6CD5\u6062\u590D\u3002";
          if (footEl) footEl.textContent = "\u24D8 \u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002";
        } else {
          if (titleEl) titleEl.textContent = "\u6279\u91CF\u5220\u9664\u6587\u6863";
          if (hintEl) hintEl.textContent = "\u786E\u5B9A\u8981\u4ECE\u300C\u6211\u7684\u6587\u6863\u300D\u4E2D\u79FB\u9664\u9009\u4E2D\u7684\u6587\u6863\u5417\uFF1F";
          if (footEl) footEl.textContent = "\u24D8 \u5220\u9664\u540E\u65E0\u6CD5\u6062\u590D\uFF0C\u78C1\u76D8\u6587\u4EF6\u4E0D\u4F1A\u88AB\u5220\u9664\u3002";
        }
        if (els.docBatchDelName) els.docBatchDelName.textContent = "\u5171 " + ids.length + " \u7BC7\u6587\u6863";
        openSingleModal("doc-batch-del-modal");
      });
    }
    if (els.docBatchDelCancel) els.docBatchDelCancel.addEventListener("click", function() {
      if (els.docBatchDelModal) els.docBatchDelModal.style.display = "none";
    });
    if (els.docBatchDelClose) els.docBatchDelClose.addEventListener("click", function() {
      if (els.docBatchDelModal) els.docBatchDelModal.style.display = "none";
    });
    if (els.docBatchDelConfirm) els.docBatchDelConfirm.addEventListener("click", function() {
      var ids = getBatchSelectedIds();
      var c = state.docFilter === "trash" ? batchDestroy(ids) : batchDelete(ids);
      if (els.docBatchDelModal) els.docBatchDelModal.style.display = "none";
      if (c > 0 && state.batchMode) toggleBatchMode(false);
      toast(state.docFilter === "trash" ? "\u6279\u91CF\u5F7B\u5E95\u5220\u9664\u5B8C\u6210\uFF1A\u5171 " + c + " \u9879" : "\u6279\u91CF\u5220\u9664\u5B8C\u6210\uFF1A\u5171 " + c + " \u9879", "success");
    });
    if (els.batchExport) {
      els.batchExport.addEventListener("click", function() {
        batchExport(getBatchSelectedIds());
      });
    }
    function closeRename() {
      if (els.docRenameModal) els.docRenameModal.style.display = "none";
    }
    if (els.docRenameClose) els.docRenameClose.addEventListener("click", closeRename);
    if (els.docRenameCancel) els.docRenameCancel.addEventListener("click", closeRename);
    function confirmRename() {
      if (!renameDocId) {
        closeRename();
        return;
      }
      var val = els.docRenameInput ? els.docRenameInput.value : "";
      val = (val || "").trim();
      if (!val) {
        toast("\u6587\u6863\u540D\u4E0D\u80FD\u4E3A\u7A7A", "error");
        return;
      }
      if (renameDoc(renameDocId, val)) {
        toast("\u91CD\u547D\u540D\u6210\u529F", "success");
      }
      closeRename();
    }
    if (els.docRenameConfirm) els.docRenameConfirm.addEventListener("click", confirmRename);
    if (els.docRenameInput) {
      els.docRenameInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmRename();
        } else if (e.key === "Escape") {
          e.preventDefault();
          closeRename();
        }
      });
    }
    if (document.getElementById("doc-del-close")) document.getElementById("doc-del-close").addEventListener("click", closeDocDelConfirm);
    if (document.getElementById("doc-del-cancel")) document.getElementById("doc-del-cancel").addEventListener("click", closeDocDelConfirm);
    if (document.getElementById("doc-del-confirm")) document.getElementById("doc-del-confirm").addEventListener("click", function() {
      var id = pendingDelId;
      if (id) {
        closeDocDelConfirm();
        deleteDoc(id);
      }
    });
  }
  initEvents();
  syncSortButton();
  initApp();
  initCraftSidebar();
})();
