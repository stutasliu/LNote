/* [esm] 导出本模块顶层绑定 */
export { AI_INSTRUCTIONS, aiSession, runAiInstruction, openAiPanel, closeAiPanel, stopAiTask, initAiAssistant };
/* [esm] 导入依赖模块绑定 */
import { $ } from './01-core.js';
import { activeDoc } from './05-store.js';
import { cm } from './04-editor-init.js';
import { copyToClipboard } from './11-format-tools.js';
import { getApi, hasApi } from './13-api-path.js';
import { toast } from './16-doc-ops.js';
import { aiEntryBlocked, isAiAuthError, openAiSettings } from './29-ai-config.js';

  /* ---------------- 选中即用助手（v0.22：M2） ----------------
   * 后端：main.py LNoteApi.ai_chat / ai_stop（SSE 流式 + 单任务取消）
   * 入口：文本编辑器右键菜单「AI 助手」/ 富文档浮动工具条「AI 助手」
   * 约束：同一时刻仅 1 个任务；新任务先停旧任务；生成中切换文档/关闭面板
   *       即停止并丢弃回调；Key 不落到前端，助手仅消费文本。 */

  var AI_MAX_CHARS = 4000;

  var AI_SYSTEM_PROMPT = '你是 L.Note 的写作助手。请直接输出处理后的正文内容，' +
    '不要添加解释性说明、前言或 Markdown 代码块围栏。';

  var AI_INSTRUCTIONS = [
    { key: 'polish', label: '润色', tip: '让表达更流畅专业',
      build: function (t) { return '请润色以下内容，使表达更流畅、专业，保持原意不变。只输出润色后的正文：\n\n' + t; } },
    { key: 'continue', label: '续写', tip: '顺着内容继续写',
      build: function (t) { return '请顺着以下内容继续写作，延续原有风格与主题。只输出续写部分：\n\n' + t; } },
    { key: 'summary', label: '总结要点', tip: '提炼关键信息',
      build: function (t) { return '请总结以下内容的要点，用简洁的条目列出。只输出要点：\n\n' + t; } },
    { key: 'expand', label: '扩写', tip: '补充细节与例子',
      build: function (t) { return '请对以下内容进行扩写，补充细节与例子，使其更充实。只输出扩写后的正文：\n\n' + t; } },
    { key: 'fix', label: '纠错', tip: '修正错别字与语法',
      build: function (t) { return '请检查并修正以下内容中的错别字、语法与标点错误，保持原意与结构。只输出修正后的文本：\n\n' + t; } },
    { key: 'outline', label: '生成大纲', tip: '整理为层级大纲',
      build: function (t) { return '请为以下内容生成层级化大纲，使用 Markdown 列表。只输出大纲：\n\n' + t; } }
  ];

  var aiSession = null;   // 运行期单任务会话（不持久化）
  var aiSeq = 0;
  var aiPanelInited = false;

  function aiInstructionByKey(key) {
    for (var i = 0; i < AI_INSTRUCTIONS.length; i++) {
      if (AI_INSTRUCTIONS[i].key === key) return AI_INSTRUCTIONS[i];
    }
    return null;
  }

  function resolveKind(kind) {
    if (kind) return kind;
    var d = activeDoc();
    return (d && d.kind === 'rich') ? 'rich' : 'text';
  }

  // 采集当前选区上下文；文本走 CodeMirror，富文档走块编辑器选区
  function getSourceContext(kind) {
    if (kind === 'rich') {
      var blk = window.InkpadBlocks && window.InkpadBlocks.getBlockAtCaret();
      if (!blk || !blk.range) return null;
      var rtext = blk.range.toString();
      if (!rtext || !rtext.trim()) return null;
      return { kind: 'rich', text: rtext, range: blk.range.cloneRange(), editable: blk.editable };
    }
    if (!cm) return null;
    var text = cm.getSelection();
    if (!text || !text.trim()) return null;
    return { kind: 'text', text: text, from: cm.getCursor('from'), to: cm.getCursor('to') };
  }

  /* ---------------- 面板渲染 ---------------- */

  function setAiPanelTitle(t) {
    var el = $('ai-panel-title');
    if (el) el.textContent = t || 'AI 助手';
  }

  function setAiPanelMeta(text, kind) {
    var el = $('ai-panel-meta');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = kind === 'error' ? 'var(--danger)'
      : (kind === 'ok' || kind === 'pending') ? 'var(--accent)' : '';
  }

  function setAiPanelBody(text) {
    var el = $('ai-panel-body');
    if (!el) return;
    el.textContent = text || '';
    el.scrollTop = el.scrollHeight;
  }

  function setAiButtons(status) {
    var streaming = status === 'streaming';
    var hasResult = !!(aiSession && aiSession.resultText);
    var stopBtn = $('ai-stop');
    var retryBtn = $('ai-retry');
    if (stopBtn) stopBtn.style.display = streaming ? '' : 'none';
    if (retryBtn) retryBtn.style.display = (status === 'error') ? '' : 'none';
    var rep = $('ai-apply-replace');
    var ins = $('ai-apply-insert');
    var cp = $('ai-copy');
    if (rep) rep.disabled = !(hasResult && !streaming);
    if (ins) ins.disabled = !(hasResult && !streaming);
    if (cp) cp.disabled = !hasResult;
  }

  function openAiPanel() {
    var p = $('ai-panel');
    if (p) p.style.display = 'flex';
  }

  function countChars(s) { return String(s == null ? '' : s).length; }

  /* ---------------- 任务编排 ---------------- */

  function requestStop() {
    if (!aiSession || !aiSession.sessionId) return;
    try {
      if (hasApi() && getApi().ai_stop) getApi().ai_stop(aiSession.sessionId);
    } catch (e) {}
  }

  // 停止按钮：中断后端流式读取，保留已接收内容供复制
  function stopAiTask() {
    if (!aiSession || aiSession.status !== 'streaming') return;
    requestStop();
    aiSession.status = 'stopped';
    setAiPanelMeta('已停止（已接收 ' + countChars(aiSession.resultText) + ' 字）');
    setAiButtons('stopped');
  }

  // 关闭面板：停止任务并丢弃回调
  function closeAiPanel() {
    requestStop();
    aiSession = null;
    var p = $('ai-panel');
    if (p) p.style.display = 'none';
  }

  function finishAi(status, fullText, error) {
    if (!aiSession) return;
    if (typeof fullText === 'string' && fullText.length >= aiSession.resultText.length) {
      aiSession.resultText = fullText;
    }
    aiSession.status = status;
    setAiPanelBody(aiSession.resultText);
    setAiButtons(status);
    if (status === 'done') {
      setAiPanelMeta('生成完成 · ' + countChars(aiSession.resultText) + ' 字', 'ok');
    } else if (status === 'stopped') {
      setAiPanelMeta('已停止（已接收 ' + countChars(aiSession.resultText) + ' 字）');
    } else {
      aiSession.error = error || '生成失败';
      setAiPanelMeta(aiSession.error, 'error');
      toast('AI 生成失败', 'error');
      // Key 中途失效：引导重新配置（PRD §7）
      if (isAiAuthError(aiSession.error)) {
        toast('API Key 无效或已过期，请在设置中重新配置', 'error');
        openAiSettings();
      }
    }
  }

  // Python 端流式回调入口（worker 线程 evaluate_js 推送）
  window.__lnoteAiChatCb = function (msg) {
    if (!msg || !msg.sessionId || !aiSession) return;
    if (msg.sessionId !== aiSession.sessionId) return;   // 丢弃过期会话回调
    if (aiSession.status !== 'streaming') return;
    // 生成中切换文档：停止任务并丢弃（PRD §7）
    var d = activeDoc();
    if (aiSession.docId && (!d || d.id !== aiSession.docId)) {
      requestStop();
      aiSession.status = 'stopped';
      aiSession = null;
      var p = $('ai-panel');
      if (p) p.style.display = 'none';
      return;
    }
    if (msg.type === 'delta') {
      aiSession.resultText += (msg.delta || '');
      setAiPanelBody(aiSession.resultText);
      setAiButtons('streaming');
      return;
    }
    if (msg.type === 'done') { finishAi('done', msg.fullText, null); return; }
    if (msg.type === 'stopped') { finishAi('stopped', msg.fullText, null); return; }
    if (msg.type === 'error') { finishAi('error', msg.fullText, msg.error); return; }
  };

  function startAiTask(inst, src) {
    var text = src.text;
    var truncated = false;
    if (text.length > AI_MAX_CHARS) { text = text.slice(0, AI_MAX_CHARS); truncated = true; }

    // 单任务并发：先停旧任务再发起新任务（PRD §6 并发）
    if (aiSession) requestStop();

    var d = activeDoc();
    var sessionId = 'ai-' + (++aiSeq) + '-' + Date.now();
    aiSession = {
      sessionId: sessionId,
      kind: src.kind,
      docId: d ? d.id : null,
      sourceText: text,
      sourceCtx: src,
      promptKey: inst.key,
      promptLabel: inst.label,
      status: 'streaming',
      resultText: '',
      error: null,
      truncated: truncated,
      from: src.from || null,
      to: src.to || null,
      range: src.range || null,
      editable: src.editable || null
    };

    setAiPanelTitle(inst.label);
    setAiPanelBody('');
    setAiPanelMeta('正在生成…', 'pending');
    setAiButtons('streaming');
    openAiPanel();

    if (truncated) toast('内容过长，已截断到前 ' + AI_MAX_CHARS + ' 字符', 'info');

    var payload = {
      sessionId: sessionId,
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: inst.build(text) }
      ]
    };
    getApi().ai_chat(payload).then(function (r) {
      if (r && r.error) finishAi('error', '', r.error);
    }).catch(function (e) {
      finishAi('error', '', String((e && e.message) || e));
    });
  }

  // 助手入口：解析指令与选区上下文后发起任务
  function runAiInstruction(instKey, opts) {
    opts = opts || {};
    var inst = aiInstructionByKey(instKey);
    if (!inst) return;
    var kind = resolveKind(opts.kind);
    var src = opts.context || getSourceContext(kind);
    if (!src) { toast('请先选中要处理的内容', 'error'); return; }
    if (!hasApi() || !getApi().ai_chat) {
      toast('当前为浏览器预览环境，AI 助手仅在桌面版可用', 'error');
      return;
    }
    // 未配置则引导进入设置 AI 页签（PRD 功能 #8）
    if (aiEntryBlocked()) return;
    startAiTask(inst, src);
  }

  function onAiRetry() {
    if (!aiSession || !aiSession.sourceCtx) return;
    var inst = aiInstructionByKey(aiSession.promptKey);
    if (!inst) return;
    startAiTask(inst, aiSession.sourceCtx);
  }

  /* ---------------- 结果处置 ---------------- */

  function applyText(text, replace) {
    if (!cm) return;
    if (replace && aiSession.from && aiSession.to) {
      var endR = cm.replaceRange(text, aiSession.from, aiSession.to);
      cm.setCursor(endR);
    } else {
      var pos = aiSession.to || cm.getCursor();
      var endI = cm.replaceRange(text, pos);
      cm.setCursor(endI);
    }
    cm.focus();
    toast(replace ? '已替换选中内容' : '已插入到光标处', 'success');
    closeAiPanel();
  }

  function applyRich(text, replace) {
    var editable = aiSession.editable;
    var range = aiSession.range;
    if (!editable || !range) { toast('无法定位到编辑位置', 'error'); return; }
    try {
      editable.focus();
      var sel = window.getSelection();
      var r = range.cloneRange();
      if (!replace) r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
      var ok = false;
      try { ok = document.execCommand('insertText', false, text); } catch (e0) { ok = false; }
      if (!ok) {
        var r2 = range.cloneRange();
        if (!replace) r2.collapse(false);
        r2.deleteContents();
        var node = document.createTextNode(text);
        r2.insertNode(node);
        r2.setStartAfter(node);
        r2.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r2);
        editable.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (e) {
      toast('写入富文档失败：' + String((e && e.message) || e), 'error');
      return;
    }
    toast(replace ? '已替换选中内容' : '已插入到光标处', 'success');
    closeAiPanel();
  }

  function applyResult(replace) {
    if (!aiSession || !aiSession.resultText) { toast('暂无结果可处理', 'error'); return; }
    if (aiSession.kind === 'rich') applyRich(aiSession.resultText, replace);
    else applyText(aiSession.resultText, replace);
  }

  function copyAiResult() {
    if (!aiSession || !aiSession.resultText) { toast('暂无结果可复制', 'error'); return; }
    copyToClipboard(aiSession.resultText).then(function () {
      toast('结果已复制', 'success');
    }).catch(function () {
      toast('复制失败', 'error');
    });
  }

  /* ---------------- 初始化 ---------------- */

  function initAiAssistant() {
    if (aiPanelInited) return;
    aiPanelInited = true;
    var close = $('ai-panel-close');
    if (close) close.addEventListener('click', closeAiPanel);
    var stop = $('ai-stop');
    if (stop) stop.addEventListener('click', stopAiTask);
    var retry = $('ai-retry');
    if (retry) retry.addEventListener('click', onAiRetry);
    var rep = $('ai-apply-replace');
    if (rep) rep.addEventListener('click', function () { applyResult(true); });
    var ins = $('ai-apply-insert');
    if (ins) ins.addEventListener('click', function () { applyResult(false); });
    var cp = $('ai-copy');
    if (cp) cp.addEventListener('click', copyAiResult);
  }
