/* =========================================================
 * paste-autoformat.test.js —— 粘贴自动识别 JSON / XML 纯函数单元测试（Vitest）
 * 背景：v1.0.4 新增「粘贴时自动识别并序列化 JSON / XML」，
 * 识别与序列化逻辑（isBalancedXml / autoFormatPasted）放在
 * 11-format-tools.js 以便独立执行；非目标类型必须原样返回，
 * 由调用方走默认粘贴。
 * ========================================================= */
import { describe, it, expect, beforeAll } from 'vitest';
import vm from 'node:vm';
import { extractFns } from '../helpers/extract-fn.js';

let H = null;

beforeAll(() => {
  const code = extractFns('11-format-tools', ['isBalancedXml', 'autoFormatPasted', 'isWholeJson', 'prettyXML']);
  const ctx = vm.createContext({ String, JSON, Math });
  vm.runInContext(code + '\nthis.__H = { isBalancedXml, autoFormatPasted };', ctx);
  H = ctx.__H;
});

describe('isBalancedXml', () => {
  it('单个成对根元素 → true', () => {
    expect(H.isBalancedXml('<root><a>1</a></root>')).toBe(true);
  });

  it('自闭合根元素 → true', () => {
    expect(H.isBalancedXml('<root/>')).toBe(true);
    expect(H.isBalancedXml('<root attr="1"/>')).toBe(true);
  });

  it('XML 声明 / 注释 / DOCTYPE / CDATA 不干扰判定', () => {
    expect(H.isBalancedXml('<?xml version="1.0" encoding="UTF-8"?><root><a>1</a></root>')).toBe(true);
    expect(H.isBalancedXml('<!-- 注释 --><root><a>1</a></root>')).toBe(true);
    expect(H.isBalancedXml('<!DOCTYPE root><root/>')).toBe(true);
    expect(H.isBalancedXml('<root><![CDATA[<a>]]></root>')).toBe(true);
  });

  it('未闭合 → false', () => {
    expect(H.isBalancedXml('<root>')).toBe(false);
    expect(H.isBalancedXml('<root><a>1</a>')).toBe(false);
  });

  it('标签交叉 / 不匹配 → false', () => {
    expect(H.isBalancedXml('<a><b></a></b>')).toBe(false);
    expect(H.isBalancedXml('<a>1</b>')).toBe(false);
  });

  it('多根元素 → false（不是合法 XML 文档）', () => {
    expect(H.isBalancedXml('<a>x</a><b>y</b>')).toBe(false);
    expect(H.isBalancedXml('<a/><b/>')).toBe(false);
  });

  it('非 XML 文本 → false', () => {
    expect(H.isBalancedXml('hello world')).toBe(false);
    expect(H.isBalancedXml('a < b')).toBe(false);
    expect(H.isBalancedXml('')).toBe(false);
    expect(H.isBalancedXml('   ')).toBe(false);
    expect(H.isBalancedXml(null)).toBe(false);
  });
});

describe('autoFormatPasted —— JSON', () => {
  it('压缩的对象 → 缩进 2 空格序列化', () => {
    const res = H.autoFormatPasted('{"a":1,"b":[1,2]}');
    expect(res.lang).toBe('json');
    expect(res.text).toBe(JSON.stringify({ a: 1, b: [1, 2] }, null, 2));
  });

  it('数组 → 序列化', () => {
    const res = H.autoFormatPasted('[1,2,3]');
    expect(res.lang).toBe('json');
    expect(res.text).toBe(JSON.stringify([1, 2, 3], null, 2));
  });

  it('已是规范格式 → 序列化结果与原文一致（调用方可跳过拦截）', () => {
    const raw = '{\n  "a": 1\n}';
    const res = H.autoFormatPasted(raw);
    expect(res.lang).toBe('json');
    expect(res.text).toBe(raw);
  });

  it('序列化幂等', () => {
    const once = H.autoFormatPasted('{"a":1,"b":{"c":2}}').text;
    expect(H.autoFormatPasted(once).text).toBe(once);
  });

  it('裸标量不视为 JSON（避免误切换文档语言）', () => {
    ['123', 'true', 'false', 'null', '"hi"'].forEach((raw) => {
      const res = H.autoFormatPasted(raw);
      expect(res.lang).toBe('');
      expect(res.text).toBe(raw);
    });
  });

  it('语法损坏的对象 → 原样返回', () => {
    const raw = '{bad json}';
    const res = H.autoFormatPasted(raw);
    expect(res.lang).toBe('');
    expect(res.text).toBe(raw);
  });
});

describe('autoFormatPasted —— XML', () => {
  it('压缩 XML → 按嵌套深度缩进', () => {
    const res = H.autoFormatPasted('<a><b>1</b></a>');
    expect(res.lang).toBe('xml');
    expect(res.text).toBe('<a>\n  <b>1</b>\n</a>');
  });

  it('带属性 / 声明 → 序列化', () => {
    const res = H.autoFormatPasted('<?xml version="1.0"?><root><item id="1">v</item></root>');
    expect(res.lang).toBe('xml');
    expect(res.text).toContain('<item id="1">v</item>');
    expect(res.text.split('\n').length).toBeGreaterThan(1);
  });

  it('序列化幂等', () => {
    const once = H.autoFormatPasted('<a><b><c>1</c></b></a>').text;
    expect(H.autoFormatPasted(once).text).toBe(once);
  });
});

describe('autoFormatPasted —— 非目标类型无需处理', () => {
  it('空 / 纯空白 → lang 为空且原文不动', () => {
    expect(H.autoFormatPasted('')).toEqual({ lang: '', text: '' });
    expect(H.autoFormatPasted('   ')).toEqual({ lang: '', text: '   ' });
    expect(H.autoFormatPasted(null)).toEqual({ lang: '', text: '' });
  });

  it('普通文本 / 代码 / 表格文本 → 原样返回', () => {
    ['hello world', 'const a = 1;', 'a\tb\n1\t2', '# 标题\n正文', 'name,age\n张三,28'].forEach((raw) => {
      const res = H.autoFormatPasted(raw);
      expect(res.lang).toBe('');
      expect(res.text).toBe(raw);
    });
  });
});
