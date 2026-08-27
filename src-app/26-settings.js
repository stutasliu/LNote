/* [esm] 导出本模块顶层绑定 */
export { settingsState, currentCombo, buildCmExtraKeys, handleGlobalKeydown, openSettingsModal, closeSettingsModal, initSettings };
/* [esm] 导入依赖模块绑定 */
import { $ } from './01-core.js';
import { cm } from './04-editor-init.js';
import { renderList } from './06-doc-list.js';
import { saveDoc, newRichDoc, newVisualDoc } from './09-rich-save.js';
import { execEditorCmd, formatCurrent } from './11-format-tools.js';
import { handleTabKey } from './12-snippet-clip.js';
import { openSingleModal } from './15-insert.js';
import { newDoc, newSticky, toast } from './16-doc-ops.js';
import { frFindNext, openFindModal } from './19-find-replace.js';

/* ---------------- 设置：持久化状态 / 默认值 / 快捷键 ---------------- */
var SETTINGS_KEY = 'inkpad.settings.v1';
var DEFAULT_SETTINGS = {
  fontSize: 14,
  lineWrapping: true,
  lineNumbers: true,
  shortcuts: {
    save: 'Ctrl-S',
    newDoc: 'Ctrl-N',
    newRich: 'Ctrl-Shift-N',
    newFlow: 'Ctrl-Alt-N',
    newMind: 'Ctrl-Alt-M',
    newNote: 'Ctrl-Shift-M',
    newSticky: 'Ctrl-Alt-S',
    find: 'Ctrl-F',
    replace: 'Ctrl-H',
    findNext: 'F3',
    findPrev: 'Shift-F3',
    format: 'Ctrl-Shift-F',
    toggleComment: 'Ctrl-/',
    foldAll: 'Ctrl-Alt-F',
    unfoldAll: 'Ctrl-Alt-Shift-F',
    selectNextOccurrence: 'Ctrl-Alt-Down',
    mergeLines: 'Ctrl-Shift-J'
  }
};
var SHORTCUT_LIST = [
  { id: 'save', label: '保存文档', scope: 'global' },
  { id: 'newDoc', label: '新建文档', scope: 'global' },
  { id: 'newRich', label: '新建富文档', scope: 'global' },
  { id: 'newFlow', label: '新建流程图', scope: 'global' },
  { id: 'newMind', label: '新建思维导图', scope: 'global' },
  { id: 'newNote', label: '新建思维笔记', scope: 'global' },
  { id: 'newSticky', label: '新建便利贴', scope: 'global' },
  { id: 'find', label: '查找', scope: 'editor' },
  { id: 'replace', label: '替换', scope: 'editor' },
  { id: 'findNext', label: '查找下一个', scope: 'editor' },
  { id: 'findPrev', label: '查找上一个', scope: 'editor' },
  { id: 'format', label: '格式化文档', scope: 'editor' },
  { id: 'toggleComment', label: '注释 / 取消注释', scope: 'editor' },
  { id: 'foldAll', label: '全部折叠', scope: 'editor' },
  { id: 'unfoldAll', label: '全部展开', scope: 'editor' },
  { id: 'selectNextOccurrence', label: '选中下一处匹配', scope: 'editor' },
  { id: 'mergeLines', label: '合并行', scope: 'editor' }
];
var settingsState = null;
function loadSettings() {
  var base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  try {
    var saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
    if (typeof saved.fontSize === 'number') base.fontSize = saved.fontSize;
    if (typeof saved.lineWrapping === 'boolean') base.lineWrapping = saved.lineWrapping;
    if (typeof saved.lineNumbers === 'boolean') base.lineNumbers = saved.lineNumbers;
    if (saved.shortcuts) {
      Object.keys(base.shortcuts).forEach(function (k) {
        var v = saved.shortcuts[k];
        if (typeof v === 'string' && v) base.shortcuts[k] = v;
      });
    }
  } catch (e) {}
  if (!localStorage.getItem(SETTINGS_KEY)) {
    // 兼容旧版本：inkpad.fontsize 迁移到统一设置
    var oldFs = parseInt(localStorage.getItem('inkpad.fontsize'), 10);
    if (oldFs) base.fontSize = oldFs;
  }
  settingsState = base;
}
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsState));
  } catch (e) {}
}
function currentCombo(id) {
  return settingsState && settingsState.shortcuts && settingsState.shortcuts[id] ? settingsState.shortcuts[id] : (DEFAULT_SETTINGS.shortcuts[id] || '');
}
function fmtCombo(combo) {
  return (combo || '').replace(/-/g, '+');
}
function parseCombo(combo) {
  var parts = (combo || '').split('-');
  var key = parts.pop() || '';
  return {
    ctrl: parts.indexOf('Ctrl') >= 0,
    shift: parts.indexOf('Shift') >= 0,
    alt: parts.indexOf('Alt') >= 0,
    meta: parts.indexOf('Cmd') >= 0,
    key: key
  };
}
function comboKeyForCompare(combo) {
  return (combo || '').replace('Cmd-', 'Ctrl-');
}
function canonicalKey(k) {
  if (!k) return '';
  var m = { 'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right', ' ': 'Space', 'Escape': 'Esc' };
  var v = m[k] || k;
  return v.length === 1 ? v.toUpperCase() : v;
}
function matchesCombo(e, combo) {
  var p = parseCombo(combo);
  if (!p.key) return false;
  // Ctrl / Cmd 视为同一"主修饰键"（跨平台不区分）
  var evtPrimary = e.ctrlKey || e.metaKey;
  if ((p.ctrl || p.meta) !== evtPrimary) return false;
  if (!!e.shiftKey !== !!p.shift) return false;
  if (!!e.altKey !== !!p.alt) return false;
  return canonicalKey(e.key).toLowerCase() === p.key.toLowerCase();
}
function buildCmExtraKeys() {
  var s = settingsState ? settingsState.shortcuts : DEFAULT_SETTINGS.shortcuts;
  var keys = {
    'Tab': handleTabKey,
    'Shift-Tab': function (cm2) { cm2.execCommand('indentLess'); }
  };
  var actionMap = {
    find: function () { openFindModal(false); },
    replace: function () { openFindModal(true); },
    findNext: function () { frFindNext(false); },
    findPrev: function () { frFindNext(true); },
    format: formatCurrent,
    toggleComment: 'toggleComment',
    foldAll: 'foldAll',
    unfoldAll: 'unfoldAll',
    selectNextOccurrence: 'selectNextOccurrence',
    mergeLines: function () { execEditorCmd('merge'); }
  };
  Object.keys(actionMap).forEach(function (id) {
    var combo = s[id];
    if (!combo) return;
    keys[combo] = actionMap[id];
    // 同时注册平台互换变体（Cmd ↔ Ctrl）
    var hasCtrl = combo.indexOf('Ctrl') >= 0;
    var hasCmd = combo.indexOf('Cmd') >= 0;
    if (hasCtrl && !hasCmd) {
      keys[combo.replace('Ctrl-', 'Cmd-')] = actionMap[id];
    } else if (hasCmd && !hasCtrl) {
      keys[combo.replace('Cmd-', 'Ctrl-')] = actionMap[id];
    }
  });
  return keys;
}
function handleGlobalKeydown(e) {
  if (e.defaultPrevented) return false;
  if (matchesCombo(e, currentCombo('save'))) {
    e.preventDefault();
    saveDoc(false);
    return true;
  }
  if (matchesCombo(e, currentCombo('newDoc'))) {
    e.preventDefault();
    newDoc('plaintext');
    return true;
  }
  if (matchesCombo(e, currentCombo('newRich'))) {
    e.preventDefault();
    newRichDoc();
    return true;
  }
  if (matchesCombo(e, currentCombo('newFlow'))) {
    e.preventDefault();
    newVisualDoc('flow');
    return true;
  }
  if (matchesCombo(e, currentCombo('newMind'))) {
    e.preventDefault();
    newVisualDoc('mind');
    return true;
  }
  if (matchesCombo(e, currentCombo('newNote'))) {
    e.preventDefault();
    newVisualDoc('note');
    return true;
  }
  if (matchesCombo(e, currentCombo('newSticky'))) {
    e.preventDefault();
    var d = newSticky();
    renderList();
    if (d) toast('已新建便利贴', 'success');
    return true;
  }
  return false;
}

