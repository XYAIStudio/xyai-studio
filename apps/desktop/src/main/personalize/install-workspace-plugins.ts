/**
 * After a harness turn, install plugin packages written under workspace/plugins.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { installFromDirectory } from './actions.js';
import type { PersonalAsset } from './types.js';

function looksLikePackage(dir: string): boolean {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return false;
  const markers = [
    'plugin.json',
    'package.json',
    'README.md',
    'index.js',
    'index.ts',
    'main.js',
    'SKILL.md',
  ];
  return markers.some((f) => existsSync(path.join(dir, f)));
}

function readName(dir: string, fallback: string): string {
  for (const f of ['plugin.json', 'package.json']) {
    const p = path.join(dir, f);
    if (!existsSync(p)) continue;
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as {
        name?: unknown;
        id?: unknown;
      };
      if (typeof raw.name === 'string' && raw.name.trim()) return raw.name.trim();
      if (typeof raw.id === 'string' && raw.id.trim()) return raw.id.trim();
    } catch {
      /* ignore */
    }
  }
  return fallback;
}

export function installPluginsFromWorkspaceDir(pluginsDir: string): {
  installed: PersonalAsset[];
  errors: string[];
} {
  const installed: PersonalAsset[] = [];
  const errors: string[] = [];
  if (!pluginsDir || !existsSync(pluginsDir)) {
    return { installed, errors };
  }
  let entries: string[] = [];
  try {
    entries = readdirSync(pluginsDir);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { installed, errors };
  }
  for (const name of entries) {
    const dir = path.join(pluginsDir, name);
    if (!looksLikePackage(dir)) continue;
    const res = installFromDirectory({
      kind: 'plugin',
      id: name,
      name: readName(dir, name),
      srcPath: dir,
      description: 'Installed from Studio workspace/plugins',
    });
    if (res.ok && res.asset) installed.push(res.asset);
    else if (res.message) errors.push(`${name}: ${res.message}`);
  }
  return { installed, errors };
}
