import { createServer, type Server } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  appendImaNote,
  checkImaRepeatedNames,
  createImaNote,
  getImaMediaInfo,
  getImaNoteContent,
  imaMediaSpecForFile,
  importImaLocalFile,
  importImaUrls,
  listImaKnowledgeBases,
  listImaKnowledgeItems,
  listImaNotebooks,
  listImaNotes,
  searchImaKnowledge,
  searchImaNotes,
  type ImaCosPut,
  type ImaCosPutContext,
  type ImaCredentials,
} from '../src/xyai-core/ima-client.ts'

const CRED: ImaCredentials = { clientId: 'cid', apiKey: 'key' }

let server: Server
let base: string
let noteBase: string

function readBody(chunks: Buffer[]): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    const body = readBody(chunks)
    const path = (req.url ?? '').split('?')[0]
    const send = (obj: unknown): void => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(obj))
    }
    if (!req.headers['ima-openapi-clientid'] || !req.headers['ima-openapi-apikey']) {
      return send({ code: 20004, msg: 'apiKey 鉴权失败', data: null })
    }
    if (path === '/wiki/search_knowledge_base') {
      return send({ code: 0, msg: 'ok', data: { info_list: [{ id: 'kb-1', name: '产品资料库', cover_url: 'c.png' }], is_end: true, next_cursor: '' } })
    }
    if (path === '/wiki/get_knowledge_list') {
      return send({ code: 0, msg: 'ok', data: { knowledge_list: [{ media_id: 'm-1', title: '规格说明.md', parent_folder_id: '' }], is_end: true, next_cursor: '' } })
    }
    if (path === '/wiki/search_knowledge') {
      return send({ code: 0, msg: 'ok', data: { info_list: [{ media_id: 'm-1', title: '规格说明.md', highlight_content: '本地优先是本产品的默认能力。' }], is_end: true, next_cursor: '' } })
    }
    if (path === '/wiki/get_media_info') {
      const id = body.media_id
      if (id === 'note-1') return send({ code: 0, msg: 'ok', data: { media_type: 11, notebook_ext_info: { notebook_id: '42' } } })
      if (id === 'file-1') return send({ code: 0, msg: 'ok', data: { media_type: 1, url_info: { url: 'https://example.com/a.pdf', headers: { Authorization: 'Bearer x' } } } })
      return send({ code: 0, msg: 'ok', data: { media_type: 1 } })
    }
    if (path === '/wiki/import_urls') {
      return send({ code: 0, msg: 'ok', data: { results: { 'https://a.com': { url: 'https://a.com', ret_code: 0, media_id: 'm-9' } } } })
    }
    if (path === '/note/get_doc_content') {
      return send({ code: 0, msg: 'ok', data: { content: '这是笔记正文。' } })
    }
    if (path === '/note/list_notebook') {
      return send({ code: 0, msg: 'ok', data: { note_folder_infos: [{ folder_id: 'f-1', name: '工作', note_number: 2 }], is_end: true, next_cursor: '' } })
    }
    if (path === '/note/list_note') {
      return send({ code: 0, msg: 'ok', data: { note_book_list: [{ note_id: 'n-1', title: '会议纪要', note_ext_info: { folder_id: 'f-1', folder_name: '工作' } }], is_end: true, next_cursor: '' } })
    }
    if (path === '/note/search_note') {
      return send({ code: 0, msg: 'ok', data: { note_list: [{ note_book_info: { note_id: 'n-1', title: '会议纪要', note_ext_info: { folder_id: 'f-1' } } }], is_end: true, total_hit_num: 1 } })
    }
    if (path === '/note/import_doc' || path === '/note/append_doc') {
      return send({ code: 0, msg: 'ok', data: { note_id: 'n-new' } })
    }
    if (path === '/wiki/check_repeated_names') {
      const entries = Array.isArray(body.params) ? body.params : []
      return send({
        code: 0,
        msg: 'ok',
        data: {
          results: entries.map((item) => ({ name: typeof item === 'object' && item !== null ? String((item as Record<string, unknown>).name ?? '') : '', is_repeated: false })),
        },
      })
    }
    if (path === '/wiki/create_media') {
      const fileName = typeof body.file_name === 'string' ? body.file_name : 'unknown'
      return send({
        code: 0,
        msg: 'ok',
        data: {
          media_id: 'new-1',
          cos_credential: {
            token: 'tok',
            secret_id: 'sid',
            secret_key: 'skey',
            start_time: 1000,
            expired_time: 2000,
            bucket_name: 'bucket-1',
            region: 'ap-guangzhou',
            cos_key: 'kb-1/uploads/' + fileName,
          },
        },
      })
    }
    if (path === '/wiki/add_knowledge') {
      return send({ code: 0, msg: 'ok', data: { media_id: 'new-1' } })
    }
    return send({ code: 404, msg: 'unknown ' + path, data: null })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  base = 'http://127.0.0.1:' + port + '/wiki/'
  noteBase = 'http://127.0.0.1:' + port + '/note/'
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('W-106 ima 客户端（读/查/写/导入契约）', () => {
  it('列出知识库并解析 id/name', async () => {
    const bases = await listImaKnowledgeBases(CRED, base)
    expect(bases).toHaveLength(1)
    expect(bases[0]?.name).toBe('产品资料库')
  })

  it('只读浏览知识库文件列表，不下载正文', async () => {
    const items = await listImaKnowledgeItems(CRED, 'kb-1', undefined, base)
    expect(items[0]?.title).toBe('规格说明.md')
    expect(items[0]?.mediaId).toBe('m-1')
  })

  it('检索返回标题与高亮片段', async () => {
    const hits = await searchImaKnowledge(CRED, 'kb-1', '本地优先', base)
    expect(hits[0]?.highlightContent).toContain('本地优先')
  })

  it('获取文件媒体返回可访问 URL，笔记媒体返回 notebook_id 与正文', async () => {
    const file = await getImaMediaInfo(CRED, 'file-1', base, noteBase)
    expect(file.url).toBe('https://example.com/a.pdf')
    const note = await getImaMediaInfo(CRED, 'note-1', base, noteBase)
    expect(note.notebookId).toBe('42')
    expect(note.noteContent).toBe('这是笔记正文。')
  })

  it('读取笔记正文', async () => {
    expect(await getImaNoteContent(CRED, '42', noteBase)).toBe('这是笔记正文。')
  })

  it('列出笔记本与笔记', async () => {
    expect((await listImaNotebooks(CRED, noteBase))[0]?.name).toBe('工作')
    expect((await listImaNotes(CRED, undefined, noteBase))[0]?.title).toBe('会议纪要')
  })

  it('检索笔记标题', async () => {
    expect((await searchImaNotes(CRED, '会议', 0, noteBase))[0]?.title).toBe('会议纪要')
  })

  it('新建与追加笔记返回 note_id', async () => {
    expect(await createImaNote(CRED, '# 标题', undefined, undefined, noteBase)).toBe('n-new')
    expect(await appendImaNote(CRED, 'n-1', '追加内容', noteBase)).toBe('n-new')
  })

  it('导入网页 URL 到知识库', async () => {
    const results = await importImaUrls(CRED, 'kb-1', ['https://a.com'], undefined, base)
    expect(results[0]?.ok).toBe(true)
    expect(results[0]?.mediaId).toBe('m-9')
  })

  it('鉴权失败把 msg 原文抛出', async () => {
    const bad = { clientId: '', apiKey: '' }
    await expect(listImaKnowledgeBases(bad, base)).rejects.toThrow('apiKey 鉴权失败')
  })
})


