/**
 * Official ima OpenAPI client (wiki/v1).
 * Docs: https://ima.qq.com/agent-interface
 * Base: POST https://ima.qq.com/openapi/wiki/v1/<action>
 * Headers: ima-openapi-clientid, ima-openapi-apikey, Content-Type: application/json
 * Envelope: { retcode, errmsg, data } (also accepts code/msg aliases).
 */

export const IMA_DEFAULT_BASE_URL = 'https://ima.qq.com/openapi/wiki/v1';
export const IMA_AGENT_PORTAL = 'https://ima.qq.com/agent-interface';

export type ImaCredentials = {
  clientId: string;
  apiKey: string;
  /** Override default OpenAPI base. */
  baseUrl?: string;
};

export type ImaEnvelopeParse = {
  ok: boolean;
  retcode: number;
  errmsg: string;
  data: unknown;
};

export type ImaKnowledgeBaseSummary = {
  id: string;
  title: string;
  raw?: Record<string, unknown>;
};

export type ImaKnowledgeFile = {
  id: string;
  name: string;
  path: string;
  url?: string;
  mediaId?: string;
};

export type ImaSearchHit = {
  mediaId: string;
  title: string;
  highlightContent: string;
  url?: string;
};

export class ImaApiError extends Error {
  readonly retcode: number;
  constructor(retcode: number, errmsg: string) {
    super(errmsg || `ima API error retcode=${retcode}`);
    this.name = 'ImaApiError';
    this.retcode = retcode;
  }
}

/** Parse official envelope; tolerates code/msg aliases seen in the wild. */
export function parseImaEnvelope(raw: unknown): ImaEnvelopeParse {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, retcode: -1, errmsg: 'invalid ima response', data: undefined };
  }
  const o = raw as Record<string, unknown>;
  const retcodeRaw = o.retcode ?? o.code;
  const retcode =
    typeof retcodeRaw === 'number'
      ? retcodeRaw
      : typeof retcodeRaw === 'string' && retcodeRaw.trim() !== '' && !Number.isNaN(Number(retcodeRaw))
        ? Number(retcodeRaw)
        : -1;
  const errmsg =
    typeof o.errmsg === 'string'
      ? o.errmsg
      : typeof o.msg === 'string'
        ? o.msg
        : typeof o.message === 'string'
          ? o.message
          : retcode === 0
            ? ''
            : 'unknown ima error';
  return {
    ok: retcode === 0,
    retcode,
    errmsg,
    data: o.data,
  };
}

export function hasImaCredentials(
  creds: Partial<ImaCredentials> | null | undefined,
): creds is ImaCredentials {
  return Boolean(
    creds &&
      typeof creds.clientId === 'string' &&
      creds.clientId.trim() &&
      typeof creds.apiKey === 'string' &&
      creds.apiKey.trim(),
  );
}

export function incompleteImaCredentialsMessage(): string {
  return (
    `ima 凭证不完整：请填写 Client ID 与 API Key（在 ${IMA_AGENT_PORTAL} 获取）。` +
    `未启用 mock 时不会调用真实 API。`
  );
}

function resolveBaseUrl(baseUrl?: string): string {
  const raw = (baseUrl || IMA_DEFAULT_BASE_URL).trim().replace(/\/$/, '');
  return raw || IMA_DEFAULT_BASE_URL;
}

