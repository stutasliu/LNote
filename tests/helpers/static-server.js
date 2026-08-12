/* =========================================================
 * static-server.js —— 零依赖静态文件服务器（E2E 测试用）
 * ========================================================= */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

export function startStaticServer(root, port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath;
      try {
        urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      } catch {
        res.writeHead(400); res.end('bad url'); return;
      }
      if (urlPath === '/') urlPath = '/index.html';
      if (urlPath === '/favicon.ico') {
        res.writeHead(204); res.end(); return; // 无 favicon，避免 404 噪音
      }
      const file = path.join(root, urlPath);
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404: ' + urlPath);
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, url: 'http://127.0.0.1:' + port });
    });
  });
}
