/**
 * Tiny localhost static file server for packaged OpenXYOS (Vite absolute /assets/… URLs).
 * Path-traversal safe; SPA fallback for extension-less routes.
 */

import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';

export const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

export function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

/** Resolve URL path under root; null if outside root (traversal). */
export function safeResolveUnderRoot(root: string, urlPath: string): string | null {
  let raw = urlPath.split('?')[0].split('#')[0] || '/';
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const rel = raw.replace(/^\/+/, '') || 'index.html';
  const rootResolved = path.resolve(root);
  const resolved = path.resolve(rootResolved, rel);
  const relative = path.relative(rootResolved, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolved;
}

export type StaticServerHandle = {
  server: http.Server;
  port: number;
  root: string;
  url: string;
  close: () => Promise<void>;
};

function requestHandler(serveRoot: string): http.RequestListener {
  return (req, res) => {
    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    const urlPath = req.url || '/';
    let filePath = safeResolveUnderRoot(serveRoot, urlPath);
    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    let st: ReturnType<typeof statSync> | null = null;
    try {
      if (existsSync(filePath)) st = statSync(filePath);
    } catch {
      st = null;
    }

    if (st?.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      try {
        st = existsSync(filePath) ? statSync(filePath) : null;
      } catch {
        st = null;
      }
    }

    // SPA fallback: no file and path has no extension → index.html
    const base = path.basename(filePath);
    const hasExt = base.includes('.');
    if ((!st || !st.isFile()) && !hasExt) {
      const spa = path.join(path.resolve(serveRoot), 'index.html');
      if (existsSync(spa)) {
        filePath = spa;
        try {
          st = statSync(spa);
        } catch {
          st = null;
        }
      }
    }

    if (!st || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const type = contentTypeFor(filePath);
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(filePath).pipe(res);
  };
}

/**
 * Listen on preferredPort, then preferredPort+1…, then ephemeral 0.
 */
export function listenStaticServer(
  serveRoot: string,
  preferredPort = 3921,
  maxAttempts = 30,
): Promise<StaticServerHandle> {
  const root = path.resolve(serveRoot);
  const handler = requestHandler(root);

  return new Promise((resolve, reject) => {
    const tryListen = (port: number, attemptsLeft: number, useEphemeral: boolean) => {
      const server = http.createServer(handler);
      const onError = (err: NodeJS.ErrnoException) => {
        server.off('listening', onListening);
        try {
          server.close();
        } catch {
          /* ignore */
        }
        if (err.code === 'EADDRINUSE') {
          if (!useEphemeral && attemptsLeft > 1) {
            tryListen(port + 1, attemptsLeft - 1, false);
            return;
          }
          if (!useEphemeral) {
            tryListen(0, 1, true);
            return;
          }
        }
        reject(err);
      };
      const onListening = () => {
        server.off('error', onError);
        const addr = server.address();
        const bound =
          typeof addr === 'object' && addr && typeof addr.port === 'number' ? addr.port : port;
        const url = `http://127.0.0.1:${bound}/`;
        resolve({
          server,
          port: bound,
          root,
          url,
          close: () =>
            new Promise<void>((resClose, rejClose) => {
              server.close((e) => (e ? rejClose(e) : resClose()));
            }),
        });
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(useEphemeral ? 0 : port, '127.0.0.1');
    };

    tryListen(preferredPort, maxAttempts, false);
  });
}
