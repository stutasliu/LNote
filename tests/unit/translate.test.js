/* =========================================================
 * translate.test.js —— 翻译功能纯函数单元测试（Vitest）
 * ========================================================= */
import { describe, it, expect, beforeAll } from 'vitest';
import vm from 'node:vm';
import { extractFns } from '../helpers/extract-fn.js';

let T = null;

beforeAll(() => {
  const code = extractFns('22-translate', ['detectLang', 'targetFor', 'buildQuery']);
  const ctx = vm.createContext({ Math, String, Number, Object, Array, console });
  vm.runInContext(code + '\nthis.__T = { detectLang, targetFor, buildQuery };', ctx);
  T = ctx.__T;
});

describe('detectLang', () => {
  it('纯中文 → zh', () => {
    expect(T.detectLang('你好世界')).toBe('zh');
  });

  it('中英混合以中文为主 → zh', () => {
    expect(T.detectLang('世界你好 hi 这是一段中文')).toBe('zh');
  });

  it('纯英文 → en', () => {
    expect(T.detectLang('Hello world')).toBe('en');
  });

  it('英文为主的混合 → en', () => {
    expect(T.detectLang('Hello 世界 this is a very long english sentence')).toBe('en');
    expect(T.detectLang('你好 hello 世界 world')).toBe('en');
  });

  it('数字 / 符号 / 空 → en（不抛错）', () => {
    expect(T.detectLang('12345')).toBe('en');
    expect(T.detectLang('!!! ###')).toBe('en');
    expect(T.detectLang('')).toBe('en');
    expect(T.detectLang(null)).toBe('en');
    expect(T.detectLang(undefined)).toBe('en');
  });
});

describe('targetFor', () => {
  it('中文源 → 英文目标', () => {
    expect(T.targetFor('zh')).toBe('en');
  });

  it('其它源 → 中文目标', () => {
    expect(T.targetFor('en')).toBe('zh');
    expect(T.targetFor('ja')).toBe('zh');
    expect(T.targetFor('')).toBe('zh');
  });
});

describe('buildQuery', () => {
  it('去除首尾空白', () => {
    expect(T.buildQuery('  hello  ')).toBe('hello');
  });

  it('空 / null → 空串', () => {
    expect(T.buildQuery('')).toBe('');
    expect(T.buildQuery(null)).toBe('');
    expect(T.buildQuery('   ')).toBe('');
  });

  it('超过 1500 字符截断到 1500', () => {
    const long = 'a'.repeat(2000);
    const q = T.buildQuery(long);
    expect(q.length).toBe(1500);
    expect(q).toBe(long.slice(0, 1500));
  });

  it('恰好 1500 字符不截断', () => {
    const q = T.buildQuery('b'.repeat(1500));
    expect(q.length).toBe(1500);
  });
});
