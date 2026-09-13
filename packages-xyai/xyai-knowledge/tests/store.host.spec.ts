import { deflateSync } from 'node:zlib'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { extractDocxText, extractPdfText } from '../src/extract.ts'
import { ImaClient } from '../src/ima.ts'
import { OllamaModelRunner } from '../src/local-model.ts'
import { KnowledgeStore, type Registry, type Secrets } from '../src/store.ts'
import type { Limits, LocalMount } from '../src/protocol.ts'

const roots: string[] = []; const stores: KnowledgeStore[] = []
afterEach(async () => { for (const store of stores.splice(0)) await store.dispose(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const json = (value: unknown): Response => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })

async function bench(fetcher: typeof fetch = vi.fn(async url => String(url).endsWith('/api/tags') ? json({ models: [{ name: 'fast:1b' }] }) : json({ response: '{"summary":"设备交接","keywords":["设备"],"topics":["交接"],"entities":[],"questions":["状态如何？"]}', eval_count: 8, eval_duration: 100_000_000 })) as unknown as typeof fetch) {
  const base = await mkdtemp(join(tmpdir(), 'xyai-knowledge-test-')); roots.push(base)
  const source = join(base, 'source'), artifacts = join(base, 'application-artifacts'); await mkdir(source)
  let raw = '{"schemaVersion":2,"mounts":[]}'
  const registry: Registry = { read: () => raw, write: async value => { raw = value } }
  const secretsMap = new Map<string,string>(); const secrets: Secrets = { get: async name => secretsMap.get(name), set: async (name,value) => { secretsMap.set(name,value) }, unset: async name => { secretsMap.delete(name) } }
  const limits: Limits = { maxFileBytes: 100_000, maxFiles: 10_000, artifactRoot: artifacts, ollamaEndpoint: 'http://ollama', modelTimeoutMs: 5_000, benchmarkTimeoutMs: 5_000, distillChunkChars: 2_000, maxBenchmarkModels: 4, cloudEndpoint: 'http://ima', cloudTimeoutMs: 5_000, cloudPageSize: 50, cloudContentBytes: 10_000, cloudHydrateLimit: 2 }
  const model = new OllamaModelRunner({ endpoint: limits.ollamaEndpoint, benchmarkTimeoutMs: limits.benchmarkTimeoutMs, modelTimeoutMs: limits.modelTimeoutMs, chunkChars: limits.distillChunkChars, maxBenchmarkModels: limits.maxBenchmarkModels }, fetcher)
  const ima = new ImaClient({ endpoint: limits.cloudEndpoint, timeoutMs: limits.cloudTimeoutMs, pageSize: limits.cloudPageSize, contentBytes: limits.cloudContentBytes, hydrateLimit: limits.cloudHydrateLimit }, fetcher)
  const store = new KnowledgeStore(registry, limits, model, ima, secrets); stores.push(store)
  return { source, artifacts, registry, limits, model, ima, secrets, secretsMap, store }
}

it('walks beyond the old depth cap, preserves source files, and writes real model artifacts under the application directory', async () => {
  const b = await bench(); let directory = b.source
  for (let index = 0; index < 40; index += 1) { directory = join(directory, `d${index}`); await mkdir(directory) }
  const original = '交接班需确认设备状态。'; await writeFile(join(directory, 'manual.md'), original)
  const mount = await b.store.addLocal(b.source); await b.store.scan(mount.id); await b.store.idle()
  const current = b.store.snapshot().mounts[0] as LocalMount; const document = current.documents[0]!
  expect(document.state).toBe('ready'); expect(document.model).toBe('fast:1b'); expect(await b.store.preview(mount.id, document.id)).toBe(original)
  expect(JSON.parse(await b.store.preview(mount.id, document.id, true)).chunks[0].summary).toBe('设备交接')
  expect(await readFile(join(directory, 'manual.md'), 'utf8')).toBe(original)
  expect(mount.output.startsWith(b.artifacts)).toBe(true); expect((await readdir(mount.output)).some(name => name.endsWith('.semantic.json'))).toBe(true)
  await b.store.update(mount.id, null); expect((await lstat(join(directory, 'manual.md'))).isFile()).toBe(true); expect((await lstat(mount.output)).isDirectory()).toBe(true)
})

it('retains extracted text and reports the waiting state when no local model responds', async () => {
  const fetcher = vi.fn(async url => String(url).endsWith('/api/tags') ? json({ models: [] }) : json({})) as unknown as typeof fetch
  const b = await bench(fetcher); await writeFile(join(b.source, 'plain.txt'), 'local extract survives')
  const mount = await b.store.addLocal(b.source); await b.store.scan(mount.id); await b.store.idle()
  const current = b.store.snapshot().mounts[0] as LocalMount
  expect(current.documents[0]!.state).toBe('extracted'); expect(current.error).toBe('NO_LOCAL_MODEL'); expect(await b.store.preview(mount.id, current.documents[0]!.id)).toContain('survives')
})

it('selects the fastest model from measured generation throughput', async () => {
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith('/api/tags')) return json({ models: [{ name: 'slow:1b' }, { name: 'fast:1b' }] })
    const model = JSON.parse(String(init?.body)).model as string
    return json({ response: '{"summary":"ok","keywords":[],"topics":[],"entities":[],"questions":[]}', eval_count: 10, eval_duration: model === 'fast:1b' ? 100_000_000 : 500_000_000 })
  }) as unknown as typeof fetch
  const b = await bench(fetcher); await writeFile(join(b.source, 'speed.txt'), 'measure actual local generation')
  const mount = await b.store.addLocal(b.source); await b.store.scan(mount.id); await b.store.idle()
  expect((b.store.snapshot().mounts[0] as LocalMount).selectedModel?.name).toBe('fast:1b')
})

