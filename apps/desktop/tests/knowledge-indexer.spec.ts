import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  KnowledgeIndexer,
  KnowledgeIndexerStateStore,
  classifyKnowledgeFile,
  diffKnowledgeScans,
  ignoredDirectoryName,
  isHiddenSystemFileName,
  isOfficeLockFileName,
  isTemporaryFileExtension,
  mountStateKey,
  preflightKnowledgeRoot,
  scanKnowledgeRoot,
  type KnowledgeFileFingerprint,
  type KnowledgeScanFile,
} from '../src/xyai-core/knowledge-indexer.ts'

async function fixtureRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'xyai-kb-index-'))
}

async function makeFile(root: string, relativePath: string, content = ''): Promise<string> {
  const target = join(root, ...relativePath.split('/'))
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, content, 'utf8')
  return target
}

describe('knowledge-indexer classification and ignore rules', () => {
  it('classifies text, first-batch documents and unsupported formats by extension', () => {
    expect(classifyKnowledgeFile('a/notes/readme.md')).toEqual({ kind: 'text', parseable: true })
    expect(classifyKnowledgeFile('a/report.docx')).toEqual({ kind: 'document', parseable: true })
    expect(classifyKnowledgeFile('a/scan.pdf')).toEqual({ kind: 'document', parseable: true })
    expect(classifyKnowledgeFile('a/photo.png')).toEqual({ kind: 'unsupported', parseable: false })
  })

  it('keeps the documented directory ignore reasons and file-level helpers', () => {
    expect(ignoredDirectoryName('$RECYCLE.BIN')).toBe('protected-directory')
    expect(ignoredDirectoryName('System Volume Information')).toBe('protected-directory')
    expect(ignoredDirectoryName('.git')).toBe('version-control-directory')
    expect(ignoredDirectoryName('node_modules')).toBe('dependency-directory')
    expect(ignoredDirectoryName('.hidden')).toBe('hidden-directory')
    expect(ignoredDirectoryName('docs')).toBeUndefined()
    expect(isOfficeLockFileName('~$report.docx')).toBe(true)
    expect(isOfficeLockFileName('report.docx')).toBe(false)
    expect(isTemporaryFileExtension('.TMP')).toBe(true)
    expect(isHiddenSystemFileName('Thumbs.db')).toBe(true)
  })
})

describe('knowledge-indexer preflight', () => {
  it('reports a missing path without throwing', async () => {
    const missing = join(tmpdir(), 'xyai-kb-absent-' + Date.now())
    const result = await preflightKnowledgeRoot(missing)
    expect(result.exists).toBe(false)
    expect(result.readable).toBe(false)
  })

  it('accepts a readable directory and rejects a plain file', async () => {
    const root = await fixtureRoot()
    const result = await preflightKnowledgeRoot(root)
    expect(result.exists).toBe(true)
    expect(result.isDirectory).toBe(true)
    expect(result.readable).toBe(true)
    expect(result.isSymbolicLink).toBe(false)
    expect(result.warnings).toEqual([])
    const file = await makeFile(root, 'readme.md')
    const fileResult = await preflightKnowledgeRoot(file)
    expect(fileResult.exists).toBe(true)
    expect(fileResult.isDirectory).toBe(false)
    expect(fileResult.readable).toBe(false)
  })
})

describe('scanKnowledgeRoot', () => {
  it('enumerates parseable and unsupported files while ignoring known noise', async () => {
    const root = await fixtureRoot()
    await makeFile(root, 'notes/readme.md', '# 说明')
    await makeFile(root, 'notes/plain.txt', 'hello world')
    await makeFile(root, 'manual.pdf', '%PDF-1.4')
    await makeFile(root, 'photo.png', 'not parsed')
    await makeFile(root, '.git/config', 'ignored')
    await makeFile(root, 'node_modules/pkg/index.js', 'ignored')
    await makeFile(root, '.hidden/secret.txt', 'ignored')
    await makeFile(root, '$RECYCLE.BIN/x.txt', 'ignored')
    await makeFile(root, '~$draft.docx', 'lock')
    await makeFile(root, 'huge.bin', '12345678901234567890')

    const report = await scanKnowledgeRoot(root, { maxFileBytes: 15 })
    const relPaths = report.files.map(file => file.relPath)
    expect(relPaths).toEqual(['manual.pdf', 'notes/plain.txt', 'notes/readme.md', 'photo.png'])
    expect(report.parseableCount).toBe(3)
    expect(report.unsupportedCount).toBe(1)
    expect(report.files.find(file => file.relPath === 'manual.pdf')?.kind).toBe('document')
    expect(report.files.find(file => file.relPath === 'photo.png')?.parseable).toBe(false)
    expect(report.ignoredItemCount).toBe(2)
    expect(report.ignoredDirectoryCount).toBe(4)
    const reasons = new Set(report.ignoredItems.map(item => item.reason))
    expect(reasons.has('office-lock-file')).toBe(true)
    expect(reasons.has('oversized-file')).toBe(true)
  })

  it('honours the depth cap and reports truncation instead of scanning forever', async () => {
    const root = await fixtureRoot()
    await makeFile(root, 'a/b/c/d/e/deep.txt', 'deep')
    const report = await scanKnowledgeRoot(root, { maxDepth: 3 })
    expect(report.maxDepthReached).toBe(true)
    expect(report.files.length).toBe(0)
    const unlimited = await scanKnowledgeRoot(root)
    expect(unlimited.maxDepthReached).toBe(false)
    expect(unlimited.files.length).toBe(1)
  })
})

