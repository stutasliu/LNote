# L.Note（Inkpad）最终构建报告

> 生成时间：2026-08-12　|　版本：v0.20.44　|　状态：✅ 全部通过

## 1. 报告概要

本报告记录 Inkpad（L.Note）本地文本编辑器从**单一 5676 行 IIFE 巨型文件**到**真实 ES Modules 模块化架构**的完整工程化改造成果，涵盖构建管线、测试体系、构建产物清单与校验数据。

核心交付：

| 项 | 结果 |
|---|---|
| 源码形态 | `src-app/` 20 个真实 ES Modules（显式 import/export，292 个顶层绑定，231 处跨模块引用） |
| 构建产物 | `js/app.js`（IIFE，213,784 B）＋ `js/vendor-bundle.js`（IIFE，5,016,729 B） |
| 打包产物 | `dist-web/`（Vite 生产构建，CSS 合并指纹化 93,450 B，KaTeX 字体 64 个） |
| 测试 | **47/47 通过**（15 个测试套件，0 失败） |
| file:// 兼容 | ✅ 已由 `tests/e2e/dist-web.test.js` 的 file:// 直载用例验证（pywebview 打包场景） |

## 2. 工程化改造历程

| 阶段 | 内容 | 关键成果 |
|---|---|---|
| Phase 1 | 巨型文件拆分 | `app.js` 5676 行 IIFE 按职责拆为 `src-app/` 20 个模块；`tools/build-app.js` 构建期拼接，运行时逐字等价 |
| Phase 2 | 状态管理重构 | 集中式 `state` 对象（docs/activeId/previewOn/currentVisual）＋ `bus` 事件总线（pub/sub），数据变更统一 `docs:changed` 事件驱动刷新 |
| Phase 3 | 构建工具链 | Vite dev server（`tools/vite-plugin-inkpad.js` 自动重拼 + 热刷新）＋ CSS/字体合并压缩管线 |
| Phase 4 | 自动化测试 | Vitest 单测（源码级函数提取，`tests/helpers/extract-fn.js`）＋ CDP 驱动 headless Edge E2E（`tests/helpers/cdp.js`，零额外下载） |
| Phase 5 | CSS 分层整理 | `style.css` 2155 行 → `css/base.css`/`layout.css`/`components.css` 按层拆分，产物 hash 逐字节一致 |
| 阶段 6 | vendor 迁移 npm | 35 个 `vendor/*.js` → 6 个 npm 依赖（esbuild 打包单文件 IIFE `js/vendor-bundle.js`）；`vendor/` 仅剩 CSS/字体静态资源 |
| 阶段 7 | 真实 ESM 迁移 | `src-app` 由「同闭包片段」改写为真实 ES Modules；14 个共享可变变量收拢进 `state`；循环依赖保留（esbuild 提升变量处理）；顶层副作用收敛为 `initEvents()`/`initApp()` 显式装配 |
| 阶段 8 | 产物级验证 | 新增 `tests/e2e/dist-web.test.js`：以 `dist-web/` 为根目录验证浏览器运行 + `file://` 直载（pywebview 打包场景） |

## 3. 最终架构

```
notion-editor/
├── src-app/            # 20 个真实 ES Modules（源码，含显式 import/export）
│   ├── 01-core.js      #   常量 / DOM 引用 els / bus 事件总线 / state 集中状态（0 外部依赖）
│   ├── 02~19-*.js      #   功能模块（保留循环依赖，ESM 规范支持）
│   ├── 20-craft-init.js#   入口：显式装配 initEvents → initApp → initCraftSidebar
├── src-vendor/main.js  # npm 依赖打包入口（CodeMirror/marked/mermaid/hljs/katex/diff）
├── tools/              # 构建与迁移工具（lib-lex 词法库 / esm-migrate / build-app 等 9 个）
├── tests/              # 测试体系（helpers + unit + e2e 3 个产物级套件）
├── css/                # 分层样式（base / layout / components / inkpad-rich）
├── js/                 # 构建产物（app.js IIFE / vendor-bundle.js / 存量运行时脚本）
├── dist-web/           # Vite 生产打包产物（PyInstaller 打包输入）
└── reports/            # 本报告归档（build-report.md / test-report.json / artifacts-hash.txt）
```

## 4. 构建管线

| 命令 | 用途 |
|---|---|
| `npm run dev` | Vite dev server（监听 src-app 变化 → esbuild 重打包 → full-reload） |
| `npm run build` | Vite 生产构建 → `dist-web/`（自动触发 src-app 打包 + 拷贝 js/vendor + 移除 crossorigin） |
| `npm run build:vendor` | esbuild 打包 npm 依赖 → `js/vendor-bundle.js` |
| `npm run build:app` | esbuild 打包 src-app ESM → `js/app.js`（IIFE，file:// 兼容） |
| `npm run verify:app` | 构建并校验无错误 |
| `npm test` / `test:unit` / `test:e2e` | 全量 / 单测 / E2E 测试 |

构建链：`src-app/*.js`（ESM）→ esbuild（IIFE，传统 script）→ `js/app.js`；`src-vendor/main.js` → esbuild（IIFE）→ `js/vendor-bundle.js`；Vite 合并 CSS/字体 → `dist-web/`；PyInstaller 按 `Inkpad.spec` 打包（`dist-web/index.html` + `js/` + `vendor/` 静态资源 + `css/` + `icons/`）。

