- **正式版本号转正 V1.0.0**：代码（`main.py` / `package.json` / 关于面板）、安装包、发布页、README 与软著材料（源程序 PDF 页眉、操作说明书登记版本号）统一对齐到 V1.0.0。

- **品牌标识全面更名 Inkpad → L.Note**：源码中残留的旧品牌字样统一改为 L.Note——前端全局对象 `InkpadApi` → `LNoteApi`，Python 侧私有属性 `__inkpad*` → `__lnote*`；构建配置改名为 `LNote.spec` / `LNoteMac.spec` / `LNoteDebug.spec`，Vite 插件改名为 `tools/vite-plugin-lnote.js`，样式表由 `css/inkpad-rich.css` 改为 `css/lnote-rich.css`，界面文案与文档不再出现旧品牌。

- **旧版富文档目录一次性平滑迁移**：富文档自动存储目录由旧名改为 `L.NoteRich`；首次使用时若检测到旧的 `InkpadRich` 目录，会自动同盘 rename 迁移（O(1) 操作），迁移失败（文件被占用等）时回退继续使用旧目录，老用户数据不丢。

- **对外协议标识保持不变，升级无感**：localStorage 键（`inkpad.docs.v1` / `inkpad.active.v1` / `inkpad.content.*` / `inkpad.settings.v1` 等）、富文档标记 `<!-- inkpad:rich -->` 与剪贴板类型 `application/x-inkpad-mind` 全部保持原样，升级后既有笔记、便签、图片与剪贴板内容均照常读取。

- **软著源程序文档消除「?」占位**：`_gen_src_pdf.py` 新增符号字体回退机制——基准字体（宋体）缺字形时，自动从 Symbol / Emoji 字体中挑出覆盖率最高者并分段绘制；源程序 PDF 中不再把无法显示的字形落成问号，残留问号仅剩源码本身自带的半角问号。

- **软著材料与发布文档同步**：源程序 PDF 页眉版本号更新为 V1.0.0，操作说明书登记版本号、安装包 / 便携版文件名、发布说明、下载页与 CHANGELOG 同步到本版。
