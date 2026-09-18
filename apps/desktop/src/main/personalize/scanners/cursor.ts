/**
 * Read-only Cursor scanner (MCP, rules/skills, extensions metadata).
 */

import path from 'node:path';
import type { DiscoveredRaw, ScanProbeEnv } from '../types.js';
import {
  cursorExtensionRoots,
  cursorMcpConfigCandidates,
  cursorSkillDirs,
} from '../paths.js';
import {
  extractMcpServersMap,
  isDirectory,
  isFile,
  listDirNames,
  listSubdirs,
  pathExists,
  readJsonFile,
  readTextFile,
  sanitizeMcpServerEntry,
} from '../scan-fs.js';

export function scanCursor(env: ScanProbeEnv): DiscoveredRaw[] {
  const out: DiscoveredRaw[] = [];

  for (const cfg of cursorMcpConfigCandidates(env)) {
    if (!pathExists(cfg) || !isFile(cfg)) continue;
    const json = readJsonFile(cfg);
    const map = extractMcpServersMap(json);
    if (!map) continue;
    for (const [name, entry] of Object.entries(map)) {
      out.push({
        discoveryKey: `cursor|mcp|${cfg}|${name}`,
        kind: 'mcp',
        name,
        originApp: 'cursor',
        pathOrRef: cfg,
        description: `Cursor MCP · ${path.basename(cfg)}`,
        manifest: {
          serverName: name,
          configPath: cfg,
          entry: sanitizeMcpServerEntry(entry),
        },
      });
    }
  }

  for (const dir of cursorSkillDirs(env)) {
    if (!isDirectory(dir)) continue;
    for (const sub of listSubdirs(dir)) {
      out.push({
        discoveryKey: `cursor|skill|${sub}`,
        kind: 'skill',
        name: path.basename(sub),
        originApp: 'cursor',
        pathOrRef: sub,
        description: `Cursor skill/rule · ${dir}`,
        manifest: { skillDir: sub, parent: dir },
      });
    }
    for (const name of listDirNames(dir)) {
      if (!/\.(md|mdc|json)$/i.test(name)) continue;
      const full = path.join(dir, name);
      if (!isFile(full)) continue;
      out.push({
        discoveryKey: `cursor|skill|${full}`,
        kind: 'skill',
        name: name.replace(/\.(md|mdc|json)$/i, ''),
        originApp: 'cursor',
        pathOrRef: full,
        description: 'Cursor rule/skill file',
        manifest: { skillFile: full },
      });
    }
  }

  for (const root of cursorExtensionRoots(env)) {
    if (!isDirectory(root)) continue;
    for (const sub of listSubdirs(root)) {
      const pkgPath = path.join(sub, 'package.json');
      let name = path.basename(sub);
      let version: string | undefined;
      if (isFile(pkgPath)) {
        const pkg = readJsonFile(pkgPath) as Record<string, unknown> | null;
        if (pkg && typeof pkg.displayName === 'string') name = pkg.displayName;
        else if (pkg && typeof pkg.name === 'string') name = pkg.name;
        if (pkg && typeof pkg.version === 'string') version = pkg.version;
      }
      out.push({
        discoveryKey: `cursor|plugin|${sub}`,
        kind: 'plugin',
        name,
        originApp: 'cursor',
        pathOrRef: sub,
        version,
        description: 'Cursor extension',
        manifest: { extensionDir: sub, packageJson: pkgPath },
      });
    }
  }

  // Connector-like: .cursor connectors / oauth configs if present
  const connectorCandidates = [
    path.join(env.home, '.cursor', 'connectors.json'),
    path.join(env.appData, 'Cursor', 'connectors.json'),
  ];
  for (const cfg of connectorCandidates) {
    if (!isFile(cfg)) continue;
    const json = readJsonFile(cfg);
    if (Array.isArray(json)) {
      for (const item of json) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const name =
          typeof o.name === 'string'
            ? o.name
            : typeof o.id === 'string'
              ? o.id
              : 'connector';
        out.push({
          discoveryKey: `cursor|connector|${cfg}|${name}`,
          kind: 'connector',
          name,
          originApp: 'cursor',
          pathOrRef: cfg,
          description: 'Cursor connector',
          manifest: { configPath: cfg, entry: o },
        });
      }
    } else if (json && typeof json === 'object') {
      for (const [name, entry] of Object.entries(
        json as Record<string, unknown>,
      )) {
        out.push({
          discoveryKey: `cursor|connector|${cfg}|${name}`,
          kind: 'connector',
          name,
          originApp: 'cursor',
          pathOrRef: cfg,
          description: 'Cursor connector',
          manifest: {
            configPath: cfg,
            entry:
              entry && typeof entry === 'object'
                ? (entry as Record<string, unknown>)
                : { value: entry },
          },
        });
      }
    } else {
      // raw file reference
      const raw = readTextFile(cfg);
      if (raw) {
        out.push({
          discoveryKey: `cursor|connector|${cfg}`,
          kind: 'connector',
          name: path.basename(cfg),
          originApp: 'cursor',
          pathOrRef: cfg,
          description: 'Cursor connector config',
          manifest: { configPath: cfg },
        });
      }
    }
  }

  return out;
}
