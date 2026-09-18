/**
 * Optional user-specified scan roots — look for mcp.json / skills / plugins.
 */

import path from 'node:path';
import type { DiscoveredRaw } from '../types.js';
import {
  extractMcpServersMap,
  isDirectory,
  isFile,
  listSubdirs,
  pathExists,
  readJsonFile,
  sanitizeMcpServerEntry,
} from '../scan-fs.js';

export function scanExtraRoots(roots: string[]): DiscoveredRaw[] {
  const out: DiscoveredRaw[] = [];
  for (const root of roots) {
    if (!root || !pathExists(root)) continue;
    const mcpJson = path.join(root, 'mcp.json');
    if (isFile(mcpJson)) {
      const map = extractMcpServersMap(readJsonFile(mcpJson));
      if (map) {
        for (const [name, entry] of Object.entries(map)) {
          out.push({
            discoveryKey: `other|mcp|${mcpJson}|${name}`,
            kind: 'mcp',
            name,
            originApp: 'other',
            pathOrRef: mcpJson,
            description: `User root MCP · ${root}`,
            manifest: {
              serverName: name,
              configPath: mcpJson,
              entry: sanitizeMcpServerEntry(entry),
            },
          });
        }
      }
    }
    for (const subName of ['skills', 'plugins', 'commands', 'rules']) {
      const dir = path.join(root, subName);
      if (!isDirectory(dir)) continue;
      for (const sub of listSubdirs(dir)) {
        const kind = subName === 'plugins' ? 'plugin' : 'skill';
        out.push({
          discoveryKey: `other|${kind}|${sub}`,
          kind,
          name: path.basename(sub),
          originApp: 'other',
          pathOrRef: sub,
          description: `User root ${kind} · ${root}`,
          manifest: { dir: sub, parent: dir },
        });
      }
    }
  }
  return out;
}
