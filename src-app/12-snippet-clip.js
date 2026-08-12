/* [esm] 导出本模块顶层绑定 */
export { SNIPPETS, snippetState, handleTabKey, insertSnippet, openSnippetModal, CLIP_KEY, CLIP_MAX, getClips, recordClip, renderClipList };
/* [esm] 导入依赖模块绑定 */
import { $, els } from './01-core.js';
import { cm } from './04-editor-init.js';
import { activeDoc } from './05-store.js';
import { openSingleModal } from './15-insert.js';
import { toast } from './16-doc-ops.js';
  var SNIPPETS = {
    javascript: [
      { name: 'log', desc: 'console.log', text: 'console.log(${1});' },
      { name: 'func', desc: 'function 声明', text: 'function ${1:name}(${2}) {\n  ${3}\n}' },
      { name: 'for', desc: 'for 循环', text: 'for (let ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n  ${3}\n}' },
      { name: 'if', desc: 'if 判断', text: 'if (${1:condition}) {\n  ${2}\n}' },
      { name: 'arr', desc: '箭头函数', text: '(${1:args}) => ${2:expr}' },
      { name: 'import', desc: 'import', text: "import ${1:name} from '${2:module}';" }
    ],
    python: [
      { name: 'def', desc: '函数定义', text: 'def ${1:name}(${2:args}):\n    ${3:pass}' },
      { name: 'for', desc: 'for 循环', text: 'for ${1:i} in ${2:range(10)}:\n    ${3:pass}' },
      { name: 'if', desc: 'if 判断', text: 'if ${1:condition}:\n    ${2:pass}' },
      { name: 'class', desc: '类定义', text: 'class ${1:Name}:\n    def __init__(self):\n        ${2:pass}' },
      { name: 'main', desc: 'main 入口', text: 'if __name__ == "__main__":\n    ${1:pass}' }
    ],
    html: [
      { name: 'html5', desc: 'HTML5 骨架', text: '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${1:标题}</title>\n</head>\n<body>\n  ${2:内容}\n</body>\n</html>' },
      { name: 'div', desc: 'div 容器', text: '<div class="${1:cls}">\n  ${2}\n</div>' },
      { name: 'a', desc: '链接', text: '<a href="${1:url}" target="_blank">${2:文字}</a>' },
      { name: 'img', desc: '图片', text: '<img src="${1:url}" alt="${2:描述}">' },
      { name: 'script', desc: 'script 标签', text: '<script>\n  ${1}\n</script>' }
    ],
    markdown: [
      { name: 'code', desc: '代码块', text: '```${1:language}\n${2}\n```' },
      { name: 'table', desc: '表格', text: '| ${1:列1} | ${2:列2} |\n| --- | --- |\n| ${3:数据} | ${4:数据} |' },
      { name: 'link', desc: '链接', text: '[${1:文字}](${2:url})' },
      { name: 'img', desc: '图片', text: '![${1:alt}](${2:url})' },
      { name: 'task', desc: '任务列表', text: '- [ ] ${1:待办}' }
    ],
    json: [
      { name: 'obj', desc: 'JSON 对象', text: '{\n  "${1:key}": ${2:value}\n}' },
      { name: 'arr', desc: 'JSON 数组', text: '[\n  ${1}\n]' }
    ],
    xml: [
      { name: 'node', desc: 'XML 节点', text: '<${1:tag}>\n  ${2}\n</${1:tag}>' },
      { name: 'comment', desc: '注释', text: '<!-- ${1:注释} -->' }
    ],
    css: [
      { name: 'flex', desc: 'Flex 布局', text: 'display: flex;\njustify-content: ${1:center};\nalign-items: ${2:center};' },
      { name: 'media', desc: '媒体查询', text: '@media (max-width: ${1:768px}) {\n  ${2}\n}' }
    ],
    plaintext: [],
    sql: [], yaml: [], shell: [], clike: [], mermaid: []
  };

  var snippetState = null; // { stops: [{from,to}], idx }

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
    cm2.execCommand('indentMore');
  }

  function insertSnippet(snippet) {
    var text = snippet.text;
    var stops = []; // { n, def, sentinel }
    var seq = 0;
    // 把 ${n} / ${n:default} 替换成唯一哨兵；${0} 直接移除（最终光标位）
    var expanded = text.replace(/\$\{(\d+)(?::([^}]*))?\}/g, function (m, n, def) {
      if (Number(n) === 0) return '';
      var sentinel = '\u0001' + (++seq) + '\u0001';
      stops.push({ n: Number(n), def: def !== undefined ? def : '', sentinel: sentinel });
      return sentinel;
    });

    var fromPos = cm.getCursor('from');
    cm.replaceSelection(expanded);
    var baseOffset = cm.indexFromPos(fromPos);

    stops.forEach(function (st) {
      var idx = expanded.indexOf(st.sentinel);
      if (idx === -1) return;
      var pos = cm.posFromIndex(baseOffset + idx);
      var end = cm.posFromIndex(baseOffset + idx + st.sentinel.length);
      cm.replaceRange(st.def, pos, end);
      st.from = pos;
      st.to = cm.posFromIndex(baseOffset + idx + st.def.length);
    });

    stops.sort(function (a, b) { return a.n - b.n; });
    if (stops.length) {
      snippetState = {
        stops: stops.map(function (s) { return { from: s.from, to: s.to }; }),
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
    var lang = d && d.lang ? d.lang : 'plaintext';
    if (d && d.kind && d.kind !== 'text') lang = 'plaintext';
    var list = SNIPPETS[lang] || SNIPPETS.plaintext;
    els.snippetList.innerHTML = '';
    if (!list.length) {
      els.snippetList.innerHTML = '<div class="clip-empty">当前语言没有内置代码段（请切换为 JS / Python / HTML 等）</div>';
    }
    list.forEach(function (s) {
      var item = document.createElement('div');
      item.className = 'snippet-item';
      item.innerHTML = '<span class="snippet-name">' + s.name + '</span><span class="snippet-desc">' + s.desc + '</span>';
      item.addEventListener('click', function () {
        insertSnippet(s);
        $('snippet-modal').style.display = 'none';
        toast('已插入「' + s.name + '」，按 Tab 跳转占位', 'success');
      });
      els.snippetList.appendChild(item);
    });
    openSingleModal('snippet-modal');
  }

  /* ---------------- 剪贴板历史 ---------------- */
  var CLIP_KEY = 'inkpad.clip.v1';
  var CLIP_MAX = 20;

  function getClips() {
    try { return JSON.parse(localStorage.getItem(CLIP_KEY)) || []; } catch (e) { return []; }
  }

  function recordClip(text) {
    if (!text || text.length > 5000) return;
    var list = getClips();
    list = list.filter(function (t) { return t !== text; });
    list.unshift(text);
    if (list.length > CLIP_MAX) list.length = CLIP_MAX;
    localStorage.setItem(CLIP_KEY, JSON.stringify(list));
  }

  function renderClipList() {
    var list = getClips();
    els.clipList.innerHTML = '';
    if (!list.length) {
      els.clipList.innerHTML = '<div class="clip-empty">还没有复制记录</div>';
      return;
    }
    list.forEach(function (t) {
      var item = document.createElement('div');
      item.className = 'clip-item';
      var preview = t.replace(/\s+/g, ' ');
      if (preview.length > 60) preview = preview.slice(0, 60) + '…';
      item.innerHTML = '<span class="clip-text"></span><button class="clip-del" title="删除">✕</button>';
      item.querySelector('.clip-text').textContent = preview;
      item.querySelector('.clip-text').title = t.slice(0, 200);
      item.addEventListener('click', function (e) {
        if (e.target.classList.contains('clip-del')) {
          e.stopPropagation();
          var rest = getClips().filter(function (x) { return x !== t; });
          localStorage.setItem(CLIP_KEY, JSON.stringify(rest));
          renderClipList();
          return;
        }
        // 插入到光标处
        if (cm.getSelection()) cm.replaceSelection(t);
        else cm.replaceRange(t, cm.getCursor());
        $('clip-modal').style.display = 'none';
        toast('已插入剪贴板内容 ✓', 'success');
      });
      els.clipList.appendChild(item);
    });
  }
