/**
 * Stage components/openxyos-pack for electron-builder extraResources → resources/openxyos
 *
 * Primary fix for absolute Vite `/assets/…` URLs is the localhost static server
 * (see OPENXYOS-EMBED.md). This script optionally rewrites leading absolute paths
 * to relative `./…` as belt-and-suspenders for file:// or odd hosts.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const srcRoot = path.join(repoRoot, 'components', 'openxyos');
const packRoot = path.join(repoRoot, 'components', 'openxyos-pack');

function copyDist(fromDir, toDir) {
  mkdirSync(toDir, { recursive: true });
  cpSync(fromDir, toDir, { recursive: true });
}

/**
 * Rewrite absolute root asset URLs in HTML to relative paths so they work
 * even if something loads the pack without the HTTP host.
 * `/assets/…` → `./assets/…`, `/logo.png` → `./logo.png`, `/manifest…` → `./manifest…`
 */
function rewriteAbsoluteAssetUrls(dir) {
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.html'));
  } catch {
    return;
  }
  for (const name of files) {
    const indexPath = path.join(dir, name);
    let html;
    try {
      html = readFileSync(indexPath, 'utf8');
    } catch {
      continue;
    }
    const next = html
      .replace(/((?:src|href)=["'])\/assets\//g, '$1./assets/')
      .replace(/((?:src|href)=["'])\/logo\.png/g, '$1./logo.png')
      .replace(/((?:src|href)=["'])\/manifest/g, '$1./manifest');
    if (next !== html) {
      writeFileSync(indexPath, next);
      console.log('[stage-openxyos] rewrote absolute URLs → relative in', name);
    }
  }
}

rmSync(packRoot, { recursive: true, force: true });
mkdirSync(packRoot, { recursive: true });

const candidates = [
  path.join(srcRoot, 'dist'),
  path.join(srcRoot, 'frontend', 'dist'),
];

let copied = false;
for (const d of candidates) {
  if (existsSync(path.join(d, 'index.html'))) {
    // Flat layout: resources/openxyos/index.html (+ assets)
    copyDist(d, packRoot);
    copied = true;
    console.log('[stage-openxyos] copied', d, '→', packRoot);
    rewriteAbsoluteAssetUrls(packRoot);
    break;
  }
}

if (!copied) {
  // Minimal placeholder so path resolves; real build should replace this
  writeFileSync(
    path.join(packRoot, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"/><title>OpenXYOS</title>
<style>body{margin:0;font-family:system-ui;background:linear-gradient(165deg,#eaf3ff,#eef4ff);color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{max-width:520px;padding:28px;border-radius:16px;background:rgba(255,255,255,.8);border:1px solid #bfdbfe;box-shadow:0 10px 28px rgba(37,99,235,.12)}
h1{margin:0 0 8px;font-size:22px}p{margin:0;line-height:1.6;color:#334155}</style></head>
<body><div class="card"><h1>OpenXYOS</h1><p>静态包尚未构建。请在 components/openxyos 执行 <code>npm run build</code> 后重新打包安装。</p></div></body></html>`,
  );
  console.log('[stage-openxyos] wrote placeholder index.html');
}

const pkgSrc = path.join(srcRoot, 'package.json');
const pkg = {
  name: 'openxyos',
  version: '0.6.3',
  private: true,
  description: 'Staged OpenXYOS UI for XYAI Studio 业务空间',
};
if (existsSync(pkgSrc)) {
  try {
    const raw = JSON.parse(readFileSync(pkgSrc, 'utf8'));
    pkg.version = raw.version || pkg.version;
    pkg.name = raw.name || pkg.name;
  } catch { /* ignore */ }
}
writeFileSync(path.join(packRoot, 'package.json'), JSON.stringify(pkg, null, 2));
console.log('[stage-openxyos] done', packRoot);
