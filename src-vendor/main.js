/* =========================================================
 * src-vendor/main.js —— npm 依赖打包入口
 *
 * 把原本 vendor/ 下的全局脚本库改为 npm 依赖，用 esbuild
 * 打包为单个 IIFE（js/vendor-bundle.js），保持全局变量名不变：
 *   CodeMirror / marked / mermaid / hljs / katex / diff
 * 前端（app.js / md.js / block-editor.js / compare.html）无需改动。
 * ========================================================= */

/* ---------- CodeMirror 5（主库 + addon + mode，注册到全局） ---------- */
import CodeMirror from 'codemirror';
// addon（npm codemirror@5 的目录结构与 vendor 不同，按实际路径导入）
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/edit/matchbrackets';
import 'codemirror/addon/edit/closetag';
import 'codemirror/addon/selection/active-line';
import 'codemirror/addon/dialog/dialog';
import 'codemirror/addon/search/search';
import 'codemirror/addon/search/searchcursor';
import 'codemirror/addon/search/match-highlighter';
import 'codemirror/addon/search/jump-to-line';
import 'codemirror/addon/fold/foldcode';
import 'codemirror/addon/fold/foldgutter';
import 'codemirror/addon/fold/brace-fold';
import 'codemirror/addon/fold/xml-fold';
import 'codemirror/addon/fold/indent-fold';
import 'codemirror/addon/fold/comment-fold';
import 'codemirror/addon/fold/markdown-fold';
import 'codemirror/addon/hint/show-hint';
import 'codemirror/addon/hint/anyword-hint';
import 'codemirror/addon/edit/continuelist';
// mode
import 'codemirror/mode/xml/xml';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/css/css';
import 'codemirror/mode/htmlmixed/htmlmixed';
import 'codemirror/mode/markdown/markdown';
import 'codemirror/mode/python/python';
import 'codemirror/mode/sql/sql';
import 'codemirror/mode/shell/shell';
import 'codemirror/mode/yaml/yaml';
import 'codemirror/mode/clike/clike';
window.CodeMirror = CodeMirror;

/* ---------- marked（Markdown 解析） ---------- */
import { marked } from 'marked';
window.marked = marked;

/* ---------- mermaid（图表）已拆分为 vendor-mermaid.js，按需懒加载 ----------
 * 启动不再同步加载 mermaid（约 2.5MB），首次渲染图表时由
 * window.__mermaidReady(cb) 动态注入 vendor-mermaid.js。 */

/* ---------- highlight.js（代码高亮） ---------- */
import hljs from 'highlight.js';
window.hljs = hljs;

/* ---------- KaTeX（数学公式） ---------- */
import katex from 'katex';
window.katex = katex;

/* ---------- diff（文件比较，compare.html 使用 window.Diff） ---------- */
import * as diff from 'diff';
window.Diff = diff; // compare.html 原有全局名
window.diff = diff;