loadSettings();

/* ---------------- 设置弹窗绑定（通用设置 + 快捷键） ---------------- */
var settingsRecordingId = null;
var settingsRecordingBtn = null;
function syncSettingsControls() {
  $('settings-fontsize').value = settingsState.fontSize;
  $('settings-fontsize-val').textContent = settingsState.fontSize + 'px';
  $('settings-linenum').value = settingsState.lineNumbers ? '1' : '0';
  $('settings-wrap').value = settingsState.lineWrapping ? '1' : '0';
}
function switchSettingsTab(name) {
  Array.prototype.forEach.call(document.querySelectorAll('.settings-tab'), function (t) {
    t.classList.toggle('active', t.getAttribute('data-settings-tab') === name);
  });
  $('settings-pane-general').style.display = name === 'general' ? '' : 'none';
  $('settings-pane-keys').style.display = name === 'keys' ? '' : 'none';
  if (name === 'keys') renderShortcutList();
}
function renderShortcutList() {
  var box = $('settings-keys-list');
  box.innerHTML = '';
  SHORTCUT_LIST.forEach(function (item) {
    var row = document.createElement('div');
    row.className = 'sk-row';
    var lab = document.createElement('span');
    lab.className = 'sk-label';
    lab.textContent = item.label;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sk-combo';
    btn.textContent = fmtCombo(currentCombo(item.id));
    btn.title = '点击后按下新组合键进行录制';
    btn.addEventListener('click', function () {
      startSettingsRecording(item.id, btn);
    });
    row.appendChild(lab);
    row.appendChild(btn);
    box.appendChild(row);
  });
}
function startSettingsRecording(id, btn) {
  stopSettingsRecording();
  settingsRecordingId = id;
  settingsRecordingBtn = btn;
  btn.classList.add('recording');
  btn.textContent = '请按键…';
  btn.blur();
  window.addEventListener('keydown', onSettingsRecordKeydown, true);
}
function stopSettingsRecording() {
  window.removeEventListener('keydown', onSettingsRecordKeydown, true);
  settingsRecordingId = null;
  if (settingsRecordingBtn) {
    settingsRecordingBtn.classList.remove('recording');
    settingsRecordingBtn = null;
  }
}
function onSettingsRecordKeydown(e) {
  if (!settingsRecordingId) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat) return;
  var ck = canonicalKey(e.key);
  if (!ck) return;
  if (ck === 'Esc') {
    stopSettingsRecording();
    toast('已取消修改', 'info');
    return;
  }
  var mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Cmd');
  if (mods.length === 0 && ck.length === 1) {
    toast('请至少含一个修饰键（Ctrl / Alt / Shift / Cmd）', 'error');
    return;
  }
  var combo = mods.concat([ck]).join('-');
  var conflict = null;
  Object.keys(DEFAULT_SETTINGS.shortcuts).forEach(function (k) {
    if (k === settingsRecordingId) return;
    if (comboKeyForCompare(currentCombo(k)) === comboKeyForCompare(combo)) conflict = k;
  });
  if (conflict) {
    var dupLabel = '';
    SHORTCUT_LIST.forEach(function (it) {
      if (it.id === conflict) dupLabel = it.label;
    });
    stopSettingsRecording();
    toast('快捷键 ' + fmtCombo(combo) + ' 已被「' + dupLabel + '」占用', 'error');
    renderShortcutList();
    return;
  }
  settingsState.shortcuts[settingsRecordingId] = combo;
  saveSettings();
  cm.setOption('extraKeys', buildCmExtraKeys());
  stopSettingsRecording();
  renderShortcutList();
  toast('快捷键已更新', 'success');
}
function openSettingsModal() {
  syncSettingsControls();
  renderShortcutList();
  openSingleModal('settings-modal');
}
function closeSettingsModal() {
  stopSettingsRecording();
  $('settings-modal').style.display = 'none';
}

