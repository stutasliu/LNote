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

console.log('[build-vendor] 已生成 js/vendor-bundle.js');
if (result.metafile) console.log('[build-vendor] bytes:', result.metafile.outputs && result.metafile.outputs[path.join(ROOT, 'js', 'vendor-bundle.js')]);