export async function imaRequest(
  action: string,
  body: Record<string, unknown>,
  creds: ImaCredentials,
): Promise<unknown> {
  const act = action.replace(/^\//, '');
  const url = `${resolveBaseUrl(creds.baseUrl)}/${act}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'ima-openapi-clientid': creds.clientId.trim(),
      'ima-openapi-apikey': creds.apiKey.trim(),
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new ImaApiError(
      -1,
      `ima HTTP ${res.status}: non-JSON response ${text.slice(0, 160)}`,
    );
  }
  const env = parseImaEnvelope(parsed);
  if (!env.ok) {
    throw new ImaApiError(env.retcode, env.errmsg || `ima HTTP ${res.status}`);
  }
  if (!res.ok) {
    throw new ImaApiError(env.retcode || res.status, env.errmsg || `HTTP ${res.status}`);
  }
  return env.data;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function pickString(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
}

function unwrapKbItem(item: unknown): Record<string, unknown> | null {
  const o = asRecord(item);
  if (!o) return null;
  const nested = asRecord(o.knowledge_base);
  return nested || o;
}

function extractArray(data: unknown, keys: string[]): unknown[] {
  const o = asRecord(data);
  if (!o) {
    return Array.isArray(data) ? data : [];
  }
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

export function normalizeImaKnowledgeBases(data: unknown): ImaKnowledgeBaseSummary[] {
  const arr = extractArray(data, [
    'searched_knowledge_base_list',
    'knowledge_base_list',
    'info_list',
    'list',
    'items',
  ]);
  const out: ImaKnowledgeBaseSummary[] = [];
  for (const item of arr) {
    const o = unwrapKbItem(item);
    if (!o) continue;
    const id = pickString(o, ['knowledge_base_id', 'id', 'kb_id']);
    const title = pickString(o, ['title', 'name', 'knowledge_base_name']) || id;
    if (!id) continue;
    out.push({ id, title, raw: o });
  }
  return out;
}

export function normalizeImaKnowledgeList(data: unknown): ImaKnowledgeFile[] {
  const filesArr = extractArray(data, [
    'knowledge_list',
    'list',
    'files',
    'items',
    'info_list',
  ]);
  const foldersArr = extractArray(data, ['folders', 'folder_list']);
  const out: ImaKnowledgeFile[] = [];

  for (const item of filesArr) {
    const o = asRecord(item);
    if (!o) continue;
    const mediaId = pickString(o, ['media_id', 'id', 'doc_id', 'note_id']);
    const name = pickString(o, ['title', 'name', 'file_name']) || mediaId;
    if (!mediaId && !name) continue;
    const id = mediaId || name;
    const url = pickString(o, ['url', 'href', 'link']) || undefined;
    out.push({
      id,
      name,
      path: mediaId || name,
      url,
      mediaId: mediaId || undefined,
    });
  }

  for (const item of foldersArr) {
    const o = asRecord(item);
    if (!o) continue;
    const id = pickString(o, ['folder_id', 'id']);
    const name = pickString(o, ['title', 'name', 'folder_name']) || id;
    if (!id) continue;
    out.push({
      id,
      name: `[文件夹] ${name}`,
      path: id,
    });
  }

  return out;
}

export function normalizeImaSearchHits(data: unknown): ImaSearchHit[] {
  const arr = extractArray(data, [
    'knowledge_list',
    'search_list',
    'info_list',
    'list',
    'items',
    'results',
  ]);
  const out: ImaSearchHit[] = [];
  for (const item of arr) {
    const o = asRecord(item);
    if (!o) continue;
    const mediaId = pickString(o, ['media_id', 'id', 'doc_id']);
    const title = pickString(o, ['title', 'name', 'file_name']) || mediaId;
    const highlightContent =
      pickString(o, ['highlight_content', 'highlight', 'snippet', 'content', 'summary']) ||
      '';
    if (!mediaId && !title && !highlightContent) continue;
    out.push({
      mediaId: mediaId || title,
      title: title || mediaId,
      highlightContent,
      url: pickString(o, ['url', 'href', 'link']) || undefined,
    });
  }
  // Sometimes a single hit object is returned under data itself
  if (!out.length) {
    const o = asRecord(data);
    if (o && (o.highlight_content || o.media_id)) {
      const mediaId = pickString(o, ['media_id', 'id']);
      const title = pickString(o, ['title', 'name']) || mediaId;
      out.push({
        mediaId: mediaId || title,
        title,
        highlightContent: pickString(o, ['highlight_content', 'highlight', 'snippet']),
        url: pickString(o, ['url', 'href']) || undefined,
      });
    }
  }
  return out;
}

export async function listImaKnowledgeBases(
  creds: ImaCredentials,
  opts: { query?: string; limit?: number } = {},
): Promise<ImaKnowledgeBaseSummary[]> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const all: ImaKnowledgeBaseSummary[] = [];
  let cursor = '';
  let guard = 0;
  while (guard++ < 20) {
    const data = await imaRequest(
      'search_knowledge_base',
      { query: opts.query ?? '', cursor, limit },
      creds,
    );
    const page = normalizeImaKnowledgeBases(data);
    all.push(...page);
    const o = asRecord(data);
    const isEnd = o?.is_end === true || o?.isEnd === true;
    const next =
      typeof o?.next_cursor === 'string'
        ? o.next_cursor
        : typeof o?.cursor === 'string'
          ? o.cursor
          : '';
    if (isEnd || !next || next === cursor || page.length === 0) break;
    cursor = next;
  }
  // Deduplicate by id
  const seen = new Set<string>();
  return all.filter((kb) => {
    if (seen.has(kb.id)) return false;
    seen.add(kb.id);
    return true;
  });
}

export async function listImaFiles(
  creds: ImaCredentials,
  knowledgeBaseId: string,
  opts: { folderId?: string; pageLimit?: number; maxPages?: number } = {},
): Promise<ImaKnowledgeFile[]> {
  const pageLimit = Math.min(Math.max(opts.pageLimit ?? 50, 1), 50);
  const maxPages = opts.maxPages ?? 40;
  const all: ImaKnowledgeFile[] = [];
  let cursor = '';
  for (let i = 0; i < maxPages; i++) {
    const body: Record<string, unknown> = {
      knowledge_base_id: knowledgeBaseId,
      cursor,
      limit: pageLimit,
    };
    if (opts.folderId) body.folder_id = opts.folderId;
    const data = await imaRequest('get_knowledge_list', body, creds);
    const page = normalizeImaKnowledgeList(data);
    all.push(...page);
    const o = asRecord(data);
    const isEnd = o?.is_end === true || o?.isEnd === true;
    const next =
      typeof o?.next_cursor === 'string'
        ? o.next_cursor
        : typeof o?.cursor === 'string'
          ? o.cursor
          : '';
    if (isEnd || !next || next === cursor || page.length === 0) break;
    cursor = next;
  }
  return all;
}

export async function searchImaKnowledge(
  creds: ImaCredentials,
  knowledgeBaseId: string,
  query: string,
): Promise<ImaSearchHit[]> {
  const data = await imaRequest(
    'search_knowledge',
    {
      knowledge_base_id: knowledgeBaseId,
      query,
      cursor: '',
    },
    creds,
  );
  return normalizeImaSearchHits(data);
}
