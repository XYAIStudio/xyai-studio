/** Read-only ima knowledge OpenAPI client. */
import { extname } from 'node:path'
import { extractDocxText, extractPdfText, extractPlainText } from './extract.ts'
import type { CloudDocumentRecord, KnowledgeSearchHit } from './protocol.ts'

/** Credentials resolved for one operation. */
export interface ImaCredentials { clientId: string; apiKey: string }
/** ima request settings. */
export interface ImaConfig { endpoint: string; timeoutMs: number; pageSize: number; contentBytes: number; hydrateLimit: number }
type Fetch = typeof fetch

function object(value: unknown): Record<string, unknown> { if (typeof value !== 'object' || value === null) throw new Error('IMA_INVALID_RESPONSE'); return value as Record<string, unknown> }
function text(value: unknown): string { return typeof value === 'string' ? value : '' }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function excerpt(value: string, query: string): string { const normalized = value.replaceAll('\0', '').trim(); const at = normalized.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase()); const start = Math.max(0, at < 0 ? 0 : at - 500); return normalized.slice(start, start + 4_000) }

/** ima provider that reads metadata and query snippets without downloading content. */
export class ImaClient {
  constructor(private readonly config: ImaConfig, private readonly fetcher: Fetch = fetch) {}
  private async post(credentials: ImaCredentials, endpoint: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const controller = new AbortController()
    const abort = (): void => controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => controller.abort(new Error('IMA_TIMEOUT')), this.config.timeoutMs)
    try {
      const response = await this.fetcher(`${this.config.endpoint}/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json', 'ima-openapi-clientid': credentials.clientId, 'ima-openapi-apikey': credentials.apiKey }, body: JSON.stringify(payload), signal: controller.signal })
      if (!response.ok) throw new Error(`IMA_HTTP_${response.status}`)
      const packet = object(await response.json())
      if (packet.code !== 0) throw new Error(text(packet.msg) || 'IMA_OPERATION_FAILED')
      return packet.data === null || packet.data === undefined ? {} : object(packet.data)
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
  }
  /** Prove credentials and return visible libraries. */
  async libraries(credentials: ImaCredentials, signal?: AbortSignal): Promise<Array<{ id: string; name: string }>> {
    const out: Array<{ id: string; name: string }> = []; let cursor = ''
    for (;;) {
      const data = await this.post(credentials, 'search_knowledge_base', { query: '', cursor, limit: Math.min(this.config.pageSize, 20) }, signal)
      const list = Array.isArray(data.info_list) ? data.info_list : []
      for (const item of list) { const row = object(item); const id = text(row.kb_id) || text(row.id); if (id) out.push({ id, name: text(row.kb_name) || text(row.name) || id }) }
      const next = text(data.next_cursor); if (data.is_end !== false || !next) return out; cursor = next
    }
  }
  /** List all item metadata in one library. */
  async list(credentials: ImaCredentials, knowledgeBaseId: string, folderId?: string, signal?: AbortSignal): Promise<CloudDocumentRecord[]> {
    const out: CloudDocumentRecord[] = []; let cursor = ''
    for (;;) {
      const payload: Record<string, unknown> = { knowledge_base_id: knowledgeBaseId, cursor, limit: this.config.pageSize }
      if (folderId !== undefined && folderId !== '') payload.folder_id = folderId
      const data = await this.post(credentials, 'get_knowledge_list', payload, signal)
      const list = Array.isArray(data.knowledge_list) ? data.knowledge_list : []
      for (const item of list) { const row = object(item); const id = text(row.media_id); if (id) out.push({ id, title: text(row.title) || id, ...(text(row.parent_folder_id) ? { parentId: text(row.parent_folder_id) } : {}), directory: row.media_type === 99 || id.startsWith('folder_') }) }
      const next = text(data.next_cursor); if (data.is_end !== false || !next) return out; cursor = next
    }
  }
  private async remoteText(credentials: ImaCredentials, mediaId: string, title: string, mediaType: unknown, signal?: AbortSignal): Promise<string> {
    const data = await this.post(credentials, 'get_media_info', { media_id: mediaId }, signal)
    const info = object(data.url_info); const address = new URL(text(info.url))
    if (address.protocol !== 'https:') throw new Error('IMA_CONTENT_URL_NOT_HTTPS')
    const rawHeaders = object(info.headers); const headers = new Headers()
    for (const [name, value] of Object.entries(rawHeaders)) if (typeof value === 'string') headers.set(name, value)
    const controller = new AbortController(); const abort = (): void => controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true }); const timer = setTimeout(() => controller.abort(new Error('IMA_TIMEOUT')), this.config.timeoutMs)
    try {
      const response = await this.fetcher(address, { headers, signal: controller.signal }); if (!response.ok) throw new Error(`IMA_CONTENT_HTTP_${response.status}`)
      const declared = Number(response.headers.get('content-length')); if (Number.isFinite(declared) && declared > this.config.contentBytes) throw new Error('IMA_CONTENT_TOO_LARGE')
      if (!response.body) throw new Error('IMA_CONTENT_EMPTY')
      const chunks: Uint8Array[] = []; let size = 0; const reader = response.body.getReader()
      try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > this.config.contentBytes) throw new Error('IMA_CONTENT_TOO_LARGE'); chunks.push(part.value) } } finally { await reader.cancel().catch(() => undefined) }
      const joined = Buffer.alloc(size); let offset = 0; for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength }
      const extension = extname(title).toLocaleLowerCase()
      if (mediaType === 1 || extension === '.pdf') return extractPdfText(joined).text
      if (mediaType === 3 || extension === '.docx') return extractDocxText(joined).text
      const contentType = response.headers.get('content-type')?.toLocaleLowerCase() ?? ''
      if (contentType.startsWith('text/') || [2, 5, 6, 7, 11, 13, 14].includes(Number(mediaType)) || ['.txt','.md','.json','.csv'].includes(extension)) return extractPlainText(joined).text
      throw new Error('IMA_CONTENT_FORMAT_UNSUPPORTED')
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
  }
  /** Search remote snippets on demand for a conversation tool call. */
  async search(credentials: ImaCredentials, knowledgeBaseId: string, query: string, mount: { id: string; name: string }, signal?: AbortSignal): Promise<KnowledgeSearchHit[]> {
    const data = await this.post(credentials, 'search_knowledge', { query, knowledge_base_id: knowledgeBaseId, cursor: '' }, signal)
    const list = Array.isArray(data.info_list) ? data.info_list : []
    const hits: KnowledgeSearchHit[] = []; let hydrated = 0
    for (const item of list) {
      const row = object(item); const id = text(row.media_id); if (!id) continue
      let snippet = text(row.highlight_content)
      if (!snippet && row.media_type !== 99 && hydrated < this.config.hydrateLimit) { hydrated += 1; try { snippet = excerpt(await this.remoteText(credentials, id, text(row.title) || id, row.media_type, signal), query) } catch (error) { snippet = `Remote content unavailable: ${message(error)}` } }
      hits.push({ mountId: mount.id, mountName: mount.name, provider: 'ima', documentId: id, title: text(row.title) || id, snippet, path: text(row.parent_folder_id) })
    }
    return hits
  }
}
