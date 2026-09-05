/**
 * 云知识库（ima 首发）挂接注册表 + 对话引用编排。
 *
 * 与本地挂接的关键差异：云库绝不下载、绝不本地解析。挂接只登记 {知识库 id + 名称}，
 * 文件列表按需实时从 ima 拉取元数据；对话 @云库 时实时检索片段并注入回答。
 * 凭据经 CredentialVault 系统级加密，绝不落明文、绝不下发到渲染进程。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import type { CredentialVault } from '../credential-vault.ts'
import {
  IMA_API_KEY_NAME,
  IMA_CLIENT_ID_NAME,
  listImaKnowledgeBases,
  listImaKnowledgeItems,
  searchImaKnowledge,
  type ImaCredentials,
  type ImaKnowledgeBaseSummary,
  type ImaKnowledgeItem,
  type ImaSearchHit,
} from './ima-client.ts'

export interface CloudKnowledgeMount {
  readonly id: string
  readonly kind: 'ima'
  readonly name: string
  readonly knowledgeBaseId: string
  readonly mountedAt: string
}

export interface CloudChatSource {
  readonly index: number
  readonly mountName: string
  readonly title: string
  readonly snippet: string
  readonly mediaId: string
}

export interface CloudChatResult {
  readonly question: string
  readonly scopeLabel: string
  readonly text: string
  readonly sources: readonly CloudChatSource[]
  readonly matchedDocs: number
}

interface CloudRegistryDocument {
  readonly schemaVersion: 1
  readonly imaMounts: CloudKnowledgeMount[]
}

function writeAtomic(path: string, value: unknown): Promise<void> {
  return (async () => {
    await mkdir(dirname(path), { recursive: true })
    const temporaryPath = path + '.' + process.pid + '.' + randomBytes(6).toString('hex') + '.tmp'
    await writeFile(temporaryPath, JSON.stringify(value, null, 2) + '\n', 'utf8')
    await rename(temporaryPath, path)
  })()
}

export class CloudKnowledgeStore {
  private document: CloudRegistryDocument = { schemaVersion: 1, imaMounts: [] }
  private ready = false

  constructor(private readonly registryPath: string, private readonly vault: CredentialVault) {}

  async load(): Promise<void> {
    if (this.ready) return
    try {
      const parsed = JSON.parse(await readFile(this.registryPath, 'utf8')) as Partial<CloudRegistryDocument>
      if (parsed.schemaVersion === 1 && Array.isArray(parsed.imaMounts)) {
        this.document = { schemaVersion: 1, imaMounts: parsed.imaMounts.filter((item) => item?.kind === 'ima' && typeof item.id === 'string' && typeof item.knowledgeBaseId === 'string') }
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    this.ready = true
  }

  list(): readonly CloudKnowledgeMount[] {
    return this.document.imaMounts
  }

  get(id: string): CloudKnowledgeMount | undefined {
    return this.document.imaMounts.find((item) => item.id === id)
  }

  async hasCredentials(): Promise<boolean> {
    const clientId = await this.vault.get(IMA_CLIENT_ID_NAME)
    const apiKey = await this.vault.get(IMA_API_KEY_NAME)
    return Boolean(clientId && apiKey)
  }

  async credentials(): Promise<ImaCredentials | undefined> {
    const clientId = await this.vault.get(IMA_CLIENT_ID_NAME)
    const apiKey = await this.vault.get(IMA_API_KEY_NAME)
    if (!clientId || !apiKey) return undefined
    return { clientId, apiKey }
  }

  async setCredentials(clientId: string, apiKey: string): Promise<void> {
    if (!clientId.trim() || !apiKey.trim()) throw new Error('请填写完整的 Client ID 与 API Key')
    await this.vault.set(IMA_CLIENT_ID_NAME, clientId.trim())
    await this.vault.set(IMA_API_KEY_NAME, apiKey.trim())
  }

  async clearCredentials(): Promise<void> {
    // 凭据不可删除但可覆盖为空值校验拒绝；这里通过 set 空值会抛错，
    // 因此卸载凭据走"不存在即视为未配置"语义，仅移除挂接记录即可。
    await this.load()
    this.document = { schemaVersion: 1, imaMounts: [] }
    await writeAtomic(this.registryPath, this.document)
  }

  async add(knowledgeBaseId: string, name: string): Promise<CloudKnowledgeMount> {
    await this.load()
    const existing = this.document.imaMounts.find((item) => item.knowledgeBaseId === knowledgeBaseId)
    if (existing !== undefined) return existing
    const mount: CloudKnowledgeMount = {
      id: 'cloud-' + randomUUID(),
      kind: 'ima',
      name: name.trim() || 'ima 知识库',
      knowledgeBaseId,
      mountedAt: new Date().toISOString(),
    }
    this.document.imaMounts.push(mount)
    await writeAtomic(this.registryPath, this.document)
    return mount
  }

  async remove(id: string): Promise<void> {
    await this.load()
    const next = this.document.imaMounts.filter((item) => item.id !== id)
    if (next.length === this.document.imaMounts.length) return
    this.document = { schemaVersion: 1, imaMounts: next }
    await writeAtomic(this.registryPath, this.document)
  }

  async listKnowledgeBases(): Promise<ImaKnowledgeBaseSummary[]> {
    const credentials = await this.credentials()
    if (credentials === undefined) throw new Error('尚未连接 ima，请先填写 Client ID 与 API Key')
    return listImaKnowledgeBases(credentials)
  }

  async listItems(mountId: string, folderId?: string): Promise<ImaKnowledgeItem[]> {
    const mount = this.get(mountId)
    if (mount === undefined) throw new Error('该 ima 知识库不存在或已解除挂接')
    const credentials = await this.credentials()
    if (credentials === undefined) throw new Error('尚未连接 ima，请先填写 Client ID 与 API Key')
    return listImaKnowledgeItems(credentials, mount.knowledgeBaseId, folderId)
  }

  async search(mountId: string, query: string): Promise<ImaSearchHit[]> {
    const mount = this.get(mountId)
    if (mount === undefined) throw new Error('该 ima 知识库不存在或已解除挂接')
    const credentials = await this.credentials()
    if (credentials === undefined) throw new Error('尚未连接 ima，请先填写 Client ID 与 API Key')
    return searchImaKnowledge(credentials, mount.knowledgeBaseId, query)
  }

  /** 云库问答：检索片段 → 组装带溯源脚标的回答。只取片段、不下载整篇。 */
  async answer(mountId: string, question: string): Promise<CloudChatResult> {
    const mount = this.get(mountId)
    if (mount === undefined) throw new Error('该 ima 知识库不存在或已解除挂接')
    const trimmed = question.trim()
    const scopeLabel = '知识库「' + mount.name + '」（ima）'
    if (trimmed === '') {
      return { question: '', scopeLabel, text: '请先输入要问的问题。', sources: [], matchedDocs: 0 }
    }
    const hits = await this.search(mountId, trimmed.slice(0, 500))
    if (hits.length === 0) {
      return {
        question: trimmed,
        scopeLabel,
        text: '在 ' + scopeLabel + ' 中没有检索到与「' + trimmed.slice(0, 60) + '」直接相关的内容。云库只做片段检索、不会整库下载，可以换个关键词再试。',
        sources: [],
        matchedDocs: 0,
      }
    }
    const sources: CloudChatSource[] = []
    const bullets: string[] = []
    const picked = hits.slice(0, 6)
    picked.forEach((hit, index) => {
      const snippet = (hit.highlightContent ?? '').trim().slice(0, 360)
      sources.push({ index: index + 1, mountName: mount.name, title: hit.title, snippet, mediaId: hit.mediaId })
      const lead = snippet === '' ? '（命中标题，片段需在 ima 中查看）' : firstClause(snippet, 90)
      bullets.push('〔' + (index + 1) + '〕 ' + hit.title + ' —— ' + lead)
    })
    const text = [
      '根据 ' + scopeLabel + ' 检索到的 ' + picked.length + ' 条相关内容，我整理了以下片段（〔编号〕来自云端检索结果）：',
      '',
      bullets.join('\n'),
      '',
      '以上片段来自 ima 云端搜索，本机未下载原文、未做本地解析；点击来源可在 ima 中查看完整内容。',
    ].join('\n')
    return { question: trimmed, scopeLabel, text, sources, matchedDocs: hits.length }
  }
}

function firstClause(text: string, width: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= width) return cleaned
  return cleaned.slice(0, width) + '…'
}
