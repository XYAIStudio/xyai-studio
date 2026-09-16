/**
 * Copy renderer static assets; rename preload.js → preload.cjs
 * so sandbox preload stays CommonJS under "type": "module".
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendererDest = path.join(root, 'dist/renderer');
mkdirSync(rendererDest, { recursive: true });

for (const name of ['index.html', 'styles.css']) {
  copyFileSync(
    path.join(root, 'src/renderer', name),
    path.join(rendererDest, name),
  );
}

const preloadJs = path.join(root, 'dist/preload/preload.js');
const preloadCjs = path.join(root, 'dist/preload/preload.cjs');
if (existsSync(preloadJs)) {
  if (existsSync(preloadCjs)) unlinkSync(preloadCjs);
  renameSync(preloadJs, preloadCjs);
  const mapJs = `${preloadJs}.map`;
  const mapCjs = `${preloadCjs}.map`;
  if (existsSync(mapJs)) {
    if (existsSync(mapCjs)) unlinkSync(mapCjs);
    renameSync(mapJs, mapCjs);
  }
}

console.log('[desktop] static assets copied; preload.cjs ready');
