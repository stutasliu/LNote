/* =========================================================
 * analyze-deps.js —— ESM 迁移后的模块依赖分析（基于 lib-lex）
 *
 * 输出每个模块的顶层绑定数、引用数、外部依赖矩阵与强连通分量
 * （循环依赖群）。用于验证迁移结果与规划后续拆分。
 *
 * 用法：node tools/analyze-deps.js
 * ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const { scan } = require('./lib-lex');

const ROOT = path.join(__dirname, '..');
const PARTS_DIR = path.join(ROOT, 'src-app');

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

const deps = {};
for (const [f, d] of Object.entries(data)) {
  const from = new Map();
  for (const b of d.refs) {
    const defs = defMap.get(b);
    if (!defs) continue;
    for (const m of defs) {
      if (m === f) continue;
      if (!from.has(m)) from.set(m, new Set());
      from.get(m).add(b);
    }
  }
  deps[f] = from;
}

console.log('=== 每个模块：顶层绑定 / 引用 / 外部依赖模块数 ===');
for (const f of files) {
  console.log(
    f.padEnd(26),
    String(data[f].bindings.length).padStart(3), 'bindings',
    String(data[f].refs.length).padStart(4), 'refs',
    String(deps[f].size).padStart(3), 'dep-modules'
  );
}

// 强连通分量（Tarjan）
const names = files.map((f) => f.replace('.js', ''));
const idx = new Map(names.map((n, i) => [n, i]));
const adj = names.map(() => new Set());
for (const [f, from] of Object.entries(deps)) {
  const fi = idx.get(f.replace('.js', ''));
  for (const m of from.keys()) adj[fi].add(idx.get(m.replace('.js', '')));
}
let counter = 0;
const dfn = new Array(names.length).fill(-1);
const low = new Array(names.length).fill(0);
const stack = [];
const onStack = new Array(names.length).fill(false);
const sccs = [];
function tarjan(v) {
  dfn[v] = low[v] = ++counter;
  stack.push(v); onStack[v] = true;
  for (const w of adj[v]) {
    if (dfn[w] === -1) { tarjan(w); low[v] = Math.min(low[v], low[w]); }
    else if (onStack[w]) low[v] = Math.min(low[v], dfn[w]);
  }
  if (low[v] === dfn[v]) {
    const comp = [];
    while (true) {
      const x = stack.pop(); onStack[x] = false; comp.push(names[x]);
      if (x === v) break;
    }
    sccs.push(comp.sort());
  }
}
for (let v = 0; v < names.length; v++) if (dfn[v] === -1) tarjan(v);

console.log('\n=== 强连通分量（循环依赖群） ===');
const cyc = sccs.filter((c) => c.length > 1);
if (cyc.length === 0) console.log('无循环依赖（所有分量均为单点）');
for (const c of cyc.sort((a, b) => a.length - b.length)) {
  console.log('[' + c.join(', ') + ']  ' + c.length + ' 个模块成环');
}

const totalBindings = new Set();
for (const d of Object.values(data)) for (const b of d.bindings) totalBindings.add(b);
let crossRef = 0;
for (const d of Object.values(deps)) for (const s of d.values()) crossRef += s.size;
console.log('\n=== 汇总 ===');
console.log('顶层绑定总数（去重）:', totalBindings.size);
console.log('跨模块引用总数:', crossRef);
