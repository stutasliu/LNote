/* =========================================================
 * backlinks.test.js —— 反向链接纯函数单元测试（Vitest）
 * ========================================================= */
import { describe, it, expect, beforeAll } from 'vitest';
import vm from 'node:vm';
import { extractFns } from '../helpers/extract-fn.js';

let T = null;

beforeAll(() => {
  const code = extractFns('21-backlinks', [
    'docText', 'contextOf', 'linkRangesOf', 'scanBacklinks', 'replaceTitleToLink',
    'linkTargetAt', 'findDocByTitle'
  ]);
  const ctx = vm.createContext({ JSON, Math, Date, String, Number, Object, Array, RegExp, console, state: [] });
  vm.runInContext(code + '\nthis.__T = { docText, contextOf, linkRangesOf, scanBacklinks, replaceTitleToLink, linkTargetAt, findDocByTitle };\nthis.__setState = function (docs) { state = { docs: docs }; };', ctx);
  T = ctx.__T;
  T._setState = ctx.__setState;
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

describe('linkTargetAt', () => {
  it('光标落在 [[...]] 内 → 返回 inner', () => {
    const text = '见 [[Obsidian 教程|新手必读]] 一文';
    expect(T.linkTargetAt(text, 3)).toBe('Obsidian 教程|新手必读'); // 落在 [ 上
    expect(T.linkTargetAt(text, 8)).toBe('Obsidian 教程|新手必读'); // 落在标题中间
    expect(T.linkTargetAt(text, 20)).toBe('Obsidian 教程|新手必读'); // 落在 ] 上
  });
  it('光标不在 [[...]] 内 → null', () => {
    const text = '见 [[Obsidian 教程]] 一文';
    expect(T.linkTargetAt(text, 0)).toBeNull();
    expect(T.linkTargetAt(text, 19)).toBeNull();
    expect(T.linkTargetAt(null, 3)).toBeNull();
  });
  it('多段链接各自独立命中', () => {
    const text = '[[A]] 中间文本 [[B]]';
    expect(T.linkTargetAt(text, 2)).toBe('A');
    expect(T.linkTargetAt(text, 12)).toBe('B');
    expect(T.linkTargetAt(text, 7)).toBeNull();
  });
});

describe('findDocByTitle', () => {
  const docs = [
    mk('cur', 'Obsidian 教程', '我是当前文档'),
    mk('d1', '读书笔记', '正文'),
    mk('d2', 'Obsidian 教程', '重名文档'),
    mk('del', '已删除文档', '正文', { deleted: true })
  ];

  it('按标题精确匹配（忽略两端空白）', () => {
    T._setState(docs);
    expect(T.findDocByTitle('读书笔记')).toMatchObject({ id: 'd1' });
    expect(T.findDocByTitle(' 读书笔记 ')).toMatchObject({ id: 'd1' });
  });
  it('[[标题|别名]] 只按主标题匹配', () => {
    T._setState(docs);
    expect(T.findDocByTitle('Obsidian 教程|新手必读')).toMatchObject({ id: 'cur' });
  });
  it('已删除文档不参与匹配', () => {
    T._setState(docs);
    expect(T.findDocByTitle('已删除文档')).toBeNull();
  });
  it('空 inner / 无匹配 → null', () => {
    T._setState(docs);
    expect(T.findDocByTitle('')).toBeNull();
    expect(T.findDocByTitle('|别名')).toBeNull();
    expect(T.findDocByTitle('不存在的文档')).toBeNull();
  });
});
