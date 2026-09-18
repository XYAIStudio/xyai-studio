/**
 * Read-only Gemini desktop/CLI scanner (best-effort if present).
 */

import path from 'node:path';
import type { DiscoveredRaw, ScanProbeEnv } from '../types.js';
import {
  geminiConfigCandidates,
  geminiProbeRoots,
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

export function scanGemini(env: ScanProbeEnv): DiscoveredRaw[] {
  const out: DiscoveredRaw[] = [];

  for (const cfg of geminiConfigCandidates(env)) {
    if (!pathExists(cfg) || !isFile(cfg)) continue;
    const json = readJsonFile(cfg);
    const map = extractMcpServersMap(json);
    if (map) {
      for (const [name, entry] of Object.entries(map)) {
        out.push({
          discoveryKey: `gemini|mcp|${cfg}|${name}`,
          kind: 'mcp',
          name,
          originApp: 'gemini',
          pathOrRef: cfg,
          description: `Gemini MCP · ${path.basename(cfg)}`,
          manifest: {
            serverName: name,
            configPath: cfg,
            entry: sanitizeMcpServerEntry(entry),
          },
        });
      }
    } else if (json && typeof json === 'object') {
      // Generic connector/settings reference
      out.push({
        discoveryKey: `gemini|connector|${cfg}`,
        kind: 'connector',
        name: path.basename(cfg, path.extname(cfg)),
        originApp: 'gemini',
        pathOrRef: cfg,
        description: 'Gemini config',
        manifest: { configPath: cfg },
      });
    }
  }

  for (const root of geminiProbeRoots(env)) {
    if (!isDirectory(root)) continue;
    const pluginDir = path.join(root, 'extensions');
    const skillsDir = path.join(root, 'skills');
    if (isDirectory(pluginDir)) {
      for (const sub of listSubdirs(pluginDir)) {
        out.push({
          discoveryKey: `gemini|plugin|${sub}`,
          kind: 'plugin',
          name: path.basename(sub),
          originApp: 'gemini',
          pathOrRef: sub,
          description: 'Gemini extension',
          manifest: { extensionDir: sub },
        });
      }
    }
    if (isDirectory(skillsDir)) {
      for (const sub of listSubdirs(skillsDir)) {
        out.push({
          discoveryKey: `gemini|skill|${sub}`,
          kind: 'skill',
          name: path.basename(sub),
          originApp: 'gemini',
          pathOrRef: sub,
          description: 'Gemini skill',
          manifest: { skillDir: sub },
        });
      }
    }
  }

  return out;
}
