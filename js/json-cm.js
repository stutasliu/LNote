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
      }
    };
  });

  // mime → mode 别名
  CodeMirror.defineMIME('application/json', { name: 'application/json' });
})();
