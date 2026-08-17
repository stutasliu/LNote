# macOS 打包方案（L.Note / Inkpad）

> 目标：把 L.Note 打包为 macOS 可运行的 `.app`（dmg 分发），保持与 Windows 版一致的功能。

## 一、结论

- **可行**。main.py 无任何 Windows 专属代码（已核查：无 win32、无平台判断、无盘符假设），前端是纯 Web 技术（Vite 产物 + file:// 相对路径，已兼容）。
- 桌面壳 pywebview 在 macOS 使用系统 **WKWebView** 内核（无需额外运行时，Win 版依赖的 WebView2 在 macOS 不存在）。
- **必须在 macOS 机器上构建**（PyInstaller 不支持跨平台交叉编译）；Windows 上生成的前端产物（`dist-web/` 等）可直接拷到 Mac 使用，Mac 上不需要 Node。
- 未签名 `.app` 会被 Gatekeeper 拦截（需右键→打开）；正式分发建议签名 + 公证（需 Apple Developer Program，$99/年）。

## 二、前置条件（在 Mac 上）

| 项 | 要求 |
|---|---|
| macOS | 11.0+（Big Sur 及以上；Intel 与 Apple Silicon 均可） |
| Python | 3.10+。**建议官方 universal2 安装包**（python.org），否则无法一次构建双架构 |
| 依赖 | `pyinstaller`、`pywebview`、`pyobjc`（macOS 的 pywebview 依赖 Cocoa/WebKit 桥） |
| 前端产物 | 从 Windows 端拷贝：`dist-web/`、`css/`、`js/`、`vendor/`、`icons/`、`compare.html`、`image_viewer.html` |
| 可选 | Apple Developer Program 账号（签名 + 公证用） |

安装依赖：

```bash
python3 -m pip install --upgrade pip
python3 -m pip install pyinstaller pywebview pyobjc-framework-Cocoa pyobjc-framework-WebKit pillow
```

## 三、构建步骤

### 1. 生成 .icns 图标

macOS 应用图标用 `.icns`（不能用 `.ico`）。`tools/gen_icns.py` 会读取 `icons/L.NOTE/icon-L.NOTE-1024x1024.png` 生成各尺寸 iconset 并调用 `iconutil` 输出 `icons/L.NOTE/icon-L.NOTE.icns`：

```bash
python3 tools/gen_icns.py
```

### 2. 用 macOS spec 打包

```bash
python3 -m PyInstaller --clean -y InkpadMac.spec
```

产物：`dist/L.Note.app`（完整 .app bundle）。可先双击验证。

### 3. 一键脚本

```bash
bash build_mac.sh
```

脚本自动：装依赖 → 生成 icns → 打包 →（如配置了证书则签名+公证）。

## 四、签名与公证（正式分发必需）

未签名应用在较新 macOS 上会提示「无法打开，因为无法验证开发者」。要消除，需：

1. 注册 **Apple Developer Program**（$99/年），在开发者后台申请 **Developer ID Application** 证书（下载到本机钥匙串）。
2. 签名：

```bash
codesign --force --deep --sign "Developer ID Application: 你的名字 (TEAMID)" \
  --options runtime dist/L.Note.app
```

3. 公证（notarization，上传 Apple 审核并盖章）：

```bash
xcrun notarytool submit dist/L.Note.app \
  --apple-id "你的AppleID" --team-id "TEAMID" --password "APP专用密码" --wait
```

4. 盖章（把公证票据钉进 app）：

```bash
xcrun stapler staple dist/L.Note.app
```

> App 专用密码：在 appleid.apple.com 生成（登录 → 安全 → App 专用密码），不要用登录密码。
> 没有证书的临时方案：右键 → 打开 → 仍要打开；或在「系统设置 → 隐私与安全性」中放行。仅适合自用，不适合对外分发。

## 五、架构（CPU）支持

| 目标 | 命令 | 说明 |
|---|---|---|
| 仅 Apple Silicon (arm64) | `python3 -m PyInstaller --clean -y InkpadMac.spec`（Python 为 arm64） | 文件最小 |
| 仅 Intel (x86_64) | 同上（Python 为 x86_64） | 老 Mac |
| **通用（推荐）** | Python 用官方 **universal2** 安装包，spec 中 `target_arch='universal2'` | 一份 .app 两端都能跑 |