describe('diffKnowledgeScans', () => {
  it('detects added, changed, removed and unchanged files from fingerprints', () => {
    const file = (relPath: string, bytes: number, mtimeMs: number): KnowledgeScanFile => ({ relPath, kind: 'text', parseable: true, bytes, mtimeMs })
    const previous = new Map<string, KnowledgeFileFingerprint>([
      ['a.txt', { bytes: 1, mtimeMs: 100 }],
      ['b.txt', { bytes: 2, mtimeMs: 200 }],
      ['c.txt', { bytes: 3, mtimeMs: 300 }],
    ])
    const next = [file('a.txt', 1, 100), file('b.txt', 22, 200), file('d.txt', 4, 400)]
    const diff = diffKnowledgeScans(previous, next)
    expect(diff.added.map(item => item.relPath)).toEqual(['d.txt'])
    expect(diff.changed.map(item => item.relPath)).toEqual(['b.txt'])
    expect(diff.removed).toEqual(['c.txt'])
    expect(diff.unchangedCount).toBe(1)
  })
})

describe('KnowledgeIndexer scan state persistence', () => {
  it('scans incrementally and survives reload from disk', async () => {
    const root = await fixtureRoot()
    const registry = join(root, 'scan-state.json')
    const folder = await fixtureRoot()
    await makeFile(folder, 'one.md', 'one')
    await makeFile(folder, 'two.txt', 'two two')

    const indexer = new KnowledgeIndexer(new KnowledgeIndexerStateStore(registry))
    await indexer.load()
    const first = await indexer.scanMount(folder)
    expect(first.diff.added.map(item => item.relPath).sort()).toEqual(['one.md', 'two.txt'])
    expect(first.diff.unchangedCount).toBe(0)
    expect(mountStateKey(folder)).toBe(mountStateKey(first.state.rootPath))

    const oneTarget = await makeFile(folder, 'one.md', 'one edited with more bytes')
    await makeFile(folder, 'three.pdf', '%PDF')
    await utimes(oneTarget, new Date(Date.now() + 60_000), new Date(Date.now() + 60_000))
    const second = await indexer.scanMount(folder)
    expect(second.diff.changed.map(item => item.relPath)).toEqual(['one.md'])
    expect(second.diff.added.map(item => item.relPath)).toEqual(['three.pdf'])

    const reloaded = new KnowledgeIndexerStateStore(registry)
    await reloaded.load()
    const persistedFiles = reloaded.recordFor(folder)?.files.map(item => item.relPath) ?? []
    expect(persistedFiles).toContain('three.pdf')
    expect(persistedFiles).toContain('two.txt')
    expect(persistedFiles.length).toBe(3)
  })

  it('reports a second scan as fully unchanged and can remove the state', async () => {
    const root = await fixtureRoot()
    const registry = join(root, 'state.json')
    const folder = await fixtureRoot()
    await makeFile(folder, 'stable.md', 'stable')
    const indexer = new KnowledgeIndexer(new KnowledgeIndexerStateStore(registry))
    await indexer.load()
    await indexer.scanMount(folder)
    const second = await indexer.scanMount(folder)
    expect(second.diff.added.length).toBe(0)
    expect(second.diff.changed.length).toBe(0)
    expect(second.diff.removed.length).toBe(0)
    expect(second.diff.unchangedCount).toBe(1)
    await indexer.removeMount(folder)
    const reloaded = new KnowledgeIndexerStateStore(registry)
    await reloaded.load()
    expect(reloaded.recordFor(folder)).toBeUndefined()
  })
})
