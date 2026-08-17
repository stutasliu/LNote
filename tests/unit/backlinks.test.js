/* =========================================================
 * backlinks.test.js —— 反向链接纯函数单元测试（Vitest）
 * ========================================================= */
import { describe, it, expect, beforeAll } from 'vitest';
import vm from 'node:vm';
import { extractFns } from '../helpers/extract-fn.js';

let T = null;

beforeAll(() => {
  const code = extractFns('21-backlinks', [
    'docText', 'contextOf', 'linkRangesOf', 'scanBacklinks', 'replaceTitleToLink'
  ]);
  const ctx = vm.createContext({ JSON, Math, Date, String, Number, Object, Array, RegExp, console });
  vm.runInContext(code + '\nthis.__T = { docText, contextOf, linkRangesOf, scanBacklinks, replaceTitleToLink };', ctx);
  T = ctx.__T;
});

const mk = (id, title, content, extra) => Object.assign({ id, title, content }, extra || {});

describe('docText', () => {
  it('富文档：拼接各块 text', () => {
    const d = { kind: 'rich', content: [{ text: '标题A' }, { text: '正文B' }, { text: '' }] };
    expect(T.docText(d)).toBe('标题A\n正文B\n');
  });
  it('文本文档：原样返回字符串', () => {
    expect(T.docText({ content: 'hello\nworld' })).toBe('hello\nworld');
  });
  it('content 为数组的非富文档：按字符串处理', () => {
    expect(T.docText({ content: ['a', 'b'] })).toBe('');
  });
});

describe('scanBacklinks', () => {
  const cur = mk('cur', 'Obsidian 教程', '我是当前文档');

  it('明确链接 [[标题]] → linked', () => {
    const docs = [cur, mk('d1', '笔记一', '参考了 [[Obsidian 教程]] 的方法')];
    const r = T.scanBacklinks(cur, docs);
    expect(r.linked.length).toBe(1);
    expect(r.linked[0].docId).toBe('d1');
    expect(r.mentioned.length).toBe(0);
  });

  it('[[标题|别名]] 也算明确链接', () => {
    const docs = [cur, mk('d1', '笔记一', '见 [[Obsidian 教程|新手必读]]')];
    const r = T.scanBacklinks(cur, docs);
    expect(r.linked.length).toBe(1);
  });

  it('正文提到标题但未加链接 → mentioned', () => {
    const docs = [cur, mk('d1', '笔记一', '今天学了 Obsidian 教程，收获很大')];
    const r = T.scanBacklinks(cur, docs);
    expect(r.linked.length).toBe(0);
    expect(r.mentioned.length).toBe(1);
    expect(r.mentioned[0].matches[0].ctx).toContain('Obsidian 教程');
  });

  it('[[其他]] 内部的标题字面不算 mentioned', () => {
    const docs = [cur, mk('d1', '笔记一', '参考了 [[其他的 Obsidian 教程 讲解]] 一文')];
    const r = T.scanBacklinks(cur, docs);
    expect(r.linked.length).toBe(0);
    expect(r.mentioned.length).toBe(0);
  });

  it('排除自身与已删除文档', () => {
    const docs = [
      cur,
      Object.assign(mk('self2', 'Obsidian 教程', '自己也提到 Obsidian 教程'), { id: 'cur' }),
      Object.assign(mk('del', '已删', '提到 Obsidian 教程'), { deleted: true })
    ];
    const r = T.scanBacklinks(cur, docs);
    expect(r.linked.length + r.mentioned.length).toBe(0);
  });

  it('富文档块中也能识别链接与提到', () => {
    const docs = [
      cur,
      mk('d1', '读书笔记', '[[Obsidian 教程]] 很实用', { kind: 'rich', content: [{ text: '今天看完了 [[Obsidian 教程]]' }, { text: '又复习了一次 Obsidian 教程' }] })
    ];
    const r = T.scanBacklinks(cur, docs);
    expect(r.linked.length).toBe(1);
    expect(r.linked[0].matches.length).toBe(1); // [[...]] 只有一处（块2提到被计入 mentioned）
    expect(r.mentioned.length).toBe(1);
  });
});

describe('replaceTitleToLink', () => {
  it('把标题字面替换为 [[标题]]', () => {
    expect(T.replaceTitleToLink('复习 Obsidian 教程，并实践', 'Obsidian 教程'))
      .toBe('复习 [[Obsidian 教程]]，并实践');
  });
  it('保护已有 [[标题]] 不重复包裹', () => {
    expect(T.replaceTitleToLink('见 [[Obsidian 教程]] 与 Obsidian 教程', 'Obsidian 教程'))
      .toBe('见 [[Obsidian 教程]] 与 [[Obsidian 教程]]');
  });
  it('别名形式 [[标题|别名]] 不被破坏', () => {
    expect(T.replaceTitleToLink('参考 [[Obsidian 教程|新手必读]]', 'Obsidian 教程'))
      .toBe('参考 [[Obsidian 教程|新手必读]]');
  });
});