分发时建议提供 universal2 版 + 单独的 arm64 精简版。

## 六、macOS 与 Windows 差异注意点（已核对）

| 项 | Windows | macOS | 处理 |
|---|---|---|---|
| 渲染内核 | Edge WebView2 | 系统 WKWebView | 无需改动 |
| localStorage 持久化 | `private_mode=False` 已持久 | 同样支持（WKWebsiteDataStore 持久存储） | 无需改动，需实机验证 |
| 文件对话框 `file_types=("所有文件 (*.*)",)` | 原生 | pywebview 跨平台统一解析该格式，`(*.*)` 视为全部文件 | 若实机异常，去掉该参数即可 |
| 富文档目录 | `~/Documents/InkpadRich` | 同（`~` = `/Users/xxx`） | 无需改动 |
| 路径分隔符 | 反斜杠 | 正斜杠 | 前端 `normPath()` 已统一处理 |
| 菜单栏 | 无 | 系统菜单栏 | pywebview 默认菜单，可后续定制 |
| 窗口行为 | 无标题栏按钮差异 | 红绿灯按钮 | `create_window` 参数通用 |

## 七、实机验证清单（打包后必测）

- [ ] 双击 .app 正常启动，无「无法验证开发者」（签名后）
- [ ] 新建文档 → 重启应用 → 文档还在（localStorage 持久化）
- [ ] 「导入文件」「打开文件夹」原生对话框正常
- [ ] Ctrl+S 改等价快捷键（macOS 惯用 Cmd+S，当前是否绑定需在 Mac 上确认；没有则提示）
- [ ] 富文档：新建 → 插图片 → 重启后图片仍在（落盘 `~/Documents/InkpadRich`）
- [ ] Markdown 预览 / Mermaid / KaTeX 渲染正常
- [ ] 文件比较窗口、图片查看器窗口可打开
- [ ] 中文输入法在编辑器内正常

> 快捷键提示：macOS 习惯 Command 键。前端监听 Ctrl+* 的快捷键（如 Ctrl+S/Ctrl+F）在 Mac 上仍需 Ctrl，若希望用 Cmd 需在 `17-events.js`/`19-find-replace.js` 中加平台判断（`navigator.platform` 含 'Mac' 时把 `ctrlKey` 换成 `metaKey`）。这是打包后最值得做的一项适配。

## 八、发布

1. 用 `hdiutil create` 把 .app 打成 dmg（可选，双击安装体验更好）：

```bash
hdiutil create -volname "L.Note" -srcfolder dist/L.Note.app -ov -format UDZO dist/L.Note-0.20.44-macos.dmg
```

2. 下载页增加 macOS 区块（下载按钮 + SHA256），截图可复用。
3. 与 Windows 版一样推到 GitHub Releases 资产。

## 九、风险与对策

| 风险 | 对策 |
|---|---|
| WKWebView 与 WebView2 渲染差异（个别 CSS） | 构建后用验证清单逐项实测；差异点用 CSS 前缀/媒体查询兜底 |
| localStorage 在 WKWebView 偶发不持久 | 已有富文档磁盘落盘兜底；普通文本文档可加「导出」习惯提示 |
| 首次 Gatekeeper 拦截 | 必须签名 + 公证；文档注明 |
| 快捷键 Ctrl vs Cmd | 打包后补平台判断适配（见第七节） |
| 无 Mac 构建机 | 需一台 Mac（或 CI：GitHub Actions `macos-latest` runner 可免费构建并产出 .app，可代为配置） |

## 十、文件清单（本次新增）

| 文件 | 说明 |
|---|---|
| `InkpadMac.spec` | macOS 版 PyInstaller 配置（.app bundle） |
| `build_mac.sh` | 一键构建脚本（依赖 + 图标 + 打包 + 可选签名/公证） |
| `tools/gen_icns.py` | 从 1024px PNG 生成 .icns 图标 |
| `docs/13-macos打包方案.md` | 本文档 |
