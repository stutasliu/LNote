/* [esm] 导出本模块顶层绑定 */
export { detectLang, targetFor, buildQuery, callTranslate, translateSelection, closeTranslateModal };
/* [esm] 导入依赖模块绑定 */
import { $ } from './01-core.js';
import { cm } from './04-editor-init.js';
import { copyToClipboard } from './11-format-tools.js';
import { getApi, hasApi } from './13-api-path.js';
import { openSingleModal } from './15-insert.js';
import { toast } from './16-doc-ops.js';

  /* ---------------- 翻译功能（v0.21：右键菜单「翻译」→ 弹窗展示） ---------------- */

  // 语言粗判：CJK 汉字数量 ≥ 英文字母数且 ≥ 1 → 'zh'，否则 'en'
  function detectLang(text) {
    var t = String(text == null ? '' : text);
    var cjk = 0;
    var latin = 0;
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i);
      if (c >= 0x4E00 && c <= 0x9FFF) cjk++;
      else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) latin++;
    }
    return (cjk > 0 && cjk >= Math.max(latin, 1)) ? 'zh' : 'en';
  }

  // 目标语言：中文 → 英文，其余 → 中文
  function targetFor(src) { return src === 'zh' ? 'en' : 'zh'; }

  // 规整待翻译文本：去首尾空白 + 截断到 1500 字符（翻译接口长度限制）
  function buildQuery(text) {
    var t = String(text == null ? '' : text).trim();
    if (t.length > 1500) t = t.slice(0, 1500);
    return t;
  }

  function _langLabel(lang) {
    if (lang === 'zh') return '中文';
    if (lang === 'en') return '英文';
    return String(lang || '').toUpperCase();
  }

  var __trCb = null;
  var __trTimer = null;

  // 翻译调用：桌面版走 pywebview 桥接（Python 端 worker 线程请求 + evaluate_js 回调推送），
  // 浏览器预览（无桥接）时直连 Google 公共翻译接口
  function callTranslate(text, target) {
    if (hasApi()) {
      return new Promise(function (resolve) {
        __trCb = resolve;
        if (__trTimer) clearTimeout(__trTimer);
        __trTimer = setTimeout(function () {
          __trTimer = null;
          if (__trCb) { var cb = __trCb; __trCb = null; cb({ error: '翻译超时，请检查网络' }); }
        }, 20000);
        getApi().translate(text, target).catch(function (e) {
          if (__trCb) { var cb2 = __trCb; __trCb = null; if (__trTimer) clearTimeout(__trTimer); cb2({ error: String((e && e.message) || e) }); }
        });
      });
    }
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
      encodeURIComponent(target) + '&dt=t&q=' + encodeURIComponent(text);
    return fetch(url).then(function (resp) { return resp.json(); }).then(function (data) {
      var segs = (data && data[0]) ? data[0] : [];
      var out = '';
      for (var i = 0; i < segs.length; i++) {
        if (segs[i] && segs[i][0]) out += segs[i][0];
      }
      if (!out) return { error: '翻译结果为空' };
      return { ok: true, text: out, target: target };
    });
  }

  // Python 端翻译完成后的回调入口（worker 线程 evaluate_js 推送）
  window.__inkpadTranslateCb = function (r) {
    if (__trCb) { var cb = __trCb; __trCb = null; if (__trTimer) clearTimeout(__trTimer); cb(r || { error: '翻译结果为空' }); }
  };

  // 右键菜单「翻译」入口：取选中文本 → 语言检测 → 请求 → 弹窗展示
  function translateSelection() {
    var text = buildQuery(cm.getSelection());
    if (!text) { toast('请先选中要翻译的内容', 'error'); return; }
    var src = detectLang(text);
    var target = targetFor(src);
    var orig = $('translate-orig');
    var result = $('translate-result');
    if (!orig || !result) { toast('翻译窗口不存在', 'error'); return; }
    orig.textContent = text;
    result.textContent = '翻译中…';
    $('translate-src-label').textContent = '原文（' + _langLabel(src) + '）';
    $('translate-dst-label').textContent = '译文（' + _langLabel(target) + '）';
    openSingleModal('translate-modal');
    callTranslate(text, target).then(function (r) {
      if (r && r.error) {
        result.textContent = '翻译失败：' + r.error;
        toast('翻译失败', 'error');
        return;
      }
      result.textContent = (r && r.text) ? r.text : '（无结果）';
    }).catch(function (e) {
      result.textContent = '翻译失败：' + String((e && e.message) || e);
      toast('翻译失败', 'error');
    });
  }

  function closeTranslateModal() {
    var m = $('translate-modal');
    if (m) m.style.display = 'none';
  }

  // 弹窗交互（markup 位于 app.js 之前，模块求值时 DOM 已就绪）
  $('translate-close').addEventListener('click', closeTranslateModal);
  $('translate-ok').addEventListener('click', closeTranslateModal);
  $('translate-copy').addEventListener('click', function () {
    var t = $('translate-result').textContent;
    if (!t || t === '翻译中…') { toast('暂无译文可复制', 'error'); return; }
    copyToClipboard(t).then(function () { toast('译文已复制', 'success'); }).catch(function () { toast('复制失败', 'error'); });
  });
  $('translate-modal').addEventListener('click', function (e) {
    if (e.target === $('translate-modal')) closeTranslateModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('translate-modal') && $('translate-modal').style.display === 'flex') closeTranslateModal();
  });