## 5. 测试体系（47/47 通过）

| 套件 | 文件 | 用例数 | 覆盖内容 |
|---|---|---|---|
| 单测 | `tests/unit/pure-fns.test.js` | 24 | JSON/XML 格式化、转义、Unicode、Base64、文本工具、时间戳、文件名清洗（源码级提取，与源码强同步） |
| E2E 冒烟 | `tests/e2e/smoke.test.js` | 8 | 加载 / 新建 / 编辑 / 信息面板 / 预览 / 查找替换 / 删除 / 全程零异常 |
| E2E vendor | `tests/e2e/vendor.test.js` | 8 | 六库全局就位、marked/katex/hljs/mermaid(awaitPromise)/Diff 真实渲染、compare.html、零异常 |
| E2E 产物 | `tests/e2e/dist-web.test.js` | 7 | dist-web HTTP 加载、关键资源 200、编辑/预览/查找替换、**file:// 直载**、零异常 |

> 完整结果归档：`reports/test-report.json`（15 套件 / 47 用例 / 0 失败，startTime 1786504585642）。

## 6. 构建产物清单（SHA256）

| 产物 | 大小 | SHA256 |
|---|---|---|
| js/app.js（ESM 打包 IIFE） | 213,784 B | `55bc63faf225c0c3f1e75dcf215d12d9e43e0575a387a05a02d0fe51f0becd31` |
| js/vendor-bundle.js（npm 依赖 IIFE） | 5,016,729 B | `39111ade4646a4f021e56a748aeb4269d75e68df593581dde665fb374a85827c` |
| dist-web/index.html | 47,783 B | `b16d1a448428f084513359c183385af87e2e7c89bc26bcefd95e1507044eff13` |
| dist-web/assets/index-DZynoaPT.css（合并 CSS） | 93,504 B | `27de26e5dd20b9659259a0767c310c2486961c2577fe8f2255f8dd84b625c163` |
| dist-web/js/app.js | 213,784 B | `55bc63faf225c0c3f1e75dcf215d12d9e43e0575a387a05a02d0fe51f0becd31` |
| dist-web/js/vendor-bundle.js | 5,016,729 B | `39111ade4646a4f021e56a748aeb4269d75e68df593581dde665fb374a85827c` |
| package.json | 837 B | `8528efe27539e52cd3122808654337f615fba32a38725e8d407ee9485d0b3dd9` |
| vite.config.js | 1,308 B | `ac4f0aa207471805773dbca31beeb0d3b5eea0213b81f8f9c1c838e471dcad03` |
| vitest.config.js | 571 B | `af3bc05ba3b88b59d903211bc2236f0a301e90c430b540aec9a072c21ae9f736` |

> 全部 42 个关键文件（src-app 20 模块 / tools 9 工具 / tests 4 套件 / 产物）的完整 SHA256 清单归档于 `reports/artifacts-hash.txt`。

## 7. 迁移数据对比

| 指标 | 迁移前（同闭包 IIFE） | 迁移后（真实 ESM） |
|---|---|---|
| 源码组织 | 单一 5,676 行 IIFE，248 个函数共享闭包 | `src-app/` 20 个模块，显式 import/export |
| 顶层绑定 | 隐式共享（同作用域） | 292 个，跨模块引用 231 处（显式依赖） |
| 循环依赖 | 无概念（单闭包） | 15 模块成环（ESM 规范支持，保留） |
| 共享可变状态 | 隐式 var 提升 | 14 个变量收拢进 `state.*`（import 只读约束） |
| 模块求值副作用 | 按拼接顺序 | 收敛为 `initEvents()`/`initApp()` 显式装配 |
| 构建方式 | 字符串拼接（逐字等价） | esbuild 打包（行为等价，E2E 验证） |
| vendor 库 | 35 个全局 script | 6 个 npm 依赖打包为单文件 |

## 8. 归档产物

`reports/` 目录：

| 文件 | 说明 |
|---|---|
| `build-report.md` | 本报告 |
| `test-report.json` | Vitest JSON 完整测试报告（15 套件 / 47 用例） |
| `artifacts-hash.txt` | 42 个关键文件 SHA256 + 字节数清单 |
| `artifacts.csv` | 53 个工程文件完整清单（file, bytes, sha256 三字段 CSV） |

## 9. 已知保留项与后续建议

1. **循环依赖保留**（既定决策）：15 模块环依赖 ESM 规范支持与 esbuild 提升变量，后续如追求更干净的依赖图，可按 `analyze-deps.js` 输出的依赖方向逐模块拆层（工程量大、回归风险高，未纳入本次范围）。
2. `vendor/` 目录存在冗余 CSS/字体（Vite 已把 CSS 合并进 `assets/index-*.css`，closeBundle 仍整目录拷贝）——无害，可后续清理以减小打包体积。
3. 测试套件使用固定 HTTP 端口（8321/8322/8323）与调试端口（9333/9334/9335），多实例并行时需避免端口冲突。
4. 后续可引入 `npm run test:report`（vitest JSON reporter）与 CI 集成，将 `reports/` 作为构建产物归档。
