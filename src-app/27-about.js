/* [esm] 导出本模块顶层绑定 */
export { openAboutModal, initAbout };
/* [esm] 导入依赖模块绑定 */
import { $ } from './01-core.js';
import { getApi } from './13-api-path.js';
import { openSingleModal } from './15-insert.js';
import { toast } from './16-doc-ops.js';

/* ---------------- 关于：版本号 / 检查更新 / 更新日志 ---------------- */
// 版本号与 main.py 的 APP_VERSION / package.json 的 version 保持一致
var APP_VERSION = '0.21.12';
var APP_RELEASES_URL = 'https://github.com/stutasliu/LNote/releases';
var APP_HOME_URL = 'https://stutasliu.github.io/LNote/';

// 与 main.py _version_greater 语义一致的版本比较（a > b 返回 true）
function versionGreater(a, b) {
  function parts(v) {
    var arr = String(v || '').replace(/^v/i, '').trim().split('.');
    var out = [];
    for (var i = 0; i < 3; i++) {
      var m = String(arr[i] || '').match(/\d+/);
      out.push(m ? parseInt(m[0], 10) : 0);
    }
    return out;
  }
  var pa = parts(a), pb = parts(b);
  for (var i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i];
  }
  return false;
}

function setAboutStatus(text, cls) {
  var el = $('about-status');
  el.textContent = text;
  el.className = 'about-update-status' + (cls ? ' ' + cls : '');
}

function openAboutModal() {
  var verEl = $('about-version');
  var api = getApi();
  if (api && api.get_version) {
    api.get_version().then(function (r) {
      if (r && r.version) verEl.textContent = '版本 ' + r.version;
    }).catch(function () {});
  } else {
    verEl.textContent = '版本 ' + APP_VERSION;
  }
  setAboutStatus('点击「检查更新」获取最新版本信息');
  openSingleModal('about-modal');
}

function closeAboutModal() {
  $('about-modal').style.display = 'none';
}

function openExternal(url) {
  var api = getApi();
  if (api && api.open_external) {
    api.open_external(url).catch(function () {});
  } else {
    window.open(url, '_blank');
  }
}

function checkUpdate() {
  var btn = $('about-check');
  btn.disabled = true;
  setAboutStatus('正在检查更新…');
  var api = getApi();
  if (api && api.check_update) {
    api.check_update().then(function (r) {
      btn.disabled = false;
      if (r && r.ok) {
        if (r.update_available) {
          setAboutStatus('发现新版本 ' + r.latest + '（当前 ' + r.current + '），可在更新日志中查看', 'warn');
          toast('发现新版本 ' + r.latest, 'success');
        } else {
          setAboutStatus('已是最新版本 ' + r.latest, 'ok');
          toast('已是最新版本', 'success');
        }
      } else if (r && r.error) {
        setAboutStatus(r.error, 'err');
      } else {
        setAboutStatus('检查更新失败，请稍后重试', 'err');
      }
    }).catch(function (e) {
      btn.disabled = false;
      setAboutStatus('检查更新失败：' + (e && e.message ? e.message : '网络异常'), 'err');
    });
  } else {
    btn.disabled = false;
    setAboutStatus('浏览器环境未连接更新服务，当前版本 ' + APP_VERSION);
  }
}

/* ---------------- 关于初始化：弹窗绑定 ---------------- */
function initAbout() {
  $('about-close').addEventListener('click', closeAboutModal);
  $('about-done').addEventListener('click', closeAboutModal);
  $('about-modal').addEventListener('click', function (e) {
    if (e.target === $('about-modal')) closeAboutModal();
  });
  $('about-check').addEventListener('click', checkUpdate);
  $('about-changelog').addEventListener('click', function () { openExternal(APP_RELEASES_URL); });
  $('about-home').addEventListener('click', function () { openExternal(APP_HOME_URL); });
}