var fontSize = settingsState.fontSize;
function applyFontSize(px) {
  settingsState.fontSize = px;
  fontSize = px;
  cm.getWrapperElement().style.fontSize = px + 'px';
  cm.refresh();
  saveSettings();
}

/* ---------------- 设置初始化：弹窗绑定 + 应用持久化选项 ---------------- */
function initSettings() {
  $('settings-close').addEventListener('click', closeSettingsModal);
  $('settings-done').addEventListener('click', closeSettingsModal);
  $('settings-modal').addEventListener('click', function (e) {
    if (e.target === $('settings-modal')) closeSettingsModal();
  });
  $('settings-reset').addEventListener('click', function () {
    settingsState = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    saveSettings();
    cm.setOption('lineNumbers', settingsState.lineNumbers);
    cm.setOption('lineWrapping', settingsState.lineWrapping);
    cm.setOption('extraKeys', buildCmExtraKeys());
    applyFontSize(settingsState.fontSize);
    syncSettingsControls();
    renderShortcutList();
    toast('已恢复默认设置', 'success');
  });
  Array.prototype.forEach.call(document.querySelectorAll('.settings-tab'), function (t) {
    t.addEventListener('click', function () {
      switchSettingsTab(t.getAttribute('data-settings-tab'));
    });
  });
  $('settings-fontsize').addEventListener('input', function () {
    var px = parseInt(this.value, 10) || 14;
    applyFontSize(px);
    $('settings-fontsize-val').textContent = px + 'px';
  });
  $('settings-linenum').addEventListener('change', function () {
    settingsState.lineNumbers = this.value === '1';
    saveSettings();
    cm.setOption('lineNumbers', settingsState.lineNumbers);
  });
  $('settings-wrap').addEventListener('change', function () {
    settingsState.lineWrapping = this.value === '1';
    saveSettings();
    cm.setOption('lineWrapping', settingsState.lineWrapping);
  });

  // 应用持久化的编辑器选项（04 初始化使用默认值，这里覆盖为已保存设置）
  cm.setOption('lineNumbers', settingsState.lineNumbers);
  cm.setOption('lineWrapping', settingsState.lineWrapping);
  cm.setOption('extraKeys', buildCmExtraKeys());
  applyFontSize(settingsState.fontSize);
  // Ctrl+滚轮缩放编辑器字体（持久化）
  cm.getWrapperElement().addEventListener('wheel', function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    fontSize = Math.min(26, Math.max(10, fontSize + (e.deltaY < 0 ? 1 : -1)));
    applyFontSize(fontSize);
  }, { passive: false });
}
