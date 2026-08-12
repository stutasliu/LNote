/* =========================================================
 * lib-lex.js —— 词法扫描共享库（真实 ESM 迁移工具共用）
 *
 * 提供：
 *   KEYWORDS    JS 关键字集合
 *   scan(src)   提取顶层绑定 / 标识符引用
 *
 * 扫描跳过字符串字面量、模板、行/块注释、正则字面量（启发式），
 * 并正确追踪括号深度。var/let/const 声明支持连写初始化
 * （var a = 1, b = f(1,2), c = 'x', ...，含解构与正则初值）。
 * ========================================================= */
'use strict';

const KEYWORDS = new Set(
  ('var let const function return if else for while do switch case default break continue new typeof instanceof in of try catch finally throw this null true false undefined delete void class extends super export import default async await yield static get set')
    .split(' ')
);

const isWordStart = (c) => /[A-Za-z_$]/.test(c);
const isWord = (c) => /[A-Za-z0-9_$]/.test(c);
const isBlank = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

/** 在 src 的 pos 处跳过一段「字符串/模板/正则/注释」，返回结束位置；非特殊字符返回 pos */
function skipToken(src, pos) {
  const c = src[pos];
  const n = src.length;
  if (c === '/' && src[pos + 1] === '/') {
    let j = src.indexOf('\n', pos); return j < 0 ? n : j;
  }
  if (c === '/' && src[pos + 1] === '*') {
    const j = src.indexOf('*/', pos + 2);
    return j < 0 ? n : j + 2;
  }
  if (c === "'" || c === '"' || c === '`') {
    const q = c;
    let j = pos + 1;
    while (j < n) {
      if (src[j] === '\\') { j += 2; continue; }
      if (src[j] === q) { j++; break; }
      j++;
    }
    return j;
  }
  return pos;
}

/**
 * 提取一个文件的顶层绑定与引用。
 * @returns {{ bindings: string[], refs: string[] }}
 *  bindings 为顶层绑定名（function/class/var/let/const 声明）；
 *  refs 为全部标识符引用（已去关键字、属性访问、对象字面量键）。
 */
function scan(src) {
  const bindings = new Map();
  const refs = new Set();
  const n = src.length;
  let i = 0;
  let depth = 0;
  let prevSignificant = '';
  const addRef = (w) => { if (!KEYWORDS.has(w)) refs.add(w); };

  while (i < n) {
    const c = src[i];
    // 行注释 / 块注释 / 字符串 / 模板 / 正则（启发式）
    if (c === '/' && src[i + 1] === '/') {
      const j = src.indexOf('\n', i);
      prevSignificant = ''; i = j < 0 ? n : j; continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2);
      prevSignificant = ''; i = j < 0 ? n : j + 2; continue;
    }
    if (c === '/' && !/[0-9)\]}\x27"_$A-Za-z]/.test(prevSignificant)) {
      let j = i + 1; let inClass = false;
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) { j++; break; }
        j++;
      }
      while (j < n && /[a-z]/i.test(src[j])) j++;
      prevSignificant = 'x'; i = j; continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      i = skipToken(src, i);
      prevSignificant = 'x'; continue;
    }
    if (c === '{') { depth++; i++; continue; }
    if (c === '}') { depth = Math.max(0, depth - 1); i++; continue; }
    if (isWordStart(c)) {
      let j = i + 1;
      while (j < n && isWord(src[j])) j++;
      const word = src.slice(i, j);
      const nextChar = (j < n && !isBlank(src[j])) ? src[j] : null;

      // 属性访问 foo.bar -> bar 不引用；对象字面量键 { foo: 1 } -> foo 不引用
      if (prevSignificant !== '.') {
        const isObjKey = (nextChar === ':' && prevSignificant !== ')');
        if (!isObjKey) addRef(word);
      }

      if (depth === 0) {
        if (word === 'function' || word === 'class' || word === 'async') {
          let k = j;
          if (word === 'async') {
            while (k < n && isBlank(src[k])) k++;
            if (src.slice(k, k + 8) === 'function') {
              k += 8;
              while (k < n && isBlank(src[k])) k++;
            } else { i = j; continue; }
          }
          while (k < n && isBlank(src[k])) k++;
          const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(src.slice(k));
          if (m) bindings.set(m[0], { kind: word === 'class' ? 'class' : 'fn', depth: 0 });
        } else if (word === 'var' || word === 'let' || word === 'const') {
          let k = j;
          const names = [];
          while (true) {
            while (k < n && isBlank(src[k])) k++;
            if (src[k] === '{' || src[k] === '[') {
              // 解构：粗略提取内部标识符（{ a, b } / [a, b] / { a: b }）
              let k2 = k + 1; let innerDepth = 1;
              while (k2 < n && innerDepth > 0) {
                const ch = src[k2];
                if (ch === '{' || ch === '[') innerDepth++;
                else if (ch === '}' || ch === ']') innerDepth--;
                else if (isWordStart(ch)) {
                  const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(src.slice(k2));
                  if (m && !src[k2 - 1].match(/[.:]/)) names.push(m[0]);
                  k2 += m[0].length; continue;
                }
                k2++;
              }
              k = k2;
            } else if (isWordStart(src[k])) {
              const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(src.slice(k));
              names.push(m[0]);
              k += m[0].length;
            } else break;
            // 跳过初始化表达式（直到顶层 ',' 或 ';'），支持 var a = 1, b = f(1,2)
            let pd = 0; // 括号深度（保护 f(1,2) 内的逗号）
            while (k < n) {
              const ch = src[k];
              if (ch === ',' && pd === 0) { k++; break; }
              if (ch === ';') { k++; pd = -1; break; }
              if (ch === '{' || ch === '(' || ch === '[') pd++;
              else if (ch === '}' || ch === ')' || ch === ']') pd = Math.max(0, pd - 1);
              else if (ch === '/' || ch === "'" || ch === '"' || ch === '`') {
                const t = skipToken(src, k);
                if (t > k) { k = t; continue; }
                // 正则（非除号场景）：跳过到关闭斜杠
                if (ch === '/') {
                  let k2 = k + 1; let inClass = false;
                  while (k2 < n) {
                    const ch2 = src[k2];
                    if (ch2 === '\\') { k2 += 2; continue; }
                    if (ch2 === '[') inClass = true;
                    else if (ch2 === ']') inClass = false;
                    else if (ch2 === '/' && !inClass) { k2++; break; }
                    k2++;
                  }
                  while (k2 < n && /[a-z]/i.test(src[k2])) k2++;
                  k = k2; continue;
                }
              }
              k++;
            }
            if (pd === -1) break; // 语句结束
            // 若下一个声明又是标识符（var a = 1, b = 2 的 b），继续循环
            let kk = k;
            while (kk < n && isBlank(src[kk])) kk++;
            if (kk < n && isWordStart(src[kk])) continue;
            break;
          }
          for (const nm of names) bindings.set(nm, { kind: 'var', depth: 0 });
        }
      }

      prevSignificant = word; i = j; continue;
    }
    if (!isBlank(c)) prevSignificant = c;
    i++;
  }
  return { bindings: [...bindings.keys()], refs: [...refs] };
}

module.exports = { KEYWORDS, scan };
