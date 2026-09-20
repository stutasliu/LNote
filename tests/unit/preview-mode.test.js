/* =========================================================
 * preview-mode.test.js —— 预览显示方式判定纯函数单元测试（Vitest）
 * 背景：文档预览新增「预览显示方式」设置项；默认「全窗口」，
 * 「左右分栏」为原样式。previewDisplayMode 负责判定当前应显示
 * 哪种模式（full / split / none）。
 * ========================================================= */
import { describe, it, expect, beforeAll } from 'vitest';
import vm from 'node:vm';
import { extractFns } from '../helpers/extract-fn.js';

let P = null;

beforeAll(() => {
  const code = extractFns('10-status-preview', ['previewDisplayMode']);
  const ctx = vm.createContext({});
  vm.runInContext(code + '\nthis.__P = { previewDisplayMode };', ctx);
  P = ctx.__P;
});

describe('previewDisplayMode（预览显示方式判定）', () => {
  it('预览关闭 → none', () => {
    expect(P.previewDisplayMode(false, 'markdown', false)).toBe('none');
    expect(P.previewDisplayMode(false, 'html', true)).toBe('none');
  });

  it('不支持预览的语言 / 无文档 → none', () => {
    expect(P.previewDisplayMode(true, 'plaintext', false)).toBe('none');
    expect(P.previewDisplayMode(true, null, false)).toBe('none');
  });

  it('默认（未开启分栏设置）→ 全窗口 full', () => {
    expect(P.previewDisplayMode(true, 'markdown', false)).toBe('full');
    expect(P.previewDisplayMode(true, 'html', false)).toBe('full');
    expect(P.previewDisplayMode(true, 'mermaid', false)).toBe('full');
  });

  it('开启分栏设置 → 保持左右分栏 split', () => {
    expect(P.previewDisplayMode(true, 'markdown', true)).toBe('split');
    expect(P.previewDisplayMode(true, 'html', true)).toBe('split');
    expect(P.previewDisplayMode(true, 'mermaid', true)).toBe('split');
  });
});
