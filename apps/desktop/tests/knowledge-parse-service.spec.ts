import { describe, expect, it } from 'vitest'
import { deflateSync } from 'node:zlib'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { KnowledgeParseService } from '../src/xyai-core/knowledge-parse-service.ts'

async function fixtureFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'xyai-kb-svc-'))
  await mkdir(join(folder, 'docs'), { recursive: true })
  await writeFile(join(folder, 'docs', 'a.md'), '# 服务测试\n第一段内容')
  await writeFile(join(folder, 'docs', 'b.txt'), 'plain second file')
  await writeFile(join(folder, 'broken.pdf'), Buffer.from('%PDF-1.4 broken no stream', 'utf8'))
  await writeFile(join(folder, 'photo.png'), Buffer.from([1, 2, 3, 4]))
  return folder
}

function pdfFixture(): Buffer {
  const content = 'BT /F1 12 Tf 72 720 Td (Hello from service PDF) Tj ET'
  const compressed = deflateSync(Buffer.from(content, 'latin1'))
  const stream = `<< /Length ${String(compressed.length)} /Filter /FlateDecode >>
stream
${compressed.toString('latin1')}
endstream`
  const objects: ReadonlyArray<[number, string]> = [
    [1, '<< /Type /Catalog /Pages 2 0 R >>'],
    [2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    [3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>'],
    [4, stream],
  ]
  let text = '%PDF-1.4\n'
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
  for (const offset of offsets) text += `${String(offset).padStart(10, '0')} 00000 n ` + `
`
  text += `trailer
<< /Size ${String(objects.length + 1)} /Root 1 0 R >>
startxref
${String(xrefOffset)}
%%EOF`
  return Buffer.from(text, 'latin1')
}

describe('KnowledgeParseService', () => {
  it('scans, parses, reports, previews, retries and detaches a mount', async () => {
    const folder = await fixtureFolder()
    await writeFile(join(folder, 'docs', 'ok.pdf'), pdfFixture())
    const dataDirectory = await mkdtemp(join(tmpdir(), 'xyai-kb-svc-data-'))
    const service = new KnowledgeParseService(dataDirectory)
    const events: string[] = []
    service.onUpdate(() => events.push('tick'))

    await service.startMount('m1', folder)
    expect(service.stateFor('m1').summary.total).toBe(0)
    await service.runNow('m1')
    expect(service.stateFor('m1').summary).toMatchObject({ total: 4, ready: 3, failed: 1, pending: 0 })
    const files = service.listFiles('m1')
    expect(files.map(file => file.relPath).sort()).toEqual(['broken.pdf', 'docs/a.md', 'docs/b.txt', 'docs/ok.pdf'])
    const broken = files.find(file => file.relPath === 'broken.pdf')
    expect(broken?.status).toBe('failed')
    expect(broken?.error ?? '').toMatch(/OCR|text/)
    const preview = await service.preview('m1', 'docs/a.md')
    expect(preview ?? '').toContain('服务测试')

    const retried = await service.retryFailed('m1')
    expect(retried).toBe(1)
    await service.runNow('m1')
    expect(service.stateFor('m1').summary.failed).toBe(1)

    await service.detach('m1')
    expect(service.stateFor('m1').summary.total).toBe(0)
    expect(() => service.listFiles('m1')).toThrow()
    await new Promise(resolve => setTimeout(resolve, 260))
    expect(events.length).toBeGreaterThanOrEqual(1)
  })
})
