/**
 * After a tools turn, copy workspace plugins/skills/MCP/agents into 个性化.
 * No installer execution — copy + catalog only.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { discoveryId } from './personalize/paths.js';
import {
  extractMcpServersMap,
  isDirectory,
  isFile,
  listSubdirs,
  pathExists,
  readJsonFile,
  sanitizeMcpServerEntry,
} from './personalize/scan-fs.js';
import {
  copyPathInto,
  installedDir,
  upsertAsset,
} from './personalize/store.js';
import type { PersonalAsset, PersonalizeKind } from './personalize/types.js';

const KIND_FOLDERS: { dir: string; kind: PersonalizeKind }[] = [
  { dir: 'skills', kind: 'skill' },
  { dir: 'plugins', kind: 'plugin' },
  { dir: 'mcp', kind: 'mcp' },
  { dir: 'agents', kind: 'agent' },
  { dir: 'connectors', kind: 'connector' },
];

function assetFromDir(
  kind: PersonalizeKind,
  dir: string,
): PersonalAsset {
  const name = path.basename(dir);
  const discoveryKey = `workspace|${kind}|${dir}`;
  return {
    id: discoveryId(discoveryKey),
    kind,
    name,
    source: 'user',
    originApp: 'xyai',
    status: 'installed',
    pathOrRef: dir,
    description: `工作目录 ${kind}`,
    manifest: { workspaceDir: dir },
  };
}

/**
 * Discover installable assets under the Studio workspace cwd.
 */
export function discoverWorkspaceAssets(workspaceDir: string): PersonalAsset[] {
  if (!workspaceDir || !pathExists(workspaceDir) || !isDirectory(workspaceDir)) {
    return [];
  }
  const out: PersonalAsset[] = [];
  const seen = new Set<string>();

  for (const { dir, kind } of KIND_FOLDERS) {
    const root = path.join(workspaceDir, dir);
    if (!isDirectory(root)) continue;
    for (const sub of listSubdirs(root)) {
      const asset = assetFromDir(kind, sub);
      if (seen.has(asset.id)) continue;
      seen.add(asset.id);
      out.push(asset);
    }
  }

  const mcpJson = path.join(workspaceDir, 'mcp.json');
  if (isFile(mcpJson)) {
    const map = extractMcpServersMap(readJsonFile(mcpJson));
    if (map) {
      for (const [name, entry] of Object.entries(map)) {
        const discoveryKey = `workspace|mcp|${mcpJson}|${name}`;
        const id = discoveryId(discoveryKey);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({
          id,
          kind: 'mcp',
          name,
          source: 'user',
          originApp: 'xyai',
          status: 'installed',
          pathOrRef: mcpJson,
          description: '工作目录 MCP',
          manifest: {
            serverName: name,
            configPath: mcpJson,
            entry: sanitizeMcpServerEntry(entry),
          },
        });
      }
    }
  }

  return out;
}

export interface InstallWorkspacePluginsResult {
  installed: PersonalAsset[];
}

/**
 * Copy discovered workspace assets into userData/personalize/installed.
 * @param workspaceDir Studio cwd (userData/workspace)
 */
export function installWorkspacePlugins(
  workspaceDir: string,
): InstallWorkspacePluginsResult {
  const discovered = discoverWorkspaceAssets(workspaceDir);
  const installed: PersonalAsset[] = [];
  for (const raw of discovered) {
    const src = raw.pathOrRef;
    if (!src || !existsSync(src)) continue;
    const destRoot = path.join(installedDir(raw.kind), raw.id);
    const pathOrRef = copyPathInto(src, destRoot);
    const asset: PersonalAsset = {
      ...raw,
      status: 'installed',
      pathOrRef,
      manifest: {
        ...(raw.manifest || {}),
        installedAt: new Date().toISOString(),
        installPath: pathOrRef,
        workspaceSource: src,
      },
    };
    upsertAsset(asset);
    installed.push(asset);
  }
  return { installed };
}
