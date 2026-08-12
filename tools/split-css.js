/* =========================================================
 * split-css.js —— Phase 5：style.css 按行分段拆分为三层
 *
 * 分段（1-based，含端点；保持原层叠顺序）：
 *   base.css       L1-47    token(:root) + reset + 基础布局
 *   layout.css     L49-436  侧边栏 / 主区域 / App Bar 布局容器
 *   components.css L438-末  工具栏 / 菜单 / 弹窗 / 预览 / 浮层等组件
 *
 * 说明：纯机械行切分，不重排任何规则，层叠顺序与原文件一致。
 * 用法：node tools/split-css.js
 * ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'css', 'style.css');
const OUT = path.join(ROOT, 'css');

const SEGMENTS = [
  { file: 'base.css', from: 1, to: 47, header: '/* ===== base.css —— token / reset / 基础（源：style.css L1-47） ===== */' },
  { file: 'layout.css', from: 49, to: 436, header: '/* ===== layout.css —— 页面布局容器：侧边栏 / 主区域 / App Bar（源：style.css L49-436） ===== */' },
  { file: 'components.css', from: 438, to: Infinity, header: '/* ===== components.css —— 组件：工具栏 / 菜单 / 弹窗 / 预览 / 浮层（源：style.css L438 起） ===== */' }
];

const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
const total = lines.length;

for (const seg of SEGMENTS) {
  const end = seg.to === Infinity ? total : seg.to;
  const slice = lines.slice(seg.from - 1, end);
  const content = seg.header + '\n\n' + slice.join('\n') + '\n';
  fs.writeFileSync(path.join(OUT, seg.file), content);
  console.log('[split-css] ' + seg.file + '  ' + slice.length + ' 行');
}
console.log('[split-css] 完成（style.css 共 ' + total + ' 行，全部覆盖）');
