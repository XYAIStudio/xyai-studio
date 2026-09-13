import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { ModelHubBackend, type PlazaPersisted, type PlazaSettingsScope } from '../src/host-backend.ts'
import * as runtimes from '../src/local-runtimes.ts'

const dirs: string[] = []
const backends: ModelHubBackend[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const backend of backends.splice(0)) backend.dispose()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

function memorySettings(initial: PlazaPersisted = {}): PlazaSettingsScope {
  const data: PlazaPersisted = {
    autoCheck: false,
    registryJson: '[]',
    catalog: '',
    defaultModelId: '',
    ...initial,
  }
  return {
    get: () => data,
    update: (patch) => { Object.assign(data, patch) },
  }
}

async function waitScan(backend: ModelHubBackend, taskId: string) {
  for (let i = 0; i < 80; i++) {
    const snap = await backend.dispatch('scan/snapshot', { taskId })
    const task = (snap as { value?: { task?: { phase?: string } } }).value?.task
    if (task?.phase === 'done' || task?.phase === 'cancelled') return snap
    await delay(25)
  }
  throw new Error('scan did not finish')
}

it('scans a user root for .gguf files, mounts without deleting, and unmounts without deleting', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xyai-hub-scan-'))
  dirs.push(dir)
  const nested = join(dir, 'models')
  await mkdir(nested)
  const gguf = join(nested, 'Qwen-demo-Q4_K_M.gguf')
  await writeFile(gguf, Buffer.concat([Buffer.from('GGUF'), Buffer.alloc(32, 1)]))
  const backend = new ModelHubBackend(memorySettings())
  backends.push(backend)
  const started = await backend.dispatch('scan/start', {
    roots: [dir], onlyRoots: true, autoRegister: 'no', maxDepth: 3,
  })
  expect(started.ok).toBe(true)
  const startValue = started.value as { task: { taskId: string; stub: boolean } }
  expect(startValue.task.stub).toBe(false)
  const done = await waitScan(backend, startValue.task.taskId)
  const found = (done as { value: { found: { path: string; mounted: boolean }[] } }).value.found
  expect(found.some(f => f.path === gguf)).toBe(true)
  const id = found.find(f => f.path === gguf)!.path
  const registered = await backend.dispatch('registry/register', {
    path: gguf, autoBenchmark: 'no',
  })
  expect(registered.ok).toBe(true)
  const entry = (registered.value as { entry: { mounted: boolean; path: string; id: string } }).entry
  expect(entry.mounted).toBe(true)
  const unmounted = await backend.dispatch('registry/unmount', { id: entry.id, confirm: 'yes' })
  expect((unmounted.value as { entry: { mounted: boolean } }).entry.mounted).toBe(false)
  const { readFile } = await import('node:fs/promises')
  expect((await readFile(gguf)).subarray(0, 4).toString()).toBe('GGUF')
  void id
})

it('refuses a catalog download when no GGUF source exists and Ollama is not running', async () => {
  const backend = new ModelHubBackend(memorySettings(), {
    fetchImpl: (async () => { throw new Error('offline') }) as typeof fetch,
  })
  backends.push(backend)
  const res = await backend.dispatch('downloads/start', { modelId: 'q7', name: 'Qwen2.5 7B' })
  expect(res.ok).toBe(true)
  const value = res.value as { errcode: string; unavailable?: boolean; stub?: boolean }
  expect(value.errcode).toBe('503')
  expect(value.unavailable).toBe(true)
  expect(value.stub).toBe(false)
})

it('returns unavailable TTFT when no local runtime can run the mounted GGUF', async () => {
  vi.spyOn(runtimes, 'findLlamaServer').mockReturnValue(undefined)
  const dir = await mkdtemp(join(tmpdir(), 'xyai-hub-bench-'))
  dirs.push(dir)
  const gguf = join(dir, 'tiny.gguf')
  await writeFile(gguf, Buffer.concat([Buffer.from('GGUF'), Buffer.alloc(16, 2)]))
  const backend = new ModelHubBackend(memorySettings(), {
    fetchImpl: (async () => { throw new Error('offline') }) as typeof fetch,
  })
  backends.push(backend)
  const registered = await backend.dispatch('registry/register', { path: gguf, autoBenchmark: 'no' })
  const id = (registered.value as { entry: { id: string } }).entry.id
  const bench = await backend.dispatch('benchmark/start', { id })
  expect(bench.ok).toBe(true)
  for (let i = 0; i < 40; i++) {
    const snap = await backend.dispatch('benchmark/snapshot', {
      taskId: (bench.value as { task: { taskId: string } }).task.taskId,
    })
    const value = snap.value as { task: { phase: string }; result?: { unavailable?: boolean; simulated?: boolean; firstTokenMs: number | null } }
    if (value.task.phase !== 'running') {
      expect(value.result?.simulated).toBe(false)
      expect(value.result?.unavailable).toBe(true)
      expect(value.result?.firstTokenMs).toBeNull()
      return
    }
    await delay(25)
  }
  throw new Error('benchmark did not settle')
})

