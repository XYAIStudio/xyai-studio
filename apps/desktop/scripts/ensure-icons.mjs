/**
 * Copy tracked brand icons into apps/desktop/build/ for electron-builder.
 * ASCII-only. Does not download anything.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = path.join(root, 'brand');
const buildDir = path.join(root, 'build');

function fail(msg) {
  console.error('[ensure-icons]', msg);
  process.exit(1);
}

function icoImageCount(file) {
  const buf = readFileSync(file);
  if (buf.length < 6) return 0;
  const reserved = buf.readUInt16LE(0);
  const type = buf.readUInt16LE(2);
  const count = buf.readUInt16LE(4);
  if (reserved !== 0 || type !== 1) return 0;
  return count;
}

mkdirSync(buildDir, { recursive: true });

const pngSrc = existsSync(path.join(brandDir, 'xyai-logo.png'))
  ? path.join(brandDir, 'xyai-logo.png')
  : path.join(root, 'src/renderer/assets/logo.png');
const icoSrc = existsSync(path.join(brandDir, 'icon.ico'))
  ? path.join(brandDir, 'icon.ico')
  : path.join(buildDir, 'icon.ico');

if (!existsSync(pngSrc)) {
  fail('missing XYAI logo PNG (brand/xyai-logo.png or src/renderer/assets/logo.png)');
}

const pngDest = path.join(buildDir, 'icon.png');
const icoDest = path.join(buildDir, 'icon.ico');
copyFileSync(pngSrc, pngDest);

if (existsSync(icoSrc) && icoSrc !== icoDest) {
  copyFileSync(icoSrc, icoDest);
}

if (!existsSync(icoDest)) {
  fail('missing build/icon.ico — commit brand/icon.ico (multi-size Windows icon)');
}

const count = icoImageCount(icoDest);
if (count < 1) {
  fail('build/icon.ico is not a valid ICO');
}
if (count < 6) {
  console.warn(
    `[ensure-icons] build/icon.ico has ${count} size(s); prefer 16..256 (6+)`,
  );
}

console.log('[ensure-icons] ok', {
  png: pngDest,
  ico: icoDest,
  icoSizes: count,
});
