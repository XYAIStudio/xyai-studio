/**
 * Read the desktop product version from apps/desktop/package.json.
 * Pack scripts must not hardcode the version string.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * @param {string} appRoot apps/desktop directory
 * @returns {string} x.y.z
 */
export function readDesktopAppVersion(appRoot) {
  const raw = readFileSync(path.join(appRoot, 'package.json'), 'utf8');
  const pkg = JSON.parse(raw);
  if (typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(pkg.version)) {
    throw new Error(
      `[app-version] desktop package.json version must be x.y.z, got ${String(pkg.version)}`,
    );
  }
  return pkg.version;
}
