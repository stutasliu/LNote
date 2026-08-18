/* =========================================================
 * reveal-folder.test.js —— 「打开所在文件夹」路径判定纯函数单元测试（Vitest）
 * 背景：文档功能列表新增「打开所在文件夹」；revealTarget 判定
 * 当前文档能否在系统文件管理器中定位（需关联磁盘文件）。
 * ========================================================= */
import { describe, it, expect, beforeAll } from 'vitest';
import vm from 'node:vm';
import { extractFns } from '../helpers/extract-fn.js';

let H = null;

beforeAll(() => {
  const code = extractFns('16-doc-ops', ['revealTarget']);
  const ctx = vm.createContext({});
  vm.runInContext(code + '\nthis.__H = { revealTarget };', ctx);
  H = ctx.__H;
});

describe('revealTarget（打开所在文件夹 - 路径判定）', () => {
  it('null / undefined 文档 → 提示先打开文档', () => {
    expect(H.revealTarget(null)).toEqual({ path: null, error: '请先打开一个文档' });
    expect(H.revealTarget(undefined)).toEqual({ path: null, error: '请先打开一个文档' });
  });

  it('无 diskPath（应用本地文档）→ 提示未关联磁盘文件', () => {
    expect(H.revealTarget({ id: 'a', title: '本地笔记' })).toEqual({
      path: null,
      error: '该文档保存在应用本地，未关联磁盘文件'
    });
  });

  it('空 diskPath 视为本地文档', () => {
    expect(H.revealTarget({ id: 'a', diskPath: '' })).toEqual({
      path: null,
      error: '该文档保存在应用本地，未关联磁盘文件'
    });
  });

  it('有 diskPath 的磁盘文档 → 返回真实路径', () => {
    const p = 'D:/Notes/InkpadRich/abc.md';
    expect(H.revealTarget({ id: 'a', diskPath: p })).toEqual({ path: p, error: null });
  });
});
