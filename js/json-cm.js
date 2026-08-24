/*!
 * Inkpad 内置 JSON 高亮模式（不依赖 vendor/codemirror/mode/json）
 * 通过 CodeMirror.defineMode 注册 application/json mime
 * 区分字段名 / 字符串值 / 数字 / 关键字 / 标点
 *
 * 用法：在 codemirror.js 之后、app.js 之前引入
 */
(function () {
  if (!window.CodeMirror) return;
  if (CodeMirror.modes && CodeMirror.modes['application/json']) return;

  CodeMirror.defineMode('application/json', function () {
    function consumeString(stream) {
      // 已确认 stream.peek() === '"'，吃掉 "..."（含转义）
      stream.next(); // opening "
      while (!stream.eol()) {
        var ch = stream.next();
        if (ch === '\\') {
          if (!stream.eol()) stream.next();
          continue;
        }
        if (ch === '"') return true; // 完整闭合
      }
      return false; // 未闭合（不合法 JSON，但吃掉避免死循环）
    }

    return {
      startState: function () { return {}; },
      token: function (stream) {
        if (stream.eatSpace()) return null;

        // 标点（, { } [ ]）
        if (stream.match(/^[,{}\[\]]/, true)) return 'punctuation';

        // 字符串：先吃，再 lookahead 看后面是不是 :
        if (stream.peek() === '"') {
          consumeString(stream);
          // 检测后面是不是 : 来判定是否字段名
          var rest = stream.string.substr(stream.pos);
          if (/^\s*:/.test(rest)) return 'string property';
          return 'string';
        }

        // null / true / false
        if (stream.match(/^(?:null|true|false)\b/, true)) return 'atom';

        // 数字（含负数、小数、指数）
        if (stream.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/, true)) {
          return 'number';
        }

        // 冒号
        if (stream.eat(':')) return 'punctuation';

        // 其他吃掉一字符，避免死循环
        stream.next();
        return null;
      },
      // 关联折叠 helper（按名查找 CodeMirror.helpers.fold['json-brace']）
      fold: 'json-brace'
    };
  });

  // ---- JSON 折叠 helper：{ } / [ ] 结构折叠，跳过字符串内容 ----
  // 与官方 brace-fold 不同：同一行内闭合的紧凑 JSON（如 {"a":1,"b":[2,3]}）也允许折叠
  function scanMatchingBracket(cm, line, fromCh, openCh, closeCh) {
    var depth = 1;
    for (var l = line; l <= cm.lastLine(); l++) {
      var text = cm.getLine(l);
      var pos = (l === line) ? fromCh : 0;
      while (pos < text.length) {
        var c = text.charAt(pos);
        // 字符串整体跳过，避免把字符串里的 { } [ ] 计入配对
        if (c === '"') {
          pos++;
          while (pos < text.length) {
            var cc = text.charAt(pos);
            if (cc === '\\') { pos += 2; continue; }
            pos++;
            if (cc === '"') break;
          }
          continue;
        }
        if (c === openCh) depth++;
        else if (c === closeCh) {
          depth--;
          if (depth === 0) return { line: l, ch: pos };
        }
        pos++;
      }
    }
    return null;
  }

  // 统计数组 [from, to] 内顶层元素数量（跳过字符串与嵌套结构），空数组返回 0
  function countArrayElements(cm, from, to) {
    var depth = 0, count = 0, sawAny = false, completed = false;
    for (var l = from.line; l <= to.line && !completed; l++) {
      var text = cm.getLine(l) || '';
      var startCh = (l === from.line) ? from.ch : 0;
      var endCh = (l === to.line) ? to.ch + 1 : text.length;
      if (startCh > endCh) break;
      var pos = startCh;
      while (pos < endCh) {
        var c = text.charAt(pos);
        if (c === '"') {
          pos++;
          while (pos < endCh) {
            var cc = text.charAt(pos);
            if (cc === '\\') { pos += 2; continue; }
            pos++;
            if (cc === '"') break;
          }
          sawAny = true;
          continue;
        }
        if (c === '{' || c === '[') { depth++; sawAny = true; }
        else if (c === '}' || c === ']') {
          depth--;
          if (depth < 0) { completed = true; break; }
          sawAny = true;
        }
        else if (c === ',') {
          if (depth === 0) count++;
          sawAny = true;
        }
        else if (c !== ' ' && c !== '\t' && c !== '\r') sawAny = true;
        pos++;
      }
    }
    return sawAny ? count + 1 : 0;
  }

  function jsonBraceFold(cm, start) {
    var line = start.line;
    var lineText = cm.getLine(line);
    if (!lineText) return null;

    var candidates = [];
    for (var i = start.ch; i < lineText.length; i++) {
      var c = lineText.charAt(i);
      if (c !== '{' && c !== '[') continue;
      var tt = cm.getTokenTypeAt(CodeMirror.Pos(line, i));
      if (tt && /^(comment|string)/.test(tt)) continue; // 字符串内的括号不参与折叠
      candidates.push({ ch: i + 1, open: c, close: c === '{' ? '}' : ']' });
    }
    if (!candidates.length) return null;

    // 取该行最外层（位置最靠前）且能配对的结构；单行紧凑 JSON 同样可折叠
    for (var j = 0; j < candidates.length; j++) {
      var cand = candidates[j];
      var end = scanMatchingBracket(cm, line, cand.ch, cand.open, cand.close);
      if (!end) continue;
      if (end.line === line && end.ch <= cand.ch) continue; // 空结构 {} / [] 不折叠
      var rng = { from: CodeMirror.Pos(line, cand.ch), to: end };
      if (cand.open === '[') rng.from.elementCount = countArrayElements(cm, rng.from, end);
      return rng;
    }
    return null;
  }

  CodeMirror.registerHelper('fold', 'json-brace', jsonBraceFold);

  // 全局兜底：JSON 折叠不只绑定 application/json 语言模式。
  // 新建的纯文本文档（plaintext / text/plain）粘贴 JSON 时，当前语言没有
  // 自己的 fold helper，导致折叠完全不可用。这里注册一个全局 helper：
  // 只要文档首非空白字符是 { 或 [（整体是 JSON 结构），就对所有行启用
  // 同样的 { } / [ ] 配对折叠。该 helper 是最后兜底，已有 fold helper 的
  // 语言（xml / markdown / json 等）不受影响。
  CodeMirror.registerGlobalHelper('fold', 'json-auto', function (mode, cm) {
    if (!cm || !cm.getDoc || !cm.getLine) return false;
    var firstLine = cm.getLine(0);
    if (!firstLine) return false;
    for (var k = 0; k < firstLine.length; k++) {
      var ch = firstLine.charAt(k);
      if (ch === ' ' || ch === '\t' || ch === '\r') continue;
      return ch === '{' || ch === '[';
    }
    return false;
  }, function (cm, start) {
    return jsonBraceFold(cm, start);
  });

  // mime → mode 别名
  CodeMirror.defineMIME('application/json', { name: 'application/json' });
})();
