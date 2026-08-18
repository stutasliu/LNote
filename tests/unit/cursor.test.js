/* =========================================================
 * cursor.test.js —— 光标位置记忆纯函数单元测试（Vitest）
 * ========================================================= */
import { describe, it, expect, beforeAll } from 'vitest';
import vm from 'node:vm';
import { extractFns } from '../helpers/extract-fn.js';

let T = null;

beforeAll(() => {
  const code = extractFns('05-store', ['saveCursorPos', 'loadCursorPos', 'clampCursorPos']);
  const store = {};
  const localStorageMock = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i] || null,
    get length() { return Object.keys(store).length; }
  };
  const ctx = vm.createContext({ JSON, Math, String, Number, Object, Array, console, localStorage: localStorageMock });
  vm.runInContext(code + '\nthis.__T = { saveCursorPos, loadCursorPos, clampCursorPos };', ctx);
  T = ctx.__T;
  T._store = store;
  T._ls = localStorageMock;
});

describe('saveCursorPos / loadCursorPos', () => {
  it('保存后可读回相同位置', () => {
    T.saveCursorPos('d1', { line: 3, ch: 5 });
    expect(T.loadCursorPos('d1')).toEqual({ line: 3, ch: 5 });
  });

  it('未保存 / 无 id → null', () => {
    expect(T.loadCursorPos('d-nope')).toBeNull();
    expect(T.loadCursorPos(null)).toBeNull();
    expect(T.loadCursorPos('')).toBeNull();
  });

  it('损坏的 JSON → null（不抛错）', () => {
    T._ls.setItem('inkpad.cursor.d-bad', '{oops');
    expect(T.loadCursorPos('d-bad')).toBeNull();
  });

  it('缺少 line/ch 字段 → null', () => {
    T._ls.setItem('inkpad.cursor.d-bad2', '{"line":"x"}');
    expect(T.loadCursorPos('d-bad2')).toBeNull();
  });

  it('小数坐标会被取整', () => {
    T.saveCursorPos('d1', { line: 1.9, ch: 2.7 });
    expect(T.loadCursorPos('d1')).toEqual({ line: 1, ch: 2 });
  });

  it('line/ch 为 0 也能正常保存', () => {
    T.saveCursorPos('d2', { line: 0, ch: 0 });
    expect(T.loadCursorPos('d2')).toEqual({ line: 0, ch: 0 });
  });

  it('pos 为空时静默跳过', () => {
    expect(T.saveCursorPos('d3', null)).toBeUndefined();
    expect(T.loadCursorPos('d3')).toBeNull();
  });
});

describe('clampCursorPos', () => {
  const text = 'line0\nline1\nline2\nline3';

  it('正常位置原样返回', () => {
    expect(T.clampCursorPos({ line: 2, ch: 3 }, text)).toEqual({ line: 2, ch: 3 });
  });

  it('行号超出文档 → 钳到末行', () => {
    expect(T.clampCursorPos({ line: 99, ch: 3 }, text)).toEqual({ line: 3, ch: 3 });
  });

  it('列号超出该行 → 钳到行尾', () => {
    expect(T.clampCursorPos({ line: 1, ch: 999 }, text)).toEqual({ line: 1, ch: 5 });
  });

  it('负数 → 钳到 0', () => {
    expect(T.clampCursorPos({ line: -2, ch: -1 }, text)).toEqual({ line: 0, ch: 0 });
  });

  it('空文档 → 0,0', () => {
    expect(T.clampCursorPos({ line: 5, ch: 5 }, '')).toEqual({ line: 0, ch: 0 });
  });

  it('null → null', () => {
    expect(T.clampCursorPos(null, text)).toBeNull();
  });

  it('text 为 null → 空文档处理', () => {
    expect(T.clampCursorPos({ line: 3, ch: 2 }, null)).toEqual({ line: 0, ch: 0 });
  });
});
