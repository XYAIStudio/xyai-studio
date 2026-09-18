/**
 * Bundle Electron main + preload into a self-contained pack/ directory
 * for electron-builder (pnpm workspace packages inlined via esbuild).
 *
 * Layout mirrors dist/ so main.ts path joins keep working:
 *   pack/main/main.js
 *   pack/preload/preload.cjs
 *   pack/renderer/{index.html,styles.css,main.js}
 *   pack/package.json
 *
 * Codex native binary is NOT vendored — runtime uses PATH / XYAI_CODEX_BIN,
 * or MOCK when unavailable / XYAI_CODEX_MOCK=1.
 */
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(root, '../..');
const packDir = path.join(root, 'pack');

function ensureCleanPack() {
  rmSync(packDir, { recursive: true, force: true });
  mkdirSync(path.join(packDir, 'main'), { recursive: true });
  mkdirSync(path.join(packDir, 'preload'), { recursive: true });
  mkdirSync(path.join(packDir, 'renderer'), { recursive: true });
}

async function bundleMain() {
  await esbuild.build({
    entryPoints: [path.join(root, 'src/main/main.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: path.join(packDir, 'main/main.js'),
    external: ['electron'],
    sourcemap: true,
    logLevel: 'info',
    packages: 'bundle',
  });
}

async function bundlePreload() {
  await esbuild.build({
    entryPoints: [path.join(root, 'src/preload/preload.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: path.join(packDir, 'preload/preload.cjs'),
    external: ['electron'],
    sourcemap: true,
    logLevel: 'info',
  });
}

function copyRenderer() {
  const builtRenderer = path.join(root, 'dist/renderer');
  const srcRenderer = path.join(root, 'src/renderer');

  if (!existsSync(path.join(builtRenderer, 'main.js'))) {
    throw new Error(
      '[bundle-desktop] missing dist/renderer/main.js — run `pnpm run build` first',
    );
  }

  for (const name of ['index.html', 'styles.css', 'main.js']) {
    const fromBuilt = path.join(builtRenderer, name);
    const fromSrc = path.join(srcRenderer, name);
    const from = existsSync(fromBuilt) ? fromBuilt : fromSrc;
    if (!existsSync(from)) {
      throw new Error(`[bundle-desktop] missing renderer asset: ${name}`);
    }
    copyFileSync(from, path.join(packDir, 'renderer', name));
  }
  const assetsBuilt = path.join(builtRenderer, 'assets');
  const assetsSrc = path.join(srcRenderer, 'assets');
  const assetsFrom = existsSync(assetsBuilt) ? assetsBuilt : assetsSrc;
  if (existsSync(assetsFrom)) {
    cpSync(assetsFrom, path.join(packDir, 'renderer', 'assets'), {
      recursive: true,
    });
  }
}

function writePackPackageJson() {
  const pkg = {
    name: 'xyai-studio',
    productName: 'XYAI Studio',
    version: '0.5.0',
    description: 'XYAI Studio 0.5 beta — Electron thin host + Codex chat',
    author: 'XYAI',
    license: 'UNLICENSED',
    private: true,
    type: 'module',
    main: './main/main.js',
  };
  writeFileSync(
    path.join(packDir, 'package.json'),
    `${JSON.stringify(pkg, null, 2)}\n`,
    'utf8',
  );
}

function noteOpenXyos() {
  const marker = path.join(repoRoot, 'components/openxyos/package.json');
  if (existsSync(marker)) {
    console.log(
      '[bundle-desktop] OpenXYOS package.json present (bridge → submodule-present at runtime when probed)',
    );
  } else {
    console.log(
      '[bundle-desktop] OpenXYOS placeholder only — bridge → not-installed until submodule added',
    );
  }
}

async function main() {
  console.log('[bundle-desktop] packing →', packDir);
  ensureCleanPack();
  await bundleMain();
  await bundlePreload();
  copyRenderer();
  writePackPackageJson();
  noteOpenXyos();
  console.log('[bundle-desktop] done');
}

main().catch((err) => {
  console.error('[bundle-desktop] failed', err);
  process.exitCode = 1;
});
