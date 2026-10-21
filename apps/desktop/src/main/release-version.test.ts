import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STUDIO_ASSEMBLY } from './harness/default-profile.js';

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const repoRoot = path.resolve(desktopRoot, '../..');

describe('0.5.1 product version', () => {
  it('locks desktop package, assembly profile, in-process copy, and about constant', () => {
    const pkg = JSON.parse(
      readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'),
    ) as { version: string };
    const profile = JSON.parse(
      readFileSync(
        path.join(repoRoot, 'assembly/profiles/0.5.0-dev.example.json'),
        'utf8',
      ),
    ) as { productVersion: string };
    const aboutConst = readFileSync(
      path.join(desktopRoot, 'src/renderer/product-version.ts'),
      'utf8',
    );
    const builder = readFileSync(
      path.join(desktopRoot, 'electron-builder.yml'),
      'utf8',
    );

    expect(pkg.version).toBe('0.5.1');
    expect(profile.productVersion).toBe(pkg.version);
    expect(DEFAULT_STUDIO_ASSEMBLY.productVersion).toBe(pkg.version);
    expect(aboutConst).toContain(`'${pkg.version}'`);
    expect(builder).toContain('XYAI-Studio-${version}-Setup-${arch}.${ext}');
  });
});
