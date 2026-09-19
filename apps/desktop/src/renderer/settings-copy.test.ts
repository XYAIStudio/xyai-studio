import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('settings and chat copy', () => {
  it('does not show 高级引擎 in settings or picker', () => {
    const html = readFileSync(path.join(here, 'index.html'), 'utf8');
    const picker = readFileSync(path.join(here, 'chat/model-picker.ts'), 'utf8');
    expect(html).not.toMatch(/高级引擎/);
    expect(picker).not.toMatch(/高级引擎/);
  });
});