it('prepare reports unavailable instead of a fake install when no runtime exists', async () => {
  const backend = new ModelHubBackend(memorySettings(), {
    fetchImpl: (async () => { throw new Error('offline') }) as typeof fetch,
  })
  backends.push(backend)
  const res = await backend.dispatch('environment/prepare', { confirm: 'yes' })
  expect(res.ok, JSON.stringify(res)).toBe(true)
  const task = (res.value as { task: { phase: string; stub: boolean; error?: string } }).task
  expect(task).toBeTruthy()
  expect(task.stub).toBe(false)
  expect(['done', 'unavailable']).toContain(task.phase)
  if (task.phase === 'unavailable') expect(task.error).toMatch(/不可用/)
})

it('writes the default local model into the hub catalog', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xyai-hub-def-'))
  dirs.push(dir)
  const gguf = join(dir, 'pick.gguf')
  await writeFile(gguf, Buffer.concat([Buffer.from('GGUF'), Buffer.alloc(8, 3)]))
  const settings = memorySettings()
  const backend = new ModelHubBackend(settings)
  backends.push(backend)
  const registered = await backend.dispatch('registry/register', { path: gguf, name: 'Pick', autoBenchmark: 'no' })
  const id = (registered.value as { entry: { id: string } }).entry.id
  await backend.dispatch('registry/set-default', { id })
  expect(settings.get().defaultModelId).toBe(id)
  expect(settings.get().catalog ?? '').toContain('local-gguf')
  expect(settings.get().catalog ?? '').toContain(gguf)
})

it('cloud test probes the provider URL through fetchImpl and never marks a stub success', async () => {
  const seen: string[] = []
  const backend = new ModelHubBackend(memorySettings(), {
    fetchImpl: (async (input) => {
      seen.push(String(input))
      return new Response('{"data":[]}', { status: 200 })
    }) as typeof fetch,
  })
  backends.push(backend)
  const saved = await backend.dispatch('cloud/set-key', { providerId: 'deepseek', key: 'sk-test' })
  expect(saved.ok).toBe(true)
  const probed = await backend.dispatch('cloud/test', { providerId: 'deepseek' })
  expect(probed.ok).toBe(true)
  const value = probed.value as { stub: boolean; unavailable?: boolean; result: string; errcode?: string }
  expect(value.stub).toBe(false)
  expect(value.unavailable).toBeUndefined()
  expect(value.result).toMatch(/HTTP 200/)
  expect(seen.some(url => url.includes('api.deepseek.com') && url.endsWith('/models'))).toBe(true)
})

it('cloud test reports unavailable without stub when the probe fails', async () => {
  const backend = new ModelHubBackend(memorySettings(), {
    fetchImpl: (async () => { throw new Error('offline') }) as typeof fetch,
  })
  backends.push(backend)
  await backend.dispatch('cloud/set-key', { providerId: 'deepseek', key: 'sk-test' })
  const probed = await backend.dispatch('cloud/test', { providerId: 'deepseek' })
  expect(probed.ok).toBe(true)
  const value = probed.value as { stub: boolean; unavailable?: boolean; errcode: string }
  expect(value.stub).toBe(false)
  expect(value.unavailable).toBe(true)
  expect(value.errcode).toBe('503')
})

it('pulls an Ollama tag when the runtime is up and refuses to re-download a mounted tag', async () => {
  const pulls: string[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/tags')) return new Response(JSON.stringify({ models: [{ name: 'qwen2.5:7b' }] }), { status: 200 })
    if (url.endsWith('/api/version')) return new Response(JSON.stringify({ version: '0.3.0' }), { status: 200 })
    if (url.endsWith('/api/pull')) {
      pulls.push(String(init?.body ?? ''))
      const body = '{"status":"success"}\n'
      return new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson' } })
    }
    throw new Error(url)
  }) as typeof fetch
  const backend = new ModelHubBackend(memorySettings(), { fetchImpl })
  backends.push(backend)

  const missing = await backend.dispatch('ollama/pull', {})
  expect((missing.value as { errcode: string }).errcode).toBe('400')

  const started = await backend.dispatch('ollama/pull', { tag: 'tinyllama:1.1b' })
  expect(started.ok).toBe(true)
  const task = (started.value as { task: { taskId: string; detail: string; stub: boolean } }).task
  expect(task.stub).toBe(false)
  expect(task.detail).toContain('Ollama pull')

  const registered = await backend.dispatch('registry/register', {
    path: 'ollama:qwen2.5:7b', name: 'qwen2.5:7b', kind: 'Ollama', autoBenchmark: 'no',
  })
  expect(registered.ok).toBe(true)
  const again = await backend.dispatch('ollama/pull', { tag: 'qwen2.5:7b' })
  expect((again.value as { errcode: string; errmsg: string }).errcode).toBe('409')
  expect((again.value as { errmsg: string }).errmsg).toMatch(/无需重复下载|already/i)
})

it('does not start an Ollama pull when the runtime is down', async () => {
  const backend = new ModelHubBackend(memorySettings(), {
    fetchImpl: (async () => { throw new Error('offline') }) as typeof fetch,
  })
  backends.push(backend)
  const res = await backend.dispatch('ollama/pull', { tag: 'qwen2.5:7b' })
  const value = res.value as { errcode: string; unavailable?: boolean; stub?: boolean }
  expect(value.errcode).toBe('503')
  expect(value.unavailable).toBe(true)
  expect(value.stub).toBe(false)
})
