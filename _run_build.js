const { spawn } = require('child_process');
const path = require('path');

process.chdir(path.join(__dirname));

console.log('Starting PyInstaller build...');

const pyInstaller = spawn('python', ['-m', 'PyInstaller', 'Inkpad.spec', '--noconfirm'], {
  stdio: 'inherit',
  shell: true
});

pyInstaller.on('close', (code) => {
  console.log('PyInstaller exited with code:', code);
});

pyInstaller.on('error', (err) => {
  console.error('Failed to start PyInstaller:', err);
});
