const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-debug-'));

// 用 CDP 方式启动 Edge
const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--user-data-dir=' + path.join(tmpDir, 'profile'),
  '--remote-debugging-port=9333',
  '--window-size=1280,800',
  'http://localhost:8765/index.html'
];

try {
  const child = require('child_process').spawn('"'+edge+'"', args, { shell: true, detached: true });
  setTimeout(() => {
    try {
      // 获取 CDP 数据
      const http = require('http');
      http.get('http://127.0.0.1:9333/json', (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const tabs = JSON.parse(data);
            const tab = tabs[0];
            if (tab && tab.webSocketDebuggerUrl) {
              const WebSocket = require('ws');
              const ws = new WebSocket(tab.webSocketDebuggerUrl);
              ws.on('open', () => {
                // 获取按钮状态
                ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `JSON.stringify({
                  btnExists: !!document.getElementById('btn-toggle-sidebar2'),
                  btnDisplay: document.getElementById('btn-toggle-sidebar2') ? getComputedStyle(document.getElementById('btn-toggle-sidebar2')).display : 'N/A',
                  btnVisibility: document.getElementById('btn-toggle-sidebar2') ? getComputedStyle(document.getElementById('btn-toggle-sidebar2')).visibility : 'N/A',
                  btnPointerEvents: document.getElementById('btn-toggle-sidebar2') ? getComputedStyle(document.getElementById('btn-toggle-sidebar2')).pointerEvents : 'N/A',
                  btnZIndex: document.getElementById('btn-toggle-sidebar2') ? getComputedStyle(document.getElementById('btn-toggle-sidebar2')).zIndex : 'N/A',
                  btnRect: document.getElementById('btn-toggle-sidebar2') ? JSON.stringify(document.getElementById('btn-toggle-sidebar2').getBoundingClientRect()) : 'N/A',
                  sidebarClass: document.getElementById('sidebar') ? document.getElementById('sidebar').className : 'N/A',
                  appbarPosition: getComputedStyle(document.getElementById('appbar')).position,
                  appbarZIndex: getComputedStyle(document.getElementById('appbar')).zIndex,
                  elementAtBtn: document.getElementById('btn-toggle-sidebar2') ? (() => { var r = document.getElementById('btn-toggle-sidebar2').getBoundingClientRect(); return document.elementFromPoint(r.x + 5, r.y + 5) ? document.elementFromPoint(r.x + 5, r.y + 5).id + '.' + document.elementFromPoint(r.x + 5, r.y + 5).className : 'null' })() : 'N/A'
                })` }}));
              });
              ws.on('message', (msg) => {
                const result = JSON.parse(msg);
                if (result.id === 1) {
                  console.log('Button debug info:', result.result.result.value);
                  ws.close();
                  process.exit(0);
                }
              });
            }
          } catch(e) { console.log('Parse error:', e.message); process.exit(1); }
        });
      }).on('error', (e) => { console.log('HTTP error:', e.message); process.exit(1); });
    } catch(e) { console.log('Error:', e.message); process.exit(1); }
  }, 3000);
} catch(e) {
  console.log('Spawn error:', e.message);
}
