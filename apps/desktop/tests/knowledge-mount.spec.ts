import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { KnowledgeAssetStore } from '../src/xyai-core/knowledge-asset-store.ts'

const temporaryRoots: string[] = []
afterEach(async () => { await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'xyai-knowledge-mount-'))
  temporaryRoots.push(root)
  await mkdir(join(root, 'docs', 'nested'), { recursive: true })
  await writeFile(join(root, 'docs', 'nested', 'readme.md'), '# mounted', 'utf8')
  await writeFile(join(root, 'notes.txt'), 'hello', 'utf8')
  const store = new KnowledgeAssetStore(join(root, 'registry.json'), join(root, 'content'))
  await store.load()
  return { root, store }
}

describe('KnowledgeAssetStore mounted sources', () => {
  it('mounts a directory and lazily lists nested children', async () => {
    const { root, store } = await fixture()
    const mount = await store.mountDirectory(root)
    expect(store.listMounts()).toHaveLength(1)
    const children = await store.listMountChildren(mount.id)
    expect(children.find(item => item.name === 'docs')?.kind).toBe('directory')
    const nested = await store.listMountChildren(mount.id, 'docs/nested')
    expect(nested).toEqual([{ name: 'readme.md', path: 'docs/nested/readme.md', kind: 'file', bytes: 9 }])
    expect(await store.readMountedFile(mount.id, 'docs/nested/readme.md')).toBe('# mounted')
  })

  it('preserves mounts across reload and rejects path escape', async () => {
    const { root, store } = await fixture()
    const mount = await store.mountDirectory(root)
    const restored = new KnowledgeAssetStore(join(root, 'registry.json'), join(root, 'content'))
    await restored.load()
    expect(restored.listMounts()[0]?.id).toBe(mount.id)
    await expect(restored.readMountedFile(mount.id, '../outside.txt')).rejects.toThrow('escapes root')
    await restored.unmount(mount.id)
    expect(restored.listMounts()).toHaveLength(0)
    expect(JSON.parse(await readFile(join(root, 'registry.json'), 'utf8')).schemaVersion).toBe(2)
  })

  it('skips protected Windows directory names without breaking a drive tree', async () => {
    const { root, store } = await fixture()
    await mkdir(join(root, '$RECYCLE.BIN', 'S-1-5-21-test'), { recursive: true })
    await writeFile(join(root, '$RECYCLE.BIN', 'S-1-5-21-test', 'hidden.txt'), 'system', 'utf8')
    await mkdir(join(root, 'readable'), { recursive: true })
    await writeFile(join(root, 'readable', 'visible.txt'), 'visible', 'utf8')

    const mount = await store.mountDirectory(root)
    const rootChildren = await store.listMountChildren(mount.id)
    expect(rootChildren.map(item => item.name)).toEqual(expect.arrayContaining(['readable']))
    expect(rootChildren.some(item => item.name.toLowerCase() === '$recycle.bin')).toBe(false)
    await expect(store.listMountChildren(mount.id, '$RECYCLE.BIN/S-1-5-21-test')).resolves.toEqual([])
    await expect(store.readMountedFile(mount.id, '$RECYCLE.BIN/S-1-5-21-test/hidden.txt')).rejects.toThrow('protected')
  })

  it('shows only readable folders and parseable UTF-8 text files', async () => {
    const { root, store } = await fixture()
    await mkdir(join(root, 'readable'), { recursive: true })
    await writeFile(join(root, 'readable', 'data.json'), '{"ok":true}', 'utf8')
    await writeFile(join(root, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    await writeFile(join(root, 'binary.txt'), Buffer.from([0x00, 0x01, 0x02]))
    await writeFile(join(root, 'unsupported.pdf'), '%PDF-1.7', 'utf8')

    const mount = await store.mountDirectory(root)
    const children = await store.listMountChildren(mount.id)
    expect(children.map(item => item.name)).toEqual(expect.arrayContaining(['docs', 'notes.txt', 'readable']))
    expect(children.map(item => item.name)).not.toEqual(expect.arrayContaining(['image.png', 'binary.txt', 'unsupported.pdf']))
    expect(await store.readMountedFile(mount.id, 'notes.txt')).toBe('hello')
    await expect(store.readMountedFile(mount.id, 'unsupported.pdf')).rejects.toThrow('parseable')
  })
})
