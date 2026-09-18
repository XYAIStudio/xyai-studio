/**
 * Persist mounts in userData/knowledge-stores.json (caller supplies path).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  CloudKbMount,
  CloudProviderConfig,
  CloudProviderId,
  KnowledgeStoresState,
  KbMount,
  LocalKbMount,
} from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

export function emptyStores(defaultIndexRoot = ''): KnowledgeStoresState {
  return { version: 1, mounts: [], defaultIndexRoot };
}

export function loadStores(filePath: string): KnowledgeStoresState {
  if (!existsSync(filePath)) return emptyStores();
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
    return normalizeStores(raw);
  } catch {
    return emptyStores();
  }
}

export function saveStores(filePath: string, state: KnowledgeStoresState): void {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

export function normalizeStores(raw: unknown): KnowledgeStoresState {
  const base = emptyStores();
  const r = asRecord(raw);
  if (!r) return base;
  const mounts: KbMount[] = [];
  if (Array.isArray(r.mounts)) {
    for (const m of r.mounts) {
      const o = asRecord(m);
      if (!o || typeof o.id !== 'string' || typeof o.name !== 'string') continue;
      if (o.kind === 'local' && typeof o.sourceRoot === 'string') {
        const local: LocalKbMount = {
          id: o.id,
          kind: 'local',
          name: o.name,
          sourceRoot: o.sourceRoot,
          indexRoot: typeof o.indexRoot === 'string' ? o.indexRoot : '',
          createdAt: typeof o.createdAt === 'string' ? o.createdAt : nowIso(),
          updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : nowIso(),
        };
        mounts.push(local);
      } else if (o.kind === 'cloud') {
        const provider: CloudProviderId =
          o.provider === 'ima' ? 'ima' : 'http';
        const cfg = asRecord(o.config) || {};
        const config: CloudProviderConfig = {
          baseUrl: typeof cfg.baseUrl === 'string' ? cfg.baseUrl : '',
          clientId: typeof cfg.clientId === 'string' ? cfg.clientId : '',
          apiKey: typeof cfg.apiKey === 'string' ? cfg.apiKey : '',
          knowledgeBaseId:
            typeof cfg.knowledgeBaseId === 'string' ? cfg.knowledgeBaseId : '',
          useMock: cfg.useMock === true,
          extra:
            cfg.extra && typeof cfg.extra === 'object'
              ? Object.fromEntries(
                  Object.entries(cfg.extra as Record<string, unknown>).filter(
                    (e): e is [string, string] => typeof e[1] === 'string',
                  ),
                )
              : {},
        };
        const cloud: CloudKbMount = {
          id: o.id,
          kind: 'cloud',
          name: o.name,
          provider,
          config,
          indexRoot: typeof o.indexRoot === 'string' ? o.indexRoot : '',
          createdAt: typeof o.createdAt === 'string' ? o.createdAt : nowIso(),
          updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : nowIso(),
        };
        mounts.push(cloud);
      }
    }
  }
  return {
    version: 1,
    mounts,
    defaultIndexRoot:
      typeof r.defaultIndexRoot === 'string' ? r.defaultIndexRoot : '',
  };
}

export function createLocalMount(input: {
  name: string;
  sourceRoot: string;
  indexRoot: string;
}): LocalKbMount {
  const t = nowIso();
  return {
    id: `kb-local-${randomUUID()}`,
    kind: 'local',
    name: input.name,
    sourceRoot: path.resolve(input.sourceRoot),
    indexRoot: path.resolve(input.indexRoot),
    createdAt: t,
    updatedAt: t,
  };
}

export function createCloudMount(input: {
  name: string;
  provider: CloudProviderId;
  config: CloudProviderConfig;
  indexRoot: string;
}): CloudKbMount {
  const t = nowIso();
  return {
    id: `kb-cloud-${randomUUID()}`,
    kind: 'cloud',
    name: input.name,
    provider: input.provider,
    config: input.config,
    indexRoot: path.resolve(input.indexRoot),
    createdAt: t,
    updatedAt: t,
  };
}
