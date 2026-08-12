#!/usr/bin/env node
/* =========================================================
 * refactor-rename.js —— Phase 2 状态收拢的词法安全替换脚本
 *
 * 把 src-app/*.js 中散落的裸标识符 docs / activeId / previewOn /
 * currentVisual 统一替换为 state.*（集中式状态对象）：
 *   docs          -> state.docs
 *   activeId      -> state.activeId
 *   previewOn     -> state.previewOn
 *   currentVisual -> state.currentVisual
 *
 * 安全性（词法扫描，非正则全局替换）：
 *   1. 跳过字符串字面量（'..." / 模板）与注释（//、/* *\/）—— 保护
 *      'inkpad.docs.v1' 等字符串与注释中的字样
 *   2. 跳过属性访问（前一非空白字符为 '.'）—— 保护 richOutline.activeId
 *   3. 跳过对象字面量键（后一非空白字符为 ':'）—— 保护 { activeId: null }
 *
 * 用法：node tools/refactor-rename.js [--dry-run]
 *   --dry-run 只统计不写文件
 * ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PARTS_DIR = path.join(ROOT, 'src-app');

const MAPPING = {
  docs: 'state.docs',
  activeId: 'state.activeId',
  previewOn: 'state.previewOn',
  currentVisual: 'state.currentVisual'
};

const isWordStart = (c) => /[A-Za-z_$]/.test(c);
const isWord = (c) => /[A-Za-z0-9_$]/.test(c);
const isBlank = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

/** 在已输出字符串中找前一个非空白字符 */
function prevNonBlank(str) {
  for (let k = str.length - 1; k >= 0; k--) {
    if (!isBlank(str[k])) return str[k];
  }
  return '';
}

/** 词法安全替换：返回 { out, replaced } */
function refactor(src) {
  let out = '';
  let replaced = 0;
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    // 行注释
    if (c === '/' && src[i + 1] === '/') {
      let j = src.indexOf('\n', i);
      if (j < 0) j = n;
      out += src.slice(i, j); i = j;
      continue;
    }
    // 块注释
    if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2);
      const end = j < 0 ? n : j + 2;
      out += src.slice(i, end); i = end;
      continue;
    }
    // 正则字面量（启发式）：前一非空白字符不是「操作数/字符串结尾」类字符
    // 时按正则解析，避免正则内的 " 误入字符串模式导致后续区域漏替换
    // （如 /[\\/:*?"<>|]/g 中的双引号）。
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
      while (j < n && /[a-z]/i.test(src[j])) j++; // flags
      out += src.slice(i, j); i = j;
      continue;
    }
    // 字符串 / 模板
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
    // 标识符
    if (isWordStart(c)) {
      let j = i + 1;
      while (j < n && isWord(src[j])) j++;
      const word = src.slice(i, j);
      if (Object.prototype.hasOwnProperty.call(MAPPING, word)) {
        // 前一非空白字符（在已输出缓冲中往前找）
        let prev = '';
        for (let k = out.length - 1; k >= 0; k--) {
          if (!isBlank(out[k])) { prev = out[k]; break; }
        }
        // 后一非空白字符
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
