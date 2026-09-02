/* [esm] 导出本模块顶层绑定 */
export { initAutoUpdate, showUpdateModal };
/* [esm] 导入依赖模块绑定 */
import { $ } from './01-core.js';
import { getApi, hasApi } from './13-api-path.js';
import { openSingleModal } from './15-insert.js';
import { toast } from './16-doc-ops.js';

/* ---------------- 自动更新：启动检查 / 更新提示弹窗 / 一键更新 ---------------- */
// 本次会话是否已执行过启动检查（避免重复触发）
var _autoChecked = false;
// 待更新版本 tag（check_update 返回的 latest，如 "v0.21.13"）
var _pendingTag = '';
// 是否有更新任务进行中（防重复点击）
var _updateBusy = false;

// 顶栏「更多」按钮红色更新标签：显示/隐藏
function setUpdBadge(on) {
  var el = $('update-badge');
  if (el) el.style.display = on ? 'block' : 'none';
}

function setUpdStatus(text, cls) {
  var el = $('update-status');
  el.textContent = text || '';
  el.className = 'update-status' + (cls ? ' ' + cls : '');
}

function closeUpdateModal() {
  $('update-modal').style.display = 'none';
}

function showUpdateModal(latest, current) {
  if (!latest) return;
  $('update-versions').textContent = '当前版本 ' + (current || '') + '  →  最新版本 ' + latest;
  $('update-title').textContent = '发现新版本 ' + latest;
  setUpdStatus('', '');
  var actions = $('update-actions');
  var prog = $('update-progress');
  if (actions) actions.style.display = '';
  if (prog) prog.style.display = 'none';
  openSingleModal('update-modal');
}

function _setUpdProgressView() {
  var actions = $('update-actions');
  var prog = $('update-progress');
  if (actions) actions.style.display = 'none';
  if (prog) prog.style.display = 'block';
}

// 下载进度：percent 为 -1/非法值时显示不确定进度条动画
function _setUpdProgress(percent) {
  var bar = $('update-progress');
  var inner = $('update-progress-inner');
  var txt = $('update-progress-text');
  var p = Number(percent);
  if (isNaN(p) || p < 0) {
    bar.className = 'update-progress indet';
    inner.style.width = '';
    txt.textContent = '正在下载更新…';
  } else {
    bar.className = 'update-progress';
    inner.style.width = Math.min(100, Math.max(0, p)) + '%';
    txt.textContent = '正在下载更新 ' + Math.round(p) + '%';
  }
}

function _failUpdate(msg) {
  _updateBusy = false;
  setUpdStatus(msg, 'err');
  var actions = $('update-actions');
  var prog = $('update-progress');
  if (actions) actions.style.display = '';
  if (prog) prog.style.display = 'none';
  setUpdBadge(true); // 保留红色标签：仍有新版本可更新
}

// 后端下载/安装进度回调（见 main.py start_update 推送的 payload）
function _onUpdateCb(p) {
  if (!p || typeof p !== 'object') return;
  if (p.ok === false) {
    _failUpdate(p.error || '更新失败');
    return;
  }
  var s = p.state;
  if (s === 'downloading') {
    _setUpdProgress(p.percent);
  } else if (s === 'ready') {
    var txt = $('update-progress-text');
    if (txt) txt.textContent = '下载完成，正在安装…';
  } else if (s === 'installing') {
    var txt2 = $('update-progress-text');
    if (txt2) txt2.textContent = '正在安装，安装完成后将自动重启…';
  }
}

function startUpdate() {
  if (_updateBusy) return;
  var api = getApi();
  if (!api || !api.start_update) {
    toast('当前环境不支持自动更新', 'err');
    return;
  }
  var tag = _pendingTag;
  if (!tag) {
    toast('缺少目标版本信息，请稍后重试', 'err');
    return;
  }
  _updateBusy = true;
  setUpdStatus('', '');
  _setUpdProgressView();
  _setUpdProgress(-1);
  window.__inkpadUpdateCb = _onUpdateCb;
  api.start_update(tag).then(function (r) {
    if (!r) return;
    if (r.error) _failUpdate(r.error);
    else if (!r.started) _failUpdate('更新任务未能启动');
  }).catch(function (e) {
    _failUpdate('更新失败：' + (e && e.message ? e.message : '网络异常'));
  });
}

// 启动自动检查：发现新版本 → 红色标签 + 弹出更新提示；已是最新 → 无任何处理
function autoCheckUpdate() {
  if (_autoChecked) return;
  _autoChecked = true;
  var api = getApi();
  if (!api || !api.check_update) return; // 浏览器环境/桥未就绪：静默跳过
  api.check_update().then(function (r) {
    if (r && r.ok && r.update_available && r.latest) {
      _pendingTag = r.latest;
      setUpdBadge(true);
      showUpdateModal(r.latest, r.current);
    }
    // 已是最新版本：不弹窗、不加角标
  }).catch(function (e) {
    console.warn('[lnote] 启动自动更新检查失败：' + (e && e.message ? e.message : e));
  });
}

/* ---------------- 自动更新初始化：绑定弹窗事件 + 启动检查 ---------------- */
function initAutoUpdate() {
  $('update-close').addEventListener('click', closeUpdateModal);
  $('update-later').addEventListener('click', closeUpdateModal);
  $('update-now').addEventListener('click', startUpdate);
  $('update-modal').addEventListener('click', function (e) {
    if (e.target === $('update-modal')) closeUpdateModal();
  });
  // 启动自动检查：pywebview 桥就绪后再执行（等界面稳定稍作延迟）
  var boot = function () { setTimeout(autoCheckUpdate, 1200); };
  if (hasApi()) {
    boot();
  } else {
    window.addEventListener('pywebviewready', function h() {
      window.removeEventListener('pywebviewready', h);
      boot();
    }, { once: true });
  }
}
