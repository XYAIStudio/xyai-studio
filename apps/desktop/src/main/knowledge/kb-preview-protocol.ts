/**
 * Privileged custom protocol for streaming KB source files into the renderer
 * without base64-encoding large PDFs over IPC.
 *
 * Scheme: xyai-kb-preview://v/?p=<encodeURIComponent(absPath)>
 * Only paths inside registered source roots are served.
 */

import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import { isPathInside } from '@xyai/knowledge';

export const KB_PREVIEW_SCHEME = 'xyai-kb-preview';

const allowedRoots = new Set<string>();

export function registerKbPreviewSourceRoot(root: string): void {
  if (!root) return;
  allowedRoots.add(path.resolve(root));
}

export function clearKbPreviewSourceRoots(): void {
  allowedRoots.clear();
}

export function listKbPreviewSourceRoots(): string[] {
  return [...allowedRoots];
}

export function isAllowedKbPreviewPath(absPath: string): boolean {
  const resolved = path.resolve(absPath);
  for (const root of allowedRoots) {
    if (isPathInside(root, resolved)) return true;
  }
  return false;
}

/** Build a renderer-safe preview URL for a local absolute path. */
export function buildKbPreviewProtocolUrl(absPath: string): string {
  const resolved = path.resolve(absPath);
  return `${KB_PREVIEW_SCHEME}://v/?p=${encodeURIComponent(resolved)}`;
}

/**
 * Must be called before app ready.
 */
export function registerKbPreviewSchemePrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: KB_PREVIEW_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true,
        corsEnabled: true,
      },
    },
  ]);
}

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.txt' || ext === '.md' || ext === '.csv' || ext === '.json') {
    return 'text/plain; charset=utf-8';
  }
  if (ext === '.html' || ext === '.htm') return 'text/html; charset=utf-8';
  return 'application/octet-stream';
}

/**
 * Call after app.whenReady().
 */
export function registerKbPreviewProtocolHandler(): void {
  protocol.handle(KB_PREVIEW_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const encoded = url.searchParams.get('p') || '';
      const abs = path.resolve(decodeURIComponent(encoded));
      if (!encoded || !isAllowedKbPreviewPath(abs)) {
        return new Response('Forbidden', { status: 403, statusText: 'Forbidden' });
      }
      if (!existsSync(abs) || !statSync(abs).isFile()) {
        return new Response('Not Found', { status: 404 });
      }
      // Prefer net.fetch(file URL) for range/stream support in Chromium PDF viewer
      const fileUrl = pathToFileURL(abs).toString();
      const res = await net.fetch(fileUrl);
      const headers = new Headers(res.headers);
      headers.set('Content-Type', mimeFor(abs));
      headers.set('Cache-Control', 'no-store');
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(message, { status: 500 });
    }
  });
}

