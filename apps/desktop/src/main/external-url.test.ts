import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { safeExternalHttpUrl } from './external-url.js';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('safeExternalHttpUrl', () => {
  it('allows http and https', () => {
    expect(safeExternalHttpUrl('https://example.com/a')).toBe(
      'https://example.com/a',
    );
    expect(safeExternalHttpUrl('  http://127.0.0.1:3000/x  ')).toBe(
      'http://127.0.0.1:3000/x',
    );
  });

  it('rejects non-http schemes, credentials, and junk', () => {
    expect(safeExternalHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalHttpUrl('file:///etc/passwd')).toBeNull();
    expect(safeExternalHttpUrl('https://user:pass@example.com')).toBeNull();
    expect(safeExternalHttpUrl('//example.com')).toBeNull();
    expect(safeExternalHttpUrl('')).toBeNull();
    expect(safeExternalHttpUrl('https://example.com/a b')).toBeNull();
  });
});

describe('external url copies', () => {
  it('keeps the main and renderer helpers identical', () => {
    const grab = (src: string): string => {
      const m = src.match(
        /export function safeExternalHttpUrl[\s\S]*?\n}\n/,
      );
      return m?.[0] ?? '';
    };
    const mainSrc = readFileSync(path.join(here, 'external-url.ts'), 'utf8');
    const rendererSrc = readFileSync(
      path.join(here, '../renderer/chat/external-url.ts'),
      'utf8',
    );
    expect(grab(rendererSrc)).toBe(grab(mainSrc));
    expect(grab(mainSrc).length).toBeGreaterThan(40);
  });
});