it('mounts ima only after a real list call, stores metadata, searches remotely, and removes credentials on detach', async () => {
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).startsWith('https://content.example/')) { expect(new Headers(init?.headers).get('x-signed')).toBe('yes'); return new Response('# 三祥热电\n真实远程正文片段：装机与经营数据。', { headers: { 'content-type': 'text/markdown' } }) }
    const endpoint = String(url).split('/').at(-1); const headers = new Headers(init?.headers)
    expect(headers.get('ima-openapi-clientid')).toBe('client'); expect(headers.get('ima-openapi-apikey')).toBe('secret')
    if (endpoint === 'search_knowledge_base') { expect(JSON.parse(String(init?.body)).limit).toBe(20); return json({ code: 0, data: { info_list: [{ kb_id: 'kb-1', kb_name: '研发资料' }], is_end: true } }) }
    if (endpoint === 'get_knowledge_list') { const body = JSON.parse(String(init?.body)) as { folder_id?: string }; if (body.folder_id !== undefined) expect(body.folder_id).toBe('folder_123'); return json({ code: 0, data: { knowledge_list: [{ media_id: 'm-1', title: '规范.pdf', media_type: 1 }], is_end: true } }) }
    if (endpoint === 'get_media_info') return json({ code: 0, data: { url_info: { url: 'https://content.example/document.md', headers: { 'x-signed': 'yes' } } } })
    return json({ code: 0, data: { info_list: [{ media_id: 'm-1', title: '规范.md', media_type: 7, highlight_content: '' }], is_end: true } })
  }) as unknown as typeof fetch
  const b = await bench(fetcher); const mount = await b.store.addIma({ name: 'ima 研发', knowledgeBaseId: 'kb-1', clientId: 'client', apiKey: 'secret' })
  expect(mount.documents).toEqual([{ id: 'm-1', title: '规范.pdf', directory: false }]); expect(await readdir(b.artifacts).catch(() => [])).toEqual([])
  await b.store.listImaFolder(mount.id, 'folder_123')
  const hits = await b.store.search('三祥热电', mount.id); expect(hits[0]).toMatchObject({ provider: 'ima', snippet: expect.stringContaining('真实远程正文片段'), path: '' })
  expect(b.secretsMap.size).toBe(2); await b.store.update(mount.id, null); expect(b.secretsMap.size).toBe(0)
})

function u16(value:number):number[]{return[value&255,(value>>>8)&255]} function u32(value:number):number[]{return[value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255]}
function storedZip(files:ReadonlyArray<readonly[string,Buffer]>):Buffer{const bytes:number[]=[],central:number[]=[];for(const[name,data]of files){const nb=Buffer.from(name);const offset=bytes.length;bytes.push(...u32(0x04034B50),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(data.length),...u32(data.length),...u16(nb.length),...u16(0),...nb,...data);central.push(...u32(0x02014B50),...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(data.length),...u32(data.length),...u16(nb.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...nb)}const off=bytes.length;bytes.push(...central,...u32(0x06054B50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(central.length),...u32(off),...u16(0));return Buffer.from(bytes)}
function pdfFixture():Buffer{const compressed=deflateSync(Buffer.from('BT /F1 12 Tf 72 720 Td (Hello from XYAI PDF) Tj ET','latin1'));const body=`<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n${compressed.toString('latin1')}\nendstream`;return Buffer.from(`%PDF-1.4\n1 0 obj\n${body}\nendobj\n%%EOF`,'latin1')}
it('extracts real DOCX and compressed text PDF bytes',()=>{const xml=Buffer.from('<w:document><w:body><w:p><w:r><w:t>第二段 hello docx</w:t></w:r></w:p></w:body></w:document>');expect(extractDocxText(storedZip([['word/document.xml',xml]])).text).toContain('hello docx');expect(extractPdfText(pdfFixture()).text).toContain('Hello from XYAI PDF')})

it('writes parse artifacts only into a user-chosen output directory and leaves the source read-only', async () => {
  const b = await bench()
  const chosen = join(b.source, '..', 'user-output')
  await mkdir(chosen)
  await writeFile(join(b.source, 'keep.md'), '源文件必须原样保留')
  const mount = await b.store.addLocal(b.source, chosen)
  expect(mount.output.replaceAll('\\', '/').toLowerCase()).toContain('user-output')
  expect(mount.root.replaceAll('\\', '/')).not.toBe(mount.output.replaceAll('\\', '/'))
  await b.store.scan(mount.id); await b.store.idle()
  expect(await readFile(join(b.source, 'keep.md'), 'utf8')).toBe('源文件必须原样保留')
  expect((await readdir(b.source)).includes('.owner')).toBe(false)
  expect((await readdir(mount.output)).includes('.owner')).toBe(true)
  expect((await readdir(mount.output)).some(name => name.endsWith('.text.txt') || name.endsWith('.semantic.json'))).toBe(true)
  await expect(b.store.addLocal(b.source, chosen)).rejects.toThrow('ALREADY_MOUNTED')
})

it('rejects a parse output directory that overlaps the read-only source', async () => {
  const b = await bench()
  await expect(b.store.addLocal(b.source, b.source)).rejects.toThrow('ARTIFACT_ROOT_OVERLAPS_SOURCE')
  await expect(b.store.addLocal(b.source, join(b.source, 'nested-out'))).rejects.toThrow('ARTIFACT_ROOT_OVERLAPS_SOURCE')
})
