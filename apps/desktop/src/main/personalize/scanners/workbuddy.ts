/**
 * Read-only Workbuddy scanner (best-effort official-ish dirs).
 */

import path from 'node:path';
import type { DiscoveredRaw, ScanProbeEnv } from '../types.js';
import {
  workbuddyConfigCandidates,
  workbuddyProbeRoots,
} from '../paths.js';
import {
  extractMcpServersMap,
  isDirectory,
  isFile,
  listSubdirs,
  pathExists,
  readJsonFile,
  sanitizeMcpServerEntry,
} from '../scan-fs.js';

export function scanWorkbuddy(env: ScanProbeEnv): DiscoveredRaw[] {
  const out: DiscoveredRaw[] = [];

  for (const cfg of workbuddyConfigCandidates(env)) {
    if (!pathExists(cfg) || !isFile(cfg)) continue;
    const json = readJsonFile(cfg);
    const map = extractMcpServersMap(json);
    if (map) {
      for (const [name, entry] of Object.entries(map)) {
        out.push({
          discoveryKey: `workbuddy|mcp|${cfg}|${name}`,
          kind: 'mcp',
          name,
          originApp: 'workbuddy',
          pathOrRef: cfg,
          description: `Workbuddy MCP · ${path.basename(cfg)}`,
          manifest: {
            serverName: name,
            configPath: cfg,
            entry: sanitizeMcpServerEntry(entry),
          },
        });
      }
      continue;
    }
    if (Array.isArray(json)) {
      for (const item of json) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const name =
          typeof o.name === 'string'
            ? o.name
            : typeof o.id === 'string'
              ? o.id
              : path.basename(cfg);
        const kind =
          /plugin/i.test(path.basename(cfg)) ? 'plugin' : 'connector';
        out.push({
          discoveryKey: `workbuddy|${kind}|${cfg}|${name}`,
          kind,
          name,
          originApp: 'workbuddy',
          pathOrRef: cfg,
          description: `Workbuddy ${kind}`,
          manifest: { configPath: cfg, entry: o },
        });
      }
    } else if (json && typeof json === 'object') {
      out.push({
        discoveryKey: `workbuddy|connector|${cfg}`,
        kind: 'connector',
        name: path.basename(cfg, path.extname(cfg)),
        originApp: 'workbuddy',
        pathOrRef: cfg,
        description: 'Workbuddy config',
        manifest: { configPath: cfg },
      });
    }
  }

  for (const root of workbuddyProbeRoots(env)) {
    if (!isDirectory(root)) continue;
    for (const subName of ['plugins', 'skills', 'mcp']) {
      const dir = path.join(root, subName);
      if (!isDirectory(dir)) continue;
      for (const sub of listSubdirs(dir)) {
        const kind =
          subName === 'plugins'
            ? 'plugin'
            : subName === 'skills'
              ? 'skill'
              : 'mcp';
        out.push({
          discoveryKey: `workbuddy|${kind}|${sub}`,
          kind,
          name: path.basename(sub),
          originApp: 'workbuddy',
          pathOrRef: sub,
          description: `Workbuddy ${kind}`,
          manifest: { dir: sub, parent: dir },
        });
      }
    }
  }

  return out;
}
