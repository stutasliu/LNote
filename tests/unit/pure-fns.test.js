/* =========================================================
 * pure-fns.test.js —— 纯函数单元测试（Vitest）
 *
 * 从 src-app/*.js（同闭包片段）源码级提取顶层纯函数，在 vm
 * 中执行后断言。与源码强同步：每次运行都从最新 src-app 提取，
 * 无需维护测试副本。
 * ========================================================= */
import { describe, it, expect, beforeAll } from 'vitest';
import vm from 'node:vm';
import { extractFns } from '../helpers/extract-fn.js';

let T = null; // 被测试的纯函数集合

beforeAll(() => {
  const code =
    extractFns('11-format-tools', [
      'jsonFormat', 'jsonCompress', 'strEscape', 'strUnescape',
      'unicodeToZh', 'zhToUnicode', 'jsonToGet',
      'b64Encode', 'b64Decode', 'urlEncodeText', 'urlDecodeText',
      'titleCase', 'swapCase', 'fullToHalf', 'halfToFull',
      'dedupeLines', 'indentOf', 'pad2', 'formatBeijing', 'prettyXML'
    ]) +
    '\n' +
    extractFns('09-rich-save', ['sanitizeFileName']);

  const ctx = vm.createContext({
    TextEncoder, TextDecoder, btoa, atob,
    encodeURIComponent, decodeURIComponent,
    JSON, Math, Date, String, Number, Object, Array, RegExp, parseInt, console
  });
  vm.runInContext(
    code +
      '\nthis.__T = { jsonFormat, jsonCompress, strEscape, strUnescape, unicodeToZh, zhToUnicode, jsonToGet, b64Encode, b64Decode, urlEncodeText, urlDecodeText, titleCase, swapCase, fullToHalf, halfToFull, dedupeLines, indentOf, pad2, formatBeijing, prettyXML, sanitizeFileName };',
    ctx
  );
  T = ctx.__T;
});

describe('JSON 工具', () => {
  it('jsonFormat 格式化（2 空格缩进）', () => {
    expect(T.jsonFormat('{"a":1,"b":[1,2]}')).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
  });
  it('jsonCompress 压缩去空白', () => {
    expect(T.jsonCompress('{ "a" : 1 }')).toBe('{"a":1}');
  });
  it('jsonToGet 对象转 query', () => {
    expect(T.jsonToGet('{"a":1,"b":"x y"}')).toBe('a=1&b=x%20y');
  });
  it('jsonToGet 非对象抛错', () => {
    expect(() => T.jsonToGet('[1,2]')).toThrow();
  });
});

describe('转义', () => {
  it('strEscape 转义引号与换行', () => {
    expect(T.strEscape('a"b\n')).toBe('a\\"b\\n');
  });
  it('strUnescape 还原转义', () => {
    expect(T.strUnescape('a\\"b\\n')).toBe('a"b\n');
  });
});

describe('Unicode', () => {
  it('unicodeToZh 解码 \\uXXXX', () => {
    expect(T.unicodeToZh('\\u4f60\\u597d')).toBe('你好');
  });
  it('zhToUnicode 编码为 \\uXXXX', () => {
    expect(T.zhToUnicode('你好')).toBe('\\u4f60\\u597d');
  });
});

describe('Base64 / URL', () => {
  it('b64Encode UTF-8 编码', () => {
    expect(T.b64Encode('你好')).toBe('5L2g5aW9');
  });
  it('b64Decode 还原中文', () => {
    expect(T.b64Decode('5L2g5aW9')).toBe('你好');
  });
  it('b64Decode 非法 UTF-8 抛错', () => {
    expect(() => T.b64Decode('////')).toThrow();
  });
  it('urlEncodeText / urlDecodeText 往返', () => {
    const enc = T.urlEncodeText('a b&c=中');
    expect(enc).toBe('a%20b%26c%3D%E4%B8%AD');
    expect(T.urlDecodeText(enc)).toBe('a b&c=中');
  });
});

describe('文本工具', () => {
  it('titleCase 单词首字母大写', () => {
    expect(T.titleCase('hello world')).toBe('Hello World');
  });
  it('swapCase 反转大小写', () => {
    expect(T.swapCase('AbC')).toBe('aBc');
  });
  it('fullToHalf 全角转半角（仅 U+FF01~FF5E 全角 ASCII 区）', () => {
    expect(T.fullToHalf('，！')).toBe(',!');
    expect(T.fullToHalf('ＡＢＣ')).toBe('ABC');
    expect(T.fullToHalf('　')).toBe(' ');
    // U+3002（。）不在转换范围，保持不变
    expect(T.fullToHalf('。')).toBe('。');
  });
  it('halfToFull 半角转全角', () => {
    expect(T.halfToFull(',!')).toBe('，！');
    expect(T.halfToFull('ABC')).toBe('ＡＢＣ');
  });
  it('dedupeLines 去重保序', () => {
    expect(T.dedupeLines(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
  });
  it('indentOf 计算缩进（tab 记 2）', () => {
    expect(T.indentOf('  x')).toBe(2);
    expect(T.indentOf('\tx')).toBe(2);
    expect(T.indentOf('')).toBe(0);
  });
});

describe('时间戳', () => {
  it('pad2 补零', () => {
    expect(T.pad2(5)).toBe('05');
    expect(T.pad2(12)).toBe('12');
  });
  it('formatBeijing 始终按北京时间', () => {
    // 0ms = 1970-01-01 00:00 UTC = 08:00 北京时间
    expect(T.formatBeijing(0)).toBe('1970-01-01 08:00:00');
  });
});

describe('XML', () => {
  it('prettyXML 格式化缩进', () => {
    const out = T.prettyXML('<a><b>x</b></a>');
    expect(out).toContain('\n');
    expect(out.split('\n')[0]).toBe('<a>');
  });
});

describe('文件名清洗', () => {
  it('sanitizeFileName 替换非法字符', () => {
    expect(T.sanitizeFileName('a/b')).toBe('a_b');
    expect(T.sanitizeFileName('x:y')).toBe('x_y');
    expect(T.sanitizeFileName('a*b')).toBe('a_b');
  });
  it('sanitizeFileName 去除尾部点与空格', () => {
    expect(T.sanitizeFileName('name. ')).toBe('name');
  });
  it('sanitizeFileName 空名兜底', () => {
    expect(T.sanitizeFileName('   ')).toBe('未命名文档');
  });
});
