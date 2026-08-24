/* [esm] 导出本模块顶层绑定 */
export { newVisualDoc, newRichDoc, ensureRichDiskPath, syncRichDiskPath, _richSaveChain, runRichSaveChain, sanitizeFileName, computeRichFilePath, richChanged, syncFromEditor, docSaveName, richDocSaveFilters, richDocSaveInitialDir, saveDoc, saveNow };
/* [esm] 导入依赖模块绑定 */
import { LANGS, bus, els, state } from './01-core.js';
import { VISUAL_MODULES, cm } from './04-editor-init.js';
import { activeDoc, persist, uid } from './05-store.js';
import { fullTime } from './06-doc-list.js';
import { openDoc } from './07-doc-open.js';
import { onVisualChange, saveUniversal } from './08-visual.js';
import { dirOf, getApi, hasApi, normPath, setCachedRichDir } from './13-api-path.js';
import { folderState } from './14-filetree-image.js';
import { saveDiskDoc, toast } from './16-doc-ops.js';
  function newVisualDoc(kind) {
    var mod = window[VISUAL_MODULES[kind]];
    var d = {
      id: uid(),
      title: '',
      kind: kind,
      lang: 'json',
      content: JSON.stringify(mod.defaultModel()),
      updated: Date.now()
    };
    state.docs.push(d);
    persist();
    openDoc(d.id);
    els.title.focus();
  }

  // 新建富文档（块编辑器 / Notion 风）
  function newRichDoc() {
    var d = {
      id: uid(),
      title: '',
      kind: 'rich',
      encoding: 'utf-8',
      content: JSON.stringify([
        { id: uid(), type: 'h1', text: '无标题文档' },
        { id: uid(), type: 'text', text: '在这里输入内容。把鼠标移到块左侧可<b>拖拽排序</b>，点 <b>+</b> 插入新块。工具栏「✨ 插入」也能追加组件。' }
      ]),
      updated: Date.now()
    };
    state.docs.push(d);
    persist();
    openDoc(d.id);
    els.title.focus();
  }

  // 富文档自动落盘：确保有磁盘文件保存完整内容（含内嵌图片），
  // 绕过 localStorage ~5MB 上限，避免内容/文档丢失。返回 Promise<是否本次新分配了路径>。
  // 【v0.17 改动】文件名 = 清洗后的文档标题 + .json，与用户看到/输入的标题保持一致。
  function ensureRichDiskPath(d) {
    if (!d || d.diskPath || !hasApi()) return Promise.resolve(false);
    return getApi().get_rich_dir().then(function (dir) {
      if (!dir) return false;
      setCachedRichDir(dir);
      var dirNorm = dir.replace(/\\/g, '/');
      var desired = (d.title && d.title.trim()) || '未命名文档';
      d.diskPath = computeRichFilePath(dirNorm, d, desired);
      d.encoding = d.encoding || 'utf-8';
      return true;
    }).catch(function () { return false; });
  }

  // 【v0.17 新增】富文档标题变化时，把磁盘文件也改名为新标题。
  // 【v0.18.1 修复】之前用 move(old→new) 与 saveDiskDoc 异步并发，会引发竞态——
  //   move 完成把 old 干掉后，saveDiskDoc 的 write 又把它当成新文件重建一份，
  //   改 N 次标题就累积 N 份同样内容。现在改为：先更新 d.diskPath → 写到新路径 → 删旧路径，整条磁盘操作串行执行。
  function syncRichDiskPath(d) {
    if (!d || d.kind !== 'rich' || !hasApi()) return Promise.resolve();
    // 第一次：还没 diskPath 时分配一个
    if (!d.diskPath) return ensureRichDiskPath(d).then(function () { return null; });
    var dir = dirOf(d.diskPath);
    if (!dir) return Promise.resolve();
    var desired = (d.title && d.title.trim()) || '未命名文档';
    var newPath = computeRichFilePath(dir, d, desired);
    if (newPath === d.diskPath) return Promise.resolve();
    var oldPath = d.diskPath;
    // 1) 立刻把 in-memory diskPath 切到新路径
    d.diskPath = newPath;
    // 2) 把当前内容写到新路径（覆盖任何 orphan）
    return getApi().write_text_file(newPath, d.content || '', d.encoding || 'utf-8').then(function (ok) {
      if (!ok) {
        // 写失败 —— 回滚 diskPath
        d.diskPath = oldPath;
        throw new Error('write_text_file 返回失败');
      }
      // 3) 写成功后再删旧路径（异步吞错）
      return getApi().delete_rich_file(oldPath).catch(function () { return null; });
    }).then(function () {
      persist();
      els.statSaved.textContent = '已保存到磁盘';
      els.statSaved.style.color = '#0f7b0f';
    });
  }

  // 【v0.18.1 新增】富文档磁盘操作串行队列，避免改标题时跟 saveDiskDoc 并发改写路径。
  var _richSaveChain = Promise.resolve();
  function runRichSaveChain(d) {
    var self = _richSaveChain.then(function () {
      if (!d || d.kind !== 'rich') return null;
      return syncRichDiskPath(d).then(function () {
        if (!d.diskPath) return null;
        return saveDiskDoc(d);  // 内容写盘（覆盖当前 diskPath 对应文件）
      });
    }).then(function () {
      if (!d) return;
      persist();
      bus.emit('docs:changed');
      els.statSaved.textContent = '已保存到磁盘';
      els.statSaved.style.color = '#0f7b0f';
    }).catch(function (err) {
      console.warn('[inkpad] 富文档保存失败：', err);
      els.statSaved.textContent = '保存失败';
      els.statSaved.style.color = 'var(--danger)';
    });
    // 队列链永不被打断（错误也吞掉），下一波 save 仍能排队
    _richSaveChain = self.then(function () { return null; }, function () { return null; });
    return self;
  }

  // 【v0.17 新增】把任意字符串清洗成可作为 Windows 文件名的 basename
  function sanitizeFileName(name) {
    var t = (name == null ? '' : String(name)).trim();
    // 替换 Windows 非法字符 \ / : * ? " < > |
    t = t.replace(/[\\/:*?"<>|\r\n\t]/g, '_');
    // 去掉控制字符
    t = t.replace(/[\x00-\x1f\x7f]/g, '');
    // 去掉 Windows 不允许的尾部 . 与空格
    t = t.replace(/[.\s]+$/, '');
    if (t.length > 80) t = t.slice(0, 80);
    t = t.replace(/[.\s]+$/, '');
    if (!t) t = '未命名文档';
    return t;
  }

  // 【v0.17 新增】根据 dir + 期望名（标题）算出一个不与「本应用其他富文档」重名的完整路径。
  // 已知已占用的路径 = docs 列表里所有 kind==='rich' 且有 diskPath 的（排除 d 自己当前的 diskPath）。
  // 注意：dir 内可能有其他非 Inkpad 管理的 .json，这里只防应用内部冲突；
  //       真要严格不重名得在 Python 端 listdir；这里做「应用内不撞」就够用，撞了改名时再走 replace 失败降级。
  function computeRichFilePath(dir, d, desiredName) {
    var base = sanitizeFileName(desiredName);
    var ext = '.json';
    var occupied = {};
    (state.docs || []).forEach(function (other) {
      if (other && other !== d && other.diskPath) occupied[other.diskPath] = true;
    });
    var candidate = dir + '/' + base + ext;
    if (!occupied[candidate] || candidate === d.diskPath) return candidate;
    var n = 1;
    while (n < 1000) {
      candidate = dir + '/' + base + '_' + n + ext;
      if (!occupied[candidate] || candidate === d.diskPath) return candidate;
      n++;
    }
    return dir + '/' + base + '_' + Date.now() + ext;  // 极端兜底
  }

  // 富文档块编辑器内容变化回调（由 block-editor.js 调用）
  function richChanged() {
    var d = activeDoc();
    if (!d || d.kind !== 'rich') return;
    d.title = els.title.value;
    d.updated = Date.now();
    els.statEdit.textContent = '最后编辑 ' + fullTime(d.updated);
    els.statSaved.textContent = '保存中…';
    els.statSaved.style.color = '';
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      runRichSaveChain(d);  // 【v0.18.1】串行：先更名（写新+删旧），再写盘
    }, 400);
  }

  function syncFromEditor() {
    var d = activeDoc();
    if (!d) return;
    // PDF 只读：仅同步标题（允许重命名），内容不可写回磁盘
    if (d.kind === 'pdf') {
      d.title = els.title.value;
      d.updated = Date.now();
      els.statEdit.textContent = '最后编辑 ' + fullTime(d.updated);
      persist();
      return;
    }
    d.content = cm.getValue();
    d.title = els.title.value;
    d.updated = Date.now();
    els.statSaved.textContent = '保存中…';
    els.statSaved.style.color = '';
    els.statEdit.textContent = '最后编辑 ' + fullTime(d.updated);
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      if (d.kind === 'rich') {
        runRichSaveChain(d);  // 【v0.18.1】同上串行化
      } else {
        persist();
        if (d.diskPath) saveDiskDoc(d);
        else { els.statSaved.textContent = '已保存'; els.statSaved.style.color = '#0f7b0f'; }
        bus.emit('docs:changed');
      }
    }, 400);
  }

  // 根据文档语言/类型推断建议保存文件名（含扩展名）
  function docSaveName(d) {
    var t = (d.title || '').trim();
    if (!t) t = '未命名';
    // 富文档独立分支：固定用 .json，避免 fallback 到 .txt
    if (d.kind === 'rich') {
      if (!/\.[a-z0-9]+$/i.test(t)) t += '.json';
      return t;
    }
    var meta = LANGS[d.lang];
    var ext = (meta && meta.ext) ? meta.ext : '.txt';
    if (!/\.[a-z0-9]+$/i.test(t)) t += ext;
    return t;
  }

  // 富文档「另存为」的过滤器（pywebview 接收 (描述, 模式) 元组序列）
  function richDocSaveFilters() {
    return ['Inkpad 富文档 (*.json)', 'JSON 格式 (*.json)', '所有文件 (*.*)'];
  }

  // 富文档「另存为」弹出对话框时建议的初始目录。
  // pywebview 的 create_file_dialog 没暴露 directory 参数，但会记住上次的位置；
  // 我们先记下当前 diskPath 所在目录，用户取消的话下次还从这里弹。
  function richDocSaveInitialDir(d) {
    if (d && d.diskPath) return dirOf(d.diskPath);
    return null;
  }

  // 保存 / 另存为：forceAsk=true 始终弹「另存为」对话框；false 时若已有 diskPath 则直接覆盖
  function saveDoc(forceAsk) {
    var d = activeDoc();
    if (!d) { toast('没有可保存的文档', 'error'); return; }
    // PDF 只读：避免把 CodeMirror 残留内容写回磁盘覆盖原 PDF
    if (d.kind === 'pdf') {
      toast('PDF 文档为只读，如需编辑请使用「提取为文本」', 'info');
      return;
    }
    clearTimeout(state.saveTimer);

    if (d.kind === 'rich') {
      // 【v0.18.2】富文档保存：forceAsk=true 也走原生「另存为」（不再是直接覆盖），
      // 让用户真正能选位置 + 选「Inkpad 富文档 (*.json)」过滤器。
      d.title = els.title.value;
      persist();
      var doRichSaveAs = forceAsk || !d.diskPath;
      if (!doRichSaveAs && d.diskPath) {
        // 已有 diskPath + 不是另存为 → 直接覆盖
        runRichSaveChain(d).then(function () {
          els.statSaved.textContent = '已保存到磁盘';
          els.statSaved.style.color = '#0f7b0f';
          bus.emit('docs:changed');
          toast('已保存：' + d.diskPath, 'success');
        }).catch(function () {
          toast('保存失败', 'error');
        });
        return;
      }
      // 「另存为」路径：弹原生对话框，写入新位置后清理旧文件
      // 首次保存（Ctrl+S/保存但无磁盘路径）先提示原因，避免用户误以为「已存在文件还让另存为」
      if (!forceAsk && !d.diskPath) toast('该文档尚未关联磁盘文件，请选择保存位置（仅首次保存需要选择）', 'info');
      var oldPath = d.diskPath || null;
      var initialName = docSaveName(d);
      var richContent = d.content || '';
      getApi().save_file_encoded(initialName, richContent, d.encoding || 'UTF-8', richDocSaveFilters()).then(function (newPath) {
        if (!newPath) { toast('已取消保存', 'info'); return; }
        // 写盘成功 → 更新 diskPath + 登记到 openFiles + 若有旧路径则尝试删掉
        d.diskPath = newPath;
        d.encoding = d.encoding || 'UTF-8';
        d.updated = Date.now();
        persist();
        if (!folderState.openFiles) folderState.openFiles = {};
        folderState.openFiles[normPath(newPath).toLowerCase()] = d.id;
        if (oldPath && oldPath !== newPath) {
          // 旧路径（如果存在）建议清掉，避免遗留 orphan
          getApi().delete_rich_file(oldPath).catch(function () {});
        }
        els.statSaved.textContent = '已保存到磁盘';
        els.statSaved.style.color = '#0f7b0f';
        bus.emit('docs:changed');
        // 区分「保存」（首次保存，无 diskPath）与「另存为」的提示
        toast((forceAsk ? '已另存为：' : '已保存：') + newPath, 'success');
      }).catch(function () {
        toast('保存失败', 'error');
      });
      return;
    }

    // 非富文档（旧路径）
    if (state.currentVisual) onVisualChange(); else syncFromEditor();
    persist();
    // 浏览器降级：直接触发下载
    if (!hasApi()) {
      saveUniversal(docSaveName(d), d.content, false);
      return;
    }
    // 已关联磁盘文件且非「另存为」→ 直接覆盖写盘
    if (!forceAsk && d.diskPath) {
      getApi().write_text_file(d.diskPath, d.content, d.encoding || 'UTF-8').then(function (ok) {
        if (ok) {
          d.updated = Date.now();
          els.statSaved.textContent = '已保存到磁盘';
          els.statSaved.style.color = '#0f7b0f';
          bus.emit('docs:changed');
          toast('已保存：' + d.diskPath, 'success');
        } else {
          toast('保存失败', 'error');
        }
      }).catch(function () {
        els.statSaved.textContent = '磁盘保存失败';
        els.statSaved.style.color = 'var(--danger)';
        toast('磁盘保存失败', 'error');
      });
      return;
    }
    // 首次保存（无 diskPath）或「另存为」→ 弹原生保存对话框
    // 首次保存先提示原因，避免用户误以为「已存在文件还让另存为」
    if (!forceAsk && !d.diskPath) toast('该文档尚未关联磁盘文件，请选择保存位置（仅首次保存需要选择）', 'info');
    getApi().save_file_encoded(docSaveName(d), d.content, d.encoding || 'UTF-8').then(function (path) {
      if (!path) { toast('已取消保存', 'info'); return; }
      d.diskPath = path;
      d.encoding = d.encoding || 'UTF-8';
      d.updated = Date.now();
      persist();
      // 登记到文件树 openFiles，避免之后双击同一磁盘文件时被当成新文档
      if (!folderState.openFiles) folderState.openFiles = {};
      folderState.openFiles[normPath(path).toLowerCase()] = d.id;
      els.statSaved.textContent = '已保存到磁盘';
      els.statSaved.style.color = '#0f7b0f';
      bus.emit('docs:changed');
      // 区分「保存」（首次保存，无 diskPath）与「另存为」的提示
      toast((forceAsk ? '已另存为：' : '已保存：') + path, 'success');
    }).catch(function () {
      toast('保存失败', 'error');
    });
  }

  function saveNow() {
    saveDoc(false);
  }
