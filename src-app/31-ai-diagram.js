/* [esm] 导出本模块顶层绑定 */
export { runAiDiagram, openAiDiagramPanel, closeAiDiagramPanel, initAiDiagram };
/* [esm] 导入依赖模块绑定 */
import { $, DOC_ICONS } from './01-core.js';
import { activeDoc } from './05-store.js';
import { cm } from './04-editor-init.js';
import { getApi, hasApi } from './13-api-path.js';
import { toast } from './16-doc-ops.js';
import { newVisualDocFromModel } from './09-rich-save.js';
import { closeAiPanel } from './30-ai-assistant.js';
import { aiEntryBlocked, isAiAuthError, openAiSettings } from './29-ai-config.js';

  /* ---------------- AI 图表生成（v0.22：M3） ----------------
   * 后端：main.py InkpadApi.ai_diagram（结构 JSON + schema 校验失败重试 1 次）
   * 入口：文本右键菜单「AI 图表」/ 富文档浮动气泡 AI 菜单
   * 流程：两段式「处理中 → 结构预览 → 确认落图」
   * 约束：AI 不产出坐标；坐标一律由本地布局器计算（PRD §6）；
   *       确认后另建独立 flow/mind 文档，不覆盖原文档（PRD §5.3）。 */

  var AI_DIAGRAM_MAX_CHARS = 8000;

  var DIAG_META = {
    flow: { label: '流程图', icon: DOC_ICONS.flow },
    mind: { label: '思维导图', icon: DOC_ICONS.mind }
  };

  var diagSession = null;   // 运行期单任务会话（不持久化）
  var diagSeq = 0;
  var diagInited = false;
  var diagPromptKind = null;

  function resolveKind(kind) {
    if (kind) return kind;
    var d = activeDoc();
    return (d && d.kind === 'rich') ? 'rich' : 'text';
  }

  // 采集当前选区文本；富文档走块编辑器选区，文本走 CodeMirror
  function collectSelection(kind) {
    if (kind === 'rich') {
      var blk = window.InkpadBlocks && window.InkpadBlocks.getBlockAtCaret();
      if (!blk || !blk.range) return '';
      return blk.range.toString() || '';
    }
    if (!cm) return '';
    return cm.getSelection() || '';
  }

  /* ---------------- 本地布局器 ---------------- */
  // 估算 flow 节点尺寸（与 js/flow.js 的 nodeSize 保持一致：中日韩字符按 2 宽计）
  function flowNodeSize(text, type) {
    var len = String(text == null ? '' : text).replace(/[\x00-\xff]/g, 'a').length;
    if (type === 'decision') return { w: Math.max(120, len * 8 + 60), h: 64 };
    return { w: Math.max(90, len * 8 + 34), h: 42 };
  }

  // 逐层推导节点层号（Bellman-Ford 式松弛，环/孤立节点有界收敛）
  function flowLayers(nodes, edges) {
    var depth = {}, i, p;
    for (i = 0; i < nodes.length; i++) depth[nodes[i].id] = 0;
    for (p = 0; p < nodes.length; p++) {
      var changed = false;
      for (i = 0; i < edges.length; i++) {
        var e = edges[i];
        if (depth[e.from] == null || depth[e.to] == null) continue;
        if (depth[e.to] < depth[e.from] + 1) { depth[e.to] = depth[e.from] + 1; changed = true; }
      }
      if (!changed) break;
    }
    return depth;
  }

  // 结构 JSON → 完整 flow model（补 x/y、shape、lanes；坐标一律本地计算）
  function buildFlowModel(structure) {
    var src = (structure && structure.nodes) ? structure.nodes : [];
    var srcEdges = (structure && structure.edges) ? structure.edges : [];
    var layers = flowLayers(src, srcEdges);

    var byLayer = {}, maxD = 0, i, j;
    for (i = 0; i < src.length; i++) {
      var d = layers[src[i].id] || 0;
      (byLayer[d] = byLayer[d] || []).push(src[i]);
      if (d > maxD) maxD = d;
    }

    var H_GAP = 48, V_GAP = 68, MARGIN_X = 160, MARGIN_Y = 120;
    var layerWidths = [], maxLayerW = 0;
    for (j = 0; j <= maxD; j++) {
      var row = byLayer[j] || [];
      var w = 0;
      for (i = 0; i < row.length; i++) w += flowNodeSize(row[i].text, row[i].type).w + (i ? H_GAP : 0);
      layerWidths[j] = w;
      if (w > maxLayerW) maxLayerW = w;
    }

    var nodes = [], y = MARGIN_Y;
    for (j = 0; j <= maxD; j++) {
      var cur = byLayer[j] || [];
      var rowMaxH = 42;
      for (i = 0; i < cur.length; i++) {
        var sh = flowNodeSize(cur[i].text, cur[i].type).h;
        if (sh > rowMaxH) rowMaxH = sh;
      }
      var cursor = MARGIN_X + (maxLayerW - layerWidths[j]) / 2;
      for (i = 0; i < cur.length; i++) {
        var node = cur[i];
        var sz = flowNodeSize(node.text, node.type);
        nodes.push({
          id: node.id,
          type: node.type || 'process',
          text: node.text,
          x: Math.round(cursor + sz.w / 2),
          y: Math.round(y + rowMaxH / 2)
        });
        cursor += sz.w + H_GAP;
      }
      y += rowMaxH + V_GAP;
    }

    var edges = [];
    for (i = 0; i < srcEdges.length; i++) {
      var se = srcEdges[i];
      var item = { id: 'e' + (i + 1), from: se.from, to: se.to, shape: 'line' };
      if (se.text) item.text = se.text;
      edges.push(item);
    }

    return { nodes: nodes, edges: edges, lanes: [] };
  }

  // 结构 JSON → 完整 mind model（补 id、collapsed；坐标为渲染期自动计算）
  function buildMindModel(structure) {
    var seq = 0;
    function norm(node) {
      var id = seq === 0 ? 'root' : ('m' + seq);
      seq++;
      var children = [];
      var src = (node && node.children) ? node.children : [];
      for (var i = 0; i < src.length; i++) children.push(norm(src[i]));
      return { id: id, text: (node && node.text) || '', collapsed: false, children: children };
    }
    var rootSrc = (structure && structure.root) ? structure.root : { text: '中心主题', children: [] };
    return {
      themeName: 'classic',
      layoutDensity: 'normal',
      numberingStyle: 'none',
      root: norm(rootSrc)
    };
  }

  /* ---------------- 结构预览文本 ---------------- */

  var FLOW_TYPE_LABEL = { start: '起点', process: '处理', decision: '判断', end: '终点' };

  function previewFlowText(structure) {
    var nodes = (structure && structure.nodes) || [];
    var edges = (structure && structure.edges) || [];
    var lines = ['节点（' + nodes.length + '）'], i;
    for (i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      lines.push('  ' + (i + 1) + '. [' + (FLOW_TYPE_LABEL[n.type] || n.type) + '] ' + n.text);
    }
    lines.push('');
    lines.push('连线（' + edges.length + '）');
    for (i = 0; i < edges.length; i++) {
      var e = edges[i];
      lines.push('  ' + e.from + ' → ' + e.to + (e.text ? '（' + e.text + '）' : ''));
    }
    return lines.join('\n');
  }

  function previewMindText(structure) {
    var lines = [];
    function walk(node, depth) {
      var pad = '';
      for (var k = 0; k < depth; k++) pad += '  ';
      lines.push(pad + (depth ? '· ' : '') + ((node && node.text) || ''));
      var cs = (node && node.children) || [];
      for (var i = 0; i < cs.length; i++) walk(cs[i], depth + 1);
    }
    walk((structure && structure.root) || { text: '' }, 0);
    return lines.join('\n');
  }

  /* ---------------- 面板渲染 ---------------- */

  function setDiagTitle(t) {
    var el = $('ai-diagram-title');
    if (el) el.textContent = t || 'AI 图表';
  }

  function setDiagMeta(text, kind) {
    var el = $('ai-diagram-meta');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = kind === 'error' ? 'var(--danger)'
      : (kind === 'ok' || kind === 'pending') ? 'var(--accent)' : '';
  }

  function setDiagBody(text) {
    var el = $('ai-diagram-body');
    if (!el) return;
    el.textContent = text || '';
    el.scrollTop = 0;
  }

  function setDiagButtons(status) {
    var streaming = status === 'streaming';
    var stop = $('ai-diagram-stop');
    var retry = $('ai-diagram-retry');
    var create = $('ai-diagram-create');
    if (stop) stop.style.display = streaming ? '' : 'none';
    if (retry) retry.style.display = (status === 'error') ? '' : 'none';
    if (create) create.disabled = status !== 'ready';
  }

  function openAiDiagramPanel() {
    closeAiPanel();   // 与助手面板同位置，避免浮层重叠
    var p = $('ai-diagram-panel');
    if (p) p.style.display = 'flex';
  }

  function closeAiDiagramPanel() {
    requestDiagStop();
    diagSession = null;
    var p = $('ai-diagram-panel');
    if (p) p.style.display = 'none';
  }

  /* ---------------- 任务编排 ---------------- */

  function requestDiagStop() {
    if (!diagSession || !diagSession.sessionId) return;
    try {
      if (hasApi() && getApi().ai_stop) getApi().ai_stop(diagSession.sessionId);
    } catch (e) {}
  }

  function stopDiagTask() {
    if (!diagSession || diagSession.status !== 'streaming') return;
    requestDiagStop();
    diagSession.status = 'stopped';
    setDiagMeta('已停止');
    setDiagButtons('stopped');
  }

  function finishDiag(status, structure, title, error) {
    if (!diagSession) return;
    diagSession.status = status;
    if (status === 'done') {
      diagSession.status = 'ready';   // 与 confirmDiagCreate 的守卫一致
      var meta = DIAG_META[diagSession.kind];
      var model = diagSession.kind === 'flow' ? buildFlowModel(structure) : buildMindModel(structure);
      diagSession.model = model;
      diagSession.title = title || (structure && structure.title) || ('AI ' + meta.label);
      setDiagBody(diagSession.kind === 'flow' ? previewFlowText(structure) : previewMindText(structure));
      setDiagMeta('结构预览 · 确认后新建' + meta.label + '文档', 'ok');
      setDiagButtons('ready');
    } else if (status === 'stopped') {
      setDiagMeta('已停止');
      setDiagButtons('stopped');
    } else {
      diagSession.error = error || '生成失败';
      setDiagBody('');
      setDiagMeta(diagSession.error, 'error');
      setDiagButtons('error');
      toast('AI 图表生成失败', 'error');
      // Key 中途失效：引导重新配置（PRD §7）
      if (isAiAuthError(diagSession.error)) {
        toast('API Key 无效或已过期，请在设置中重新配置', 'error');
        openAiSettings();
      }
    }
  }

  // Python 端回调入口（worker 线程 evaluate_js 推送）
  window.__inkpadAiDiagramCb = function (msg) {
    if (!msg || !msg.sessionId || !diagSession) return;
    if (msg.sessionId !== diagSession.sessionId) return;   // 丢弃过期会话回调
    if (diagSession.status !== 'streaming') return;
    // 生成中切换文档：丢弃结果（PRD §7）
    var d = activeDoc();
    if (diagSession.docId && (!d || d.id !== diagSession.docId)) {
      requestDiagStop();
      diagSession = null;
      var p = $('ai-diagram-panel');
      if (p) p.style.display = 'none';
      return;
    }
    if (msg.type === 'done') { finishDiag('done', msg.structure, msg.title, null); return; }
    if (msg.type === 'error') { finishDiag('error', null, null, msg.error); return; }
  };

  function startDiagTask(kind, rawText) {
    var text = String(rawText == null ? '' : rawText);
    if (!text.trim()) { toast('请先输入用于生成图表的内容', 'error'); return; }
    var truncated = false;
    if (text.length > AI_DIAGRAM_MAX_CHARS) {
      text = text.slice(0, AI_DIAGRAM_MAX_CHARS);
      truncated = true;
    }

    // 单任务并发：先停旧任务再发起新任务（PRD §6 并发）
    if (diagSession) requestDiagStop();

    var meta = DIAG_META[kind];
    var d = activeDoc();
    var sessionId = 'aid-' + (++diagSeq) + '-' + Date.now();
    diagSession = {
      sessionId: sessionId,
      kind: kind,
      docId: d ? d.id : null,
      sourceText: text,
      status: 'streaming',
      model: null,
      title: '',
      error: null
    };

    setDiagTitle('AI ' + meta.label);
    setDiagBody('');
    setDiagMeta('正在生成' + meta.label + '结构…', 'pending');
    var create = $('ai-diagram-create');
    if (create) create.textContent = '新建为' + meta.label;
    setDiagButtons('streaming');
    openAiDiagramPanel();
    if (truncated) toast('内容过长，已截断到前 ' + AI_DIAGRAM_MAX_CHARS + ' 字符', 'info');

    getApi().ai_diagram({ sessionId: sessionId, kind: kind, text: text }).then(function (r) {
      if (r && r.error) finishDiag('error', null, null, r.error);
    }).catch(function (e) {
      finishDiag('error', null, null, String((e && e.message) || e));
    });
  }

  function onDiagRetry() {
    if (!diagSession) return;
    startDiagTask(diagSession.kind, diagSession.sourceText);
  }

  // 确认落图：把预览结构落为独立 flow/mind 文档
  function confirmDiagCreate() {
    if (!diagSession || diagSession.status !== 'ready' || !diagSession.model) {
      toast('暂无可用结构', 'error');
      return;
    }
    var kind = diagSession.kind;
    var model = diagSession.model;
    var title = diagSession.title || ('AI ' + DIAG_META[kind].label);
    closeAiDiagramPanel();
    newVisualDocFromModel(kind, model, title);
    toast('已新建' + DIAG_META[kind].label + '文档', 'success');
  }

  /* ---------------- 描述输入（未选中文本时） ---------------- */

  function openDiagPrompt(kind) {
    diagPromptKind = kind;
    var m = $('ai-diagram-prompt');
    if (!m) { toast('界面未就绪', 'error'); return; }
    var title = $('ai-diagram-prompt-title');
    if (title) title.textContent = '生成' + DIAG_META[kind].label;
    var ta = $('ai-diagram-prompt-text');
    if (ta) ta.value = '';
    m.style.zIndex = '9600';   // 高于 .ai-panel(9500)，避免浮层遮挡
    m.style.display = 'flex';
    setTimeout(function () { if (ta) ta.focus(); }, 30);
  }

  function closeDiagPrompt() {
    var m = $('ai-diagram-prompt');
    if (m) m.style.display = 'none';
    diagPromptKind = null;
  }

  function submitDiagPrompt() {
    var kind = diagPromptKind;
    var ta = $('ai-diagram-prompt-text');
    var text = ta ? ta.value : '';
    if (!text || !text.trim()) { toast('请输入内容描述', 'error'); return; }
    closeDiagPrompt();
    if (DIAG_META[kind]) startDiagTask(kind, text);
  }

  /* ---------------- 入口 ---------------- */

  // 优先取当前选中文本，未选中则弹描述输入框（PRD §5.3）
  function runAiDiagram(kind, opts) {
    opts = opts || {};
    if (!DIAG_META[kind]) return;
    if (!hasApi() || !getApi().ai_diagram) {
      toast('当前为浏览器预览环境，AI 图表生成仅在桌面版可用', 'error');
      return;
    }
    var srcKind = resolveKind(opts.kind);
    var text = opts.text;
    if (text == null) text = collectSelection(srcKind);
    var useDirect = !!(text && text.trim());
    // 未配置则引导进入设置 AI 页签（PRD 功能 #8）
    if (aiEntryBlocked()) return;
    if (useDirect) startDiagTask(kind, text);
    else openDiagPrompt(kind);
  }

  /* ---------------- 初始化 ---------------- */

  function initAiDiagram() {
    if (diagInited) return;
    diagInited = true;
    var close = $('ai-diagram-close');
    if (close) close.addEventListener('click', closeAiDiagramPanel);
    var stop = $('ai-diagram-stop');
    if (stop) stop.addEventListener('click', stopDiagTask);
    var retry = $('ai-diagram-retry');
    if (retry) retry.addEventListener('click', onDiagRetry);
    var create = $('ai-diagram-create');
    if (create) create.addEventListener('click', confirmDiagCreate);

    var pclose = $('ai-diagram-prompt-close');
    if (pclose) pclose.addEventListener('click', closeDiagPrompt);
    var pcancel = $('ai-diagram-prompt-cancel');
    if (pcancel) pcancel.addEventListener('click', closeDiagPrompt);
    var pok = $('ai-diagram-prompt-ok');
    if (pok) pok.addEventListener('click', submitDiagPrompt);
    var pta = $('ai-diagram-prompt-text');
    if (pta) pta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitDiagPrompt(); }
    });
  }
