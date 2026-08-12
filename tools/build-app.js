#!/usr/bin/env node
/* =========================================================
 * build-app.js —— Inkpad(L.Note) 前端源码构建脚本（真实 ESM）
 *
 * 背景：src-app/*.js 已是真实 ES Modules（显式 import/export），
 * 不再是「同 IIFE 闭包的片段」。本脚本用 esbuild 以
 * 20-craft-init.js 为入口打包为单个 IIFE -> js/app.js，
 * 保持传统 script 加载（file:// / pywebview 打包兼容）。
 *
 * 用法：
 *   node tools/build-app.js           打包 src-app -> js/app.js（IIFE）
 *   node tools/build-app.js --verify  打包并校验：无构建错误
 *
 * 历史：Phase 1 的拼接模式（--backup/--split/逐字 verify）已在
 * 真实 ESM 迁移后废弃；js/app.js.bak 保留为历史基准。
 * ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const PARTS_DIR = path.join(ROOT, 'src-app');
const APP_JS = path.join(ROOT, 'js', 'app.js');

function build() {
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
    console.error('[build] esbuild 构建失败：' + result.errors.length + ' 个错误');
    for (const e of result.errors) console.error('  ' + (e.location ? e.location.file + ':' + e.location.line : '') + ' ' + e.text);
    process.exit(1);
  }
  console.log('[build] 已打包生成 js/app.js（IIFE，' + fs.statSync(APP_JS).size + ' B）');
}

const arg = process.argv[2] || '--build';
switch (arg) {
  case '--build':
    build();
    break;
  case '--verify':
    build();
    console.log('[verify] 构建通过');
    break;
  default:
    console.error('用法：node tools/build-app.js [--build|--verify]');
    process.exit(1);
}
