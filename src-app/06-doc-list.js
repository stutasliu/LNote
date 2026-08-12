/* [esm] 导出本模块顶层绑定 */
export { renderList, pendingDelId, openDocDelConfirm, closeDocDelConfirm, deleteDoc, shortTime, fullTime };
/* [esm] 导入依赖模块绑定 */
import { $, bus, els, state } from './01-core.js';
import { cm, docIcon } from './04-editor-init.js';
import { persist } from './05-store.js';
import { openDoc } from './07-doc-open.js';
import { folderState } from './14-filetree-image.js';
import { openSingleModal } from './15-insert.js';
import { toast } from './16-doc-ops.js';
  /* ---------------- 渲染：侧栏 ---------------- */
  function renderList() {
    els.docList.innerHTML = '';
    var sorted = state.docs.slice().sort(function (a, b) { return b.updated - a.updated; });
    sorted.forEach(function (d) {
      var item = document.createElement('div');
      item.className = 'doc-item' + (d.id === state.activeId ? ' active' : '');
      item.dataset.docId = d.id;
      item.dataset.docPath = d.diskPath || '';
      item.innerHTML =
        '<span class="doc-emoji">' + docIcon(d) + '</span>' +
        '<span class="doc-name"></span>' +
        '<span class="doc-time">' + shortTime(d.updated) + '</span>';
      item.querySelector('.doc-name').textContent = d.title || '无标题';
      item.addEventListener('click', function () { openDoc(d.id); });
      els.docList.appendChild(item);
    });
    // v0.20.36：导航抽屉「最近文档」计数 = 文档总数
    var rc = document.getElementById('navRecentCount');
    if (rc) rc.textContent = String(state.docs.length);
  }

  /* ---------------- 删除文档 ---------------- */
  var pendingDelId = null;
  function openDocDelConfirm(id) {
    var d = null;
    for (var i = 0; i < state.docs.length; i++) { if (state.docs[i].id === id) { d = state.docs[i]; break; } }
    if (!d) return;
    pendingDelId = id;
    var name = d.title || '无标题';
    if (d.diskPath) name += '（磁盘文件）';
    $('doc-del-name').textContent = name;
    var foot = $('doc-del-foot');
    if (foot) foot.textContent = d.diskPath
      ? '仅从列表移除记录，不会删除磁盘上的源文件。'
      : '本地未保存的文档也会一并从列表移除（无法恢复）。';
    openSingleModal('doc-del-modal');
  }
  function closeDocDelConfirm() {
    pendingDelId = null;
    $('doc-del-modal').style.display = 'none';
  }
  function deleteDoc(id) {
    var idx = -1;
    for (var i = 0; i < state.docs.length; i++) { if (state.docs[i].id === id) { idx = i; break; } }
    if (idx < 0) return;
    var removed = state.docs[idx];
    // 同步清理文件树中已打开记录
    if (removed.diskPath && folderState.openFiles) {
      for (var p in folderState.openFiles) {
        if (folderState.openFiles[p] === id) delete folderState.openFiles[p];
      }
    }
    state.docs.splice(idx, 1);
    // 清理该文档遗留的正文
    if (removed.id) { try { localStorage.removeItem('inkpad.content.' + removed.id); } catch (e) {} }
    // 重新定位 activeId
    if (state.activeId === id) {
      state.activeId = state.docs.length ? state.docs[Math.max(0, idx - 1)].id : null;
    }
    persist();
    bus.emit('docs:changed');
    if (state.activeId) {
      openDoc(state.activeId);
    } else {
      // 没有文档了，清空编辑器
      els.title.value = '';
      els.statEdit.textContent = '';
      els.statEnc.textContent = '';
      els.statEditSep.style.display = 'none';
      if (cm) { cm.setValue(''); }
      els.breadcrumb.textContent = '📝 文档';
    }
    toast('已从「我的文档」移除：' + (removed.title || '无标题'));
  }

  function shortTime(ts) {
    var diff = Date.now() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    var dt = new Date(ts);
    return (dt.getMonth() + 1) + '/' + dt.getDate();
  }

  function fullTime(ts) {
    var dt = new Date(ts);
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) +
      ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
  }
