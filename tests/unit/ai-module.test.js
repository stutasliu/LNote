/* =========================================================
 * ai-module.test.js —— AI 模块（v0.22 / M1-M4）纯函数单元测试
 *
 * 覆盖：
 *  - 29-ai-config：isAiAuthError（PRD §7 鉴权错误识别）、matchPreset（预设匹配）
 *  - 30-ai-assistant：countChars（选区长度上限判断）、aiInstructionByKey
 *  - 31-ai-diagram：flowNodeSize / flowLayers / buildFlowModel /
 *    buildMindModel / previewFlowText / previewMindText（本地布局器与结构预览）
 *
 * 提取方式与 pure-fns/reveal-folder 测试一致：源码级提取 2 空格缩进的
 * 顶层函数，连同其依赖的模块级常量一并注入 vm 执行，保证与源码强同步。
 * ========================================================= */
import { describe, it, expect, beforeAll } from 'vitest';
import vm from 'node:vm';
import { extractFns, readPart } from '../helpers/extract-fn.js';

let A = null;

/** 从源码中提取 `var NAME = {...};` / `var NAME = [...];` 常量声明（单行或多行） */
function pickVar(source, name) {
  const re = new RegExp('var ' + name + ' = [\\{\\[][\\s\\S]*?[\\}\\]];');
  const m = re.exec(source);
  if (!m) throw new Error('常量未找到: ' + name);
  return m[0];
}

beforeAll(() => {
  const code = [
    pickVar(readPart('29-ai-config'), 'AI_PRESETS'),
    pickVar(readPart('30-ai-assistant'), 'AI_INSTRUCTIONS'),
    pickVar(readPart('31-ai-diagram'), 'FLOW_TYPE_LABEL'),
    extractFns('29-ai-config', ['isAiAuthError', 'matchPreset']),
    extractFns('30-ai-assistant', ['countChars', 'aiInstructionByKey']),
    extractFns('31-ai-diagram', [
      'flowNodeSize', 'flowLayers', 'buildFlowModel',
      'buildMindModel', 'previewFlowText', 'previewMindText'
    ])
  ].join('\n');

  const ctx = vm.createContext({ String, Math, Object, Array, JSON });
  vm.runInContext(
    code + '\nthis.__A = { AI_INSTRUCTIONS, isAiAuthError, matchPreset, countChars, aiInstructionByKey, ' +
      'flowNodeSize, flowLayers, buildFlowModel, buildMindModel, previewFlowText, previewMindText };',
    ctx
  );
  A = ctx.__A;
});

describe('AI 配置：isAiAuthError（PRD §7 鉴权失效识别）', () => {
  it('识别 401 / 403 状态码', () => {
    expect(A.isAiAuthError('API Key 无效或已过期（401）')).toBe(true);
    expect(A.isAiAuthError('请求被拒绝：403 Forbidden')).toBe(true);
  });
  it('识别 API Key / 密钥 文案', () => {
    expect(A.isAiAuthError('API Key 无效')).toBe(true);
    expect(A.isAiAuthError('密钥不正确')).toBe(true);
  });
  it('网络/超时等非鉴权错误不误判', () => {
    expect(A.isAiAuthError('请求超时，网络可能不稳定，请稍后重试')).toBe(false);
    expect(A.isAiAuthError('无法连接到模型服务，请检查 Base URL')).toBe(false);
    expect(A.isAiAuthError('模型不存在或未加载（404），请检查模型名')).toBe(false);
  });
  it('空值安全', () => {
    expect(A.isAiAuthError('')).toBe(false);
    expect(A.isAiAuthError(null)).toBe(false);
    expect(A.isAiAuthError(undefined)).toBe(false);
  });
});

