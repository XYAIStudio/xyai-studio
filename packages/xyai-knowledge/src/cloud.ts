/**
 * Cloud KB providers — ima (official OpenAPI) + generic HTTP API.
 * Credentials stay in caller-provided config (persisted in userData by host).
 */

import type { CloudProviderConfig, CloudRemoteFile } from './types.js';
import {
  IMA_DEFAULT_BASE_URL,
  hasImaCredentials,
  incompleteImaCredentialsMessage,
  listImaFiles,
  type ImaCredentials,
} from './ima-client.js';

export async function listCloudFiles(
  provider: 'ima' | 'http',
  config: CloudProviderConfig,
): Promise<{ files: CloudRemoteFile[]; stub: boolean; message?: string }> {
  if (provider === 'ima') {
    return listIma(config);
  }
  return listHttp(config);
}

function imaCredsFromConfig(config: CloudProviderConfig): ImaCredentials | null {
  const clientId = (config.clientId || '').trim();
  const apiKey = (config.apiKey || '').trim();
  if (!clientId || !apiKey) return null;
  return {
    clientId,
    apiKey,
    baseUrl: (config.baseUrl || IMA_DEFAULT_BASE_URL).trim() || IMA_DEFAULT_BASE_URL,
  };
}

async function listIma(
  config: CloudProviderConfig,
): Promise<{ files: CloudRemoteFile[]; stub: boolean; message?: string }> {
  const creds = imaCredsFromConfig(config);
  const knowledgeBaseId = (config.knowledgeBaseId || '').trim();

  if (config.useMock || !hasImaCredentials(creds) || !knowledgeBaseId) {
    const reasons: string[] = [];
    if (config.useMock) reasons.push('已启用 mock');
    if (!hasImaCredentials(creds)) reasons.push(incompleteImaCredentialsMessage());
    else if (!knowledgeBaseId) {
      reasons.push('未选择 knowledgeBaseId（请先拉取并选择知识库）');
    }
    return {
      stub: true,
      message: reasons.join('；'),
      files: config.useMock
        ? [
            {
              id: 'ima-mock-1',
              name: '示例文档.md',
              path: '/mock/示例文档.md',
              url: 'https://ima.example.invalid/mock/示例文档.md',
              mock: true,
            },
            {
              id: 'ima-mock-2',
              name: '产品说明.pdf',
              path: '/mock/产品说明.pdf',
              url: 'https://ima.example.invalid/mock/产品说明.pdf',
              mock: true,
            },
          ]
        : [],
    };
  }

  try {
    const files = await listImaFiles(creds, knowledgeBaseId);
    return {
      stub: false,
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        path: f.path,
        url: f.url,
      })),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { stub: false, message, files: [] };
  }
}

async function listHttp(
  config: CloudProviderConfig,
): Promise<{ files: CloudRemoteFile[]; stub: boolean; message?: string }> {
  if (config.useMock) {
    return {
      stub: true,
      message: 'HTTP provider stub（用户选择 mock）',
      files: [
        {
          id: 'http-mock-1',
          name: 'remote-notes.txt',
          path: '/remote-notes.txt',
          url: (config.baseUrl || 'https://example.invalid') + '/remote-notes.txt',
          mock: true,
        },
      ],
    };
  }
  if (!config.baseUrl?.trim()) {
    return {
      stub: false,
      message: '未填写 baseUrl：请在挂接时填写 API 地址，或勾选使用 stub。',
      files: [],
    };
  }
  try {
    const listPath = config.extra?.listPath || '/files';
    const url = `${config.baseUrl.replace(/\/$/, '')}${listPath.startsWith('/') ? listPath : '/' + listPath}`;
    const headers: Record<string, string> = { accept: 'application/json' };
    if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      return {
        stub: false,
        message: `HTTP ${res.status}`,
        files: [],
      };
    }
    const data = (await res.json()) as unknown;
    return { stub: false, files: normalizeRemoteList(data) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { stub: false, message, files: [] };
  }
}

function normalizeRemoteList(data: unknown): CloudRemoteFile[] {
  const arr = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { files?: unknown }).files)
      ? ((data as { files: unknown[] }).files)
      : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
        ? ((data as { items: unknown[] }).items)
        : [];
  const out: CloudRemoteFile[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = String(o.id || o.path || o.name || '');
    const name = String(o.name || o.title || id);
    const p = String(o.path || o.name || id);
    if (!id) continue;
    out.push({
      id,
      name,
      path: p,
      url: typeof o.url === 'string' ? o.url : typeof o.href === 'string' ? o.href : undefined,
      sizeBytes: typeof o.sizeBytes === 'number' ? o.sizeBytes : undefined,
    });
  }
  return out;
}
