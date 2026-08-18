/* =========================================================
 * paste-text.test.js —— 粘贴「文本优先」判定纯函数单元测试（Vitest）
 * 背景：Excel/WPS 复制选区时剪贴板同时含文本与图片，必须文本优先，
 * 否则内容会被误识别为图片插入。
 * ========================================================= */
import { describe, it, expect, beforeAll } from 'vitest';
import vm from 'node:vm';
import { extractFns } from '../helpers/extract-fn.js';

let H = null;

function makeCd(plain, html) {
  return { getData: (t) => (t === 'text/plain' ? plain : html) };
}

beforeAll(() => {
  const code = extractFns('17-events', ['hasClipboardText']);
  const ctx = vm.createContext({ String });
  vm.runInContext(code + '\nthis.__H = { hasClipboardText };', ctx);
  H = ctx.__H;
});

describe('hasClipboardText', () => {
  it('null / undefined → false', () => {
    expect(H.hasClipboardText(null)).toBe(false);
    expect(H.hasClipboardText(undefined)).toBe(false);
  });

  it('无 getData 的剪贴板 → false', () => {
    expect(H.hasClipboardText({ items: [] })).toBe(false);
    expect(H.hasClipboardText({})).toBe(false);
  });

  it('纯文本 → true', () => {
    expect(H.hasClipboardText(makeCd('hello world', ''))).toBe(true);
  });

  it('Excel 复制：Tab 分隔表格文本 → true（应粘贴文本而非图片）', () => {
    const excel = '姓名\t年龄\t城市\n张三\t28\t北京\n李四\t35\t上海';
    expect(H.hasClipboardText(makeCd(excel, ''))).toBe(true);
  });

  it('空文本 + HTML 富文本 → true', () => {
    expect(H.hasClipboardText(makeCd('', '<p>hello</p>'))).toBe(true);
  });

  it('空白文本 + 空 HTML → false（纯图片粘贴）', () => {
    expect(H.hasClipboardText(makeCd('', ''))).toBe(false);
    expect(H.hasClipboardText(makeCd('   ', ''))).toBe(false);
    expect(H.hasClipboardText(makeCd('', '   '))).toBe(false);
    expect(H.hasClipboardText(makeCd('\n\t', ''))).toBe(false);
  });

  it('getData 抛异常 → false（不崩溃，按纯图片处理）', () => {
    const bad = { getData: () => { throw new Error('denied'); } };
    expect(H.hasClipboardText(bad)).toBe(false);
  });
});
