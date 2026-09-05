import { describe, expect, it } from 'vitest'
import { deflateSync } from 'node:zlib'
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  extractDocxText,
  extractPdfText,
  extractPlainText,
} from '../src/xyai-core/knowledge-document-extract.ts'
import { KnowledgeParsePipeline, type KnowledgeParseRecord } from '../src/xyai-core/knowledge-parse-pipeline.ts'
import { scanKnowledgeRoot } from '../src/xyai-core/knowledge-indexer.ts'

async function fixtureRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'xyai-kb-parse-'))
}

async function makeFile(root: string, relativePath: string, content: Buffer | string): Promise<void> {
  const target = join(root, ...relativePath.split('/'))
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, content)
}

function u16(value: number): number[] { return [value & 255, (value >>> 8) & 255] }
function u32(value: number): number[] { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255] }

/** Minimal ZIP writer (STORED) used to fabricate .docx fixtures for tests. */
function storedZip(files: ReadonlyArray<readonly [string, Buffer]>): Buffer {
  const bytes: number[] = []
  const central: number[] = []
  const offsets: number[] = []
  for (const [name, data] of files) {
    const nameBytes = Buffer.from(name, 'utf8')
    offsets.push(bytes.length)
    bytes.push(...u32(0x04034B50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0))
    bytes.push(...u32(0), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0))
    bytes.push(...nameBytes, ...data)
    const centralOffset = offsets[offsets.length - 1] ?? 0
    central.push(...u32(0x02014B50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0))
    central.push(...u32(0), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0))
    central.push(...u16(0), ...u16(0), ...u32(0), ...u32(centralOffset))
    central.push(...nameBytes)
  }
  const cdOffset = bytes.length
  bytes.push(...central)
  const cdSize = central.length
  bytes.push(...u32(0x06054B50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length))
  bytes.push(...u32(cdSize), ...u32(cdOffset), ...u16(0))
  return Buffer.from(bytes)
}

