import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ModelEntry, ModelRole } from '@xyai/contracts';
import {
  OLLAMA_NOT_INSTALLED_MESSAGE,
  OLLAMA_NOT_RUNNING_MESSAGE,
} from './ollama-errors.js';

export type LocalModelDiscoverySource = 'api' | 'cli' | 'disk' | 'none';

export function inferOllamaRole(name: string): ModelRole {
  const lower = name.toLowerCase();
  if (
    lower.includes('embed') ||
    lower.includes('bge') ||
    lower.includes('nomic-embed') ||
    lower.includes('mxbai-embed')
  ) {
    return 'embedding';
  }
  if (lower.includes('coder') || lower.includes('code')) {
    return 'code';
  }
  if (lower.includes('vl') || lower.includes('vision') || lower.includes('mmproj')) {
    return 'vision';
  }
  return 'chat';
}

export function toOllamaModelEntry(
  name: string,
  extra: Partial<ModelEntry> = {},
): ModelEntry {
  const role: ModelRole = extra.role ?? inferOllamaRole(name);
  const capabilities: string[] = extra.capabilities?.length
    ? extra.capabilities.filter((c): c is string => Boolean(c))
    : [role];
  return {
    id: `ollama:${name}`,
    displayName: name,
    provider: 'local',
    version: extra.version ?? 'local',
    harnessIds: extra.harnessIds ?? ['ollama', 'codex-oss'],
    role,
    sizeBytes: extra.sizeBytes,
    source: extra.source ?? 'ollama',
    installed: extra.installed ?? true,
    capabilities,
  };
}

/** Parse `ollama list` text table. First column is NAME. */
export function parseOllamaListOutput(stdout: string): string[] {
  const names: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^name\b/i.test(trimmed)) continue;
    if (/^failed/i.test(trimmed)) continue;
    const first = trimmed.split(/\s+/)[0];
    if (!first || first === 'NAME') continue;
    if (!/^[A-Za-z0-9._:-]+$/.test(first)) continue;
    names.push(first);
  }
  return [...new Set(names)];
}

/**
 * `.../manifests/registry.ollama.ai/library/qwen3/8b` → `qwen3:8b`
 */
export function modelNameFromManifestPath(
  filePath: string,
  manifestsRoot: string,
): string | null {
  const rel = path.relative(manifestsRoot, filePath);
  if (!rel || rel.startsWith('..')) return null;
  const parts = rel.split(/[/\\]/).filter(Boolean);
  if (parts.length < 2) return null;
  const tag = parts[parts.length - 1]!;
  const name = parts[parts.length - 2]!;
  if (!name || name === 'manifests') return null;
  return `${name}:${tag}`;
}

export function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

export function listOllamaNamesFromDiskRoot(modelsRoot: string): string[] {
  const manifests = path.join(modelsRoot, 'manifests');
  const names: string[] = [];
  for (const file of walkFiles(manifests)) {
    const n = modelNameFromManifestPath(file, manifests);
    if (n) names.push(n);
  }
  return [...new Set(names)];
}

export function ollamaModelsRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const roots: string[] = [];
  if (env.OLLAMA_MODELS) roots.push(env.OLLAMA_MODELS);
  const home = env.USERPROFILE || env.HOME || '';
  if (home) roots.push(path.join(home, '.ollama', 'models'));
  return roots;
}

export function pickDiscoverySource(
  api: ModelEntry[],
  cli: ModelEntry[],
  disk: ModelEntry[],
): { models: ModelEntry[]; source: LocalModelDiscoverySource } {
  if (api.length) return { models: api, source: 'api' };
  if (cli.length) return { models: cli, source: 'cli' };
  if (disk.length) return { models: disk, source: 'disk' };
  return { models: [], source: 'none' };
}

export function formatLocalModelScanResult(input: {
  count: number;
  installed: boolean;
  running: boolean;
}): string {
  if (input.count > 0) {
    return `发现 ${input.count} 个本地模型`;
  }
  if (!input.installed) {
    return OLLAMA_NOT_INSTALLED_MESSAGE;
  }
  if (!input.running) {
    return OLLAMA_NOT_RUNNING_MESSAGE;
  }
  return 'Ollama 已运行，但未发现已下载的本地模型。';
}
