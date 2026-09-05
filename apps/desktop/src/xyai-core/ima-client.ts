/**
 * IMA 云知识库 OpenAPI 客户端（Electron 主进程 / Node 22+）。
 * 官方接口参考：https://ima.qq.com/agent-interface（ima claw 配置）
 *  - 知识库模块 Base：https://ima.qq.com/openapi/wiki/v1/
 *  - 笔记模块   Base：https://ima.qq.com/openapi/note/v1/
 * 协议：HTTP POST JSON；鉴权双头 ima-openapi-clientid + ima-openapi-apikey。
 * 响应统一 {code,msg,data}：code=0 成功；code≠0 把 msg 原文抛给调用方（不吞错、不崩溃）。
 *
 * 数据红线：这里只做“按需借阅”。列表/检索只取元数据与片段；正文仅在用户明确
 * 点开某条时拉取一次；绝不整库下载、绝不落盘正文缓存。
 */

import { createHash, createHmac } from 'node:crypto'
import { createReadStream, statSync } from 'node:fs'
import { request as httpsRequest } from 'node:https'

export interface ImaCredentials {
  readonly clientId: string
  readonly apiKey: string
}

export interface ImaKnowledgeBaseSummary {
  readonly id: string
  readonly name: string
  readonly coverUrl?: string
  readonly description?: string
}

export interface ImaKnowledgeItem {
  readonly mediaId: string
  readonly title: string
  readonly parentFolderId?: string
}

export interface ImaSearchHit {
  readonly mediaId: string
  readonly title: string
  readonly highlightContent?: string
  readonly parentFolderId?: string
}

export interface ImaMediaInfo {
  readonly mediaId: string
  readonly mediaType: number
  readonly url?: string
  readonly headers?: Record<string, string>
  readonly notebookId?: string
  readonly noteContent?: string
}

export interface ImaNote {
  readonly noteId: string
  readonly title: string
  readonly summary?: string
  readonly folderId?: string
  readonly folderName?: string
  readonly modifyTime?: number
}

export interface ImaNoteFolder {
  readonly folderId: string
  readonly name: string
  readonly noteNumber?: number
  readonly parentFolderId?: string
  readonly folderType?: number
}

export interface ImaImportUrlResult {
  readonly url: string
  readonly ok: boolean
  readonly mediaId?: string
  readonly message?: string
}

const WIKI_BASE = 'https://ima.qq.com/openapi/wiki/v1/'
const NOTE_BASE = 'https://ima.qq.com/openapi/note/v1/'
const TIMEOUT_MS = 12_000

interface ImaPacket {
  readonly code: number
  readonly msg?: string
  readonly data?: Record<string, unknown> | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 幂等请求最多重试 1 次（仅网络层失败重试；业务 code≠0 不重试）。 */
async function imaPost(
  credentials: ImaCredentials,
  base: string,
  endpoint: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ImaPacket> {
  const attempt = async (): Promise<ImaPacket> => {
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'ima-openapi-clientid': credentials.clientId,
        'ima-openapi-apikey': credentials.apiKey,
      },
      body: JSON.stringify(payload),
    }
    if (signal !== undefined) init.signal = signal
    const res = await fetch(base + endpoint, init)
    let parsed: ImaPacket
    try {
      parsed = (await res.json()) as ImaPacket
    } catch {
      throw new Error('ima 返回了无法识别的响应，请稍后重试')
    }
    if (typeof parsed?.code !== 'number') throw new Error('ima 返回结构异常，请检查网络后重试')
    return parsed
  }
  try {
    return await attempt()
  } catch (error) {
    if (signal?.aborted === true) throw error
    await sleep(250)
    return attempt()
  }
}

