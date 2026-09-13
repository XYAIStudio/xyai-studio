import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { downloadGgufFile, nativeModelDirectory } from '../src/native-download.ts'

const dirs: string[] = []
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
  delete process.env.XYAI_MODEL_DIR
})

function ggufBytes(extra = 64): Uint8Array {
  const buf = new Uint8Array(4 + extra)
  buf.set(Buffer.from('GGUF'), 0)
  buf.fill(7, 4)
  return buf
}

it('rejects a completed file that is not GGUF and verifies magic after a successful fetch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xyai-gguf-dl-'))
  dirs.push(dir)
  process.env.XYAI_MODEL_DIR = dir
  const bytes = ggufBytes(80)
  const fetchImpl: typeof fetch = async () => new Response(bytes, {
    status: 200,
    headers: { 'content-length': String(bytes.byteLength) },
  })
  const path = await downloadGgufFile(
    { repository: 'org/model', fileName: 'tiny.gguf', expectedSizeMiB: 0 },
    () => undefined,
    undefined,
    fetchImpl,
  )
  expect(path).toBe(join(nativeModelDirectory(), 'tiny.gguf'))
  await writeFile(path, 'not-gguf')
  await expect(downloadGgufFile(
    { repository: 'org/model', fileName: 'tiny.gguf', expectedSizeMiB: 0 },
    () => undefined,
    undefined,
    fetchImpl,
  )).rejects.toThrow(/GGUF/)
})

it('rejects a download whose bytes fail the GGUF magic check', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xyai-gguf-bad-'))
  dirs.push(dir)
  process.env.XYAI_MODEL_DIR = dir
  const fetchImpl: typeof fetch = async () => new Response(Buffer.from('NOPE'), {
    status: 200,
    headers: { 'content-length': '4' },
  })
  await expect(downloadGgufFile(
    { repository: 'org/model', fileName: 'bad.gguf', expectedSizeMiB: 0 },
    () => undefined,
    undefined,
    fetchImpl,
  )).rejects.toThrow(/GGUF 文件头/)
})
