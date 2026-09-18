import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('XYAI Windows icon assets', () => {
  it('tracks a multi-size ICO (not the Electron atom fallback)', () => {
    const ico = path.join(desktopRoot, 'build', 'icon.ico');
    const png = path.join(desktopRoot, 'build', 'icon.png');
    expect(existsSync(png), 'build/icon.png').toBe(true);
    expect(existsSync(ico), 'build/icon.ico').toBe(true);
    const buf = readFileSync(ico);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.readUInt16LE(0)).toBe(0);
    expect(buf.readUInt16LE(2)).toBe(1);
    expect(buf.readUInt16LE(4)).toBeGreaterThanOrEqual(6);
  });
});
