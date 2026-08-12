/* [esm] 导出本模块顶层绑定 */
export { API, getApi, hasApi, EXT_LANGS, RICH_BLOCK_TYPES, isRichDocContent, IMG_EXTS, isImageExt, dirOf, joinPath, normPath, isAbsPath, toFileUrl, resolveImgSrc };
  /* ---------------- 磁盘文件（打开文件夹 / 编码 / 比较） ---------------- */
  // pywebview 的 JS 桥是在页面加载完成后（pywebviewready）才注入的，
  // 因此必须在调用时动态获取，不能初始化时缓存，否则会误判为浏览器环境。
  var API = null;
  function getApi() {
    if (!API && window.pywebview && window.pywebview.api) {
      API = window.pywebview.api;
    }
    return API;
  }
  function hasApi() { return !!getApi(); }
  window.addEventListener('pywebviewready', function () {
    API = window.pywebview && window.pywebview.api ? window.pywebview.api : API;
  });

  var EXT_LANGS = {
    md: 'markdown', markdown: 'markdown', json: 'json', xml: 'xml', html: 'html', htm: 'html',
    js: 'javascript', mjs: 'javascript', py: 'python', css: 'css', sql: 'sql',
    yaml: 'yaml', yml: 'yaml', sh: 'shell', bat: 'shell', c: 'clike', h: 'clike',
    java: 'clike', cpp: 'clike', cc: 'clike', hpp: 'clike', cs: 'clike',
    mmd: 'mermaid', mermaid: 'mermaid', txt: 'plaintext', log: 'plaintext'
  };

  // 【v0.18】Inkpad 富文档的块类型集合（用于识别磁盘文件/导入文件是不是富文档）
  var RICH_BLOCK_TYPES = {
    text: 1, h1: 1, h2: 1, h3: 1, quote: 1, todo: 1, code: 1, table: 1, image: 1,
    mermaid: 1, math: 1, callout: 1, hr: 1, cols: 1, ulist: 1, olist: 1, link: 1
  };
  // 嗅探：内容是不是 Inkpad 富文档的 JSON 块数组格式
  // 条件：JSON.parse 成功；是数组；首项有 string 的 id + 已知 type
  function isRichDocContent(content) {
    if (!content) return false;
    var s = String(content).trim();
    if (s.charAt(0) !== '[' || s.charAt(s.length - 1) !== ']') return false;
    try {
      var arr = JSON.parse(s);
      if (!Array.isArray(arr) || arr.length === 0) return false;
      var first = arr[0];
      if (!first || typeof first !== 'object') return false;
      if (typeof first.id !== 'string' || !first.id) return false;
      if (typeof first.type !== 'string' || !RICH_BLOCK_TYPES[first.type]) return false;
      return true;
    } catch (e) { return false; }
  }

  // 图片扩展名（用于文件树图标与双击查看）
  var IMG_EXTS = { png: 1, jpg: 1, jpeg: 1, gif: 1, webp: 1, bmp: 1, svg: 1, ico: 1 };
  function isImageExt(name) {
    var m = (name || '').match(/\.([^.]+)$/);
    return !!(m && IMG_EXTS[m[1].toLowerCase()]);
  }

  /* ---------------- 路径工具 ---------------- */
  function dirOf(p) {
    if (!p) return '';
    var i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return i < 0 ? '' : p.slice(0, i);
  }
  function joinPath(base, rel) {
    if (!base) return rel;
    var b = base.replace(/[\\\/]+$/, '');
    var r = rel.replace(/^\.\//, '').replace(/^[\\\/]+/, '');
    return b + '/' + r;
  }
  function normPath(p) { return (p || '').replace(/\\/g, '/'); }
  function isAbsPath(p) { return /^[a-z]:[\\\/]/i.test(p) || /^\//.test(p); }
  function toFileUrl(p) {
    var s = normPath(p);
    return 'file:///' + s.replace(/^\/?/, function (m) { return m; });
  }
  // 把 img src 解析为可加载的地址；返回 null 表示无法解析（保留原值）
  function resolveImgSrc(src, baseDir) {
    if (!src) return null;
    if (/^(https?:|data:|blob:)/i.test(src)) return null; // 远程 / 内联 / blob 跳过
    if (isAbsPath(src)) return toFileUrl(src);
    if (baseDir) return toFileUrl(joinPath(baseDir, src));
    return null;
  }
