/* =========================================================
 * vite.config.js —— L.Note 前端构建配置
 *
 * 设计约束：
 *  - js/app.js 是「传统 script（IIFE）」，因为 exe 打包后由
 *    pywebview 以 file:// 加载，ES module 会被浏览器 CORS 拦截。
 *    因此本配置不对前端做模块化打包，Vite 只承担：
 *      1) dev server：改 src-app/ 自动重拼 js/app.js 并整页 reload
 *      2) 构建管线：HTML/CSS/静态资源处理 + hash + 拷贝到 dist-web/
 *  - base: './' 使产物资源使用相对路径，兼容 file:// 打包加载。
 * ========================================================= */
const { defineConfig } = require('vite');
const inkpadPlugin = require('./tools/vite-plugin-inkpad');

module.exports = defineConfig({
  root: __dirname,
  // 相对路径资源引用：产物在 file:// 下（pywebview 打包）也能正确加载
  base: './',
  publicDir: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: false
  },
  build: {
    outDir: 'dist-web',
    emptyOutDir: true,
    // 不内联任何资源（保持文件引用，兼容打包）
    assetsInlineLimit: 0,
    rollupOptions: {
      input: 'index.html'
    },
    minify: 'esbuild',
    target: 'es2017'
  },
  plugins: [inkpadPlugin()]
});