function docxFixture(): Buffer {
  const xml = Buffer.from(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    '<w:p><w:r><w:t>XYAI 文档正文 第一段</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>第二段 hello docx</w:t></w:r></w:p>' +
    '</w:body></w:document>' +
    'utf8',
  )
  return storedZip([
    ['[Content_Types].xml', Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>', 'utf8')],
    ['word/document.xml', xml],
  ])
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

/** Minimal text-based single-page PDF fixture. */
function pdfFixture(includeText: boolean): Buffer {
  const content = includeText ? 'BT /F1 12 Tf 72 720 Td (Hello from XYAI PDF) Tj ET' : 'q Q'
  const compressed = deflateSync(Buffer.from(content, 'latin1'))
  const stream = `<< /Length ${String(compressed.length)} /Filter /FlateDecode >>
stream
${compressed.toString('latin1')}
endstream`
  const objects: ReadonlyArray<[number, string]> = [
    [1, '<< /Type /Catalog /Pages 2 0 R >>'],
    [2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    [3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'],
    [4, stream],
    [5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'],
  ]
  let text = '%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n'
  const offsets: number[] = []
  for (const [number, body] of objects) {
    offsets.push(text.length)
    text += `${String(number)} 0 obj
${body}
endobj
`
  }
  const xrefOffset = text.length
  text += `xref
0 ${String(objects.length + 1)}
0000000000 65535 f 
`
  for (const offset of offsets) text += `${pad(offset, 10)} 00000 n 
`
  text += `trailer
<< /Size ${String(objects.length + 1)} /Root 1 0 R >>
startxref
${String(xrefOffset)}
%%EOF`
  return Buffer.from(text, 'latin1')
}

describe('knowledge-document-extract', () => {
  it('extracts plain text and keeps the content intact', () => {
    const result = extractPlainText(Buffer.from('hello 世界', 'utf8'))
    expect(result.text).toContain('hello 世界')
  })

  it('extracts docx body paragraphs into readable text', () => {
    const result = extractDocxText(docxFixture())
    expect(result.text).toContain('XYAI 文档正文 第一段')
    expect(result.text).toContain('第二段 hello docx')
  })

  it('extracts the embedded text layer of a text-based pdf', () => {
    const result = extractPdfText(pdfFixture(true))
    expect(result.text).toContain('Hello from XYAI PDF')
  })

  it('fails honestly when a pdf has no embedded text layer', () => {
    expect(() => extractPdfText(pdfFixture(false))).toThrow(/OCR|text/i)
  })
})

describe('KnowledgeParsePipeline', () => {
  it('parses text, docx and pdf; records honest states; persists and reconciles', async () => {
    const root = await fixtureRoot()
    const folder = join(root, 'lib')
    await mkdir(folder, { recursive: true })
    await makeFile(folder, 'notes/a.md', '# 备忘\n内容 one')
    await makeFile(folder, 'notes/b.txt', 'plain text two')
    await makeFile(folder, 'report.docx', docxFixture())
    await makeFile(folder, 'scan.pdf', pdfFixture(true))
    await makeFile(folder, 'broken.pdf', Buffer.from('%PDF-1.4 broken no stream', 'utf8'))
    await makeFile(folder, 'photo.png', Buffer.from([1, 2, 3, 4]))

    const registry = join(root, 'parse-registry.json')
    const contentDirectory = join(root, 'content')
    const events: string[] = []
    const pipeline = new KnowledgeParsePipeline(registry, contentDirectory)
    pipeline.onUpdate(event => events.push(`${event.relPath}:${event.record.status}`))
    await pipeline.load()

    const scan = await scanKnowledgeRoot(folder)
    const reconcile = await pipeline.reconcile(folder, scan.files)
    expect(reconcile.added).toBe(5) // a.md b.txt report.docx scan.pdf broken.pdf
    expect(pipeline.statusSummary(folder)).toMatchObject({ pending: 5, ready: 0 })

    const run = await pipeline.runPending(folder)
    expect(run.processed).toBe(5)
    expect(run.ready).toBe(4)
    expect(run.failed).toBe(1)
    const summary = pipeline.statusSummary(folder)
    expect(summary).toMatchObject({ total: 5, ready: 4, failed: 1, pending: 0 })
    expect((await pipeline.textFor(folder, 'notes/a.md')) ?? '').toContain('备忘')
    expect((await pipeline.textFor(folder, 'report.docx')) ?? '').toContain('XYAI 文档正文')
    expect((await pipeline.textFor(folder, 'scan.pdf')) ?? '').toContain('Hello from XYAI PDF')
    const broken = pipeline.recordFor(folder, 'broken.pdf') as KnowledgeParseRecord | undefined
    expect(broken?.status).toBe('failed')
    expect(broken?.error ?? '').toMatch(/OCR|text/)
    expect(events.filter(event => event.endsWith(':parsing')).length).toBe(5)
    expect(events.filter(event => event.endsWith(':ready')).length).toBe(4)

    // 编辑 a.md -> stale re-parse with fresh corpus
    await makeFile(folder, 'notes/a.md', '# 备忘\n内容 edited with more text')
    const rescan = await scanKnowledgeRoot(folder)
    const second = await pipeline.reconcile(folder, rescan.files)
    expect(second.stale).toBe(1)
    await pipeline.runPending(folder)
    expect((await pipeline.textFor(folder, 'notes/a.md')) ?? '').toContain('edited with more text')

    // 删除 b.txt -> record and corpus drop
    const target = join(folder, 'notes', 'b.txt')
    const removedRecord = pipeline.recordFor(folder, 'notes/b.txt') as KnowledgeParseRecord | undefined
    expect(removedRecord?.textFile).toBeDefined()
    await import('node:fs/promises').then(async fs => { await fs.rm(target, { force: true }) })
    const rescan2 = await scanKnowledgeRoot(folder)
    const third = await pipeline.reconcile(folder, rescan2.files)
    expect(third.removed).toBe(1)
    expect(pipeline.recordFor(folder, 'notes/b.txt')).toBeUndefined()
    if (removedRecord?.textFile !== undefined) {
      const filesAfter = await readdir(contentDirectory, { recursive: true })
      expect(filesAfter.map(String).some(item => item.includes('b.txt') === false)).toBe(true)
    }

    // 重启恢复 + removeMount 清理
    const reloaded = new KnowledgeParsePipeline(registry, contentDirectory)
    await reloaded.load()
    const persisted = reloaded.statusSummary(folder)
    expect(persisted.ready).toBe(3)
    await reloaded.removeMount(folder)
    expect(reloaded.statusSummary(folder).total).toBe(0)
    const leftover = await readdir(contentDirectory).catch(() => [])
    expect(leftover.length).toBe(0)
  })

  it('lets failed files be retried back to pending', async () => {
    const root = await fixtureRoot()
    const folder = join(root, 'lib')
    await mkdir(folder, { recursive: true })
    await makeFile(folder, 'broken.pdf', Buffer.from('%PDF broken', 'utf8'))
    const pipeline = new KnowledgeParsePipeline(join(root, 'r.json'), join(root, 'c'))
    await pipeline.load()
    const scan = await scanKnowledgeRoot(folder)
    await pipeline.reconcile(folder, scan.files)
    await pipeline.runPending(folder)
    expect(pipeline.statusSummary(folder).failed).toBe(1)
    const retried = await pipeline.retryFailed(folder)
    expect(retried).toBe(1)
    expect(pipeline.statusSummary(folder).pending).toBe(1)
  })
})
