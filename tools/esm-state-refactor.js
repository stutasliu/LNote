#!/usr/bin/env node
/* =========================================================
 * esm-state-refactor.js —— 真实 ESM 迁移：共享可变变量收拢进 state
 *
 * 背景：ESM 的 import 绑定只读，而原「同闭包」代码有 7 个跨模块
 * 赋值的共享变量（saveTimer/renderTimer/mermaidSeq/frMarks/
 * frHlTimer/frHlRunning/frHlToken）。本脚本把所有使用点的裸标识符
 * 词法安全替换为 state.*（声明点已在 01-core / 18-bootstrap 手改）。
 *
 * 安全性（同 refactor-rename.js）：
 *   跳过字符串/注释/正则字面量/模板；跳过属性访问与对象字面量键。
 *
 * 用法：node tools/esm-state-refactor.js [--dry-run]
 * ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PARTS_DIR = path.join(ROOT, 'src-app');

const MAPPING = {
  saveTimer: 'state.saveTimer',
  renderTimer: 'state.renderTimer',
  mermaidSeq: 'state.mermaidSeq',
  frMarks: 'state.frMarks',
  frHlTimer: 'state.frHlTimer',
  frHlRunning: 'state.frHlRunning',
  frHlToken: 'state.frHlToken',
  zoomLevel: 'state.zoomLevel',
  imgZoom: 'state.imgZoom',
  imgPanX: 'state.imgPanX',
  imgPanY: 'state.imgPanY',
  imgDragging: 'state.imgDragging',
  imgLastX: 'state.imgLastX',
  imgLastY: 'state.imgLastY'
};

const isWordStart = (c) => /[A-Za-z_$]/.test(c);
const isWord = (c) => /[A-Za-z0-9_$]/.test(c);
const isBlank = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

function prevNonBlank(str) {
  for (let k = str.length - 1; k >= 0; k--) {
    if (!isBlank(str[k])) return str[k];
  }
  return '';
}

function refactor(src) {
  let out = '';
  let replaced = 0;
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      let j = src.indexOf('\n', i);
      if (j < 0) j = n;
      out += src.slice(i, j); i = j;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2);
      const end = j < 0 ? n : j + 2;
      out += src.slice(i, end); i = end;
      continue;
    }
    if (c === '/' && !/[0-9)\]}\x27"_$A-Za-z]/.test(prevNonBlank(out))) {
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) { j++; break; }
        j++;
      }
      while (j < n && /[a-z]/i.test(src[j])) j++;
      out += src.slice(i, j); i = j;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === q) { j++; break; }
        j++;
      }
      out += src.slice(i, j); i = j;
      continue;
    }
    if (isWordStart(c)) {
      let j = i + 1;
      while (j < n && isWord(src[j])) j++;
      const word = src.slice(i, j);
      if (Object.prototype.hasOwnProperty.call(MAPPING, word)) {
        let prev = '';
        for (let k = out.length - 1; k >= 0; k--) {
          if (!isBlank(out[k])) { prev = out[k]; break; }
        }
        let k2 = j;
        while (k2 < n && isBlank(src[k2])) k2++;
        const next = k2 < n ? src[k2] : '';
        if (prev !== '.' && next !== ':') {
          out += MAPPING[word];
          replaced++;
          i = j;
          continue;
        }
      }
      out += word; i = j;
      continue;
    }
    out += c; i++;
  }
  return { out, replaced };
}

const dryRun = process.argv[2] === '--dry-run';
let total = 0;

for (const f of fs.readdirSync(PARTS_DIR).filter((x) => x.endsWith('.js'))) {
  const file = path.join(PARTS_DIR, f);
  const src = fs.readFileSync(file, 'utf8');
  const { out, replaced } = refactor(src);
  total += replaced;
  if (replaced > 0) {
    if (dryRun) {
      console.log('[dry-run] ' + f + ': ' + replaced + ' 处将替换');
    } else {
      fs.writeFileSync(file, out);
      console.log('[refactor] ' + f + ': ' + replaced + ' 处已替换');
    }
  }
}
console.log(dryRun ? '[dry-run] 合计 ' + total + ' 处（未写文件）' : '[refactor] 合计替换 ' + total + ' 处');