describe('AI 配置：matchPreset（Base URL 预设匹配）', () => {
  it('精确匹配内置预设', () => {
    expect(A.matchPreset('https://api.deepseek.com')).toBe('deepseek');
    expect(A.matchPreset('https://api.openai.com/v1')).toBe('openai');
    expect(A.matchPreset('https://api.moonshot.cn/v1')).toBe('moonshot');
    expect(A.matchPreset('https://open.bigmodel.cn/api/paas/v4')).toBe('zhipu');
  });
  it('忽略结尾多余的斜杠', () => {
    expect(A.matchPreset('https://api.deepseek.com/')).toBe('deepseek');
    expect(A.matchPreset('https://api.openai.com/v1///')).toBe('openai');
  });
  it('未知地址回退 custom', () => {
    expect(A.matchPreset('https://example.com/v1')).toBe('custom');
    expect(A.matchPreset('')).toBe('custom');
    expect(A.matchPreset(null)).toBe('custom');
  });
});

describe('AI 助手：countChars（选区长度）', () => {
  it('按字符数统计（含中文）', () => {
    expect(A.countChars('abc')).toBe(3);
    expect(A.countChars('中文内容')).toBe(4);
  });
  it('空值返回 0', () => {
    expect(A.countChars('')).toBe(0);
    expect(A.countChars(null)).toBe(0);
    expect(A.countChars(undefined)).toBe(0);
  });
  it('非字符串先转字符串', () => {
    expect(A.countChars(12345)).toBe(5);
  });
});

describe('AI 助手：aiInstructionByKey', () => {
  it('内置 6 条指令', () => {
    expect(A.AI_INSTRUCTIONS.length).toBe(6);
  });
  it('按 key 命中并保留 build 闭包', () => {
    const inst = A.aiInstructionByKey('polish');
    expect(inst.key).toBe('polish');
    expect(inst.label).toBe('润色');
    expect(typeof inst.build).toBe('function');
    expect(inst.build('原文')).toContain('原文');
  });
  it('未命中返回 null', () => {
    expect(A.aiInstructionByKey('not-exist')).toBe(null);
    expect(A.aiInstructionByKey('')).toBe(null);
  });
});

describe('AI 图表：flowNodeSize（节点尺寸估算）', () => {
  it('处理节点：宽度下限 90、高度 42', () => {
    expect(A.flowNodeSize('短', 'process')).toEqual({ w: 90, h: 42 });
    expect(A.flowNodeSize('开始', 'process')).toEqual({ w: 90, h: 42 });
  });
  it('判断节点：宽度下限 120、高度 64', () => {
    expect(A.flowNodeSize('判断', 'decision')).toEqual({ w: 120, h: 64 });
  });
  it('文本越长宽度越大（8px/字符 + 基础宽度）', () => {
    expect(A.flowNodeSize('这是一个较长的处理步骤', 'process')).toEqual({ w: 122, h: 42 });
    expect(A.flowNodeSize('是否满足打开文件的条件', 'decision')).toEqual({ w: 148, h: 64 });
  });
  it('空文本安全', () => {
    expect(A.flowNodeSize(null, 'process')).toEqual({ w: 90, h: 42 });
    expect(A.flowNodeSize(undefined, 'end')).toEqual({ w: 90, h: 42 });
  });
});

describe('AI 图表：flowLayers（层号推导）', () => {
  const nodes = (ids) => ids.map((id) => ({ id: id }));

  it('线性链逐层递增', () => {
    const d = A.flowLayers(nodes(['a', 'b', 'c']), [
      { from: 'a', to: 'b' }, { from: 'b', to: 'c' }
    ]);
    expect(d).toEqual({ a: 0, b: 1, c: 2 });
  });
  it('菱形分叉后合流取最长路径', () => {
    const d = A.flowLayers(nodes(['a', 'b', 'c', 'd']), [
      { from: 'a', to: 'b' }, { from: 'a', to: 'c' },
      { from: 'b', to: 'd' }, { from: 'c', to: 'd' }
    ]);
    expect(d).toEqual({ a: 0, b: 1, c: 1, d: 2 });
  });
  it('孤立节点层号为 0', () => {
    const d = A.flowLayers(nodes(['a', 'b']), []);
    expect(d).toEqual({ a: 0, b: 0 });
  });
  it('引用未知节点的边被忽略', () => {
    const d = A.flowLayers(nodes(['a']), [{ from: 'x', to: 'y' }]);
    expect(d).toEqual({ a: 0 });
  });
  it('成环时有界收敛且不抛错', () => {
    const d = A.flowLayers(nodes(['a', 'b']), [
      { from: 'a', to: 'b' }, { from: 'b', to: 'a' }
    ]);
    expect(typeof d.a).toBe('number');
    expect(typeof d.b).toBe('number');
  });
});

