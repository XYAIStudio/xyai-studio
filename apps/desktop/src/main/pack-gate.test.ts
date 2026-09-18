/**
 * Pack-out is CJS. Bare fileURLToPath(import.meta.url) / createRequire(import.meta)
 * crash when import.meta.url is empty. Scripts and tests may use ESM meta;
 * main/preload/adapter-codex production sources must stay guarded.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopSrc = path.resolve(here, '..');
const adapterSrc = path.resolve(here, '../../../../packages/adapter-codex/src');

function walkTs(dir: string, acc: string[] = []): string[] {
  if (!statSync(dir).isDirectory()) return acc;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTs(full, acc);
      continue;
    }
    if (name.endsWith('.test.ts') || name.endsWith('.test.js')) continue;
    if (/\.(ts|js|cjs)$/.test(name)) acc.push(full);
  }
  return acc;
}

/** Drop strings first so `http://` and identity stubs do not look like comments. */
function stripStringsAndComments(src: string): string {
  return src
    .replace(/`(?:\\.|[^`\\])*`/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

describe('pack gate', () => {
  it('has no bare createRequire/fileURLToPath(import.meta) in pack sources', () => {
    const files = [...walkTs(desktopSrc), ...walkTs(adapterSrc)].filter(
      (f) =>
        !f.includes(`${path.sep}scripts${path.sep}`) &&
        !f.endsWith('smoke.ts'),
    );
    const hits: string[] = [];
    const re =
      /(?:createRequire|fileURLToPath)\s*\(\s*import\.meta(?:\.url)?/;
    for (const f of files) {
      const code = stripStringsAndComments(readFileSync(f, 'utf8'));
      if (re.test(code)) hits.push(path.relative(desktopSrc, f));
    }
    expect(hits).toEqual([]);
  });
});
