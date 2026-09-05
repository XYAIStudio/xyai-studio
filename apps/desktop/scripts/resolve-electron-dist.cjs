const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const pkg = require.resolve('electron/package.json');
const electronRoot = path.dirname(pkg);
const dist = path.join(electronRoot, 'dist');
const installJs = path.join(electronRoot, 'install.js');
if (!fs.existsSync(installJs)) {
  process.stderr.write('electron install.js missing\n');
  process.exit(1);
}
process.stderr.write('Ensuring Electron binary via install.js\n');
const r = spawnSync(process.execPath, [installJs], { cwd: electronRoot, stdio: ['ignore', 2, 2] });
if (r.error) throw r.error;
if (r.status !== 0) process.exit(r.status ?? 1);
if (!fs.existsSync(dist)) {
  process.stderr.write('electron dist still missing after install.js\n');
  process.exit(1);
}
process.stdout.write(dist);
