/* =========================================================
 * vite-plugin-inkpad.js —— 把 src-app 拼接流程接入 Vite
 *
 * 背景：前端源码按职责拆在 src-app/*.js（同闭包片段），
 * 由 tools/build-app.js 拼回 js/app.js。本插件让 Vite 在
 * dev/build 时自动保证 js/app.js 是最新拼接产物：
 *   - buildStart：启动时重拼一次（确保产物/服务内容最新）
 *   - configureServer：监听 src-app/ 变化 → 重拼 + 整页 reload
 * ========================================================= */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src-app');
const OUT_DIR = path.join(ROOT, 'dist-web');

function rebuild() {
  execSync('node tools/build-app.js', { cwd: ROOT, stdio: 'inherit' });
}

module.exports = function inkpadPlugin() {
  return {
    name: 'inkpad-build',
    enforce: 'pre',
    // dev/build 启动时确保 js/app.js 由 src-app 最新拼接生成
    buildStart() {
      rebuild();
    },
    configureServer(server) {
      // 监听 src-app 变化：重新拼接 + 整页 reload（拼接产物非模块，用整页刷新而非 HMR）
      let timer = null;
      fs.watch(SRC_DIR, { persistent: true }, (evt, filename) => {
        if (!filename || !filename.endsWith('.js')) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
          timer = null;
          try {
            rebuild();
          } catch (e) {
            console.error('[inkpad] rebuild failed:', e.message);
            return;
          }
          server.ws.send({ type: 'full-reload' });
        }, 120);
      });
    },
    // Vite 对非 module script 只警告不拷贝（js/app.js、vendor/* 等是传统
    // script，必须原样进产物），这里在构建收尾时手动复制运行时脚本目录。
    // 注：css/ 已被 Vite 合并进 assets/index-*.css，无需拷贝。
    closeBundle() {
      for (const dir of ['js', 'vendor']) {
        fs.cpSync(path.join(ROOT, dir), path.join(OUT_DIR, dir), { recursive: true });
      }
      // Vite 会给 CSS link 加 crossorigin 属性，在 file://（pywebview 打包）
      // 环境下会被 CORS 拦截导致样式失效，这里统一移除。
      const htmlPath = path.join(OUT_DIR, 'index.html');
      if (fs.existsSync(htmlPath)) {
        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace(/\scrossorigin(="[^"]*")?/gi, '');
        fs.writeFileSync(htmlPath, html);
      }
      console.log('[inkpad] 已复制 js/ vendor/ 到 dist-web/ 并移除 crossorigin');
    }
  };
};
