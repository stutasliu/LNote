/* =========================================================
 * src-vendor/pdf.js —— pdf.js 独立懒加载包（PDF 查看器）
 *
 * 打包为 js/vendor-pdf.js，由 index.html 的 window.__pdfReady(cb)
 * 在首次打开 PDF 时动态注入，避免拖慢启动。
 *
 * 关键点：应用以 file:// 加载页面，Chromium 禁止 file:// 页面创建
 * Web Worker，因此 worker 不通过 new Worker 启动。构建时把
 * pdf.worker.min.js 以普通 <script> 先行注入（注册 window.pdfjsWorker），
 * pdf.js 检测到该全局后自动降级为主线程 fake worker，无需网络/Worker。
 * cmaps/ 与 standard_fonts/ 由 build-vendor.js 拷贝到 js/ 下，
 * 保证中文 PDF（Adobe-GB1 等 CID 字体）离线渲染不乱码。
 * ========================================================= */
import * as pdfjsLib from 'pdfjs-dist/build/pdf.min.js';
window.pdfjsLib = pdfjsLib;
