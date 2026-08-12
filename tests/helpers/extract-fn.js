/* =========================================================
 * extract-fn.js —— 从 src-app/*.js（同闭包片段）提取顶层纯函数
 *
 * 背景：src-app 是 IIFE 内代码片段（非 ESM），无法直接 import。
 * 为对纯函数做单元测试，这里按「函数名 + 花括号配对」从源文件
 * 提取函数定义源码，交由测试用 vm 执行（函数声明 hoisted，
 * 不依赖闭包外部变量即可独立测试）。提取过程中跳过字符串、
 * 注释、正则字面量，避免其中的 {} 干扰配对。
 * ========================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function readPart(name) {
  return fs.readFileSync(path.join(ROOT, 'src-app', name + '.js'), 'utf8');
}

function isBlank(c) {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r';
}

/** 从 source 中提取顶层函数 `function <name>(...) { ... }` 的源码 */
export function extractFn(source, fnName) {
  const re = new RegExp('^  function ' + fnName + '\\s*\\(', 'm');
  const match = re.exec(source);
  if (!match) throw new Error('函数未找到: ' + fnName);
  const start = match.index;

  // 定位函数体起始 {（参数中可能含字符串，但函数名匹配处即声明起点，
  // 从声明起点线性扫描到 { 前的 ') { ' 即可）
  let open = -1;
  {
    let i = match.index + match[0].length;
    let inStr = null;
    for (; i < source.length; i++) {
      const c = source[i];
      if (inStr) {
        if (c === '\\') { i++; continue; }
        if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
      if (c === '{') { open = i; break; }
    }
  }
  if (open < 0) throw new Error('函数无函数体: ' + fnName);

  // 从 { 开始 brace 配对（词法感知：跳过字符串/注释/正则）
  let depth = 0;
  let inStr = null;
  let end = source.length;
  for (let j = open; j < source.length; j++) {
    const c = source[j];
    if (inStr) {
      if (c === '\\') { j++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '/') {
      if (source[j + 1] === '/') { // 行注释
        const k = source.indexOf('\n', j);
        j = k < 0 ? source.length : k;
        continue;
      }
      if (source[j + 1] === '*') { // 块注释
        const k = source.indexOf('*/', j + 2);
        j = k < 0 ? source.length : k + 1;
        continue;
      }
      // 正则字面量（启发式：前一个非空白字符不像是除法操作数）
      let prev = '';
      for (let k = j - 1; k >= 0; k--) {
        if (!isBlank(source[k])) { prev = source[k]; break; }
      }
      if (!/[0-9)\]}\x27"_$A-Za-z]/.test(prev)) {
        let k = j + 1;
        let inClass = false;
        while (k < source.length) {
          const ch = source[k];
          if (ch === '\\') { k += 2; continue; }
          if (ch === '[') inClass = true;
          else if (ch === ']') inClass = false;
          else if (ch === '/' && !inClass) { k++; break; }
          k++;
        }
        while (k < source.length && /[a-z]/i.test(source[k])) k++;
        j = k - 1;
        continue;
      }
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { end = j + 1; break; }
    }
  }
  return source.slice(start, end);
}

/** 提取多个纯函数并返回可执行的源码块 */
export function extractFns(partName, fnNames) {
  const src = readPart(partName);
  return fnNames.map((n) => extractFn(src, n)).join('\n');
}
