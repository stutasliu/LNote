/* [esm] 导出本模块顶层绑定 */
export { initAiConfig, loadAiConfig, isAiConfigured, isAiConfigLoaded, refreshAiConfigState, onAiConfigChanged, openAiSettings, aiEntryBlocked, isAiAuthError };
/* [esm] 导入依赖模块绑定 */
import { $ } from './01-core.js';
import { getApi, hasApi } from './13-api-path.js';
import { toast } from './16-doc-ops.js';
import { openSettingsModal } from './26-settings.js';

  /* ---------------- AI（BYOK）配置面板（v0.22：设置弹窗「AI」页签） ----------------
   * 后端：main.py LNoteApi.ai_get_config / ai_save_config / ai_test
   * 约束：明文 Key 只经 ai_save_config 单向提交到本机文件，回读一律脱敏；
   *       连通性测试走 worker 线程 + evaluate_js 回调（与翻译一致）。 */

  var AI_PRESETS = {
    deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
    openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    moonshot: { baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    zhipu: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    custom: { baseUrl: '', model: '' }
  };

  var AI_TEST_TIMEOUT = 45000;

  var aiCfgView = null;   // 后端下发的脱敏视图
  var aiBusy = false;
  var aiInited = false;
  var aiTestTimer = null;
  var aiTestPending = false;
  var aiCfgLoaded = false;        // 是否已拿到过一次配置结果（避免加载期误判未配置）
  var aiCfgListeners = [];        // 配置变更订阅者（用于刷新 AI 入口置灰态）

  /* ---------------- 配置状态与未配置引导（v0.22：S4 / PRD 功能 #8） ----------------
   * 单一事实来源：AI 入口置灰、调用前预检均读取这里的缓存状态，
   * 避免各功能模块各自请求 ai_get_config 造成状态不一致。 */

  // 配置是否就绪：Base URL / 模型名 / 密钥三者齐备
  function isAiConfigured() {
    return !!(aiCfgView && aiCfgView.baseUrl && aiCfgView.model && aiCfgView.hasKey);
  }
  function isAiConfigLoaded() { return aiCfgLoaded; }

  function notifyAiConfig() {
    for (var i = 0; i < aiCfgListeners.length; i++) {
      try { aiCfgListeners[i](isAiConfigured()); } catch (e) {}
    }
  }
  function onAiConfigChanged(cb) {
    if (typeof cb === 'function') aiCfgListeners.push(cb);
  }

  // 静默刷新配置状态：不改动设置面板 DOM，供入口置灰与预检共用
  function refreshAiConfigState() {
    if (!hasApi() || !getApi().ai_get_config) {
      aiCfgLoaded = true; notifyAiConfig();
      return Promise.resolve(null);
    }
    return getApi().ai_get_config().then(function (r) {
      aiCfgView = (r && r.config) || null;
      aiCfgLoaded = true; notifyAiConfig();
      return aiCfgView;
    }).catch(function () {
      aiCfgLoaded = true; notifyAiConfig();
      return null;
    });
  }

  // 打开设置弹窗并切到「AI」页签（PRD 功能 #8 未配置引导）
  function openAiSettings() {
    try {
      openSettingsModal();
      var tab = document.querySelector('.settings-tab[data-settings-tab="ai"]');
      if (tab) tab.click();
    } catch (e) {}
  }

  // AI 入口守卫：桌面版且已确认未配置时返回 true 并引导进入设置；
  // 浏览器预览环境返回 false，交由各功能模块给出「仅桌面版可用」提示。
  function aiEntryBlocked() {
    if (!hasApi() || !aiCfgLoaded || isAiConfigured()) return false;
    toast('请先在设置中完成 AI 配置', 'error');
    openAiSettings();
    return true;
  }

  // 鉴权类错误识别（PRD §7：Key 中途失效 → 401 引导进入设置）
  function isAiAuthError(msg) {
    var s = String(msg || '');
    return s.indexOf('401') >= 0 || s.indexOf('403') >= 0 ||
      s.indexOf('API Key') >= 0 || s.indexOf('密钥') >= 0;
  }

  function setAiStatus(text, kind) {
    var el = $('settings-ai-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = kind === 'error' ? 'var(--danger)'
      : (kind === 'ok' || kind === 'pending') ? 'var(--accent)' : '';
  }

  function setAiBusy(busy) {
    aiBusy = busy;
    var t = $('settings-ai-test');
    var s = $('settings-ai-save');
    if (t) { t.disabled = busy; t.textContent = busy ? '测试中…' : '测试连接'; }
    if (s) s.disabled = busy;
  }

  function matchPreset(baseUrl) {
    var url = String(baseUrl || '').replace(/\/+$/, '');
    var hit = 'custom';
    Object.keys(AI_PRESETS).forEach(function (k) {
      if (k === 'custom') return;
      if (AI_PRESETS[k].baseUrl.replace(/\/+$/, '') === url) hit = k;
    });
    return hit;
  }

  function applyAiView(cfg) {
    aiCfgView = cfg || null;
    aiCfgLoaded = true;
    notifyAiConfig();
    var baseurl = $('settings-ai-baseurl');
    var model = $('settings-ai-model');
    var keyInput = $('settings-ai-key');
    var preset = $('settings-ai-preset');
    if (baseurl) baseurl.value = (cfg && cfg.baseUrl) || '';
    if (model) model.value = (cfg && cfg.model) || '';
    if (preset) preset.value = matchPreset(cfg && cfg.baseUrl);
    if (keyInput) {
      keyInput.value = '';
      keyInput.placeholder = (cfg && cfg.hasKey) ? ('已保存 ' + cfg.keyMasked + '（留空不修改）') : 'sk-...';
    }
  }

  function collectAiInput() {
    var cfg = {
      baseUrl: ($('settings-ai-baseurl') ? $('settings-ai-baseurl').value : '').trim(),
      model: ($('settings-ai-model') ? $('settings-ai-model').value : '').trim()
    };
    var key = ($('settings-ai-key') ? $('settings-ai-key').value : '').trim();
    if (key) cfg.apiKey = key;
    return cfg;
  }

  function loadAiConfig() {
    if (!hasApi() || !getApi().ai_get_config) {
      setAiStatus('当前为浏览器预览环境，AI 配置仅在桌面版可用', 'error');
      return Promise.resolve(null);
    }
    return getApi().ai_get_config().then(function (r) {
      if (!r || r.error || !r.config) {
        setAiStatus((r && r.error) || '读取配置失败', 'error');
        return null;
      }
      applyAiView(r.config);
      setAiStatus(r.config.hasKey ? '已配置密钥 ' + r.config.keyMasked : '尚未配置密钥', r.config.hasKey ? 'ok' : 'muted');
      return r.config;
    }).catch(function (e) {
      setAiStatus('读取配置失败：' + String((e && e.message) || e), 'error');
      return null;
    });
  }

  function onTestConnection() {
    if (aiBusy) return;
    var input = collectAiInput();
    if (!input.baseUrl) { setAiStatus('请先填写 Base URL', 'error'); return; }
    if (!input.apiKey && !(aiCfgView && aiCfgView.hasKey)) { setAiStatus('请先填写 API Key', 'error'); return; }
    if (!input.model) { setAiStatus('请先填写模型名', 'error'); return; }
    if (!hasApi() || !getApi().ai_test) { setAiStatus('当前为浏览器预览环境，无法测试连接', 'error'); return; }
    setAiBusy(true);
    setAiStatus('正在测试…', 'pending');
    aiTestPending = true;
    if (aiTestTimer) clearTimeout(aiTestTimer);
    aiTestTimer = setTimeout(function () {
      aiTestTimer = null;
      if (!aiTestPending) return;
      aiTestPending = false;
      setAiBusy(false);
      setAiStatus('测试超时，请检查网络或 Base URL', 'error');
    }, AI_TEST_TIMEOUT);
    getApi().ai_test(input).catch(function (e) {
      if (aiTestTimer) { clearTimeout(aiTestTimer); aiTestTimer = null; }
      aiTestPending = false;
      setAiBusy(false);
      setAiStatus('测试失败：' + String((e && e.message) || e), 'error');
    });
  }

  // Python 端测试完成后的回调入口（worker 线程 evaluate_js 推送）
  window.__lnoteAiTestCb = function (r) {
    if (!aiTestPending) return;
    aiTestPending = false;
    if (aiTestTimer) { clearTimeout(aiTestTimer); aiTestTimer = null; }
    setAiBusy(false);
    r = r || {};
    if (r.error) {
      setAiStatus('连接失败：' + r.error, 'error');
      toast('AI 连接测试失败', 'error');
      return;
    }
    var ms = (r.latencyMs != null) ? (' · ' + r.latencyMs + 'ms') : '';
    setAiStatus('连接成功 · ' + (r.model || '') + ms, 'ok');
    toast('AI 连接测试成功', 'success');
  };

  function onSaveConfig() {
    if (aiBusy) return;
    if (!hasApi() || !getApi().ai_save_config) { toast('浏览器预览环境无法保存 AI 配置', 'error'); return; }
    var input = collectAiInput();
    if (!input.baseUrl) { setAiStatus('请先填写 Base URL', 'error'); return; }
    if (!input.model) { setAiStatus('请先填写模型名', 'error'); return; }
    getApi().ai_save_config(input).then(function (r) {
      if (!r || r.error || !r.config) {
        setAiStatus((r && r.error) || '保存失败', 'error');
        toast('AI 配置保存失败', 'error');
        return;
      }
      applyAiView(r.config);
      setAiStatus(r.config.hasKey ? '已保存 · 密钥 ' + r.config.keyMasked : '已保存 · 尚未配置密钥', r.config.hasKey ? 'ok' : 'muted');
      toast('AI 配置已保存', 'success');
    }).catch(function (e) {
      setAiStatus('保存失败：' + String((e && e.message) || e), 'error');
      toast('AI 配置保存失败', 'error');
    });
  }

  function onClearKey() {
    if (aiBusy) return;
    if (!hasApi() || !getApi().ai_save_config) return;
    getApi().ai_save_config({ clearKey: true }).then(function (r) {
      if (r && r.config) applyAiView(r.config);
      setAiStatus('密钥已清除', 'muted');
      toast('已清除本机保存的 API Key', 'success');
    }).catch(function (e) {
      toast('清除失败：' + String((e && e.message) || e), 'error');
    });
  }

  function onPresetChange() {
    var v = ($('settings-ai-preset') ? $('settings-ai-preset').value : 'custom') || 'custom';
    var p = AI_PRESETS[v];
    if (!p || v === 'custom') return;
    if ($('settings-ai-baseurl')) $('settings-ai-baseurl').value = p.baseUrl;
    if ($('settings-ai-model')) $('settings-ai-model').value = p.model;
    setAiStatus('已填入预设，请补充 API Key 后测试', 'muted');
  }

  function initAiConfig() {
    if (aiInited) return;
    aiInited = true;
    var test = $('settings-ai-test');
    var save = $('settings-ai-save');
    var clear = $('settings-ai-clear');
    var preset = $('settings-ai-preset');
    if (test) test.addEventListener('click', onTestConnection);
    if (save) save.addEventListener('click', onSaveConfig);
    if (clear) clear.addEventListener('click', onClearKey);
    if (preset) preset.addEventListener('change', onPresetChange);
    // 预取配置状态，供 AI 入口置灰（PRD 功能 #8）；pywebview 桥晚于脚本注入，需补挂事件
    if (hasApi()) refreshAiConfigState();
    window.addEventListener('pywebviewready', function () { refreshAiConfigState(); });
  }
