import { afterEach, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type z from '@deepseek-ai/schemastery'
import { redactSecrets } from '@deepseek-ai/dsh-settings'
import { apply } from '../src/index.ts'
import { ModelHubBackend } from '../src/host-backend.ts'
import { measureOllamaTtft } from '../src/local-runtimes.ts'
import * as runtimes from '../src/local-runtimes.ts'

afterEach(() => vi.restoreAllMocks())
const wire = (records: unknown[]) => (async () => new Response(records.map(x => JSON.stringify(x)).join('\n'))) as typeof fetch

it('reports actual Ollama generation rate but never invents a cold start or context', async () => {
  const r = await measureOllamaTtft('http://localhost:11434', 'test', wire([{response:'hello'}, {done:true,eval_count:10,eval_duration:2e9}]))
  expect(r.tokensPerSec).toBe(5)
  expect(r.firstTokenMs).toBeGreaterThanOrEqual(0)
  expect(r.coldStartMs).toBeNull()
  expect(r.context).toBeNull()
  expect(r.display.coldStart).toBe('冷启动未测')
})
it.each([{}, {eval_count:0,eval_duration:1}, {eval_count:10,eval_duration:-1}])('leaves rate unmeasured for absent or invalid statistics %j', async stats => {
  const r = await measureOllamaTtft('http://localhost:11434', 'test', wire([{response:'hello'}, {done:true,...stats}]))
  expect(r.tokensPerSec).toBeNull()
  expect(r.display.tokensPerSec).toBe('速度未测')
})
it.each([[{response:'partial'}], [{error:'model failed'}], [{done:true}]])('rejects incomplete or failed generation %j', async (...rows) => {
  await expect(measureOllamaTtft('http://localhost:11434','test',wire(rows))).rejects.toThrow()
})
it('redacts the real plugin secret field while leaving configured flags visible', () => {
  let schema: z<never> | undefined
  const data={cloudSecretsJson:'{"deepseek":"test-secret"}',cloudConfiguredJson:'{"deepseek":true}'}
  const ctx={settings:{register:(_name:string,value:z<never>)=>{schema=value;return {get:()=>data,update:()=>{}}}},effect:()=>{}} as unknown as Context
  apply(ctx)
  const result=redactSecrets(schema!,data)
  expect(JSON.stringify(result)).not.toContain('test-secret')
  expect(result.value).toEqual({cloudConfiguredJson:data.cloudConfiguredJson})
  expect(result.secrets).toContainEqual({path:['cloudSecretsJson'],set:true})
})
it.skipIf(process.platform !== 'win32')('does not consider installed Ollama healthy when its API is unreachable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xyai-ollama-installed-'))
  const binary = join(root, 'Programs', 'Ollama', 'ollama.exe')
  const previous = process.env.LOCALAPPDATA
  await mkdir(dirname(binary), { recursive: true })
  await writeFile(binary, '')
  process.env.LOCALAPPDATA = root
  const backend = new ModelHubBackend({ get: () => ({ registryJson: '[]' }), update: () => {} }, {
    fetchImpl: (async () => { throw Error('offline') }) as typeof fetch,
  })
  try {
    const res = await backend.dispatch('environment/prepare', { confirm: 'yes' })
    const value = res.value as { task: { phase: string; stages: { id: string; done: boolean }[] }; environment: { runtime: { ollama: string } } }
    expect(value.task.phase).toBe('unavailable')
    expect(value.environment.runtime.ollama).toBe('installed')
    expect(value.task.stages.find(x => x.id === 'ollama')?.done).toBe(false)
    expect(value.task.stages.find(x => x.id === 'health')?.done).toBe(false)
  } finally {
    backend.dispose()
    if (previous === undefined) delete process.env.LOCALAPPDATA
    else process.env.LOCALAPPDATA = previous
    await rm(root, { recursive: true, force: true })
  }
})
it('does not consider an existing llama binary healthy without a model run', async () => {
  vi.spyOn(runtimes,'findLlamaServer').mockReturnValue('present-but-unverified.exe')
  const backend=new ModelHubBackend({get:()=>({registryJson:'[]'}),update:()=>{}},{fetchImpl:(async()=>{throw Error('offline')}) as typeof fetch})
  try {
    const res=await backend.dispatch('environment/prepare',{confirm:'yes'})
    const value=res.value as {task:{phase:string;stages:{id:string;done:boolean}[]};environment:{runtime:{gguf:string}}}
    expect(value.task.phase).toBe('unavailable')
    expect(value.environment.runtime.gguf).toBe('installed')
    expect(value.task.stages.find(x=>x.id==='health')?.done).toBe(false)
  } finally {backend.dispose()}
})