async function imaWiki(
  credentials: ImaCredentials,
  endpoint: string,
  payload: Record<string, unknown>,
  base = WIKI_BASE,
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('ima 请求超时，已跳过本次云端引用')), TIMEOUT_MS)
  try {
    const packet = await imaPost(credentials, base, endpoint, payload, controller.signal)
    if (packet.code !== 0) throw new Error(packet.msg || 'ima 云端返回错误')
    return (packet.data ?? null) as Record<string, unknown> | null
  } finally {
    clearTimeout(timer)
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** 列出当前账号可见知识库（含自建与订阅）。空 query 返回全部。 */
export async function listImaKnowledgeBases(
  credentials: ImaCredentials,
  base = WIKI_BASE,
): Promise<ImaKnowledgeBaseSummary[]> {
  const out: ImaKnowledgeBaseSummary[] = []
  let cursor = ''
  for (let page = 0; page < 10; page += 1) {
    const data = await imaWiki(credentials, 'search_knowledge_base', { query: '', cursor, limit: 20 }, base)
    const list = Array.isArray(data?.info_list) ? data.info_list : []
    for (const raw of list) {
      if (typeof raw !== 'object' || raw === null) continue
      const record = raw as Record<string, unknown>
      const id = asString(record.id)
      if (id === '') continue
      out.push({
        id,
        name: asString(record.name) || id,
        ...(typeof record.cover_url === 'string' ? { coverUrl: record.cover_url } : {}),
        ...(typeof record.description === 'string' ? { description: record.description } : {}),
      })
    }
    const isEnd = data?.is_end !== false
    const next = asString(data?.next_cursor)
    if (isEnd || next === '' || page === 9) break
    cursor = next
  }
  return out
}

/** 浏览知识库内容（根目录或指定文件夹），只取元数据列表、不下载正文。 */
export async function listImaKnowledgeItems(
  credentials: ImaCredentials,
  knowledgeBaseId: string,
  folderId?: string,
  base = WIKI_BASE,
): Promise<ImaKnowledgeItem[]> {
  const out: ImaKnowledgeItem[] = []
  let cursor = ''
  for (let page = 0; page < 20; page += 1) {
    const payload: Record<string, unknown> = { knowledge_base_id: knowledgeBaseId, cursor, limit: 50 }
    if (folderId !== undefined && folderId !== '') payload.folder_id = folderId
    const data = await imaWiki(credentials, 'get_knowledge_list', payload, base)
    const list = Array.isArray(data?.knowledge_list) ? data.knowledge_list : []
    for (const raw of list) {
      if (typeof raw !== 'object' || raw === null) continue
      const record = raw as Record<string, unknown>
      const mediaId = asString(record.media_id)
      if (mediaId === '') continue
      out.push({
        mediaId,
        title: asString(record.title) || mediaId,
        ...(typeof record.parent_folder_id === 'string' ? { parentFolderId: record.parent_folder_id } : {}),
      })
    }
    const isEnd = data?.is_end !== false
    const next = asString(data?.next_cursor)
    if (isEnd || next === '' || page === 19) break
    cursor = next
  }
  return out
}

/** 在指定知识库内按关键词检索，返回标题 + 高亮片段（不下载整篇）。 */
export async function searchImaKnowledge(
  credentials: ImaCredentials,
  knowledgeBaseId: string,
  query: string,
  base = WIKI_BASE,
): Promise<ImaSearchHit[]> {
  const out: ImaSearchHit[] = []
  let cursor = ''
  for (let page = 0; page < 5; page += 1) {
    const data = await imaWiki(credentials, 'search_knowledge', { query, knowledge_base_id: knowledgeBaseId, cursor }, base)
    const list = Array.isArray(data?.info_list) ? data.info_list : []
    for (const raw of list) {
      if (typeof raw !== 'object' || raw === null) continue
      const record = raw as Record<string, unknown>
      const mediaId = asString(record.media_id)
      if (mediaId === '') continue
      out.push({
        mediaId,
        title: asString(record.title) || mediaId,
        ...(typeof record.highlight_content === 'string' ? { highlightContent: record.highlight_content } : {}),
        ...(typeof record.parent_folder_id === 'string' ? { parentFolderId: record.parent_folder_id } : {}),
      })
    }
    const isEnd = data?.is_end !== false
    const next = asString(data?.next_cursor)
    if (isEnd || next === '' || page === 4) break
    cursor = next
  }
  return out
}

/** 获取单条媒体的访问信息：文件/网页返回 url，笔记返回 notebook_id（并可顺带取正文）。 */
export async function getImaMediaInfo(
  credentials: ImaCredentials,
  mediaId: string,
  base = WIKI_BASE,
  noteBase = NOTE_BASE,
): Promise<ImaMediaInfo> {
  const data = await imaWiki(credentials, 'get_media_info', { media_id: mediaId }, base)
  const mediaType = typeof data?.media_type === 'number' ? data.media_type : -1
  const urlInfo = (typeof data?.url_info === 'object' && data.url_info !== null ? data.url_info : {}) as Record<string, unknown>
  const notebookInfo = (typeof data?.notebook_ext_info === 'object' && data.notebook_ext_info !== null ? data.notebook_ext_info : {}) as Record<string, unknown>
  const notebookId = asString(notebookInfo.notebook_id)
  let noteContent: string | undefined
  if (notebookId !== '') {
    try {
      const note = await imaWiki(credentials, 'get_doc_content', { note_id: notebookId, target_content_format: 0 }, noteBase)
      const content = asString(note?.content)
      if (content !== '') noteContent = content
    } catch {
      noteContent = undefined
    }
  }
  const headers = (typeof urlInfo.headers === 'object' && urlInfo.headers !== null ? urlInfo.headers : {}) as Record<string, unknown>
  return {
    mediaId,
    mediaType,
    ...(typeof urlInfo.url === 'string' && urlInfo.url !== '' ? { url: urlInfo.url } : {}),
    ...(Object.keys(headers).length > 0 ? { headers: Object.fromEntries(Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) } : {}),
    ...(notebookId !== '' ? { notebookId } : {}),
    ...(noteContent !== undefined ? { noteContent } : {}),
  }
}

/** 读取笔记正文（纯文本）。 */
export async function getImaNoteContent(
  credentials: ImaCredentials,
  noteId: string,
  noteBase = NOTE_BASE,
): Promise<string> {
  const data = await imaWiki(credentials, 'get_doc_content', { note_id: noteId, target_content_format: 0 }, noteBase)
  return asString(data?.content)
}

/** 列出笔记本（笔记分类）。 */
export async function listImaNotebooks(credentials: ImaCredentials, noteBase = NOTE_BASE): Promise<ImaNoteFolder[]> {
  const out: ImaNoteFolder[] = []
  let cursor = '0'
  for (let page = 0; page < 20; page += 1) {
    const data = await imaWiki(credentials, 'list_notebook', { cursor, limit: 20 }, noteBase)
    const list = Array.isArray(data?.note_folder_infos) ? data.note_folder_infos : []
    for (const raw of list) {
      if (typeof raw !== 'object' || raw === null) continue
      const record = raw as Record<string, unknown>
      const folderId = asString(record.folder_id)
      if (folderId === '') continue
      out.push({
        folderId,
        name: asString(record.name) || folderId,
        ...(typeof record.note_number === 'number' ? { noteNumber: record.note_number } : {}),
        ...(typeof record.parent_folder_id === 'string' ? { parentFolderId: record.parent_folder_id } : {}),
        ...(typeof record.folder_type === 'number' ? { folderType: record.folder_type } : {}),
      })
    }
    const isEnd = data?.is_end !== false
    const next = asString(data?.next_cursor)
    if (isEnd || next === '' || page === 19) break
    cursor = next
  }
  return out
}

/** 列出笔记本内的笔记。 */
export async function listImaNotes(
  credentials: ImaCredentials,
  folderId?: string,
  noteBase = NOTE_BASE,
): Promise<ImaNote[]> {
  const out: ImaNote[] = []
  let cursor = ''
  for (let page = 0; page < 20; page += 1) {
    const payload: Record<string, unknown> = { cursor, limit: 20, sort_type: 0 }
    if (folderId !== undefined && folderId !== '') payload.folder_id = folderId
    const data = await imaWiki(credentials, 'list_note', payload, noteBase)
    const list = Array.isArray(data?.note_book_list) ? data.note_book_list : []
    for (const raw of list) {
      if (typeof raw !== 'object' || raw === null) continue
      const record = raw as Record<string, unknown>
      const noteId = asString(record.note_id)
      if (noteId === '') continue
      const ext = (typeof record.note_ext_info === 'object' && record.note_ext_info !== null ? record.note_ext_info : {}) as Record<string, unknown>
      out.push({
        noteId,
        title: asString(record.title) || noteId,
        ...(typeof record.summary === 'string' ? { summary: record.summary } : {}),
        ...(typeof ext.folder_id === 'string' ? { folderId: ext.folder_id } : {}),
        ...(typeof ext.folder_name === 'string' ? { folderName: ext.folder_name } : {}),
        ...(typeof record.modify_time === 'number' ? { modifyTime: record.modify_time } : {}),
      })
    }
    const isEnd = data?.is_end !== false
    const next = asString(data?.next_cursor)
    if (isEnd || next === '' || page === 19) break
    cursor = next
  }
  return out
}

/** 检索笔记：searchType 0=标题（默认），1=正文。 */
export async function searchImaNotes(
  credentials: ImaCredentials,
  keyword: string,
  searchType: 0 | 1 = 0,
  noteBase = NOTE_BASE,
): Promise<ImaNote[]> {
  const out: ImaNote[] = []
  let start = 0
  const end = 20
  for (let page = 0; page < 10; page += 1) {
    const data = await imaWiki(credentials, 'search_note', {
      search_type: searchType,
      sort_type: 0,
      query_info: searchType === 1 ? { content: keyword } : { title: keyword },
      start,
      end,
    }, noteBase)
    const list = Array.isArray(data?.note_list) ? data.note_list : []
    for (const raw of list) {
      if (typeof raw !== 'object' || raw === null) continue
      const record = raw as Record<string, unknown>
      const info = (typeof record.note_book_info === 'object' && record.note_book_info !== null ? record.note_book_info : {}) as Record<string, unknown>
      const noteId = asString(info.note_id)
      if (noteId === '') continue
      const ext = (typeof info.note_ext_info === 'object' && info.note_ext_info !== null ? info.note_ext_info : {}) as Record<string, unknown>
      out.push({
        noteId,
        title: asString(info.title) || noteId,
        ...(typeof info.summary === 'string' ? { summary: info.summary } : {}),
        ...(typeof ext.folder_id === 'string' ? { folderId: ext.folder_id } : {}),
        ...(typeof ext.folder_name === 'string' ? { folderName: ext.folder_name } : {}),
        ...(typeof info.modify_time === 'number' ? { modifyTime: info.modify_time } : {}),
      })
    }
    const isEnd = data?.is_end !== false
    if (isEnd || page === 9) break
    start = end * (page + 1)
  }
  return out
}

/** 新建笔记（Markdown）。 */
export async function createImaNote(
  credentials: ImaCredentials,
  content: string,
  folderId?: string,
  folderName?: string,
  noteBase = NOTE_BASE,
): Promise<string> {
  const payload: Record<string, unknown> = { content_format: 1, content }
  if (folderId !== undefined && folderId !== '') payload.folder_id = folderId
  if (folderName !== undefined && folderName !== '') payload.folder_name = folderName
  const data = await imaWiki(credentials, 'import_doc', payload, noteBase)
  return asString(data?.note_id)
}

/** 追加内容到已有笔记（Markdown）。 */
export async function appendImaNote(
  credentials: ImaCredentials,
  noteId: string,
  content: string,
  noteBase = NOTE_BASE,
): Promise<string> {
  const data = await imaWiki(credentials, 'append_doc', { note_id: noteId, content_format: 1, content }, noteBase)
  return asString(data?.note_id)
}

/** 将网页 / 微信公众号文章 URL 添加到知识库（服务端抓取，本地不传文件内容）。 */
export async function importImaUrls(
  credentials: ImaCredentials,
  knowledgeBaseId: string,
  urls: string[],
  folderId?: string,
  base = WIKI_BASE,
): Promise<ImaImportUrlResult[]> {
  const normalized = urls.filter((url) => url.trim() !== '').slice(0, 10)
  if (normalized.length === 0) return []
  const payload: Record<string, unknown> = { knowledge_base_id: knowledgeBaseId, folder_id: folderId ?? knowledgeBaseId, urls: normalized }
  const data = await imaWiki(credentials, 'import_urls', payload, base)
  const results = (typeof data?.results === 'object' && data.results !== null ? data.results : {}) as Record<string, unknown>
  return normalized.map((url) => {
    const raw = results[url]
    const record = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    const retCode = typeof record.ret_code === 'number' ? record.ret_code : -1
    return {
      url,
      ok: retCode === 0,
      ...(typeof record.media_id === 'string' ? { mediaId: record.media_id } : {}),
      ...(retCode !== 0 ? { message: '导入未完成，请在 ima 客户端内查看' } : {}),
    }
  })
}

/** 客户端探活：凭据是否有效（以最小请求探测）。 */
export async function testImaCredentials(credentials: ImaCredentials, base = WIKI_BASE): Promise<{ ok: boolean; message: string; count?: number }> {
  try {
    const bases = await listImaKnowledgeBases(credentials, base)
    return { ok: true, message: '连接成功，已读取知识库列表', count: bases.length }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '连接 ima 失败' }
  }
}


