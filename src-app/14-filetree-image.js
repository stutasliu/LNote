/* [esm] 导出本模块顶层绑定 */
export { folderState, switchSideTab, openFolder, renderFileTree, renderDirInto, openDiskFile, openImageFile, showImageModal, closeImageModal, applyImgZoom, fitImage };
/* [esm] 导入依赖模块绑定 */
import { els, state } from './01-core.js';
import { persist, uid } from './05-store.js';
import { renderList } from './06-doc-list.js';
import { openDoc } from './07-doc-open.js';
import { EXT_LANGS, getApi, hasApi, isImageExt, isPdfExt, isDocExt, isRichDocContent, normPath, toFileUrl } from './13-api-path.js';
import { openSingleModal } from './15-insert.js';
import { toast } from './16-doc-ops.js';
import { openPdfFile } from './23-pdf.js';
import { openDocFile } from './24-doc.js';
  var folderState = { root: null, expanded: {}, openFiles: {} }; // openFiles: path -> docId

  function switchSideTab(tab) {
    var docsMode = tab === 'docs';
    els.tabDocs.classList.toggle('active', docsMode);
    els.tabFiles.classList.toggle('active', !docsMode);
    els.docList.style.display = docsMode ? '' : 'none';
    els.fileTree.style.display = docsMode ? 'none' : '';
    if (!docsMode && !folderState.root) renderFileTree();
  }

  function openFolder() {
    if (!hasApi()) { toast('本地文件夹功能需在桌面版中使用', 'error'); return; }
    getApi().pick_folder().then(function (path) {
      if (!path) return;
      folderState.root = path;
      folderState.expanded = {};
      switchSideTab('files');
      renderFileTree();
      toast('已打开文件夹', 'success');
    }).catch(function () { toast('打开文件夹失败', 'error'); });
  }

  function renderFileTree() {
    var tree = els.fileTree;
    tree.innerHTML = '';
    if (!folderState.root) {
      tree.innerHTML = '<div class="clip-empty">点击上方「📂 打开文件夹」<br>选择本地目录</div>';
      return;
    }
    var rootPath = folderState.root;
    var rootOpen = folderState.expanded[rootPath] !== false; // 默认展开

    var rootEl = document.createElement('div');
    rootEl.className = 'ft-root';
    rootEl.innerHTML = '<span class="ft-arrow">' + (rootOpen ? '▾' : '▸') + '</span>' +
      '<span class="ft-ico">' + (rootOpen ? '📂' : '📁') + '</span><span class="ft-root-name"></span>';
    rootEl.querySelector('.ft-root-name').textContent = rootPath;
    rootEl.title = rootPath + '\n点击折叠 / 展开';
    rootEl.addEventListener('click', function () {
      folderState.expanded[rootPath] = !rootOpen;
      renderFileTree();
    });
    tree.appendChild(rootEl);

    if (!rootOpen) return; // 折叠时不加载子项
    renderDirInto(rootPath, tree);
  }

  // 递归渲染目录：把 dirPath 下的条目追加到 parentEl（含可折叠子目录）
  function renderDirInto(dirPath, parentEl) {
    getApi().list_dir(dirPath).then(function (entries) {
      var container = document.createElement('div');
      container.className = 'ft-children';
      parentEl.appendChild(container);
      if (entries && entries.error) {
        container.innerHTML = '<div class="clip-empty">' + entries.error + '</div>';
        return;
      }
      (entries || []).forEach(function (item) {
        var row = document.createElement('div');
        if (item.isDir) {
          var open = !!folderState.expanded[item.path];
          row.className = 'ft-item ft-dir';
          row.innerHTML = '<span class="ft-arrow">' + (open ? '▾' : '▸') + '</span>' +
            '<span class="ft-ico">' + (open ? '📂' : '📁') + '</span><span class="ft-name"></span>';
          row.querySelector('.ft-name').textContent = item.name;
          row.querySelector('.ft-name').title = item.path;
          row.addEventListener('click', function (e) {
            e.stopPropagation();
            if (folderState.expanded[item.path]) delete folderState.expanded[item.path];
            else folderState.expanded[item.path] = true;
            renderFileTree();
          });
          container.appendChild(row);
          if (open) renderDirInto(item.path, container); // 递归加载子目录
        } else {
          var isImg = isImageExt(item.name);
          var isPdf = isPdfExt(item.name);
          var isDoc = isDocExt(item.name);
          var ftIco = isImg ? '🖼️' : (isPdf ? '📕' : (isDoc ? '📘' : '📄'));
          row.className = 'ft-item ft-file' + (isImg ? ' is-image' : '') + (isPdf ? ' is-pdf' : '') + (isDoc ? ' is-doc' : '');
          row.innerHTML = '<span class="ft-arrow"></span><span class="ft-ico">' + ftIco + '</span>' +
            '<span class="ft-name"></span><span class="ft-size"></span>';
          row.querySelector('.ft-name').textContent = item.name;
          row.querySelector('.ft-name').title = item.path;
          row.querySelector('.ft-size').textContent =
            item.size >= 1048576 ? (item.size / 1048576).toFixed(1) + 'M' :
            item.size >= 1024 ? Math.round(item.size / 1024) + 'K' :
            item.size + 'B';
          row.addEventListener('click', function () { openDiskFile(item.path, item.name); });
          container.appendChild(row);
        }
      });
    }).catch(function () {
      var container = document.createElement('div');
      container.className = 'ft-children';
      container.innerHTML = '<div class="clip-empty">读取失败</div>';
      parentEl.appendChild(container);
    });
  }

  // 判断两个磁盘路径是否指向同一文件：规范化（\\→/）+ 大小写不敏感（Windows 盘符/路径）
  function sameFile(a, b) {
    return !!a && !!b && normPath(a).toLowerCase() === normPath(b).toLowerCase();
  }
  // openFiles 缓存 key 统一用规范化小写路径，避免正/反斜杠不一致导致重复条目
  function fileKey(p) { return normPath(p).toLowerCase(); }

  function dbgLog(m) {
    try {
      if (getApi() && getApi().debug_log) getApi().debug_log('[openDiskFile] ' + m);
    } catch (e) { /* ignore */ }
  }

  function openDiskFile(path, name) {
    dbgLog('enter: ' + path);
    if (folderState.openFiles[fileKey(path)]) { openDoc(folderState.openFiles[fileKey(path)]); return; }
    if (isImageExt(name)) { openImageFile(path, name); return; }
    if (isPdfExt(name)) {
      var pdfId = openPdfFile(path, name);
      if (pdfId) folderState.openFiles[fileKey(path)] = pdfId;
      return;
    }
    if (isDocExt(name)) {
      var docId = openDocFile(path, name);
      if (docId) {
        folderState.openFiles[fileKey(path)] = docId;
        renderList();
      }
      return;
    }
    getApi().read_text_file(path).then(function (res) {
      dbgLog('read_text_file -> ' + JSON.stringify(res));
      if (!res || res.error) { toast('读取失败：' + (res && res.error || '未知错误'), 'error'); return; }
      var ext = (name.match(/\.([^.]+)$/) || [])[1] || '';

      // 【v0.18】.json 内容若符合 Inkpad 富文档块数组格式 → 当富文档打开（不再当 JSON 文本）
      if (ext.toLowerCase() === 'json' && isRichDocContent(res.content)) {
        var titleFromName = name.replace(/\.[^.]+$/, '');
        // 1) 优先复用已有同 diskPath 的文档（避免重复条目；同时「修好」误开的 text 副本）
        var existing = state.docs.find(function (x) { return sameFile(x && x.diskPath, path); });
        if (existing) {
          existing.content = res.content;
          existing.kind = 'rich';
          existing.encoding = res.encoding || 'UTF-8';
          existing.updated = Date.now();
          if (!existing.title) existing.title = titleFromName;
          persist();
          folderState.openFiles[fileKey(path)] = existing.id;
          openDoc(existing.id);
          toast('已打开富文档：' + name, 'success');
          return;
        }
        // 2) 没有现存文档 → 新建
        var d2 = {
          id: uid(),
          title: titleFromName,
          kind: 'rich',
          encoding: res.encoding || 'UTF-8',
          content: res.content,
          diskPath: path,
          updated: Date.now()
        };
        state.docs.push(d2);
        persist();
        folderState.openFiles[fileKey(path)] = d2.id;
        openDoc(d2.id);
        toast('已打开富文档：' + name, 'success');
        return;
      }

      // 普通文本文件：先复用已有同 diskPath 的文档（避免重复导入产生重复条目），
      // 有则刷新内容，无则新建
      var existing = state.docs.find(function (x) { return sameFile(x && x.diskPath, path); });
      if (existing) {
        existing.content = res.content;
        existing.encoding = res.encoding || 'UTF-8';
        existing.lang = EXT_LANGS[ext.toLowerCase()] || 'plaintext';
        existing.updated = Date.now();
        persist();
        folderState.openFiles[fileKey(path)] = existing.id;
        // 打开 HTML 磁盘文件也默认自动打开预览
        if (existing.lang === 'html') state.previewOn = true;
        openDoc(existing.id);
        toast('已打开：' + name + '（已加载磁盘最新内容）', 'success');
        return;
      }
      var d = {
        id: uid(),
        title: name,
        kind: 'text',
        lang: EXT_LANGS[ext.toLowerCase()] || 'plaintext',
        content: res.content,
        encoding: res.encoding || 'UTF-8',
        diskPath: path,
        updated: Date.now()
      };
      state.docs.push(d);
      persist();
      folderState.openFiles[fileKey(path)] = d.id;
      // 打开 HTML 磁盘文件也默认自动打开预览
      if (d.lang === 'html') state.previewOn = true;
      openDoc(d.id);
      toast('已打开：' + name + '（' + (res.encoding || 'UTF-8') + '）', 'success');
    }).catch(function () { toast('读取文件失败', 'error'); });
  }

  /* ---------------- 图片查看器 ---------------- */
  function openImageFile(path, name) {
    if (!hasApi()) {
      // 浏览器降级：直接用 file:// 打开
      showImageModal(path, name, toFileUrl(path));
      return;
    }
    getApi().read_file_b64(path).then(function (res) {
      if (res && res.b64) showImageModal(path, name, 'data:' + (res.mime || 'image/png') + ';base64,' + res.b64);
      else if (res && res.error) toast('无法预览图片：' + res.error, 'error');
      else toast('图片读取失败', 'error');
    }).catch(function () { toast('图片读取失败', 'error'); });
  }

  function showImageModal(path, name, url) {
    els.imageName.textContent = name || path;
    els.imageView.src = url;
    openSingleModal('image-modal');
    state.imgZoom = 1; state.imgPanX = 0; state.imgPanY = 0;
    applyImgZoom();
    // 等图片加载后自动适应窗口
    els.imageView.onload = function () { fitImage(); };
  }

  function closeImageModal() {
    els.imageModal.style.display = 'none';
    els.imageView.src = '';
  }

  // Phase ESM：图片查看器状态被 17-events 跨模块读写，全部收拢进 state
  state.imgZoom = 1; state.imgPanX = 0; state.imgPanY = 0;
  state.imgDragging = false; state.imgLastX = 0; state.imgLastY = 0;
  function applyImgZoom() {
    els.imageView.style.transform = 'translate(' + state.imgPanX + 'px,' + state.imgPanY + 'px) scale(' + state.imgZoom + ')';
    if (els.imgZoomReset) els.imgZoomReset.textContent = Math.round(state.imgZoom * 100) + '%';
  }
  function fitImage() {
    var img = els.imageView;
    if (!img.naturalWidth) { state.imgZoom = 1; state.imgPanX = 0; state.imgPanY = 0; applyImgZoom(); return; }
    var stage = els.imageStage;
    var z = Math.min(stage.clientWidth / img.naturalWidth, stage.clientHeight / img.naturalHeight, 1) * 0.95;
    state.imgZoom = z > 0 ? z : 1; state.imgPanX = 0; state.imgPanY = 0; applyImgZoom();
  }