describe('AI 图表：buildFlowModel（本地布局）', () => {
  const structure = {
    nodes: [
      { id: 'n1', type: 'start', text: '开始' },
      { id: 'n2', type: 'process', text: '处理数据' },
      { id: 'n3', type: 'end', text: '结束' }
    ],
    edges: [
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3', text: '是' }
    ]
  };

  it('补齐 x/y（AI 不产出坐标，一律本地计算）', () => {
    const m = A.buildFlowModel(structure);
    expect(m.nodes.map((n) => [n.x, n.y])).toEqual([[205, 141], [205, 251], [205, 361]]);
  });
  it('边补 id/shape，保留文案', () => {
    const m = A.buildFlowModel(structure);
    expect(m.edges).toEqual([
      { id: 'e1', from: 'n1', to: 'n2', shape: 'line' },
      { id: 'e2', from: 'n2', to: 'n3', shape: 'line', text: '是' }
    ]);
  });
  it('lanes 占位为空数组', () => {
    expect(A.buildFlowModel(structure).lanes).toEqual([]);
  });
  it('缺省 type 退化为 process', () => {
    const m = A.buildFlowModel({ nodes: [{ id: 'n1', text: '无类型' }], edges: [] });
    expect(m.nodes[0].type).toBe('process');
  });
  it('空结构安全', () => {
    expect(A.buildFlowModel(null)).toEqual({ nodes: [], edges: [], lanes: [] });
  });
});

describe('AI 图表：buildMindModel（脑图模型）', () => {
  const structure = {
    root: {
      text: '中心主题',
      children: [
        { text: 'A', children: [{ text: 'A1' }] },
        { text: 'B' }
      ]
    }
  };

  it('补默认主题配置', () => {
    const m = A.buildMindModel(structure);
    expect(m.themeName).toBe('classic');
    expect(m.layoutDensity).toBe('normal');
    expect(m.numberingStyle).toBe('none');
  });
  it('深度优先预序编号：root / m1 / m2 ...', () => {
    const m = A.buildMindModel(structure);
    expect(m.root.id).toBe('root');
    expect(m.root.children[0].id).toBe('m1');
    expect(m.root.children[0].children[0].id).toBe('m2');
    expect(m.root.children[1].id).toBe('m3');
  });
  it('节点默认展开 collapsed=false', () => {
    const m = A.buildMindModel(structure);
    expect(m.root.collapsed).toBe(false);
    expect(m.root.children[0].collapsed).toBe(false);
  });
  it('空结构回退默认中心主题', () => {
    const m = A.buildMindModel(null);
    expect(m.root.id).toBe('root');
    expect(m.root.text).toBe('中心主题');
    expect(m.root.children).toEqual([]);
  });
});

describe('AI 图表：结构预览文本', () => {
  it('previewFlowText 列出节点与连线', () => {
    const out = A.previewFlowText({
      nodes: [
        { id: 'n1', type: 'start', text: '开始' },
        { id: 'n2', type: 'process', text: '读取' },
        { id: 'n3', type: '', text: '未知' }
      ],
      edges: [
        { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n3', text: '是' }
      ]
    });
    expect(out).toBe([
      '节点（3）',
      '  1. [起点] 开始',
      '  2. [处理] 读取',
      '  3. [] 未知',
      '',
      '连线（2）',
      '  n1 → n2',
      '  n2 → n3（是）'
    ].join('\n'));
  });
  it('previewMindText 按层级缩进', () => {
    const out = A.previewMindText({
      root: {
        text: '中心',
        children: [
          { text: 'A', children: [{ text: 'A1' }] },
          { text: 'B' }
        ]
      }
    });
    expect(out).toBe(['中心', '  · A', '    · A1', '  · B'].join('\n'));
  });
  it('空结构预览安全', () => {
    expect(A.previewMindText(null)).toBe('');
    expect(A.previewFlowText(null)).toBe('节点（0）\n\n连线（0）');
  });
});
