# L.Note 项目规则

## 代码修改后的发布流程（强制顺序）

每次完成代码修改 / 功能开发并通过验证后，**必须**按以下顺序执行，缺一不可：

### 1. 同步远程仓库（顺序固定：先 GitHub 后 Gitee）

- 先推送 GitHub：`git push github master`
- 再推送 Gitee：`git push origin master`
- 若 GitHub 推送因网络超时失败，重试直至成功，然后再推 Gitee，不可跳过 GitHub。

### 2. 生成 / 更新变更日志

- 更新根目录 `CHANGELOG.md`（Keep a Changelog 格式）：
  - 顶部新增 `## [vX.Y.Z] - 日期` 条目
  - 按「新增 / 修复 / 变更」分组记录本次改动，说明影响范围与测试情况

### 3. 更新功能列表

- 更新 `docs/06-功能列表.md`：
  - 更新顶部「版本」与「更新日期」
  - 按功能域（侧栏导航 / 文档管理 / 编辑器 / 富文档 / 翻译 / 便签等）补充本次新增的功能条目

### 4. 更新 GitHub Pages 网页（https://stutasliu.github.io/LNote/）

网页源为 `site/` 目录（在 master 分支上跟踪），发布分支为 `gh-pages`。
**关键：Pages 配置为 `branch=gh-pages, path=/`（从根目录构建）——发布文件必须放在 gh-pages 分支「根目录」，`site/` 子目录不会上线！** 只把 `site/` 检出到 gh-pages 会导致线上仍是旧版（真实教训：v0.21.7 曾因此线上停留在 v0.21.5）。需要更新的文件：

- `site/download.html`：版本号、下载链接（GitHub Releases）、校验和命令（`certutil -hashfile`）
- `site/index.html`：master 的 `site/` 不含 index.html；gh-pages 根目录的 `index.html` 是 `download.html` 的副本，发布时用 `Copy-Item download.html index.html` 生成
- `site/blink-guide.html`：顶部 badge 版本号
- `site/RELEASE-NOTES.md`：发布说明（版本标题、下载文件名、本版亮点、历史版本说明）
- `site/SHA256SUMS.txt`：用 `certutil -hashfile dist\L.Note.exe SHA256` 计算新 exe 的校验和并替换
- `site/screenshots/`：仅当截图有更新才需要动；未改截图时根目录截图保持不变即可

提交 master 并完成第 1 步推送后，将 `site/` 内容移到 gh-pages **根目录**并推送 GitHub：

```bash
git checkout gh-pages
git rm -r -q .                                   # 清空根目录旧发布文件
git checkout master -- site/                     # 检出 vX.Y.Z 的 site/ 内容
git checkout master -- .gitignore                # gh-pages 无 .gitignore，必须恢复以防 git add 误加
git mv site/download.html download.html
git mv site/blink-guide.html blink-guide.html
git mv site/RELEASE-NOTES.md RELEASE-NOTES.md
git mv site/SHA256SUMS.txt SHA256SUMS.txt
git mv site/screenshots screenshots              # 仅在截图有更新时执行
Copy-Item download.html index.html
git add -A
git commit -m "chore(site): 更新发布页面 vX.Y.Z"
git push github gh-pages
git checkout master
```

发布后验证：用 `Invoke-WebRequest "https://stutasliu.github.io/LNote/?cb=<时间戳>"`（带缓存绕过参数）核对页面出现 `vX.Y.Z`；若仍旧，先确认 `GET /pages/builds/latest` 的 `status=built` 且 commit 为刚推送的哈希，再等 CDN 缓存过期（约数分钟）后重试，勿在构建完成前反复断言。

## 构建与验证（每次改动代码后）

- 前端构建：`node tools/build-app.js; npx vite build`（生成 `js/app.js`，同步 `dist-web/`）
- Python 语法检查：`python -m py_compile main.py`
- 单元测试：`npx vitest run tests/unit`
- 打包 exe：`python -m PyInstaller Inkpad.spec --noconfirm` → `dist\L.Note.exe`（exe 被 .gitignore 忽略，仅作本地产物分发，不入库）

## 迭代开发防回归规范（吸取历史教训）

> 历史反馈："每次都迭代功能，第一次改完总是出现问题，不能完整实现。"以下规范用于避免重复踩坑。