describe('W-106b 本地文件上传到 ima（官方链路：重复检查 → create_media → COS PUT → add_knowledge）', () => {
  it('按扩展名识别支持类型与大小上限', () => {
    expect(imaMediaSpecForFile('a.pdf')?.mediaType).toBe(1)
    expect(imaMediaSpecForFile('a.docx')?.contentType).toContain('wordprocessingml')
    expect(imaMediaSpecForFile('a.xlsx')?.maxBytes).toBe(10 * 1024 * 1024)
    expect(imaMediaSpecForFile('a.exe')).toBeUndefined()
  })

  it('check_repeated_names 解析 is_repeated（同名返回 false 表示不重复）', async () => {
    const map = await checkImaRepeatedNames(CRED, 'kb-1', [{ name: '规格说明.md', mediaType: 7 }], undefined, base)
    expect(map.get('规格说明.md')).toBe(false)
  })

  it('整链上传成功：检查 → 建媒体 → COS 直传 → add_knowledge', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'xyai-ima-upload-'))
    try {
      const filePath = join(dir, '本地资料.pdf')
      await writeFile(filePath, 'hello')
      const putCalls: ImaCosPutContext[] = []
      const fakePut: ImaCosPut = async (context) => {
        putCalls.push(context)
      }
      const result = await importImaLocalFile(CRED, { knowledgeBaseId: 'kb-1', filePath }, base, fakePut)
      expect(result.ok).toBe(true)
      expect(result.mediaId).toBe('new-1')
      expect(putCalls).toHaveLength(1)
      expect(putCalls[0]?.credential.bucket).toBe('bucket-1')
      expect(putCalls[0]?.fileSize).toBe(5)
      expect(putCalls[0]?.credential.cosKey).toContain('本地资料.pdf')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('不支持格式直接跳过并给出友好原因，不请求网络', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'xyai-ima-skip-'))
    try {
      const filePath = join(dir, 'setup.exe')
      await writeFile(filePath, 'x')
      const result = await importImaLocalFile(CRED, { knowledgeBaseId: 'kb-1', filePath }, base)
      expect(result.ok).toBe(false)
      expect(result.message ?? '').toContain('不支持')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
