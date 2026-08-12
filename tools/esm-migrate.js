/* =========================================================
 * esm-migrate.js —— 真实 ESM 迁移工具
 *
 * 把 src-app/*.js 从「同一 IIFE 闭包的片段」原地改写为真实
 * ES Modules：
 *   1. 词法提取每个文件的顶层绑定（= 导出候选）与外部引用（= 导入候选）
 *   2. 文件头插入 import { ... } from './xx.js'，文件尾追加 export { ... }
 *   3. esbuild 以 20-craft-init.js 为入口打包为 IIFE -> js/app.js
 *
 * 前置：共享可变变量已收拢进 state（tools/esm-state-refactor.js
 * + 各声明点手改），ESM import 只读约束已满足。循环依赖保留
 * （ESM 规范支持，esbuild 以提升变量处理）。
 *
 * 用法：
 *   node tools/esm-migrate.js           生成 import/export 并打包
 *   node tools/esm-migrate.js --reset   剥离旧 [esm] 头重新生成并打包
 *   node tools/esm-migrate.js --build   仅打包（不重新生成）
 * ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const { scan } = require('./lib-lex');

const ROOT = path.join(__dirname, '..');
const PARTS_DIR = path.join(ROOT, 'src-app');
const APP_JS = path.join(ROOT, 'js', 'app.js');
const BAK_IIFE = path.join(ROOT, 'js', 'app.js.iife.bak');

/* ---------- 构建 import/export 图 ---------- */
function buildGraph() {
  const files = fs.readdirSync(PARTS_DIR).filter((f) => f.endsWith('.js')).sort();
  const data = {};
  for (const f of files) {
    data[f] = scan(fs.readFileSync(path.join(PARTS_DIR, f), 'utf8'));
  }
  const defMap = new Map();
  for (const [f, d] of Object.entries(data)) {
    for (const b of d.bindings) {
      if (defMap.has(b)) defMap.get(b).push(f);
      else defMap.set(b, [f]);
    }
  }
  const multiDef = [...defMap.entries()].filter(([, v]) => v.length > 1);
  if (multiDef.length) {
    console.warn('[warn] 多定义绑定（需人工确认，可能是词法误判）:');
    for (const [b, v] of multiDef) console.warn('  ' + b + ' -> ' + v.join(', '));
  }
  const importsFor = {};
  for (const [f, d] of Object.entries(data)) {
    const map = new Map();
    for (const b of d.refs) {
      const defs = defMap.get(b);
      if (!defs) continue;
      for (const m of defs) {
        if (m === f) continue;
        if (!map.has(m)) map.set(m, new Set());
        map.get(m).add(b);
      }
    }
    importsFor[f] = map;
  }
  return { files, data, importsFor };
}

/* ---------- 剥离旧的 [esm] 头部（--reset） ---------- */
function stripEsmHeader(src) {
  if (!src.startsWith('/* [esm]')) return src;
  const lines = src.split('\n');
  let i = 0;
  // 跳过：注释块、export { ... };、import ... 行
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t.startsWith('/* [esm]') || t === '*/' || t.startsWith('export {') || t.startsWith('import ')) { i++; continue; }
    break;
  }
  return lines.slice(i).join('\n');
}

/* ---------- 生成 import/export 头 ---------- */
function generate(files, data, importsFor, reset) {
  const partMark = /^\/\/ @part .*/;
  for (const f of files) {
    const file = path.join(PARTS_DIR, f);
    let src = fs.readFileSync(file, 'utf8');
    if (!reset && src.includes('/* [esm]')) {
      console.log('[esm] 跳过（已迁移）: ' + f);
      continue;
    }
    src = stripEsmHeader(src);
    const lines = src.split('\n');
    let body = lines[0] && partMark.test(lines[0]) ? lines.slice(1).join('\n') : src;
    body = body.replace(/\n+$/, '') + '\n';

    const binds = data[f].bindings;
    let head = '';
    if (binds.length) head += '/* [esm] 导出本模块顶层绑定 */\nexport { ' + binds.join(', ') + ' };\n';
    const imp = importsFor[f];
    if (imp.size) {
      head += '/* [esm] 导入依赖模块绑定 */\n';
      for (const [m, names] of [...imp.entries()].sort()) {
        head += "import { " + [...names].sort().join(', ') + " } from './" + m + "';\n";
      }
    }
    fs.writeFileSync(file, head + body);
    console.log('[esm] ' + f + ': export ' + binds.length + ', import ' + [...imp.values()].reduce((a, s) => a + s.size, 0));
  }
}

/* ---------- esbuild 打包为 IIFE（file:// 兼容产物） ---------- */
function bundle() {
  if (!fs.existsSync(BAK_IIFE)) fs.copyFileSync(APP_JS, BAK_IIFE);
  const esbuild = require('esbuild');
  const result = esbuild.buildSync({
    entryPoints: [path.join(PARTS_DIR, '20-craft-init.js')],
    bundle: true,
    format: 'iife',
    minify: false,
    target: 'es2017',
    treeShaking: false,
    outfile: APP_JS,
    logLevel: 'warning'
  });
  if (result.errors.length) {
    console.error('[esm] 打包失败：' + result.errors.length + ' 个错误');
    for (const e of result.errors) console.error('  ' + (e.location ? e.location.file + ':' + e.location.line : '') + ' ' + e.text);
    process.exit(1);
  }
  console.log('[esm] 已打包 js/app.js（IIFE，' + fs.statSync(APP_JS).size + ' B）');
}

const arg = process.argv[2] || '';
if (arg === '--build') {
  bundle();
} else {
  const reset = arg === '--reset';
  const { files, data, importsFor } = buildGraph();
  generate(files, data, importsFor, reset);
  bundle();
}
