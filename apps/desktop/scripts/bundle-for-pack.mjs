/**
 * Bundle Electron main/preload/renderer into pack-out/ for electron-builder.
 */
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const outDir = path.join(appRoot, 'pack-out');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(path.join(outDir, 'renderer'), { recursive: true });

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: false,
  logLevel: 'info',
  banner: { js: 'var __xyai_module_dir = __dirname;' },
};

await esbuild.build({
  ...shared,
  entryPoints: [path.join(appRoot, 'src/main/main.ts')],
  outfile: path.join(outDir, 'main.cjs'),
});

await esbuild.build({
  ...shared,
  entryPoints: [path.join(appRoot, 'src/preload/preload.ts')],
  outfile: path.join(outDir, 'preload.cjs'),
});

await esbuild.build({
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  entryPoints: [path.join(appRoot, 'src/renderer/main.ts')],
  outfile: path.join(outDir, 'renderer/main.js'),
  logLevel: 'info',
});

cpSync(path.join(appRoot, 'src/renderer/index.html'), path.join(outDir, 'renderer/index.html'));
cpSync(path.join(appRoot, 'src/renderer/styles.css'), path.join(outDir, 'renderer/styles.css'));

// Fix main paths: preload and renderer relative to pack-out
// main.ts uses ../preload and ../renderer from dist/main — bundled main.cjs lives in pack-out root.
// Patch: write a tiny wrapper OR adjust bundled output by defining XYAI_PACK_ROOT.
// Easiest: rewrite main to resolve from __dirname of main.cjs (pack-out).
// The source already uses path.join(__dirname, '../preload/preload.cjs') from dist/main.
// After bundle into pack-out/main.cjs, __dirname is pack-out, so paths must be ./preload.cjs and ./renderer/index.html.

writeFileSync(
  path.join(outDir, 'package.json'),
  JSON.stringify(
    {
      name: 'xyai-studio',
      version: '0.5.0',
      private: true,
      main: 'main.cjs',
      productName: 'XYAI Studio',
    },
    null,
    2,
  ) + '\n',
);

writeFileSync(
  path.join(outDir, 'README-PACK.txt'),
  'XYAI Studio 0.5 packaged build. Codex uses system/PATH or mock fallback.\n',
);

console.log('[bundle-for-pack] wrote', outDir);
