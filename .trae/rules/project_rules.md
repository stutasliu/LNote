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

网页源为 `site/` 目录（在 master 分支上跟踪），发布分支为 `gh-pages`。需要更新的文件：

- `site/download.html`：版本号、下载链接（GitHub Releases）、校验和命令（`certutil -hashfile`）
- `site/index.html`：版本号 / 功能亮点（如涉及）
- `site/blink-guide.html`：顶部 badge 版本号
- `site/RELEASE-NOTES.md`：发布说明（版本标题、下载文件名、本版亮点、历史版本说明）
- `site/SHA256SUMS.txt`：用 `certutil -hashfile dist\L.Note.exe SHA256` 计算新 exe 的校验和并替换

提交 master 并完成第 1 步推送后，将 `site/` 同步到 `gh-pages` 分支并推送 GitHub：

```bash
git checkout gh-pages
git checkout master -- site/
git commit -m "chore(site): 更新发布页面 vX.Y.Z"
git push github gh-pages
git checkout master
```

## 构建与验证（每次改动代码后）

- 前端构建：`node tools/build-app.js; npx vite build`（生成 `js/app.js`，同步 `dist-web/`）
- Python 语法检查：`python -m py_compile main.py`
- 单元测试：`npx vitest run tests/unit`
- 打包 exe：`python -m PyInstaller Inkpad.spec --noconfirm` → `dist\L.Note.exe`（exe 被 .gitignore 忽略，仅作本地产物分发，不入库）

## 版本号约定

- 正式版本号定义于 `main.py`（`APP_VERSION`）与 `package.json`（`version`），两处需保持一致
- 功能代号（如 v0.21.x）以代码注释 / CHANGELOG 为准