/** ---- 本地文件上传到 ima 知识库（官方链路：check_repeated_names → create_media → COS PUT → add_knowledge）---- */

export interface ImaCosCredential {
  readonly token: string
  readonly secretId: string
  readonly secretKey: string
  readonly startTime?: number
  readonly expiredTime?: number
  readonly bucket: string
  readonly region: string
  readonly customDomain?: string
  readonly cosKey: string
}

export interface ImaUploadFileResult {
  readonly fileName: string
  readonly ok: boolean
  readonly mediaId?: string
  readonly message?: string
}

export interface ImaMediaSpec {
  readonly mediaType: number
  readonly contentType: string
  readonly maxBytes: number
}

const IMA_SUPPORTED_MEDIA: Record<string, ImaMediaSpec> = {
  pdf: { mediaType: 1, contentType: 'application/pdf', maxBytes: 200 * 1024 * 1024 },
  doc: { mediaType: 3, contentType: 'application/msword', maxBytes: 200 * 1024 * 1024 },
  docx: { mediaType: 3, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', maxBytes: 200 * 1024 * 1024 },
  ppt: { mediaType: 4, contentType: 'application/vnd.ms-powerpoint', maxBytes: 200 * 1024 * 1024 },
  pptx: { mediaType: 4, contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', maxBytes: 200 * 1024 * 1024 },
  xls: { mediaType: 5, contentType: 'application/vnd.ms-excel', maxBytes: 10 * 1024 * 1024 },
  xlsx: { mediaType: 5, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', maxBytes: 10 * 1024 * 1024 },
  csv: { mediaType: 5, contentType: 'text/csv', maxBytes: 10 * 1024 * 1024 },
  txt: { mediaType: 13, contentType: 'text/plain', maxBytes: 10 * 1024 * 1024 },
  md: { mediaType: 7, contentType: 'text/markdown', maxBytes: 10 * 1024 * 1024 },
  markdown: { mediaType: 7, contentType: 'text/markdown', maxBytes: 10 * 1024 * 1024 },
  html: { mediaType: 20, contentType: 'text/html', maxBytes: 10 * 1024 * 1024 },
  htm: { mediaType: 20, contentType: 'text/html', maxBytes: 10 * 1024 * 1024 },
  png: { mediaType: 9, contentType: 'image/png', maxBytes: 30 * 1024 * 1024 },
  jpg: { mediaType: 9, contentType: 'image/jpeg', maxBytes: 30 * 1024 * 1024 },
  jpeg: { mediaType: 9, contentType: 'image/jpeg', maxBytes: 30 * 1024 * 1024 },
  webp: { mediaType: 9, contentType: 'image/webp', maxBytes: 30 * 1024 * 1024 },
  epub: { mediaType: 21, contentType: 'application/epub+zip', maxBytes: 50 * 1024 * 1024 },
  mp3: { mediaType: 15, contentType: 'audio/mpeg', maxBytes: 200 * 1024 * 1024 },
  m4a: { mediaType: 15, contentType: 'audio/x-m4a', maxBytes: 200 * 1024 * 1024 },
  wav: { mediaType: 15, contentType: 'audio/wav', maxBytes: 200 * 1024 * 1024 },
  aac: { mediaType: 15, contentType: 'audio/aac', maxBytes: 200 * 1024 * 1024 },
}

/** 按扩展名解析 ima 媒体规格；不支持的类型返回 undefined（由调用方给出友好提示）。 */
export function imaMediaSpecForFile(fileName: string): ImaMediaSpec | undefined {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return IMA_SUPPORTED_MEDIA[ext]
}

function hmacSha1(key: string, data: string): string {
  return createHmac('sha1', key).update(data).digest('hex')
}

function sha1Hex(data: string): string {
  return createHash('sha1').update(data).digest('hex')
}

/** 检查目标知识库（含文件夹）中是否已有同名文件。 */
export async function checkImaRepeatedNames(
  credentials: ImaCredentials,
  knowledgeBaseId: string,
  entries: readonly { readonly name: string; readonly mediaType: number }[],
  folderId?: string,
  base = WIKI_BASE,
): Promise<Map<string, boolean>> {
  const payload: Record<string, unknown> = { knowledge_base_id: knowledgeBaseId, params: entries.map((item) => ({ name: item.name, media_type: item.mediaType })) }
  if (folderId !== undefined && folderId !== '') payload.folder_id = folderId
  const data = await imaWiki(credentials, 'check_repeated_names', payload, base)
  const map = new Map<string, boolean>()
  for (const raw of Array.isArray(data?.results) ? (data.results as unknown[]) : []) {
    if (typeof raw !== 'object' || raw === null) continue
    const record = raw as Record<string, unknown>
    const name = asString(record.name)
    if (name !== '') map.set(name, record.is_repeated === true)
  }
  return map
}

export async function createImaMedia(
  credentials: ImaCredentials,
  input: { readonly fileName: string; readonly fileSize: number; readonly contentType: string; readonly knowledgeBaseId: string; readonly fileExt: string },
  base = WIKI_BASE,
): Promise<{ readonly mediaId: string; readonly credential: ImaCosCredential }> {
  const data = await imaWiki(credentials, 'create_media', {
    file_name: input.fileName,
    file_size: input.fileSize,
    content_type: input.contentType,
    knowledge_base_id: input.knowledgeBaseId,
    file_ext: input.fileExt,
  }, base)
  const mediaId = asString(data?.media_id)
  const raw = (typeof data?.cos_credential === 'object' && data.cos_credential !== null ? data.cos_credential : {}) as Record<string, unknown>
  const credential: ImaCosCredential = {
    token: asString(raw.token) || asString(raw.session_token),
    secretId: asString(raw.secret_id) || asString(raw.tmp_secret_id),
    secretKey: asString(raw.secret_key) || asString(raw.tmp_secret_key),
    ...(typeof raw.start_time === 'number' ? { startTime: raw.start_time } : {}),
    ...(typeof raw.expired_time === 'number' ? { expiredTime: raw.expired_time } : {}),
    bucket: asString(raw.bucket_name) || asString(raw.bucket),
    region: asString(raw.region),
    ...(typeof raw.custom_domain === 'string' && raw.custom_domain !== '' ? { customDomain: raw.custom_domain } : {}),
    cosKey: asString(raw.cos_key),
  }
  if (mediaId === '' || credential.token === '' || credential.secretId === '' || credential.secretKey === '' || credential.bucket === '' || credential.region === '' || credential.cosKey === '') {
    throw new Error('ima 未返回可用的上传凭证，请稍后重试或到 ima 客户端确认')
  }
  return { mediaId, credential }
}

function buildCosAuthorization(params: { readonly secretId: string; readonly secretKey: string; readonly method: string; readonly pathname: string; readonly headers: Record<string, string>; readonly startTime: number; readonly expiredTime: number }): string {
  const keyTime = String(params.startTime) + ';' + String(params.expiredTime)
  const signKey = hmacSha1(params.secretKey, keyTime)
  const headerKeys = Object.keys(params.headers).sort()
  const httpHeaders = headerKeys.map((key) => key.toLowerCase() + '=' + encodeURIComponent(params.headers[key] ?? '')).join('&')
  const httpString = params.method.toLowerCase() + '\n' + params.pathname + '\n\n' + httpHeaders + '\n'
  const stringToSign = 'sha1\n' + keyTime + '\n' + sha1Hex(httpString) + '\n'
  const signature = hmacSha1(signKey, stringToSign)
  return 'q-sign-algorithm=sha1&q-ak=' + params.secretId + '&q-sign-time=' + keyTime + '&q-key-time=' + keyTime + '&q-header-list=' + headerKeys.map((key) => key.toLowerCase()).join(';') + '&q-url-param-list=&q-signature=' + signature
}

/** 将本地文件字节上传到腾讯云 COS（PUT Object，官方临时凭证直传；不落地第三方）。 */
export interface ImaCosPutContext {
  readonly credential: ImaCosCredential
  readonly filePath: string
  readonly contentType: string
  readonly fileSize: number
}

export type ImaCosPut = (context: ImaCosPutContext) => Promise<void>

async function cosPutViaHttps(context: ImaCosPutContext): Promise<void> {
  const credential = context.credential
  const hostname = credential.bucket + '.cos.' + credential.region + '.myqcloud.com'
  const pathname = '/' + credential.cosKey
  const now = Math.floor(Date.now() / 1000)
  const startTime = credential.startTime ?? now
  const expiredTime = credential.expiredTime ?? now + 3600
  const signHeaders = { 'content-length': String(context.fileSize), host: hostname }
  const authorization = buildCosAuthorization({ secretId: credential.secretId, secretKey: credential.secretKey, method: 'PUT', pathname, headers: signHeaders, startTime, expiredTime })
  await new Promise<void>((resolve, reject) => {
    const req = httpsRequest({
      hostname,
      port: 443,
      path: pathname,
      method: 'PUT',
      headers: {
        'Content-Type': context.contentType,
        'Content-Length': context.fileSize,
        Authorization: authorization,
        'x-cos-security-token': credential.token,
      },
      timeout: Math.max(30_000, Math.min(300_000, 1_200_000)),
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        if (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300) resolve()
        else reject(new Error('上传到 ima 存储失败（HTTP ' + String(res.statusCode) + '）：' + Buffer.concat(chunks).toString('utf8').slice(0, 200)))
      })
    })
    req.on('timeout', () => { req.destroy(new Error('上传到 ima 存储超时，请重试')) })
    req.on('error', reject)
    createReadStream(context.filePath).pipe(req)
  })
}

export async function uploadImaFileToCos(credential: ImaCosCredential, filePath: string, contentType: string, put?: ImaCosPut): Promise<void> {
  const size = statSync(filePath).size
  if (put === undefined) return cosPutViaHttps({ credential, filePath, contentType, fileSize: size })
  return put({ credential, filePath, contentType, fileSize: size })
}

export async function addImaKnowledgeFile(
  credentials: ImaCredentials,
  input: { readonly mediaType: number; readonly mediaId: string; readonly title: string; readonly knowledgeBaseId: string; readonly folderId?: string; readonly cosKey: string; readonly fileSize: number; readonly lastModifyTime: number; readonly fileName: string },
  base = WIKI_BASE,
): Promise<string> {
  const payload: Record<string, unknown> = {
    media_type: input.mediaType,
    media_id: input.mediaId,
    title: input.title,
    knowledge_base_id: input.knowledgeBaseId,
    file_info: {
      cos_key: input.cosKey,
      file_size: input.fileSize,
      last_modify_time: input.lastModifyTime,
      file_name: input.fileName,
    },
  }
  if (input.folderId !== undefined && input.folderId !== '') payload.folder_id = input.folderId
  const data = await imaWiki(credentials, 'add_knowledge', payload, base)
  return asString(data?.media_id) || input.mediaId
}

/** 一键把本地文件传到指定 ima 知识库（根目录）。含重复名检查、大小/类型预检；显式用户操作才会调用。 */
export async function importImaLocalFile(
  credentials: ImaCredentials,
  input: { readonly knowledgeBaseId: string; readonly filePath: string; readonly fileName?: string; readonly folderId?: string },
  base = WIKI_BASE,
  put?: ImaCosPut,
): Promise<ImaUploadFileResult> {
  const fileName = input.fileName ?? input.filePath.split(/[\\/]/).pop() ?? input.filePath
  const spec = imaMediaSpecForFile(fileName)
  if (spec === undefined) return { fileName, ok: false, message: '该格式 ima 暂不支持通过接口上传（可先在 ima 客户端内添加）：' + fileName }
  try {
    const stat = statSync(input.filePath)
    if (!stat.isFile()) return { fileName, ok: false, message: '不是文件，已跳过' }
    if (stat.size <= 0) return { fileName, ok: false, message: '空文件无法上传' }
    if (stat.size > spec.maxBytes) return { fileName, ok: false, message: '文件超过 ima 单文件大小上限（' + Math.round(spec.maxBytes / 1024 / 1024) + ' MB），请压缩后重试' }
    const repeated = await checkImaRepeatedNames(credentials, input.knowledgeBaseId, [{ name: fileName, mediaType: spec.mediaType }], input.folderId, base)
    if (repeated.get(fileName) === true) return { fileName, ok: false, message: '知识库中已存在同名文件「' + fileName + '」，请改文件名后重试' }
    const ext = (fileName.split('.').pop() ?? '').toLowerCase()
    const created = await createImaMedia(credentials, { fileName, fileSize: stat.size, contentType: spec.contentType, knowledgeBaseId: input.knowledgeBaseId, fileExt: ext }, base)
    await uploadImaFileToCos(created.credential, input.filePath, spec.contentType, put)
    const lastModifyTime = Math.floor(stat.mtimeMs / 1000)
    const mediaId = await addImaKnowledgeFile(credentials, {
      mediaType: spec.mediaType,
      mediaId: created.mediaId,
      title: fileName,
      knowledgeBaseId: input.knowledgeBaseId,
      ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
      cosKey: created.credential.cosKey,
      fileSize: stat.size,
      lastModifyTime,
      fileName,
    }, base)
    return { fileName, ok: true, mediaId }
  } catch (error: unknown) {
    return { fileName, ok: false, message: error instanceof Error ? error.message : '上传失败，请稍后重试' }
  }
}

export const IMA_CLIENT_ID_NAME = 'ima:client_id'
export const IMA_API_KEY_NAME = 'ima:api_key'
