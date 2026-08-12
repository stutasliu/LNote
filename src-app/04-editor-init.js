/* [esm] 导出本模块顶层绑定 */
export { KIND_META, VISUAL_MODULES, docIcon, cm };
/* [esm] 导入依赖模块绑定 */
import { els } from './01-core.js';
import { execEditorCmd, formatCurrent } from './11-format-tools.js';
import { handleTabKey } from './12-snippet-clip.js';
import { frFindNext, openFindModal } from './19-find-replace.js';
  /* ---------------- 可视化文档类型 ---------------- */
  var KIND_META = {
    flow: { icon: '🔀', label: '流程图' },
    mind: { icon: '🧠', label: '思维导图' },
    note: { icon: '📋', label: '思维笔记' }
  };
  var VISUAL_MODULES = { flow: 'InkpadFlow', mind: 'InkpadMind', note: 'InkpadNote' };

  function docIcon(d) {
    if (d.kind && KIND_META[d.kind]) return KIND_META[d.kind].icon;
    return d.lang === 'mermaid' ? '📊' : '📝';
  }

  /* ---------------- 初始化 CodeMirror ---------------- */
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
    gutters: ['CodeMirror-foldgutter', 'CodeMirror-linenumbers'],
    foldOptions: { widget: '⋯' },
    highlightSelectionMatches: { showToken: /[\w$\u4e00-\u9fff]+/, annotateScrollbar: false },
    extraKeys: {
      'Ctrl-Shift-F': formatCurrent,
      'Cmd-Shift-F': formatCurrent,
      'Ctrl-F': function () { openFindModal(false); },
      'Cmd-F': function () { openFindModal(false); },
      'Ctrl-H': function () { openFindModal(true); },
      'Cmd-H': function () { openFindModal(true); },
      'F3': function (cm2) { frFindNext(false); },
      'Shift-F3': function (cm2) { frFindNext(true); },
      'Ctrl-Alt-Down': 'selectNextOccurrence',
      'Cmd-Alt-Down': 'selectNextOccurrence',
      'Ctrl-/': 'toggleComment',
      'Cmd-/': 'toggleComment',
      'Ctrl-Alt-F': 'foldAll',
      'Ctrl-Alt-Shift-F': 'unfoldAll',
      'Ctrl-Shift-J': function (cm2) { execEditorCmd('merge'); },
      'Cmd-Shift-J': function (cm2) { execEditorCmd('merge'); },
      'Tab': handleTabKey,
      'Shift-Tab': function (cm2) { cm2.execCommand('indentLess'); }
    }
  });
  // 自动补全（Ctrl+Space / Ctrl+J）
  cm.on('keyup', function (cm2, e) {
    var tag = (e.key || '').length === 1 && /[\w$]/.test(e.key);
    if (tag && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      if (cm2.getOption('mode') !== 'text/plain') CodeMirror.commands.autocomplete(cm2, null, { completeSingle: false });
    }
  });
  // 点击行号选中整行
  cm.on('gutterClick', function (cm2, line, gutter) {
    if (gutter === 'CodeMirror-linenumbers') {
      cm2.setSelection({ line: line, ch: 0 }, { line: line, ch: cm2.getLine(line).length });
    }
  });

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'neutral',
    flowchart: { htmlLabels: true, curve: 'basis' },
    fontFamily: 'inherit'
  });
