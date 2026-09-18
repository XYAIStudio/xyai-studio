/**
 * afterPack: embed XYAI icon.ico into XYAI Studio.exe (Windows).
 * signAndEditExecutable is false to avoid winCodeSign symlink errors,
 * so shortcuts otherwise keep the default Electron atom icon.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function findRcedit() {
  const roots = [
    path.join(__dirname, '..', 'node_modules'),
    path.join(__dirname, '..', '..', '..', 'node_modules'),
  ];
  const rels = [
    ['rcedit', 'bin', 'rcedit.exe'],
    ['rcedit', 'bin', 'rcedit-x64.exe'],
    ['@electron', 'rcedit', 'bin', 'rcedit.exe'],
    ['app-builder-bin', 'win', 'x64', 'rcedit-x64.exe'],
    ['app-builder-lib', 'templates', 'win', 'rcedit-x64.exe'],
  ];
  for (const root of roots) {
    for (const rel of rels) {
      const candidate = path.join(root, ...rel);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }
  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exe = path.join(context.appOutDir, exeName);
  const ico = path.join(context.packager.projectDir, 'build', 'icon.ico');
  if (!fs.existsSync(exe)) {
    console.warn('[after-pack] exe missing, skip icon embed:', exe);
    return;
  }
  if (!fs.existsSync(ico)) {
    console.warn('[after-pack] icon.ico missing, skip icon embed:', ico);
    return;
  }
  const rcedit = findRcedit();
  if (!rcedit) {
    console.warn(
      '[after-pack] rcedit not found; run on Windows: rcedit-x64.exe "<exe>" --set-icon build/icon.ico',
    );
    return;
  }
  const r = spawnSync(rcedit, [exe, '--set-icon', ico], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (r.status !== 0) {
    console.warn('[after-pack] rcedit failed:', r.stderr || r.stdout || r.status);
    return;
  }
  console.log('[after-pack] set exe icon', exe);
};
