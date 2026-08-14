/* [esm] 导出本模块顶层绑定 */
export { formatJSON, highlightJSONError, jsonErrMarks, jsonErrTimer, clearJSONErrorHighlight, formatXML, prettyXML, formatCurrent, withContent, jsonFormat, jsonCompress, strEscape, strUnescape, unicodeToZh, zhToUnicode, jsonToGet, b64Encode, b64Decode, urlEncodeText, urlDecodeText, copyToClipboard, legacyCopy, TOOL_FNS, TOOL_NAMES, MODAL_TOOLS, runTool, codeMode, codeDo, openCodeToolModal, closeCodeToolModal, bindCodeModal, tsTimer, tsIsMs, pad2, formatBeijing, refreshTsNow, openTsModal, closeTsModal, bindTsModal, withText, titleCase, swapCase, fullToHalf, halfToFull, withLines, indentOf, deleteLines, deleteToSol, deleteToEol, mergeLines, reindent, foldAllDocs, unfoldAllDocs, foldToLevel, execEditorCmd, TEXT_TOOLS, dedupeLines, runTextTool };
/* [esm] 导入依赖模块绑定 */
import { $, state } from './01-core.js';
import { cm } from './04-editor-init.js';
import { activeDoc } from './05-store.js';
import { recordClip } from './12-snippet-clip.js';
import { openSingleModal } from './15-insert.js';
import { setLang, toast } from './16-doc-ops.js';
  /* ---------------- 格式化 ---------------- */
  function formatJSON() {
    var raw = cm.getValue().trim();
    if (!raw) { toast('内容为空', 'error'); return; }
    try {
      cm.setValue(jsonFormat(raw));
      // 仅当全文整体是合法 JSON 时才切换语言（混合内容保持原语言）
      if (isWholeJson(raw)) setLang('json', true);
      var warns = countRecovered(raw);
      toast(warns ? ('JSON 格式化完成 ✓ 检测到 ' + warns + ' 处数据不完整，已在文中标注') : 'JSON 格式化完成 ✓', 'success');
    } catch (e) {
      if (/未找到可序列化的 JSON 数据/.test(e && e.message || '')) {
        toast(e.message, 'error');
      } else {
        highlightJSONError(e, raw);
      }
    }
  }

  /* ---------------- JSON 错误高亮定位 ---------------- */
  // V8 的 SyntaxError 报错指向"期望看到下一个合法 token"的位置，
  // 不一定是错误字符本身的位置。这里把它转换到 1-based 行/列，
  // 并尝试回溯到上一个可能的真实错误位置（多余逗号等）。
  function highlightJSONError(err, content) {
    if (!err || !err.message) {
      toast('JSON 解析失败：' + (err && err.message || '未知错误'), 'error');
      return;
    }
    // 1. 解析位置（字符索引，0-based）
    var posMatch = err.message.match(/position\s+(\d+)/);
    var pos = posMatch ? +posMatch[1] : -1;
    var line = 0, ch = 0;
    if (pos >= 0 && pos <= content.length) {
      for (var i = 0; i < pos; i++) {
        if (content.charCodeAt(i) === 10) { line++; ch = 0; } else { ch++; }
      }
    }
    // 2. 回溯：当 V8 在 `]`/`}`/`)` 处期望下一个 token 时，
    //    真正的错误通常是上一行末尾多余的逗号/冒号。我们把高亮指向
    //    上一行最后一个非空白字符（包括逗号、冒号、字符串等）。
    var hint = '';
    if (pos > 0 && pos <= content.length) {
      var cAt = content.charAt(pos);
      if (cAt === '}' || cAt === ']' || cAt === ')') {
        // 找上一行末尾非空白字符的位置
        var j = pos - 1;
        while (j >= 0 && (content.charCodeAt(j) === 10 || content.charCodeAt(j) === 32 || content.charCodeAt(j) === 9 || content.charCodeAt(j) === 13)) j--;
        if (j >= 0 && content.charAt(j) !== '{' && content.charAt(j) !== '[') {
          // 重新计算 line/ch
          line = 0; ch = 0;
          for (var k = 0; k < j; k++) {
            if (content.charCodeAt(k) === 10) { line++; ch = 0; } else { ch++; }
          }
          hint = '（回溯到上一行末尾的逗号/冒号等非法字符）';
        } else {
          hint = '（请检查上一行末尾是否多余了逗号、冒号等）';
        }
      }
    }
    // 3. 高亮错误行（背景淡红）+ 错误字符（深红下划线）
    clearJSONErrorHighlight();
    var lineHandle = cm.addLineClass(line, 'background', 'json-err-line');
    var lineText = cm.getLine(line) || '';
    var safeEnd = Math.min(ch + 1, lineText.length);
    // 若回溯到的是逗号/冒号，把高亮拉到行末所有尾随标点
    if (lineText.charAt(ch) === ',' || lineText.charAt(ch) === ':' || lineText.charAt(ch) === ';') {
      var k = ch;
      while (k < lineText.length && /[,:;\s]/.test(lineText.charAt(k))) k++;
      safeEnd = Math.min(k, lineText.length);
    }
    var mark = cm.markText(
      { line: line, ch: ch },
      { line: line, ch: safeEnd },
      { className: 'json-err-char' }
    );
    jsonErrMarks.push({ lineHandle: lineHandle, mark: mark });
    // 4. 滚动到行 + 把光标置于错误字符
    cm.scrollIntoView({ line: line, ch: Math.max(0, ch - 4) }, 80);
    cm.setSelection({ line: line, ch: ch }, { line: line, ch: safeEnd });
    cm.focus();
    // 5. toast 提示
    toast(
      'JSON 解析失败：第 ' + (line + 1) + ' 行 第 ' + (ch + 1) + ' 列（字符位置 ' + pos + '）' + hint,
      'error'
    );
    // 6. 8s 后自动清除，用户编辑也会清除
    if (jsonErrTimer) clearTimeout(jsonErrTimer);
    jsonErrTimer = setTimeout(clearJSONErrorHighlight, 8000);
  }

  var jsonErrMarks = [];
  var jsonErrTimer = 0;
  function clearJSONErrorHighlight() {
    if (jsonErrTimer) { clearTimeout(jsonErrTimer); jsonErrTimer = 0; }
    jsonErrMarks.forEach(function (it) {
      try {
        if (it.lineHandle) cm.removeLineClass(it.lineHandle, 'background', 'json-err-line');
        if (it.mark) it.mark.clear();
      } catch (e) {}
    });
    jsonErrMarks = [];
  }

  function formatXML() {
    var raw = cm.getValue().trim();
    if (!raw) { toast('内容为空', 'error'); return; }

    // 先用 DOMParser 校验
    var parser = new DOMParser();
    var doc = parser.parseFromString(raw, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      toast('XML 语法有误，请检查标签是否闭合', 'error');
      return;
    }
    cm.setValue(prettyXML(raw));
    setLang('xml');
    toast('XML 格式化完成 ✓', 'success');
  }

  function prettyXML(xml) {
    // 标签之间插入换行，再按嵌套深度缩进
    var padded = xml.replace(/(>)(<)/g, '$1\n$2');
    var lines = padded.split('\n');
    var indent = 0;
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      // 纯闭合标签：先减一层再输出
      if (line.indexOf('</') === 0) indent = Math.max(0, indent - 1);
      var pad = '';
      for (var j = 0; j < indent; j++) pad += '  ';
      out.push(pad + line);
      // 开标签（非自闭合、非声明/注释、不同行闭合）：输出后加一层
      if (/^<[^!?\/]/.test(line) && !/\/>$/.test(line) && line.indexOf('</') === -1) {
        indent++;
      }
    }
    return out.join('\n');
  }

  function formatCurrent() {
    if (state.currentVisual) return;
    var d = activeDoc();
    if (!d) return;
    if (d.lang === 'json') formatJSON();
    else if (d.lang === 'xml') formatXML();
    else toast('当前语言暂不支持自动格式化，可切换为 JSON / XML 后再试', 'error');
  }

  /* ---------------- JSON / 文本工具集 ---------------- */
  // 有选区则只处理选区，否则处理全文
  function withContent(fn) {
    var sel = cm.getSelection();
    if (sel) cm.replaceSelection(fn(sel));
    else cm.setValue(fn(cm.getValue()));
  }

  // 整体是否是合法 JSON（用于判断是否切换语言高亮）
  function isWholeJson(t) {
    try { JSON.parse(t.trim()); return true; } catch (e) { return false; }
  }

  // 从 start 处找配对的括号结束位置（正确处理字符串与转义），找不到返回 -1
  function matchBalanced(text, start) {
    var openCh = text[start];
    var closeCh = openCh === '{' ? '}' : ']';
    var depth = 0;
    var inStr = false;
    var esc = false;
    for (var i = start; i < text.length; i++) {
      var c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === openCh) depth++;
      else if (c === closeCh) {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  // 在 [start, end) 内扫描括号栈；若到 end 时栈非空则自动补全缺失的闭合括号，
  // 补全后整体可被 JSON.parse 解析则返回 { end, value, closed }（closed 为补全的括号数），
  // 否则返回 null。中途括号不匹配（如多余的 `]`/`}`）也返回 null。
  function tryClose(text, start, end) {
    var stack = [];
    var inStr = false, esc = false;
    for (var i = start; i < end; i++) {
      var c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{' || c === '[') stack.push(c);
      else if (c === '}' || c === ']') {
        var want = c === '}' ? '{' : '[';
        if (stack.length && stack[stack.length - 1] === want) stack.pop();
        else return null;
      }
    }
    if (!stack.length) return null;   // 完整闭合的片段不在半截恢复里处理
    var closers = '';
    for (var k = stack.length - 1; k >= 0; k--) closers += stack[k] === '{' ? '}' : ']';
    try {
      var p = JSON.parse(text.slice(start, end) + closers);
      if (p !== null && typeof p === 'object') return { end: end, value: p, closed: stack.length };
    } catch (e) {}
    return null;
  }

  // 半截 JSON 恢复：从 start 找最长可通过「自动补全闭合括号」恢复的 JSON 前缀。
  // 先试完整段，失败则从后往前在结构/空白边界处截断逐个尝试。
  // 超过 30000 字符不做恢复，避免卡顿。
  function longestJsonPrefix(text, start, limit) {
    var n = limit >= 0 ? limit : text.length;
    if (n - start > 30000) return null;
    var r = tryClose(text, start, n);
    if (r) return r;
    for (var j = n - 1; j > start; j--) {
      var c = text[j];
      if (c === ',' || c === ':' || c === '{' || c === '[' || c === '}' || c === ']' ||
          c === ' ' || c === '\n' || c === '\r' || c === '\t') {
        r = tryClose(text, start, j);
        if (r) return r;
      }
    }
    return null;
  }

  // 从混合文本中提取 JSON 片段（含半截数据）：
  // 返回 [{ start, end, parsed, recovered, closed }]，
  // recovered=true 表示该片段原文不完整（已自动补全闭合），closed 为补全的括号数。
  function extractJsonFragments(text) {
    var frags = [];
    var i = 0;
    var n = text.length;
    while (i < n) {
      var c = text[i];
      if (c === '{' || c === '[') {
        var end = matchBalanced(text, i);
        var segEnd = -1;
        var parsed = null;
        var recovered = false;
        var closed = 0;
        if (end >= 0) {
          var sub = text.slice(i, end + 1);
          try { parsed = JSON.parse(sub); segEnd = end + 1; } catch (e) { parsed = null; }
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
        if (parsed && parsed !== null && typeof parsed === 'object') {
          frags.push({ start: i, end: segEnd, parsed: parsed, recovered: recovered, closed: closed });
          i = segEnd;
          continue;
        }
      }
      i++;
    }
    return frags;
  }

  // 统计文本中「半截（被截断）」的 JSON 片段数量，用于提示用户
  function countRecovered(t) {
    var n = 0;
    var frags = extractJsonFragments(t);
    for (var k = 0; k < frags.length; k++) if (frags[k].recovered) n++;
    return n;
  }

  function jsonFormat(t) {
    // 整体是合法 JSON → 原样格式化
    try { return JSON.stringify(JSON.parse(t.trim()), null, 2); } catch (e) {}
    // 混合内容：只把其中的 JSON 片段序列化（半截数据尽力恢复），其余文本保留
    var frags = extractJsonFragments(t);
    if (!frags.length) throw new Error('未找到可序列化的 JSON 数据');
    var out = '';
    var last = 0;
    for (var k = 0; k < frags.length; k++) {
      var f = frags[k];
      out += t.slice(last, f.start) + JSON.stringify(f.parsed, null, 2);
      // 半截恢复的片段：在片段后追加标记，提示原文此处数据不完整
      // （注释文本刻意避开 { } [ ] " 等字符，避免再次格式化时被误识别）
      if (f.recovered) out += '\n/* 数据不完整：此段 JSON 原文被截断，已自动补全闭合 */';
      last = f.end;
    }
    out += t.slice(last);
    return out;
  }

  function jsonCompress(t) {
    // 整体是合法 JSON → 原样压缩
    try { return JSON.stringify(JSON.parse(t.trim())); } catch (e) {}
    // 混合内容：只压缩其中的 JSON 片段，其余文本保留
    var frags = extractJsonFragments(t);
    if (!frags.length) throw new Error('未找到可压缩的 JSON 数据');
    var out = '';
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
    // 用 JSON.stringify 做转义，去掉首尾包裹的引号
    return JSON.stringify(t).slice(1, -1);
  }

  function strUnescape(t) {
    var s = t.trim();
    try { return JSON.parse(s); } catch (e) { /* 不是带引号的 JSON 串，继续 */ }
    try { return JSON.parse('"' + s + '"'); }
    catch (e) { throw new Error('无法去转义：内容不是合法的转义字符串'); }
  }

  function unicodeToZh(t) {
    return t.replace(/\\u([0-9a-fA-F]{4})/g, function (m, g) {
      return String.fromCharCode(parseInt(g, 16));
    });
  }

  function zhToUnicode(t) {
    return t.replace(/[^\x00-\x7F]/g, function (ch) {
      return '\\u' + ('0000' + ch.charCodeAt(0).toString(16)).slice(-4);
    });
  }

  function jsonToGet(t) {
    var obj = JSON.parse(t.trim());
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error('需要 JSON 对象，例如 {"a":1,"b":"x"}');
    }
    var pairs = [];
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (v === null || v === undefined) return;
      if (typeof v === 'object') v = JSON.stringify(v);
      pairs.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    });
    if (!pairs.length) throw new Error('JSON 对象为空，没有可转换的参数');
    return pairs.join('&');
  }

  function b64Encode(t) {
    var u8 = new TextEncoder().encode(t);
    var s = '';
    for (var i = 0; i < u8.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function b64Decode(t) {
    var bin = atob(t.trim());
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(u8);
    } catch (e) {
      throw new Error('Base64 解码结果不是合法 UTF-8 文本');
    }
  }

  function urlEncodeText(t) {
    return encodeURIComponent(t);
  }

  function urlDecodeText(t) {
    try {
      return decodeURIComponent(t.trim());
    } catch (e) {
      throw new Error('URL 解码失败：内容包含非法的 % 编码');
    }
  }

  function copyToClipboard(text) {
    recordClip(text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return legacyCopy(text); }
      );
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
    return ok;
  }

  var TOOL_FNS = {
    'format': jsonFormat,
    'compress': jsonCompress,
    'escape': strEscape,
    'unescape': strUnescape,
    'unicode-zh': unicodeToZh,
    'zh-unicode': zhToUnicode,
    'to-get': jsonToGet
  };

  var TOOL_NAMES = {
    'format': 'JSON 格式化',
    'compress': 'JSON 压缩',
    'escape': '转义',
    'unescape': '去转义',
    'unicode-zh': 'Unicode → 中文',
    'zh-unicode': '中文 → Unicode',
    'to-get': '转 GET 参数',
    'b64-encode': 'Base64 编码',
    'b64-decode': 'Base64 解码',
    'url-encode': 'URL 编码',
    'url-decode': 'URL 解码'
  };

  // 弹窗类工具：菜单项 → [模式, 操作]
  var MODAL_TOOLS = {
    'b64-encode': ['base64', 'encode'],
    'b64-decode': ['base64', 'decode'],
    'url-encode': ['url', 'encode'],
    'url-decode': ['url', 'decode']
  };

  function runTool(name) {
    if (name === 'copy') {
      var text = cm.getSelection() || cm.getValue();
      if (!text) { toast('没有可复制的内容', 'error'); return; }
      copyToClipboard(text).then(function (ok) {
        toast(ok ? '已复制到剪贴板 ✓' : '复制失败，请手动 Ctrl+C', ok ? 'success' : 'error');
      });
      return;
    }
    if (name === 'ts-convert') { openTsModal(); return; }
    if (MODAL_TOOLS[name]) {
      openCodeToolModal(MODAL_TOOLS[name][0], MODAL_TOOLS[name][1]);
      return;
    }
    var fn = TOOL_FNS[name];
    if (!fn) return;
    if (!cm.getValue().trim()) { toast('内容为空', 'error'); return; }
    var rawText = cm.getValue();
    try {
      var hadSelection = !!cm.getSelection();
      var scopeText = hadSelection ? cm.getSelection() : rawText;   // 处理前的文本，用于统计半截片段
      withContent(fn);
      // 全文做 JSON 格式化/压缩时，顺带把语言切到 JSON（高亮更准确）
      // v0.20.45：传入 true 跳过 setLang 自动格式化 —— 压缩场景内容需保持压缩态
      // v0.21.2：仅当全文整体是合法 JSON 时才切换语言；混合内容保持原语言
      if (!hadSelection && (name === 'format' || name === 'compress') && isWholeJson(rawText)) setLang('json', true);
      var warns = countRecovered(scopeText);
      toast(warns ? (TOOL_NAMES[name] + ' 完成 ✓ 检测到 ' + warns + ' 处数据不完整，已自动补全' + (name === 'format' ? '并在文中标注' : '')) : (TOOL_NAMES[name] + ' 完成 ✓'), 'success');
    } catch (e) {
      var em = e && e.message || String(e);
      // 混合内容中未找到 JSON 片段：直接提示，不做错误高亮定位
      if (/未找到可序列化的 JSON 数据/.test(em)) {
        toast(em, 'error');
      } else if (e instanceof SyntaxError || /JSON|JSON\.|position\s+\d+/.test(em)) {
        highlightJSONError(e, rawText);
      } else {
        toast(em, 'error');
      }
    }
  }

  /* ---------------- 编码转换弹窗（Base64 / URL） ---------------- */
  function codeMode() {
    var r = document.querySelector('input[name="code-mode"]:checked');
    return r ? r.value : 'base64';
  }

  function codeDo(op) {
    var t = $('code-input').value;
    if (!t) { toast('请先输入要转换的内容', 'error'); return; }
    var out;
    try {
      if (codeMode() === 'base64') {
        out = op === 'encode' ? b64Encode(t) : b64Decode(t);
      } else {
        out = op === 'encode' ? urlEncodeText(t) : urlDecodeText(t);
      }
      $('code-output').value = out;
    } catch (e) {
      toast(e && e.message ? e.message : '转换失败', 'error');
    }
  }

  function openCodeToolModal(mode, op) {
    document.querySelectorAll('input[name="code-mode"]').forEach(function (r) {
      r.checked = r.value === mode;
    });
    // 有选区时预填到输入框
    var sel = cm.getSelection();
    if (sel) $('code-input').value = sel;
    openSingleModal('code-modal');
    if (op) codeDo(op);
    $('code-input').focus();
  }

  function closeCodeToolModal() {
    $('code-modal').style.display = 'none';
  }

  function bindCodeModal() {
    $('code-close').addEventListener('click', closeCodeToolModal);
    $('code-modal').addEventListener('click', function (e) {
      if (e.target === $('code-modal')) closeCodeToolModal();
    });
    $('code-encode').addEventListener('click', function () { codeDo('encode'); });
    $('code-decode').addEventListener('click', function () { codeDo('decode'); });
    $('code-swap').addEventListener('click', function () {
      $('code-input').value = $('code-output').value;
    });
    $('code-clear').addEventListener('click', function () {
      $('code-input').value = '';
      $('code-output').value = '';
      $('code-input').focus();
    });
    $('code-copy').addEventListener('click', function () {
      var v = $('code-output').value;
      if (!v) { toast('还没有转换结果', 'error'); return; }
      copyToClipboard(v).then(function (ok) {
        toast(ok ? '已复制 ✓' : '复制失败', ok ? 'success' : 'error');
      });
    });
    $('code-apply').addEventListener('click', function () {
      var v = $('code-output').value;
      if (!v) { toast('还没有转换结果', 'error'); return; }
      // 有选区替换选区，否则插入到光标处
      if (cm.getSelection()) cm.replaceSelection(v);
      else cm.replaceRange(v, cm.getCursor());
      toast('已应用到编辑器 ✓', 'success');
      closeCodeToolModal();
    });
  }

  /* ---------------- 时间戳转换弹窗 ---------------- */
  var tsTimer = null;

  function tsIsMs() {
    var r = document.querySelector('input[name="ts-unit"]:checked');
    return r && r.value === 'ms';
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // 始终以北京时间（UTC+8）格式化，与系统时区无关
  function formatBeijing(ms) {
    var d = new Date(ms + 8 * 3600000);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) +
      ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds());
  }

  function refreshTsNow() {
    var now = Date.now();
    $('ts-now').value = tsIsMs() ? String(now) : String(Math.floor(now / 1000));
  }

  function openTsModal() {
    openSingleModal('ts-modal');
    refreshTsNow();
    // 预填当前北京时间
    var bj = new Date(Date.now() + 8 * 3600000);
    $('ts-y').value = bj.getUTCFullYear();
    $('ts-mo').value = bj.getUTCMonth() + 1;
    $('ts-d').value = bj.getUTCDate();
    $('ts-h').value = bj.getUTCHours();
    $('ts-mi').value = bj.getUTCMinutes();
    $('ts-s').value = bj.getUTCSeconds();
    clearInterval(tsTimer);
    tsTimer = setInterval(refreshTsNow, 500);
  }

  function closeTsModal() {
    $('ts-modal').style.display = 'none';
    clearInterval(tsTimer);
  }

  function bindTsModal() {
    $('ts-close').addEventListener('click', closeTsModal);
    $('ts-modal').addEventListener('click', function (e) {
      if (e.target === $('ts-modal')) closeTsModal();
    });
    document.querySelectorAll('input[name="ts-unit"]').forEach(function (r) {
      r.addEventListener('change', refreshTsNow);
    });

    $('ts-to-date').addEventListener('click', function () {
      var raw = $('ts-input').value.trim();
      var ts = Number(raw);
      if (!raw || isNaN(ts)) { toast('请输入合法的时间戳数字', 'error'); return; }
      var ms = tsIsMs() ? ts : ts * 1000;
      if (ms > 8.64e15 || ms < -8.64e15) { toast('时间戳超出可表示范围', 'error'); return; }
      $('ts-date-out').value = formatBeijing(ms);
    });

    $('ts-to-ts').addEventListener('click', function () {
      var y = Number($('ts-y').value), mo = Number($('ts-mo').value), d = Number($('ts-d').value);
      var h = Number($('ts-h').value || 0), mi = Number($('ts-mi').value || 0), s = Number($('ts-s').value || 0);
      if (!y || !mo || !d) { toast('请至少填写完整的 年 / 月 / 日', 'error'); return; }
      if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) {
        toast('日期时间数值超出范围', 'error');
        return;
      }
      // 输入按北京时间（UTC+8）解释
      var ms = Date.UTC(y, mo - 1, d, h, mi, s) - 8 * 3600000;
      $('ts-ts-out').value = tsIsMs() ? String(ms) : String(Math.floor(ms / 1000));
    });

    $('ts-now-copy').addEventListener('click', function () {
      copyToClipboard($('ts-now').value).then(function (ok) {
        toast(ok ? '已复制 ✓' : '复制失败', ok ? 'success' : 'error');
      });
    });
    $('ts-date-copy').addEventListener('click', function () {
      var v = $('ts-date-out').value;
      if (!v) { toast('还没有转换结果', 'error'); return; }
      copyToClipboard(v).then(function (ok) {
        toast(ok ? '已复制 ✓' : '复制失败', ok ? 'success' : 'error');
      });
    });
    $('ts-ts-copy').addEventListener('click', function () {
      var v = $('ts-ts-out').value;
      if (!v) { toast('还没有转换结果', 'error'); return; }
      copyToClipboard(v).then(function (ok) {
        toast(ok ? '已复制 ✓' : '复制失败', ok ? 'success' : 'error');
      });
    });
  }

  /* ---------------- 文本工具（选区或全文） ---------------- */
  function withText(fn) {
    var sel = cm.getSelection();
    if (sel) cm.replaceSelection(fn(sel));
    else cm.setValue(fn(cm.getValue()));
  }

  function titleCase(s) {
    return s.replace(/\b(\w)(\w*)/g, function (m, a, b) { return a.toUpperCase() + b.toLowerCase(); });
  }

  function swapCase(s) {
    return s.replace(/[a-zA-Z]/g, function (c) {
      return c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
    });
  }

  // 全角 ↔ 半角
  function fullToHalf(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 0x3000) out += ' ';
      else if (c >= 0xFF01 && c <= 0xFF5E) out += String.fromCharCode(c - 0xFEE0);
      else out += s[i];
    }
    return out;
  }

  function halfToFull(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 0x20) out += '\u3000';
      else if (c >= 0x21 && c <= 0x7E) out += String.fromCharCode(c + 0xFEE0);
      else out += s[i];
    }
    return out;
  }

  // 对每行操作（保留选区边界）
  function withLines(fn) {
    var sel = cm.getSelection();
    var start, end;
    if (sel) {
      var from = cm.getCursor('from'), to = cm.getCursor('to');
      if (from.line !== to.line || sel.indexOf('\n') !== -1) {
        start = from.line;
        end = to.line;
      } else {
        // 单行选区：仍按行处理
        start = from.line; end = to.line;
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
      cm.replaceRange('', { line: start, ch: 0 }, { line: end, ch: cm.getLine(end).length });
      return;
    }
    cm.replaceRange(out.join('\n'), { line: start, ch: 0 }, { line: end, ch: cm.getLine(end).length });
    cm.setSelection({ line: start, ch: 0 }, { line: start + out.length - 1, ch: cm.getLine(start + out.length - 1).length });
  }

  /* ---- v0.20.1 新增：纯文本编辑增强（删除更多 / 格式 / 折叠级别）---- */
  function indentOf(line) {
    var m = /^[\t ]*/.exec(line || '');
    if (!m) return 0;
    var s = m[0], n = 0;
    for (var i = 0; i < s.length; i++) n += (s[i] === '\t' ? 2 : 1);
    return n;
  }
  function deleteLines() {
    var from = cm.getCursor('from'), to = cm.getCursor('to');
    var start = from.line, end = to.line;
    if (!cm.getSelection()) { start = end = cm.getCursor().line; }
    var last = cm.lineCount() - 1;
    var toPos = (end < last) ? { line: end + 1, ch: 0 } : { line: end, ch: cm.getLine(end).length };
    cm.replaceRange('', { line: start, ch: 0 }, toPos);
  }
  function deleteToSol() {
    var sel = cm.getSelection();
    if (!sel) { var c = cm.getCursor(); cm.replaceRange('', { line: c.line, ch: 0 }, c); return; }
    var from = cm.getCursor('from'), to = cm.getCursor('to');
    cm.operation(function () {
      for (var i = to.line; i >= from.line; i--) {
        var col = (i === from.line) ? from.ch : 0;
        cm.replaceRange('', { line: i, ch: 0 }, { line: i, ch: col });
      }
    });
  }
  function deleteToEol() {
    var sel = cm.getSelection();
    if (!sel) { var c = cm.getCursor(); cm.replaceRange('', c, { line: c.line, ch: cm.getLine(c.line).length }); return; }
    var from = cm.getCursor('from'), to = cm.getCursor('to');
    cm.operation(function () {
      for (var i = from.line; i <= to.line; i++) {
        var col = (i === to.line) ? to.ch : cm.getLine(i).length;
        cm.replaceRange('', { line: i, ch: col }, { line: i, ch: cm.getLine(i).length });
      }
    });
  }
  function mergeLines() {
    var sel = cm.getSelection();
    var text = sel || cm.getValue();
    var merged = text.replace(/\s*\n\s*/g, ' ').trim();
    if (sel) cm.replaceSelection(merged);
    else cm.setValue(merged);
  }
  function reindent() {
    if (cm.getSelection()) cm.indentSelection('smart');
    else cm.operation(function () { for (var i = 0; i < cm.lineCount(); i++) cm.indentLine(i, 'smart'); });
  }
  function foldAllDocs() { cm.foldAll(); }
  function unfoldAllDocs() { cm.unfoldAll(); }
  function foldToLevel(level) {
    cm.operation(function () {
      cm.unfoldAll();
      var total = cm.lineCount(), opens = [];
      for (var i = 0; i < total; i++) {
        var txt = cm.getLine(i), ind = indentOf(txt);
        while (opens.length && opens[opens.length - 1] >= ind) opens.pop();
        var depth = opens.length + 1;
        var hasDeeper = false;
        for (var j = i + 1; j < total; j++) {
          var jt = cm.getLine(j);
          if (jt.trim() === '') continue;
          var ji = indentOf(jt);
          if (ji > ind) { hasDeeper = true; break; }
          if (ji <= ind) break;
        }
        if (hasDeeper && depth <= level) {
          try { cm.foldCode({ line: i, ch: 0 }, { rangeFinder: CodeMirror.indentRangeFinder }, 'fold'); } catch (e) {}
        }
        opens.push(ind);
      }
    });
  }
  function execEditorCmd(cmd) {
    var contentOps = ['upper', 'lower', 'title', 'swap', 'full2half', 'half2full',
      'del-empty', 'del-dup', 'del-sol-space', 'del-eol-space', 'del-line',
      'del-to-sol', 'del-to-eol', 'merge', 'reindent', 'sort', 'sort-len', 'reverse'];
    if (contentOps.indexOf(cmd) !== -1 && !cm.getValue().trim()) { toast('内容为空', 'error'); return; }
    switch (cmd) {
      case 'upper': withText(TEXT_TOOLS.upper.fn); break;
      case 'lower': withText(TEXT_TOOLS.lower.fn); break;
      case 'title': withText(TEXT_TOOLS.title.fn); break;
      case 'swap': withText(TEXT_TOOLS.swap.fn); break;
      case 'full2half': withText(TEXT_TOOLS.full2half.fn); break;
      case 'half2full': withText(TEXT_TOOLS.half2full.fn); break;
      case 'del-empty': withLines(function (l) { return l.trim() === '' ? null : l; }); break;
      case 'del-dup': {
        var sel2 = cm.getSelection(), from2, lines2;
        if (sel2) { from2 = cm.getCursor('from').line; var to2 = cm.getCursor('to').line; lines2 = []; for (var j = from2; j <= to2; j++) lines2.push(cm.getLine(j)); }
        else { from2 = 0; lines2 = cm.getValue().split('\n'); }
        var res2 = dedupeLines(lines2);
        cm.replaceRange(res2.join('\n'), { line: from2, ch: 0 }, { line: from2 + lines2.length - 1, ch: cm.getLine(from2 + lines2.length - 1).length });
        break;
      }
      case 'sort': case 'sort-len': case 'reverse': {
        var sel = cm.getSelection(), start, lines;
        if (sel) { var f = cm.getCursor('from'); start = f.line; var e = cm.getCursor('to').line; lines = []; for (var i = start; i <= e; i++) lines.push(cm.getLine(i)); }
        else { start = 0; lines = cm.getValue().split('\n'); }
        var sorted = TEXT_TOOLS[cmd].sort(lines);
        cm.replaceRange(sorted.join('\n'), { line: start, ch: 0 }, { line: start + lines.length - 1, ch: cm.getLine(start + lines.length - 1).length });
        break;
      }
      case 'del-sol-space': withLines(function (l) { return l.replace(/^[\t ]+/, ''); }); break;
      case 'del-eol-space': withLines(function (l) { return l.replace(/[\t ]+$/, ''); }); break;
      case 'del-line': deleteLines(); break;
      case 'del-to-sol': deleteToSol(); break;
      case 'del-to-eol': deleteToEol(); break;
      case 'merge': mergeLines(); break;
      case 'reindent': reindent(); break;
      case 'fold-all': foldAllDocs(); break;
      case 'unfold-all': unfoldAllDocs(); break;
      case 'fold-1': case 'fold-2': case 'fold-3': case 'fold-4': case 'fold-5':
        foldToLevel(parseInt(cmd.split('-')[1], 10)); break;
      default: return;
    }
    var labels = {
      'upper': '转大写', 'lower': '转小写', 'title': '单词首字母大写', 'swap': '反转大小写',
      'full2half': '全角→半角', 'half2full': '半角→全角', 'del-empty': '删除空行', 'del-dup': '删除重复行',
      'del-sol-space': '删除行头空白', 'del-eol-space': '删除行尾空白', 'del-line': '删除整行',
      'del-to-sol': '删除到行头', 'del-to-eol': '删除到行尾', 'merge': '合并行', 'reindent': '重新缩进',
      'sort': '行排序', 'sort-len': '按长度排序', 'reverse': '反转行序',
      'fold-all': '折叠全部', 'unfold-all': '展开全部'
    };
    if (cmd.indexOf('fold-') === 0) toast('折叠级别 ' + cmd.split('-')[1] + ' ✓', 'success');
    else if (labels[cmd]) toast(labels[cmd] + ' 完成 ✓', 'success');
  }

  var TEXT_TOOLS = {
    'upper': { name: '转大写', fn: function (t) { return t.toUpperCase(); } },
    'lower': { name: '转小写', fn: function (t) { return t.toLowerCase(); } },
    'title': { name: '单词首字母大写', fn: titleCase },
    'swap': { name: '反转大小写', fn: swapCase },
    'full2half': { name: '全角→半角', fn: fullToHalf },
    'half2full': { name: '半角→全角', fn: halfToFull },
    'del-empty': { name: '删除空行', fn: null, lines: function (l) { return l.trim() === '' ? null : l; } },
    'del-dup': { name: '删除重复行', fn: null, lines: dedupeLines },
    'sort': { name: '行排序', fn: null, lines: null, sort: function (arr) { return arr.slice().sort(function (a, b) { return a.localeCompare(b, 'zh'); }); } },
    'sort-len': { name: '按长度排序', fn: null, lines: null, sort: function (arr) { return arr.slice().sort(function (a, b) { return a.length - b.length || a.localeCompare(b, 'zh'); }); } },
    'reverse': { name: '反转行序', fn: null, lines: null, sort: function (arr) { return arr.slice().reverse(); } }
  };

  function dedupeLines(linesArr) {
    var seen = {};
    var out = [];
    linesArr.forEach(function (l) {
      if (!seen[l]) { seen[l] = true; out.push(l); }
    });
    return out;
  }

  function runTextTool(name) { execEditorCmd(name); }

  /* ---------------- Snippet 代码段 ---------------- */
