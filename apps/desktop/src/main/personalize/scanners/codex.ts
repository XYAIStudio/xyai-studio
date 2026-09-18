/**
 * Read-only Codex CLI scanner (MCP config.toml / skills).
 */

import path from 'node:path';
import type { DiscoveredRaw, ScanProbeEnv } from '../types.js';
import {
  codexMcpConfigCandidates,
  codexSkillDirs,
} from '../paths.js';
import {
  extractMcpServersMap,
  extractTomlMcpServerNames,
  isDirectory,
  isFile,
  listDirNames,
  listSubdirs,
  pathExists,
  readJsonFile,
  readTextFile,
  sanitizeMcpServerEntry,
} from '../scan-fs.js';

export function scanCodex(env: ScanProbeEnv): DiscoveredRaw[] {
  const out: DiscoveredRaw[] = [];

  for (const cfg of codexMcpConfigCandidates(env)) {
    if (!pathExists(cfg) || !isFile(cfg)) continue;
    if (cfg.endsWith('.json')) {
      const json = readJsonFile(cfg);
      const map = extractMcpServersMap(json);
      if (!map) continue;
      for (const [name, entry] of Object.entries(map)) {
        out.push({
          discoveryKey: `codex|mcp|${cfg}|${name}`,
          kind: 'mcp',
          name,
          originApp: 'codex',
          pathOrRef: cfg,
          description: `Codex MCP · ${path.basename(cfg)}`,
          manifest: {
            serverName: name,
            configPath: cfg,
            entry: sanitizeMcpServerEntry(entry),
          },
        });
      }
      continue;
    }
    // TOML
    const toml = readTextFile(cfg);
    if (!toml) continue;
    for (const name of extractTomlMcpServerNames(toml)) {
      out.push({
        discoveryKey: `codex|mcp|${cfg}|${name}`,
        kind: 'mcp',
        name,
        originApp: 'codex',
        pathOrRef: cfg,
        description: `Codex MCP · config.toml`,
        manifest: { serverName: name, configPath: cfg, format: 'toml' },
      });
    }
  }

  for (const dir of codexSkillDirs(env)) {
    if (!isDirectory(dir)) continue;
    for (const sub of listSubdirs(dir)) {
      out.push({
        discoveryKey: `codex|skill|${sub}`,
        kind: 'skill',
        name: path.basename(sub),
        originApp: 'codex',
        pathOrRef: sub,
        description: `Codex skill · ${dir}`,
        manifest: { skillDir: sub, parent: dir },
      });
    }
    for (const name of listDirNames(dir)) {
      if (!/\.(md|json|toml|txt)$/i.test(name)) continue;
      const full = path.join(dir, name);
      if (!isFile(full)) continue;
      out.push({
        discoveryKey: `codex|skill|${full}`,
        kind: 'skill',
        name: name.replace(/\.(md|json|toml|txt)$/i, ''),
        originApp: 'codex',
        pathOrRef: full,
        description: 'Codex skill/prompt file',
        manifest: { skillFile: full },
      });
    }
  }

  return out;
}
