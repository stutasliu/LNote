/* =========================================================
 * build-vendor.js —— 用 esbuild 把 npm 依赖打包为全局 IIFE
 *
 * 输出 js/vendor-bundle.js（替代原 vendor/*.js 的 35 个 script）。
 * 前端仍通过全局变量使用（CodeMirror/marked/mermaid/hljs/katex/diff），
 * 加载方式保持传统 script（兼容 file:// 打包）。
 *
 * 用法：node tools/build-vendor.js
 * ========================================================= */
'use strict';

const path = require('path');
const fs = require('fs');
const { buildSync } = require('esbuild');

const ROOT = path.join(__dirname, '..');

const result = buildSync({
  entryPoints: [path.join(ROOT, 'src-vendor', 'main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2017',
  outfile: path.join(ROOT, 'js', 'vendor-bundle.js'),
  logLevel: 'warning'
});

// mermaid 独立懒加载包：启动不加载，首次渲染图表时动态注入
buildSync({
  entryPoints: [path.join(ROOT, 'src-vendor', 'mermaid.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2017',
  outfile: path.join(ROOT, 'js', 'vendor-mermaid.js'),
  logLevel: 'warning'
});

// pdf.js 独立懒加载包：首次打开 PDF 时动态注入（避免拖慢启动）
buildSync({
  entryPoints: [path.join(ROOT, 'src-vendor', 'pdf.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2017',
  outfile: path.join(ROOT, 'js', 'vendor-pdf.js'),
  logLevel: 'warning'
});

// mammoth 独立懒加载包：首次打开 .doc/.docx 时动态注入（避免拖慢启动）
buildSync({
  entryPoints: [path.join(ROOT, 'src-vendor', 'doc.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2017',
  outfile: path.join(ROOT, 'js', 'vendor-doc.js'),
  logLevel: 'warning'
});

// pdf.js worker：以普通 <script> 注入，注册 window.pdfjsWorker →
// pdf.js 自动降级为主线程 fake worker（file:// 页面无法创建 Web Worker）
fs.copyFileSync(
  path.join(ROOT, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.js'),
  path.join(ROOT, 'js', 'pdf.worker.min.js')
);

// cmaps：中文 PDF（Adobe-GB1 等 CID 字体）离线渲染必需
const cmapDir = path.join(ROOT, 'js', 'cmaps');
fs.rmSync(cmapDir, { recursive: true, force: true });
fs.mkdirSync(cmapDir, { recursive: true });
fs.cpSync(path.join(ROOT, 'node_modules', 'pdfjs-dist', 'cmaps'), cmapDir, { recursive: true });

// standard_fonts：PDF 标准 14 字体离线回退（无系统字体依赖）
const sfdDir = path.join(ROOT, 'js', 'standard_fonts');
fs.rmSync(sfdDir, { recursive: true, force: true });
fs.mkdirSync(sfdDir, { recursive: true });
fs.cpSync(path.join(ROOT, 'node_modules', 'pdfjs-dist', 'standard_fonts'), sfdDir, { recursive: true });

console.log('[build-vendor] 已生成 js/vendor-bundle.js、js/vendor-mermaid.js、js/vendor-pdf.js、js/vendor-doc.js');
console.log('[build-vendor] 已拷贝 js/pdf.worker.min.js、js/cmaps/、js/standard_fonts/');
if (result.metafile) console.log('[build-vendor] bytes:', result.metafile.outputs && result.metafile.outputs[path.join(ROOT, 'js', 'vendor-bundle.js')]);