### 一、修改前：先核实、先定位，不要凭记忆
1. **引用 DOM 必须先核实元素真实 `id`**：用 Grep/Read 确认 HTML 中元素的实际 `id`，再写 `$('...')` 映射。`getElementById` 返回 `null` 不报错，`if (els.xxx)` 守卫会静默跳过，导致功能"看似改了却没生效"。
   - 真实教训：工具栏映射写成 `$('ab-toolbar')`，而元素真实 `id` 是 `abToolbar`，导致 `els.abToolbar` 为 `null`，打开富文本文档时工具栏始终不显示。
2. **先复现并定位根因，再动手改**：读源码、看结构、确认问题真正来源。禁止"看到现象就猜着改"。

### 二、修改中：通盘考虑所有状态、关联与边界
3. **布局/样式问题要考虑所有状态**：不能只针对当前暴露的场景打补丁。同一元素在不同状态（显示/隐藏、不同文档类型、不同窗口宽度）下行为不同，修复必须让"所有状态"都正确，避免修 A 坏 B。
   - 真实教训：给 `.ab-actions` 加 `margin-left: auto` 只修好了"隐藏态按钮左移"，却会和 `.ab-toolbar` 的 `margin: 0 auto` 在"显示态"竞争 auto 外边距，引入右侧空隙；应改为"工具栏绝对居中"，两个状态互不干扰。
4. **一处引用的调用链自查**：改动函数/变量/元素时，检查所有调用方、守卫条件（如 `if (els.xxx)`）、以及是否还有其他代码依赖旧行为。
5. **新增功能必须接入全链路**：新功能（尤其新增文档类型 / 面板 / 格式化命令 / 右键菜单 / 快捷键 / 状态持久化）要枚举所有相关守卫与入口并逐一接入，漏一处即出错。
   - 真实教训：新增 PDF/Word 的 `kind` 时，需在保存 / 导出 / 磁盘写回 / 复制全链路拦截只读，漏一处就出现"能改动只读文档"；文档地图需覆盖"仅文本文档显示 / 非文本自动隐藏 / 开关状态持久化"等多个分支。
6. **考虑边界与极端场景，并回归已有功能**：剪贴板多格式（文本+图片）要文本优先、半截 / 混合 JSON 不误判、空文档 / 空 PDF 告警、超大文档首屏不卡顿、启动默认文档不闪现；同时验证改动不影响既有功能。
   - 真实教训：从 Excel/WPS 复制粘贴时剪贴板同时带文本和图片，原逻辑只看 `image/` 就按图片插入，忽略了文本，导致误判。

### 三、修改后：完整验证再交付
7. **任何改动（哪怕一个字符）都要跑完整构建链**：`node tools/build-app.js; npx vite build` → `python -m py_compile main.py` → `npx vitest run tests/unit` → `python -m PyInstaller Inkpad.spec --noconfirm`，缺一不可，不得跳过。
8. **PyInstaller 打包前先关闭运行中的 exe**：`dist\L.Note.exe` 被占用会报 `PermissionError: [WinError 5]`。打包前先确认没有 `L.Note.exe` 进程在运行，必要时先关闭再打包。
9. **交付前确认产物是最新构建**：核对 `dist\L.Note.exe` 的时间戳晚于本次修改时间，并明确告知用户"请重新打开新的 L.Note.exe"。用户反复反馈"没变"，多因仍在使用旧构建产物。

### 四、代码检查清单（每次迭代逐项勾选）

> 以下清单把第 1–9 条规则展开为可执行步骤，每次迭代开发完成一项勾一项，全部勾选才允许交付。

#### 阶段一：修改前（对应规则 1–2）

**规则 1：DOM 引用核实**
- [ ] 用 Grep 在 `index.html` 搜索目标元素的真实 `id="..."`，记录下来
- [ ] 打开 `src-app/01-core.js`，逐一核对 `els` 映射里的 key 与 HTML id **大小写完全一致**
- [ ] 全局搜索（Grep）所有引用该元素的 `$('...')` 调用，确认拼写全部一致
- [ ] 若代码用 `if (els.xxx)` 守卫，确认该元素在页面中必然存在（未被条件渲染移除）
- [ ] 若元素 id 被改名，搜索旧 id 的所有残留引用（`Grep "旧id" src-app index.html css`）

