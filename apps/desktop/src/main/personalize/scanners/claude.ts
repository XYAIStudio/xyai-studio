/**
 * Read-only Claude Desktop / Claude Code scanner.
 */

import path from 'node:path';
import type { DiscoveredRaw, ScanProbeEnv } from '../types.js';
import {
  claudeMcpConfigCandidates,
  claudeSkillDirs,
} from '../paths.js';
import {
  extractMcpServersMap,
  isDirectory,
  isFile,
  listDirNames,
  listSubdirs,
  pathExists,
  readJsonFile,
  sanitizeMcpServerEntry,
} from '../scan-fs.js';

export function scanClaude(env: ScanProbeEnv): DiscoveredRaw[] {
  const out: DiscoveredRaw[] = [];

  for (const cfg of claudeMcpConfigCandidates(env)) {
    if (!pathExists(cfg) || !isFile(cfg)) continue;
    const json = readJsonFile(cfg);
    const map = extractMcpServersMap(json);
    if (!map) continue;
    for (const [name, entry] of Object.entries(map)) {
      const discoveryKey = `claude|mcp|${cfg}|${name}`;
      out.push({
        discoveryKey,
        kind: 'mcp',
        name,
        originApp: 'claude',
        pathOrRef: cfg,
        description: `Claude MCP · ${path.basename(cfg)}`,
        manifest: {
          serverName: name,
          configPath: cfg,
          entry: sanitizeMcpServerEntry(entry),
        },
      });
    }
  }

  for (const dir of claudeSkillDirs(env)) {
    if (!isDirectory(dir)) continue;
    for (const sub of listSubdirs(dir)) {
      const name = path.basename(sub);
      const discoveryKey = `claude|skill|${sub}`;
      out.push({
        discoveryKey,
        kind: 'skill',
        name,
        originApp: 'claude',
        pathOrRef: sub,
        description: `Claude skill · ${dir}`,
        manifest: { skillDir: sub, parent: dir },
      });
    }
    for (const name of listDirNames(dir)) {
      if (!/\.(md|json|toml)$/i.test(name)) continue;
      const full = path.join(dir, name);
      if (!isFile(full)) continue;
      const discoveryKey = `claude|skill|${full}`;
      out.push({
        discoveryKey,
        kind: 'skill',
        name: name.replace(/\.(md|json|toml)$/i, ''),
        originApp: 'claude',
        pathOrRef: full,
        description: 'Claude skill file',
        manifest: { skillFile: full },
      });
    }
  }

  return out;
}
