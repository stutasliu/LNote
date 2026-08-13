const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-shot-'));
const out = path.join(tmpDir, 'shot.png');
const args = [
  '--headless',
  '--disable-gpu',
  '--no-first-run',
  '--user-data-dir=' + path.join(tmpDir, 'profile'),
  '--screenshot=' + out,
  '--window-size=1280,800',
  'http://localhost:8765/index.html'
];
try {
  execSync('"' + edge + '" ' + args.join(' '), { timeout: 15000 });
  const dst = 'd:\\Users\\differ\\AiProject\\2026-08-06-18-37-25 - 副本\\notion-editor\\_vfy\\appbar-v3.png';
  fs.copyFileSync(out, dst);
  console.log('Screenshot saved to: ' + dst);
} catch (e) {
  console.log('Error:', e.message);
}