**规则 2：根因定位**
- [ ] 用 Read 阅读相关源码（而非凭记忆），确认问题真实来源
- [ ] 用浏览器/`npx vitest` 复现问题，记录复现步骤与当前行为
- [ ] 确认改动范围最小化：仅改必要的文件与行，不顺手改无关代码
- [ ] 改动前记录现状（截图或行为描述），供改动后对比验证

#### 阶段二：修改中（对应规则 3–6）

**规则 3：布局全状态**
- [ ] 列出目标元素的所有状态：显示/隐藏、文档类型（`text`/`flow`/`mind`/`note`/`rich`）、窗口窄/宽、侧栏折叠/展开
- [ ] 逐一检查每个状态下布局是否符合预期
- [ ] 检查 flex/grid 中 `margin: auto` 是否与其他元素竞争（两个 `auto` 会同分剩余空间）
- [ ] 检查元素 `display:none` 后相邻元素是否会失去定位推力
- [ ] 优先用「绝对定位 + 居中」等不依赖兄弟元素的状态方案，而非 `margin: auto`

**规则 4：调用链自查**
- [ ] Grep 搜索被改动函数/变量/元素的所有引用处，逐个核对调用方
- [ ] 检查每个调用方的传参与期望返回值是否兼容
- [ ] 检查守卫条件（`if (els.xxx)`、`if (kind === 'rich')` 等）在改动后是否仍成立
- [ ] 检查事件监听、快捷键、右键菜单、`openDoc()` 切换等入口是否引用旧行为

**规则 5：全链路接入**
- [ ] 枚举新功能的所有入口：菜单、工具栏按钮、右键菜单、快捷键、双击/「打开方式」/拖拽、导入
- [ ] 若涉及状态持久化：确认 localStorage key 的写入与恢复逻辑都已接
- [ ] 若新增文档类型 `kind`：用 Grep 搜索所有 `kind ===` 分支，逐一确认打开/保存/导出/磁盘写回/复制/删除/重命名/回收站全部接入
- [ ] 若新增只读类型（PDF/Word/图片查看）：确认所有写路径（保存/导出/磁盘写回/复制文档）都有拦截

**规则 6：边界与回归**
- [ ] 空数据：空文档、空文件、0 行文本、空白 PDF
- [ ] 异常输入：半截/混合 JSON、剪贴板多格式（文本+图片）、超大文件、非 UTF-8 编码
- [ ] 性能：超大文档首屏渲染、懒加载包首次加载是否卡顿
- [ ] 启动路径：默认文档是否闪现、外部文件传入是否覆盖默认文档
- [ ] 回归测试：手动跑一遍本次改动影响模块的相邻功能（粘贴/折叠/查找/预览/大纲/文档地图）

#### 阶段三：修改后（对应规则 7–9）

**规则 7：完整构建链（缺一不可）**
- [ ] `node tools/build-app.js` 成功
- [ ] `npx vite build` 成功（`dist-web/` 同步更新）
- [ ] `python -m py_compile main.py` 成功
- [ ] `npx vitest run tests/unit` 全部通过（当前基线 87 项）
- [ ] 本次新增逻辑已补对应单元测试（如 `hasClipboardText`、`revealTarget` 先例）

**规则 8：打包前清理**
- [ ] 执行 `Get-Process L.Note -ErrorAction SilentlyContinue` 确认无运行中的 exe
- [ ] 有残留进程则先关闭，再执行 `python -m PyInstaller Inkpad.spec --noconfirm`
- [ ] 打包命令退出码为 0，且无 `PermissionError`/`WinError 5`

**规则 9：产物交付确认**
- [ ] 核对 `dist\L.Note.exe` 的文件修改时间晚于本次代码最后修改时间
- [ ] 核对版本号一致：`main.py` 的 `APP_VERSION` 与 `package.json` 的 `version`
- [ ] 向用户明确说明"请重新打开新的 `dist\L.Note.exe` 验证"，避免误用旧产物

## 版本号约定

- 正式版本号定义于 `main.py`（`APP_VERSION`）与 `package.json`（`version`），两处需保持一致
- 功能代号（如 v0.21.x）以代码注释 / CHANGELOG 为准
