# L.Note（Inkpad）

本地 Notion 风文本编辑器 —— 语法高亮 / Markdown 实时预览 / Mermaid 图表 / JSON·XML 格式化，数据全部保存在浏览器本地存储（localStorage），纯本地运行、无需联网。

> 版本：v0.20.44　|　许可证：MIT

---

## ⬇️ 下载与安装

- 最新版下载页：`release/download.html`（或访问仓库 `release/` 目录）
- 便携版（免安装）：`release/L.Note-v0.20.44-win64.exe`，双击即用
- 校验和：`release/SHA256SUMS.txt`
- 发布说明：`release/RELEASE-NOTES.md`

> 系统要求：Windows 10/11（x64），依赖 Edge WebView2 运行时（Win11 自带，Win10 一般已预装）。
> 未签名程序首次运行可能出现 SmartScreen「未知发布者」提示，点击「更多信息」→「仍要运行」即可。

---

## ✨ 功能特性

**编辑器**
- CodeMirror 5 语法高亮，支持 Markdown / JSON / XML / HTML / JavaScript / Python / CSS / SQL / Shell / YAML / C·Java·C++ / Mermaid 等 12 种语言
- 括号自动配对、自动补全、折叠、多光标、行号点击选行

**文档与预览**
- Markdown 实时预览（marked 渲染 + highlight.js 代码高亮 + KaTeX 数学公式）
- Mermaid 流程图 / 思维导图实时渲染与缩放
- 思维笔记（InkpadNote 富文档）与飞书式左侧大纲（TOC + 搜索）
- 富文档 bubble menu（选中文本浮出工具条）

**工具**
- JSON / XML 格式化与压缩
- 文本工具：转义/反转义、Unicode、Base64、URL 编码、大小写转换、全角半角、去重、缩进计算
- 查找/替换（仿 EverEdit）：正则、全文档高亮、批量替换、收藏规则
- 文件比较（双栏行级 diff，支持本地文件加载）
- 编码转换、时间戳工具、代码段插入、剪贴板历史、图片查看器（缩放/平移/适应窗口）

**工程化**
- 真实 ES Modules 架构（`src-app/` 20 个模块，显式 import/export）
- vendor 库已迁移为 npm 依赖（esbuild 打包单文件，file:// 兼容）
- 自动化测试：Vitest 单测 + CDP 驱动 headless Edge E2E（47 用例）

---

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | pywebview（Edge WebView2 内核） |
| 前端 | 原生 HTML / CSS / JS（无框架） |
| 编辑器 | CodeMirror 5 |
| 渲染 | marked · mermaid · highlight.js · KaTeX · diff |
| 构建 | Vite + esbuild（Node.js） |
| 打包 | PyInstaller（`Inkpad.spec`） |
| 测试 | Vitest + CDP（Node 内置 WebSocket，零额外下载） |

---

## 📁 目录结构

```
notion-editor/
├── main.py               # 桌面入口（pywebview）
├── index.html            # 主窗口页面
├── compare.html          # 文件比较窗口
├── image_viewer.html     # 图片查看器窗口
├── src-app/              # 前端源码（20 个真实 ES Modules）
├── src-vendor/main.js    # npm 依赖打包入口
├── css/                  # 分层样式（base / layout / components / inkpad-rich）
├── tools/                # 构建与迁移工具
├── tests/                # 测试（unit + e2e + helpers）
├── js/                   # 构建产物（app.js / vendor-bundle.js）
├── dist-web/             # Vite 生产打包产物（PyInstaller 输入）
├── reports/              # 构建报告与测试产物归档
├── Inkpad.spec           # PyInstaller 打包配置
└── vite.config.js        # Vite 构建配置
```

---

## 📦 环境要求

- **Node.js ≥ 18**（构建与测试）
- **Python 3.10+**（桌面运行），依赖 `pywebview`

```bash
# 安装前端依赖
npm install
```

---

## 🚀 使用

### 开发模式

```bash
npm run dev
```

启动 Vite dev server；修改 `src-app/` 会自动重新打包并整页刷新。

### 桌面运行（开发）

```bash
python main.py
```

### 生产构建

```bash
npm run build            # 生成 dist-web/（Vite 产物，供打包）
npm run build:vendor     # 重新打包 npm 依赖（js/vendor-bundle.js）
npm run build:app        # 重新打包 src-app（js/app.js）
```

### 打包为 Windows exe

```bash
npm run build            # 先产出 dist-web/
pyinstaller Inkpad.spec  # 按配置打包（输出 dist/L.Note.exe）
```

### 测试

```bash
npm test                 # 全量（单测 + E2E）
npm run test:unit        # 仅单测
npm run test:e2e         # 仅 E2E（自动启动 headless Edge）
```

测试体系：24 单测（源码级纯函数提取）+ 8 冒烟 + 8 vendor + 7 构建产物验证，共 **47 用例**。

---

## 🔧 构建管线

```
src-app/*.js（ESM）─esbuild→ js/app.js（IIFE，传统 script）
src-vendor/main.js ─esbuild→ js/vendor-bundle.js（IIFE）
Vite 合并 CSS/字体 → dist-web/（index.html + assets/ + js/ + vendor/）
PyInstaller 按 Inkpad.spec 打包 → L.Note.exe
```

产物保持传统 script + 相对路径，兼容 `file://` 加载（pywebview 打包场景），详见 `reports/build-report.md`。

---

## 🔒 数据与隐私

- 文档数据全部保存在浏览器 **localStorage**（键 `inkpad.docs.v1` / `inkpad.active.v1`）
- 无网络请求、无账户系统、不上传任何数据
- 可选接入 pywebview 原生文件对话框进行本地磁盘保存/导入

---

## 📄 许可证

[MIT](LICENSE) © 2026 小先生
