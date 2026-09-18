/**
 * Unit smoke: static OpenXYOS HTTP server serves index + assets, blocks traversal.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {
  contentTypeFor,
  listenStaticServer,
  safeResolveUnderRoot,
  type StaticServerHandle,
} from './openxyos-static-server.js';

describe('openxyos-static-server', () => {
  let handle: StaticServerHandle | null = null;
  let tempDir: string | null = null;

  afterEach(async () => {
    if (handle) {
      await handle.close().catch(() => undefined);
      handle = null;
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('maps content types', () => {
    expect(contentTypeFor('a.html')).toContain('text/html');
    expect(contentTypeFor('a.js')).toContain('javascript');
    expect(contentTypeFor('a.css')).toContain('text/css');
    expect(contentTypeFor('a.svg')).toContain('svg');
    expect(contentTypeFor('a.png')).toBe('image/png');
    expect(contentTypeFor('a.woff2')).toBe('font/woff2');
    expect(contentTypeFor('a.json')).toContain('json');
    expect(contentTypeFor('a.webmanifest')).toContain('manifest');
  });

  it('rejects path traversal', () => {
    const root = path.resolve('/tmp/openxyos-safe-root');
    expect(safeResolveUnderRoot(root, '/../../etc/passwd')).toBeNull();
    expect(safeResolveUnderRoot(root, '/assets/../x.js')).not.toBeNull();
  });

  it('serves index.html and /assets file over http', async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'openxyos-static-'));
    mkdirSync(path.join(tempDir, 'assets'));
    writeFileSync(
      path.join(tempDir, 'index.html'),
      '<!doctype html><html><head><link href="/assets/app.css" rel="stylesheet"/><script type="module" src="/assets/app.js"></script></head><body>ok</body></html>',
    );
    writeFileSync(path.join(tempDir, 'assets', 'app.js'), 'export const n = 1;\n');
    writeFileSync(path.join(tempDir, 'assets', 'app.css'), 'body{color:red}\n');

    handle = await listenStaticServer(tempDir, 3921);
    expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);

    const indexRes = await fetch(handle.url);
    expect(indexRes.status).toBe(200);
    expect(indexRes.headers.get('content-type')).toMatch(/text\/html/);
    const html = await indexRes.text();
    expect(html).toContain('/assets/app.js');

    const jsRes = await fetch(new URL('/assets/app.js', handle.url));
    expect(jsRes.status).toBe(200);
    expect(jsRes.headers.get('content-type')).toMatch(/javascript/);
    expect(await jsRes.text()).toContain('export const n');

    const cssRes = await fetch(new URL('/assets/app.css', handle.url));
    expect(cssRes.status).toBe(200);
    expect(cssRes.headers.get('content-type')).toMatch(/text\/css/);

    const spaRes = await fetch(new URL('/some/spa/route', handle.url));
    expect(spaRes.status).toBe(200);
    expect(await spaRes.text()).toContain('ok');

    // Raw path (not URL-normalized) with a file extension → 403, not SPA fallback
    const raw = await new Promise<{ status: number }>((resolve, reject) => {
      const u = new URL(handle!.url);
      const req = http.request(
        {
          hostname: u.hostname,
          port: Number(u.port),
          path: '/../../etc/passwd.txt',
          method: 'GET',
        },
        (res) => {
          res.resume();
          resolve({ status: res.statusCode || 0 });
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(raw.status).toBe(403);
  });
});
