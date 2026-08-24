/* =========================================================
 * src-vendor/doc.js —— mammoth 独立懒加载包（DOC/DOCX 查看器）
 *
 * 打包为 js/vendor-doc.js，由 index.html 的 window.__docReady(cb)
 * 在首次打开 .doc/.docx 时动态注入，避免拖慢启动。
 *
 * mammoth 在浏览器端把 .docx 转换为语义化 HTML（标题/段落/列表/
 * 表格/图片），并提供 extractRawText 用于复制全文，无需后端参与。
 * 注意：mammoth 只支持 .docx（OOXML）；.doc（老式二进制）在评估
 * 阶段确认不可行，前端按只读二进制提示处理。
 * ========================================================= */
import * as mammoth from 'mammoth/mammoth.browser.min.js';
window.mammoth = mammoth;
