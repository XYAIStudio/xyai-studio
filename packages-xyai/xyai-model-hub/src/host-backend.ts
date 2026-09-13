/**
 * Model Plaza Host backend.
 *
 * Real OS inspect, recursive `.gguf` scan of common model dirs plus chosen disks,
 * registry persistence, HTTP GGUF download with size+magic verify, Ollama pull,
 * and measured output through Ollama or llama-server. Missing runtimes return unavailable —
 * progress and success are never fabricated.
 */
import { execFileSync, execSync, spawn } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { cpus, freemem, platform, arch, totalmem, homedir } from 'node:os'
import { join, basename } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection'
import {
  downloadGgufFile,
  nativeModelDirectory,
  type GgufDownloadSource,
} from './native-download.ts'
import {
  findLlamaServer,
  measureLlamaCppTtft,
  measureOllamaTtft,
  unavailableBenchmark,
} from './local-runtimes.ts'
import type {
  BenchmarkResult,
  CloudProvider,
  EnvironmentInspect,
  ModelHubEnvelope,
  RecommendModel,
  RegistryEntry,
  TaskSnapshot,
} from './protocol.ts'

/** Minimal settings scope surface used for durable plaza state. */
export interface PlazaSettingsScope {
  get(): PlazaPersisted
  update(patch: Partial<PlazaPersisted>): Promise<unknown> | unknown
}

/** Durable fields beyond preference/catalog (also live on the same namespace). */
export interface PlazaPersisted {
  preference?: string
  catalog?: string
  registryJson?: string
  defaultModelId?: string
  cloudConfiguredJson?: string
  cloudSecretsJson?: string
  autoCheck?: boolean
  scanRoots?: string
}

const REAL_OS_NOTE = 'CPU / memory / platform from Node os.*'
const SKIP_DIR_NAMES = new Set([
  'node_modules', '.git', '$Recycle.Bin', 'System Volume Information',
  'Windows', 'Program Files', 'Program Files (x86)', 'ProgramData',
  'WinSxS', 'Temp', 'tmp', '.Trash',
])

/** Optional Host injections (tests replace fetch). */
export interface PlazaHostDeps {
  fetchImpl?: typeof fetch
}

function answered(value: unknown): ConnectionRpcResult<unknown> {
  return { ok: true, value }
}

function refused(code: string, message: string): ConnectionRpcResult<unknown> {
  return { ok: false, error: { code, message, details: {} } }
}

function now(): string {
  return new Date().toISOString()
}

function fieldsOf(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {}
}

function str(fields: Record<string, unknown>, key: string): string {
  const v = fields[key]
  return typeof v === 'string' ? v.trim() : ''
}

function ok(extra: Record<string, unknown> = {}, stub = false): ModelHubEnvelope & Record<string, unknown> {
  return { errcode: '0', errmsg: '', stub, ...extra }
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '未知'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} GB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

/** Richer Wave-1 recommend catalog (CN + intl). */
export const DEMO_RECOMMEND: RecommendModel[] = [
  {
    id: 'q1', name: 'Qwen3 1.7B', vendor: '通义千问', origin: '国内', use: '通用对话',
    size: '1.11 GB', vram: '1.8 GB', license: 'Apache-2.0', quant: 'Q4_K_M',
    reason: '中文轻量任务。会话摘要、知识预处理、任务路由。', tag: 'qwen3:1.7b',
    file: 'Qwen3-1.7B-Q4_K_M.gguf',
    nativeDownload: {
      repository: 'unsloth/Qwen3-1.7B-GGUF',
      fileName: 'Qwen3-1.7B-Q4_K_M.gguf',
      expectedSizeMiB: 1137,
    },
  },
  {
    id: 'q7', name: 'Qwen2.5 7B Instruct', vendor: '通义千问', origin: '国内', use: '通用对话',
    size: '4.68 GB', vram: '6.5 GB', license: 'Apache-2.0', quant: 'Q4_K_M',
    reason: '中文通用主力。长对话、知识问答、轻度推理。', tag: 'qwen2.5:7b',
    file: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'qc', name: 'Qwen2.5-Coder 3B', vendor: '通义千问', origin: '国内', use: '代码开发',
    size: '1.93 GB', vram: '2.6 GB', license: 'Apache-2.0', quant: 'Q4_K_M',
    reason: '本地编码。插件开发、代码审查与 Skills 生产。', tag: 'qwen2.5-coder:3b',
    file: 'Qwen2.5-Coder-3B-Q4_K_M.gguf',
    nativeDownload: {
      repository: 'unsloth/Qwen2.5-Coder-3B-Instruct-GGUF',
      fileName: 'Qwen2.5-Coder-3B-Instruct-Q4_K_M.gguf',
      expectedSizeMiB: 1976,
    },
  },
  {
    id: 'qc7', name: 'Qwen2.5-Coder 7B', vendor: '通义千问', origin: '国内', use: '代码开发',
    size: '4.68 GB', vram: '6.5 GB', license: 'Apache-2.0', quant: 'Q4_K_M',
    reason: '更强本地编码。多文件重构与工具调用场景。', tag: 'qwen2.5-coder:7b',
    file: 'Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'dsr', name: 'DeepSeek-R1 Distill Qwen 1.5B', vendor: 'DeepSeek', origin: '国内', use: '推理',
    size: '1.12 GB', vram: '2.0 GB', license: 'MIT', quant: 'Q4_K_M',
    reason: '轻量推理蒸馏。适合短链路思考与验证。', tag: 'deepseek-r1:1.5b',
    file: 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
  },
  {
    id: 'g1', name: 'Gemma 3 1B', vendor: 'Google', origin: '国外', use: '通用对话',
    size: '806 MiB', vram: '1.2 GB', license: 'Gemma 使用条款', quant: 'Q4_K_M',
    reason: '通用轻量任务。适合简短问答和文本分类。', tag: 'gemma3:1b',
    file: 'gemma-3-1b-it-Q4_K_M.gguf',
    nativeDownload: {
      repository: 'ggml-org/gemma-3-1b-it-GGUF',
      fileName: 'gemma-3-1b-it-Q4_K_M.gguf',
      expectedSizeMiB: 806,
    },
  },
  {
    id: 'g0', name: 'Gemma 3 270M', vendor: 'Google', origin: '国外', use: '任务路由',
    size: '241 MiB', vram: '0.6 GB', license: 'Gemma 使用条款', quant: 'Q4_K_M',
    reason: '超轻量任务。低资源环境下的短文本处理。', tag: 'gemma3:270m',
    file: 'gemma-3-270m-it-Q4_K_M.gguf',
    nativeDownload: {
      repository: 'unsloth/gemma-3-270m-it-GGUF',
      fileName: 'gemma-3-270m-it-Q4_K_M.gguf',
      expectedSizeMiB: 241,
    },
  },
  {
    id: 'll3', name: 'Llama 3.2 3B Instruct', vendor: 'Meta', origin: '国外', use: '通用对话',
    size: '2.02 GB', vram: '3.2 GB', license: 'Llama 3.2 Community', quant: 'Q4_K_M',
    reason: '英文通用轻量。适合摘要与简单指令跟随。', tag: 'llama3.2:3b',
    file: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'phi', name: 'Phi-3.5 Mini Instruct', vendor: 'Microsoft', origin: '国外', use: '通用对话',
    size: '2.18 GB', vram: '3.5 GB', license: 'MIT', quant: 'Q4_K_M',
    reason: '小参数英文/代码混合。适合边缘设备。', tag: 'phi3.5:3.8b',
    file: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
  },
  {
    id: 'mx', name: 'Mistral 7B Instruct', vendor: 'Mistral', origin: '国外', use: '通用对话',
    size: '4.37 GB', vram: '6.0 GB', license: 'Apache-2.0', quant: 'Q4_K_M',
    reason: '欧美开源主力之一。适合英文写作与工具调用。', tag: 'mistral:7b',
    file: 'Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
  },
]

const DEFAULT_PROVIDERS: CloudProvider[] = [
  {
    id: 'deepseek', name: 'DeepSeek', base: 'https://api.deepseek.com', keyConfigured: false,
    models: [
      { id: 'ds', name: 'DeepSeek Chat', call: 'deepseek-chat' },
      { id: 'dsr', name: 'DeepSeek Reasoner', call: 'deepseek-reasoner' },
    ],
  },
  {
    id: 'qwen', name: '通义千问', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', keyConfigured: false,
    models: [
      { id: 'qp', name: 'Qwen Plus', call: 'qwen-plus' },
      { id: 'qmax', name: 'Qwen Max', call: 'qwen-max' },
    ],
  },
  {
    id: 'moonshot', name: 'Moonshot / Kimi', base: 'https://api.moonshot.cn/v1', keyConfigured: false,
    models: [
      { id: 'km', name: 'Kimi 8K', call: 'moonshot-v1-8k' },
      { id: 'km32', name: 'Kimi 32K', call: 'moonshot-v1-32k' },
    ],
  },
  {
    id: 'openai', name: 'OpenAI Compatible', base: 'https://api.openai.com/v1', keyConfigured: false,
    models: [{ id: 'g4m', name: 'GPT-4o mini', call: 'gpt-4o-mini' }],
  },
]

function parseJsonArray<T>(raw: string | undefined, fallback: T[]): T[] {
  if (!raw || !raw.trim()) return fallback
  try {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) ? v as T[] : fallback
  } catch {
    return fallback
  }
}

function parseJsonObject(raw: string | undefined): Record<string, string> {
  if (!raw || !raw.trim()) return {}
  try {
    const v = JSON.parse(raw) as unknown
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, string> : {}
  } catch {
    return {}
  }
}

function detectNvidiaGpu(): { name: string; vramGb: number } | null {
  const candidates = process.platform === 'win32'
    ? [
        join(process.env.WINDIR ?? 'C:\\Windows', 'System32', 'nvidia-smi.exe'),
        join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'NVIDIA Corporation', 'NVSMI', 'nvidia-smi.exe'),
        'nvidia-smi.exe',
      ]
    : ['nvidia-smi']
  for (const executable of candidates) {
    if (executable.includes('\\') && !existsSync(executable)) continue
    try {
      const output = execFileSync(executable, [
        '--query-gpu=name,memory.total',
        '--format=csv,noheader,nounits',
      ], { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim()
      const first = output.split(/\r?\n/)[0]
      if (!first) continue
      const parts = first.split(',').map(s => s.trim())
      if (parts.length < 2 || !parts[0] || !parts[1]) continue
      const vramMiB = Number.parseInt(parts[1], 10)
      if (!Number.isFinite(vramMiB)) continue
      return { name: parts[0], vramGb: Math.round((vramMiB / 1024) * 10) / 10 }
    } catch { /* try next */ }
  }
  return null
}

function findOllamaBinary(): string | undefined {
  if (process.platform === 'win32') {
    const paths = [
      join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Ollama', 'ollama.exe'),
      join(process.env.PROGRAMFILES ?? '', 'Ollama', 'ollama.exe'),
      join(process.env['PROGRAMFILES(X86)'] ?? '', 'Ollama', 'ollama.exe'),
    ]
    for (const p of paths) {
      if (p && existsSync(p)) return p
    }
  }
  try {
    return execSync(process.platform === 'win32' ? 'where ollama' : 'which ollama', {
      encoding: 'utf8', timeout: 3000, windowsHide: true,
    }).trim().split(/\r?\n/)[0]
  } catch {
    return undefined
  }
}

async function detectOllama(fetchImpl: typeof fetch = fetch): Promise<{
  status: 'running' | 'installed' | 'missing' | 'unknown'
  version?: string
  endpoint: string
  tags?: { name: string; size?: string }[]
}> {
  const endpoint = process.env.OLLAMA_HOST ?? 'http://localhost:11434'
  const installPath = findOllamaBinary()
  let version: string | undefined
  if (installPath) {
    try {
      const raw = execFileSync(installPath, ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim()
      const match = raw.match(/(\d+\.\d+\.\d+)/)
      version = match?.[1] ?? raw.slice(0, 40)
    } catch { /* ignore */ }
  }
  let running = false
  let tags: { name: string; size?: string }[] | undefined
  try {
    const response = await fetchImpl(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (response.ok) {
      const payload = await response.json() as { models?: { name?: string; size?: number }[] }
      if (!Array.isArray(payload.models)) throw new Error('Invalid Ollama model list')
      running = true
      tags = payload.models.map(m => {
        const name = String(m.name ?? '')
        const row: { name: string; size?: string } = { name }
        if (typeof m.size === 'number') row.size = formatBytes(m.size)
        return row
      }).filter(t => t.name)
      try {
        const vr = await fetchImpl(`${endpoint}/api/version`, { signal: AbortSignal.timeout(2000) })
        if (vr.ok) {
          const body = await vr.json() as { version?: string }
          if (body.version) version = body.version
        }
      } catch { /* tags enough */ }
    }
  } catch { running = false /* Failed transport or invalid model-list response. */ }
  if (running) {
    const out: { status: 'running'; version?: string; endpoint: string; tags?: { name: string; size?: string }[] } = { status: 'running', endpoint }
    if (version) out.version = version
    if (tags) out.tags = tags
    return out
  }
  if (installPath) {
    const out: { status: 'installed'; version?: string; endpoint: string } = { status: 'installed', endpoint }
    if (version) out.version = version
    return out
  }
  return { status: 'missing', endpoint }
}

function rootsFromFields(fields: Record<string, unknown>): string[] {
  const roots: string[] = []
  if (Array.isArray(fields.roots)) {
    for (const r of fields.roots) {
      if (typeof r === 'string' && r.trim()) roots.push(r.trim())
    }
  }
  if (Array.isArray(fields.disks)) {
    for (const d of fields.disks) {
      const letter = String(d).replace(/:$/, '').trim()
      if (/^[A-Za-z]$/.test(letter)) {
        roots.push(process.platform === 'win32' ? `${letter.toUpperCase()}:\\` : `/${letter}`)
      }
    }
  }
  const single = str(fields, 'path') || str(fields, 'directory')
  if (single) roots.push(single)
  return [...new Set(roots.map(r => r.replace(/[\\/]+$/, '') || r))]
}

function defaultModelRoots(): string[] {
  const home = homedir()
  const local = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local')
  return [
    process.env.XYAI_MODEL_DIR?.trim() || '',
    nativeModelDirectory(),
    join(home, '.ollama', 'models'),
    join(home, '.cache', 'huggingface'),
    join(home, '.cache', 'huggingface', 'hub'),
    join(home, '.cache', 'lm-studio'),
    join(local, 'lm-studio', 'models'),
    join(home, 'models'),
    join(home, 'Downloads'),
    join(process.platform === 'win32' ? 'C:\\' : '/', 'models'),
    join(process.platform === 'win32' ? 'D:\\' : '/', 'models'),
    join(process.platform === 'win32' ? 'E:\\' : '/', 'models'),
  ].filter(Boolean)
}

function walkGgufSync(
  root: string,
  maxDepth: number,
  maxFiles: number,
  out: { path: string; size: number; name: string }[],
  skipped: { path: string; reason: string }[],
  cancelled: () => boolean,
): void {
  const stack: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }]
  while (stack.length && out.length < maxFiles && !cancelled()) {
    const cur = stack.pop()!
    let entries: string[]
    try {
      entries = readdirSync(cur.dir)
    } catch (e) {
      skipped.push({ path: cur.dir, reason: e instanceof Error ? e.message : 'permission' })
      continue
    }
    for (const name of entries) {
      if (out.length >= maxFiles || cancelled()) break
      if (name === '.' || name === '..' || SKIP_DIR_NAMES.has(name)) continue
      const full = join(cur.dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        skipped.push({ path: full, reason: 'stat failed' })
        continue
      }
      if (st.isDirectory()) {
        if (cur.depth < maxDepth) stack.push({ dir: full, depth: cur.depth + 1 })
      } else if (st.isFile() && /\.gguf$/i.test(name) && !/\.mmproj/i.test(name)) {
        out.push({ path: full, size: st.size, name })
      }
    }
  }
}

function idFromPath(filePath: string): string {
  const base = basename(filePath).replace(/\.gguf$/i, '')
  const safe = base.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 48)
  let hash = 0
  for (let i = 0; i < filePath.length; i++) hash = ((hash << 5) - hash + filePath.charCodeAt(i)) | 0
  return `gguf-${safe}-${(hash >>> 0).toString(16).slice(0, 6)}`
}

/** Host backend: inspect / scan / registry / downloads / cloud / benchmark. */
export class ModelHubBackend {
  private seq = 1
  private readonly tasks = new Map<string, TaskSnapshot>()
  private readonly abort = new Map<string, AbortController>()
  private readonly scanTokens = new Map<string, { cancelled: boolean }>()
  private readonly lastBench = new Map<string, BenchmarkResult>()
  private lastScan: { taskId: string; found: RegistryEntry[]; skipped: number; ollamaTags: RegistryEntry[] } | null = null
  private providers: CloudProvider[] = DEFAULT_PROVIDERS.map(p => ({
    ...p,
    models: p.models.map(m => ({ ...m })),
  }))
  private readonly fetchImpl: typeof fetch

  constructor(private readonly settings: PlazaSettingsScope, deps: PlazaHostDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch
    this.hydrateCloudFlags()
  }

  /** Route one channel call. */
  async dispatch(endpoint: string, payload: unknown): Promise<ConnectionRpcResult<unknown>> {
    const fields = fieldsOf(payload)
    try {
      switch (endpoint) {
        case 'environment/inspect': return answered(await this.inspect())
        case 'environment/plan': return answered(this.plan())
        case 'environment/prepare': return answered(await this.prepare(fields))
        case 'environment/start': return answered(await this.startRuntime(fields))
        case 'environment/snapshot': return answered(this.envSnapshot(fields))
        case 'tasks/list': return answered(ok({ tasks: [...this.tasks.values()] }, false))
        case 'scan/start': return answered(await this.scanStart(fields))
        case 'scan/cancel': return answered(this.scanCancel(fields))
        case 'scan/snapshot': return answered(this.scanSnapshot())
        case 'registry/list': return answered(ok({ entries: this.loadRegistry() }, false))
        case 'registry/register': return answered(await this.register(fields))
        case 'registry/register-batch': return answered(await this.registerBatch(fields))
        case 'registry/unmount': return answered(await this.unmount(fields))
        case 'registry/set-default': return answered(await this.setDefault(fields))
        case 'ollama/pull': return answered(await this.ollamaPull(fields))
        case 'downloads/list': return answered(ok({ tasks: [...this.tasks.values()].filter(t => t.kind === 'download') }, false))
        case 'downloads/start': return answered(await this.downloadStart(fields))
        case 'downloads/pause': return answered(this.downloadMutate(fields, 'paused'))
        case 'downloads/resume': return answered(await this.downloadMutateResume(fields))
        case 'downloads/cancel': return answered(this.downloadMutate(fields, 'cancelled'))
        case 'downloads/snapshot': return answered(this.downloadSnapshot(fields))
        case 'benchmark/start': return answered(await this.benchmarkStart(fields))
        case 'benchmark/cancel': return answered(this.benchmarkCancel(fields))
        case 'benchmark/snapshot': return answered(this.benchmarkSnapshot(fields))
        case 'recommend/list': return answered(ok({ models: DEMO_RECOMMEND, note: 'catalog sizes are estimates; downloads verify bytes on disk' }, false))
        case 'cloud/providers': return answered(ok({ providers: this.publicProviders() }, false))
        case 'cloud/validate': return answered(this.cloudValidate(fields))
        case 'cloud/set-key': return answered(await this.cloudSetKey(fields))
        case 'cloud/test': return answered(await this.cloudTest(fields))
        case 'settings/get': return answered(ok({
          autoCheck: this.settings.get().autoCheck !== false,
          scanRoots: this.settings.get().scanRoots ?? '',
          defaultModelId: this.settings.get().defaultModelId ?? '',
        }, false))
        case 'settings/save': return answered(await this.savePlazaSettings(fields))
        default: return refused('model-hub/unknown-endpoint', `unknown model-hub endpoint ${JSON.stringify(endpoint)}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return refused('model-hub/internal', message)
    }
  }

  dispose(): void {
    for (const c of this.abort.values()) c.abort()
    this.abort.clear()
    for (const s of this.scanTokens.values()) s.cancelled = true
  }

  private hydrateCloudFlags(): void {
    const flags = parseJsonObject(this.settings.get().cloudConfiguredJson)
    for (const p of this.providers) {
      p.keyConfigured = flags[p.id] === '1' || flags[p.id] === 'true'
    }
  }

  private publicProviders(): CloudProvider[] {
    this.hydrateCloudFlags()
    return this.providers.map(p => ({
      ...p,
      models: p.models.map(m => ({ ...m })),
    }))
  }

  private loadRegistry(): RegistryEntry[] {
    const def = this.settings.get().defaultModelId ?? ''
    const entries = parseJsonArray<RegistryEntry>(this.settings.get().registryJson, [])
    return entries.map(e => ({
      ...e,
      isDefault: def !== '' && e.id === def,
      missing: e.path ? !existsSync(e.path) && e.kind !== 'Ollama' : !!e.missing,
    }))
  }

  private async persistRegistry(entries: RegistryEntry[]): Promise<void> {
    const slim = entries.map(({ id, name, kind, size, path, mounted, missing, source, lastBenchmark }) => ({
      id, name, kind, size, path, mounted, missing: !!missing, source, lastBenchmark,
    }))
    await this.settings.update({ registryJson: JSON.stringify(slim) })
  }

  private async inspect(): Promise<EnvironmentInspect> {
    const processors = cpus()
    const total = totalmem()
    const free = freemem()
    const gpu = detectNvidiaGpu()
    const ollama = await detectOllama(this.fetchImpl)
    const llama = findLlamaServer()
    const notes = [
      REAL_OS_NOTE,
      gpu ? `GPU via nvidia-smi: ${gpu.name}` : 'GPU unknown — not fabricated; CPU path available',
      llama ? `GGUF runtime: llama-server at ${llama}` : 'GGUF runtime missing — llama-server not found',
      ollama.status === 'running'
        ? `Ollama running · ${ollama.endpoint}${ollama.version ? ` · ${ollama.version}` : ''}`
        : ollama.status === 'installed'
          ? 'Ollama installed but API not reachable'
          : 'Ollama not detected on this machine',
    ]
    return {
      errcode: '0',
      errmsg: '',
      stub: false,
      inspectedAt: now(),
      platform: `${platform()} / ${arch()}`,
      arch: arch(),
      cpu: processors[0]?.model?.trim() || '未知 CPU',
      cpuCores: processors.length || null,
      memoryGb: Math.round(total / 1024 ** 3),
      memoryFreeGb: Math.round((free / 1024 ** 3) * 10) / 10,
      gpu: gpu?.name ?? null,
      vramGb: gpu?.vramGb ?? null,
      freeDiskGb: null,
      runtime: {
        gguf: llama ? 'installed' as const : 'missing' as const,
        ollama: ollama.status,
        ...(ollama.version ? { ollamaVersion: ollama.version } : {}),
        ollamaEndpoint: ollama.endpoint,
      },
      realOs: true,
      realGpu: !!gpu,
      notes,
    }
  }


  private envSnapshot(fields: Record<string, unknown>) {
    const id = str(fields, 'taskId')
    if (id) {
      const task = this.tasks.get(id)
      if (!task) return { errcode: '404', errmsg: '未找到环境任务。', stub: false }
      return ok({ task }, task.stub)
    }
    const task = [...this.tasks.values()].filter(t => t.kind === 'environment').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
    return ok({ task }, task?.stub ?? false)
  }

  private plan() {
    const llama = findLlamaServer()
    const steps = [
      {
        id: 'gguf',
        title: llama ? 'XYAI GGUF 运行时已安装，待模型运行检查' : 'XYAI GGUF 运行时缺失',
        size: llama ? '本机组件' : '不可用',
        location: llama || 'apps/desktop/resources/llama-cpp',
        stage: llama ? 'installed' : 'unavailable',
      },
      { id: 'ollama', title: 'Ollama（可选）', size: '按需', location: '本机安装或启动', stage: 'optional' },
      { id: 'health', title: '健康检查', size: '—', location: 'environment/inspect', stage: 'health' },
    ]
    return ok({
      steps,
      note: llama
        ? '可扫描并挂载本机 GGUF；Ollama 为可选加速路径。'
        : '内置 llama.cpp 未随当前进程找到。不会假装安装成功。可使用已运行的 Ollama，或扫描已有 GGUF 文件。',
    }, false)
  }

  private async prepare(fields: Record<string, unknown>) {
    if (str(fields, 'confirm') !== 'yes') {
      return { errcode: '400', errmsg: '请确认安装计划后再执行。', stub: false }
    }
    const env = await this.inspect()
    const llama = findLlamaServer()
    const candidate = this.loadRegistry().find(entry => entry.kind === 'GGUF' && entry.mounted && !entry.missing)
    let ggufReady = false
    if (llama && candidate) {
      try {
        const result = await measureLlamaCppTtft(llama, candidate.path, this.fetchImpl)
        ggufReady = !result.unavailable
      } catch {
        // A failed model load or request does not establish runtime readiness.
      }
    }
    if (ggufReady) env.runtime.gguf = 'ready'
    const ready = ggufReady || env.runtime.ollama === 'running'
    const stages = [
      { id: 'gguf', title: 'GGUF 模型运行检查', done: ggufReady },
      { id: 'ollama', title: 'Ollama', done: env.runtime.ollama === 'running' },
      { id: 'health', title: '健康检查', done: ready },
    ]
    const task = this.newTask(
      'environment',
      'prepare',
      '检查运行环境',
      ready ? 'done' : 'unavailable',
      ready ? 100 : 0,
      false,
    )
    task.stages = stages
    task.detail = ready
      ? `GGUF ${env.runtime.gguf} · Ollama ${env.runtime.ollama}`
      : '没有可用的本地推理运行时（llama-server 与 Ollama 均未就绪）'
    if (!ready) {
      task.error = '环境准备不可用，未通过运行检查：请启动 Ollama，或挂载有效 GGUF 后重试。仅检测到安装文件不代表运行就绪。'
      task.recoverable = true
    }
    return ok({ task, environment: env }, false)
  }

  private async startRuntime(fields: Record<string, unknown>) {
    const which = str(fields, 'runtime') || 'ollama'
    if (which === 'ollama') {
      const bin = findOllamaBinary()
      if (!bin) {
        return { errcode: '404', errmsg: '未找到 Ollama 可执行文件。请先安装 Ollama，或使用 GGUF 路径。', stub: false }
      }
      try {
        await new Promise<void>((resolve, reject) => {
          const child = spawn(bin, ['serve'], { detached: true, windowsHide: true, stdio: 'ignore' })
          child.once('error', reject)
          child.once('spawn', () => { child.unref(); resolve() })
        })
      } catch (error) {
        // Spawn can fail when Ollama is already serving; detectOllama below is the verdict.
        void error
      }
      for (let attempt = 0; attempt < 24; attempt += 1) {
        await delay(500)
        const ready = await detectOllama(this.fetchImpl)
        if (ready.status === 'running') break
      }
      const status = await detectOllama(this.fetchImpl)
      const task = this.newTask('environment', 'ollama', '启动 Ollama', status.status === 'running' ? 'done' : 'failed', status.status === 'running' ? 100 : 0, false)
      task.detail = status.status === 'running'
        ? `${status.endpoint}${status.version ? ` · ${status.version}` : ''}`
        : '已尝试启动；API 仍不可达'
      if (status.status !== 'running') {
        task.error = 'Ollama API 未响应（可能需要手动从系统托盘启动）'
        task.recoverable = true
      }
      const env = await this.inspect()
      return ok({ runtime: env.runtime, task }, false)
    }
    return ok({ runtime: (await this.inspect()).runtime }, false)
  }

  private async scanStart(fields: Record<string, unknown>) {
    let roots = rootsFromFields(fields)
    const includeDefaults = fields.onlyRoots !== true && str(fields, 'onlyRoots') !== 'yes'
    if (includeDefaults) roots = [...roots, ...defaultModelRoots()]
    if (roots.length === 0) {
      const saved = (this.settings.get().scanRoots ?? '').split('|').map(s => s.trim()).filter(Boolean)
      if (saved.length) roots = [...saved, ...defaultModelRoots()]
    }
    roots = [...new Set(roots)]
    const existingRoots = roots.filter(r => {
      try { return existsSync(r) } catch { return false }
    })
    const missingRoots = roots.filter(r => !existingRoots.includes(r))
    const task = this.newTask('scan', 'scan', `扫描 ${existingRoots.length} 个目录`, 'scanning', 5, false)
    task.detail = `roots=${existingRoots.length}; missing=${missingRoots.length}`
    const token = { cancelled: false }
    this.scanTokens.set(task.taskId, token)
    this.lastScan = { taskId: task.taskId, found: [], skipped: missingRoots.length, ollamaTags: [] }
    void this.runScan(task.taskId, existingRoots, missingRoots, fields, token)
    return ok({
      task,
      found: [],
      skipped: missingRoots.length,
      autoRegistered: false,
    }, false)
  }

  private async runScan(
    taskId: string,
    existingRoots: string[],
    missingRoots: string[],
    fields: Record<string, unknown>,
    token: { cancelled: boolean },
  ): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return
    const foundFiles: { path: string; size: number; name: string }[] = []
    const skipped: { path: string; reason: string }[] = []
    for (const r of missingRoots) skipped.push({ path: r, reason: 'path does not exist' })
    const maxDepth = Number(fields.maxDepth) || 5
    const maxFiles = Number(fields.maxFiles) || 500
    for (let i = 0; i < existingRoots.length; i++) {
      if (token.cancelled) break
      const root = existingRoots[i]!
      const depth = /[\\/](models|huggingface|lm-studio|ollama|Downloads)([\\/]|$)/i.test(root) ? Math.max(maxDepth, 6) : maxDepth
      walkGgufSync(root, depth, maxFiles - foundFiles.length, foundFiles, skipped, () => token.cancelled)
      task.percent = Math.min(90, Math.round(((i + 1) / Math.max(1, existingRoots.length)) * 80) + 5)
      task.detail = `已扫描 ${i + 1}/${existingRoots.length} · 发现 ${foundFiles.length} 个 GGUF`
      task.updatedAt = now()
      this.publishScanFound(taskId, foundFiles, skipped)
      await delay(0)
    }

    const registry = this.loadRegistry()
    const found: RegistryEntry[] = foundFiles.map(f => {
      const existing = registry.find(e => e.path.toLowerCase() === f.path.toLowerCase())
      return {
        id: existing?.id || idFromPath(f.path),
        name: existing?.name || f.name.replace(/\.gguf$/i, ''),
        kind: 'GGUF' as const,
        size: formatBytes(f.size),
        path: f.path,
        mounted: !!existing?.mounted,
        missing: false,
        source: 'scan' as const,
      }
    })

    let ollamaTags: RegistryEntry[] = []
    const ollama = await detectOllama(this.fetchImpl)
    if (!token.cancelled && ollama.status === 'running' && ollama.tags) {
      ollamaTags = ollama.tags.map(t => ({
        id: `ollama-${t.name.replace(/[^a-zA-Z0-9._-]+/g, '-')}`,
        name: t.name,
        kind: 'Ollama',
        size: t.size || '—',
        path: `ollama:${t.name}`,
        mounted: registry.some(e => e.path === `ollama:${t.name}` && e.mounted),
        missing: false,
        source: 'ollama',
      }))
    }

    if (token.cancelled) {
      task.phase = 'cancelled'
      task.error = '已停止搜索，登记数据未改变'
      task.updatedAt = now()
      return
    }

    task.phase = 'done'
    task.percent = 100
    task.detail = `发现 ${found.length} 个 GGUF · Ollama tags ${ollamaTags.length} · 跳过 ${skipped.length}`
    this.lastScan = { taskId, found: [...found, ...ollamaTags], skipped: skipped.length, ollamaTags }

    const auto = fields.autoRegister === true || str(fields, 'autoRegister') === 'yes'
    if (auto) {
      await this.registerBatch({
        ids: found.filter(f => !f.mounted).map(f => f.id),
        entries: found,
        autoBenchmark: this.settings.get().autoCheck !== false,
      })
    }

    await this.settings.update({ scanRoots: existingRoots.join('|') })
  }

  private publishScanFound(
    taskId: string,
    foundFiles: { path: string; size: number; name: string }[],
    skipped: { path: string; reason: string }[],
  ): void {
    const registry = this.loadRegistry()
    const found: RegistryEntry[] = foundFiles.map(f => {
      const existing = registry.find(e => e.path.toLowerCase() === f.path.toLowerCase())
      return {
        id: existing?.id || idFromPath(f.path),
        name: existing?.name || f.name.replace(/\.gguf$/i, ''),
        kind: 'GGUF' as const,
        size: formatBytes(f.size),
        path: f.path,
        mounted: !!existing?.mounted,
        missing: false,
        source: 'scan' as const,
      }
    })
    this.lastScan = { taskId, found, skipped: skipped.length, ollamaTags: this.lastScan?.ollamaTags ?? [] }
  }

  private scanCancel(fields: Record<string, unknown>) {
    const id = str(fields, 'taskId')
    const task = id ? this.tasks.get(id) : [...this.tasks.values()].find(t => t.kind === 'scan' && t.phase === 'scanning')
    if (!task) return { errcode: '404', errmsg: '没有进行中的扫描任务。', stub: false }
    const token = this.scanTokens.get(task.taskId)
    if (token) token.cancelled = true
    task.phase = 'cancelled'
    task.error = '已停止搜索，登记数据未改变'
    task.updatedAt = now()
    return ok({ task }, false)
  }

  private scanSnapshot() {
    return ok({
      task: this.lastScan ? this.tasks.get(this.lastScan.taskId) ?? null : null,
      found: this.lastScan?.found ?? [],
      skipped: this.lastScan?.skipped ?? 0,
    }, false)
  }

  private async register(fields: Record<string, unknown>) {
    const id = str(fields, 'id')
    const path = str(fields, 'path')
    const name = str(fields, 'name') || (path ? basename(path).replace(/\.gguf$/i, '') : id)
    if (!id && !path) return { errcode: '400', errmsg: '缺少模型 id 或路径。', stub: false }
    const allowMissing = fields.allowMissing === true || str(fields, 'source') === 'download'
    if (path && !path.startsWith('ollama:') && !existsSync(path) && !allowMissing) {
      return { errcode: '404', errmsg: '文件不存在，无法登记。', stub: false }
    }
    const registry = this.loadRegistry()
    const existing = registry.find(e => e.id === id || (path && e.path.toLowerCase() === path.toLowerCase()))
    if (existing) {
      existing.mounted = true
      existing.missing = path.startsWith('ollama:') ? false : (path ? !existsSync(path) : existing.missing)
      if (path) existing.path = path
      if (name) existing.name = name
      await this.persistRegistry(registry)
      await this.maybeAutoBenchmark(existing, fields)
      return ok({ entry: existing }, false)
    }
    let size = str(fields, 'size')
    if (!size && path && !path.startsWith('ollama:') && existsSync(path)) {
      try { size = formatBytes(statSync(path).size) } catch { size = '未知' }
    }
    const entry: RegistryEntry = {
      id: id || idFromPath(path || `manual-${this.seq++}`),
      name,
      kind: str(fields, 'kind') || (path.startsWith('ollama:') ? 'Ollama' : 'GGUF'),
      size: size || '未知',
      path: path || '(unknown)',
      mounted: true,
      missing: !!(path && !path.startsWith('ollama:') && !existsSync(path)),
      source: str(fields, 'source') || 'manual',
    }
    registry.push(entry)
    await this.persistRegistry(registry)
    await this.maybeAutoBenchmark(entry, fields)
    return ok({ entry }, false)
  }

  private async maybeAutoBenchmark(entry: RegistryEntry, fields: Record<string, unknown>): Promise<void> {
    const autoBench = fields.autoBenchmark !== false
      && str(fields, 'autoBenchmark') !== 'no'
      && this.settings.get().autoCheck !== false
    if (autoBench && entry.mounted && !entry.missing) {
      void this.benchmarkStart({ id: entry.id })
    }
  }

  private async registerBatch(fields: Record<string, unknown>) {
    const entries = Array.isArray(fields.entries) ? fields.entries as RegistryEntry[] : (this.lastScan?.found ?? [])
    const ids = Array.isArray(fields.ids) ? fields.ids.map(String) : null
    const selected = ids ? entries.filter(e => ids.includes(e.id)) : entries
    const registered: RegistryEntry[] = []
    const failed: { id: string; error: string }[] = []
    for (const e of selected) {
      const res = await this.register({
        id: e.id, name: e.name, path: e.path, size: e.size, kind: e.kind, source: e.source || 'scan',
        autoBenchmark: fields.autoBenchmark,
      }) as ModelHubEnvelope & { entry?: RegistryEntry }
      if (res.errcode && res.errcode !== '0') failed.push({ id: e.id, error: String(res.errmsg || 'fail') })
      else if (res.entry) registered.push(res.entry)
    }
    return ok({ registered, failed, count: registered.length }, false)
  }

  private async unmount(fields: Record<string, unknown>) {
    if (str(fields, 'confirm') !== 'yes') {
      return { errcode: '400', errmsg: '解除挂载需要确认；不会删除原文件。', stub: false }
    }
    const id = str(fields, 'id')
    const registry = this.loadRegistry()
    const entry = registry.find(e => e.id === id)
    if (!entry) return { errcode: '404', errmsg: '未找到登记项。', stub: false }
    entry.mounted = false
    entry.isDefault = false
    const def = this.settings.get().defaultModelId ?? ''
    if (def === id) await this.settings.update({ defaultModelId: '' })
    await this.persistRegistry(registry)
    return ok({ entry }, false)
  }

  private async setDefault(fields: Record<string, unknown>) {
    const id = str(fields, 'id')
    const registry = this.loadRegistry()
    const entry = registry.find(e => e.id === id)
    if (!entry || !entry.mounted || entry.missing) {
      return { errcode: '409', errmsg: '模型不可用，不能设为默认。', stub: false }
    }
    const catalogLine = `${entry.name}|${entry.kind === 'Ollama' ? 'local-ollama' : 'local-gguf'}|${entry.path}`
    const current = this.settings.get().catalog ?? ''
    const lines = current.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
      .filter(line => !line.includes(`|${entry.path}`) && !line.startsWith(`${entry.name}|`))
    await this.settings.update({
      defaultModelId: id,
      catalog: [catalogLine, ...lines].join('\n').slice(0, 2000),
    })
    return ok({ defaultModelId: id, entries: this.loadRegistry(), catalog: this.settings.get().catalog }, false)
  }

  private downloadSources = new Map<string, { modelId: string; native?: GgufDownloadSource; ollamaTag?: string }>()

  /** Pull an Ollama tag. Already-mounted tags return 409 so the UI never offers re-download. */
  private async ollamaPull(fields: Record<string, unknown>) {
    const tag = (str(fields, 'tag') || str(fields, 'name')).trim()
    if (!tag) return { errcode: '400', errmsg: '缺少 Ollama 模型名。', stub: false }
    const ollama = await detectOllama(this.fetchImpl)
    if (ollama.status !== 'running') {
      return { errcode: '503', errmsg: 'Ollama 未运行。请先在环境准备页启动后再拉取。', stub: false, unavailable: true }
    }
    const id = `ollama-${tag.replace(/[^a-zA-Z0-9._-]+/g, '-')}`
    const mounted = this.loadRegistry().find(e =>
      e.mounted && !e.missing && (e.id === id || e.path === `ollama:${tag}` || e.name === tag),
    )
    if (mounted) return { errcode: '409', errmsg: '该模型已注册，无需重复下载。', stub: false }
    const active = [...this.tasks.values()].find(
      t => t.kind === 'download' && (t.modelId === id || t.label === tag) && !['done', 'cancelled', 'failed'].includes(t.phase),
    )
    if (active) return ok({ task: active, errmsg: '该模型已有任务，请继续现有任务。' }, false)
    const task = this.newTask('download', tag, tag, 'connecting', 2, false)
    task.modelId = id
    task.detail = `Ollama pull ${tag}`
    this.downloadSources.set(task.taskId, { modelId: id, ollamaTag: tag })
    void this.runDownload(task.taskId)
    return ok({ task }, false)
  }

  private async downloadStart(fields: Record<string, unknown>) {
    const modelId = str(fields, 'modelId')
    const name = str(fields, 'name') || modelId || 'model'
    if (!modelId) return { errcode: '400', errmsg: '缺少 modelId。', stub: false }
    const active = [...this.tasks.values()].find(
      t => t.kind === 'download' && t.modelId === modelId && !['done', 'cancelled', 'failed'].includes(t.phase),
    )
    if (active) return ok({ task: active, errmsg: '该模型已有任务，请继续现有任务。' }, false)
    const mounted = this.loadRegistry().find(e => e.id === modelId && e.mounted && !e.missing)
    if (mounted) return { errcode: '409', errmsg: '该模型已注册，无需重复下载。', stub: false }

    const demo = DEMO_RECOMMEND.find(m => m.id === modelId)
    const ollama = await detectOllama(this.fetchImpl)
    const native = demo?.nativeDownload
    const ollamaTag = demo?.tag
    if (!native && !(ollama.status === 'running' && ollamaTag)) {
      return {
        errcode: '503',
        errmsg: '该模型没有可用的 GGUF 下载源，且 Ollama 未运行。请扫描本机已有文件，或先启动 Ollama 后再拉取。',
        stub: false,
        unavailable: true,
      }
    }

    const task = this.newTask('download', name, name, 'connecting', 2, false)
    task.modelId = modelId
    task.detail = native ? `${str(fields, 'node') || 'hf-mirror → huggingface'} · ${native.fileName}` : `Ollama pull ${ollamaTag}`
    this.downloadSources.set(task.taskId, {
      modelId,
      ...(native ? { native } : {}),
      ...(ollamaTag ? { ollamaTag } : {}),
    })
    void this.runDownload(task.taskId)
    return ok({ task }, false)
  }

  private async runDownload(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    const spec = this.downloadSources.get(taskId)
    if (!task || !spec) return
    const controller = new AbortController()
    this.abort.set(taskId, controller)
    try {
      if (spec.native) {
        const path = await downloadGgufFile(spec.native, progress => {
          const current = this.tasks.get(taskId)
          if (!current || current.phase === 'paused' || current.phase === 'cancelled') return
          current.phase = progress.status === 'done' ? 'registering' : progress.status
          current.percent = progress.percent
          current.detail = progress.filePath
          current.updatedAt = now()
        }, controller.signal, this.fetchImpl)
        if (task.phase === 'cancelled' || task.phase === 'paused') return
        task.phase = 'registering'
        task.percent = 100
        await this.register({
          id: spec.modelId,
          name: task.label,
          kind: 'GGUF',
          path,
          source: 'download',
          autoBenchmark: true,
        })
        task.phase = 'done'
        task.detail = path
      } else if (spec.ollamaTag) {
        await this.pullOllama(taskId, spec.ollamaTag, controller.signal)
        if (task.phase === 'cancelled' || task.phase === 'paused') return
        await this.register({
          id: spec.modelId,
          name: task.label,
          kind: 'Ollama',
          path: `ollama:${spec.ollamaTag}`,
          source: 'download',
          autoBenchmark: true,
        })
        task.phase = 'done'
        task.percent = 100
        task.detail = `ollama:${spec.ollamaTag}`
      }
    } catch (error) {
      const current = this.tasks.get(taskId)
      if (!current || current.phase === 'paused' || current.phase === 'cancelled') return
      current.phase = 'failed'
      current.error = error instanceof Error ? error.message : String(error)
      current.recoverable = true
      current.updatedAt = now()
    } finally {
      this.abort.delete(taskId)
    }
  }

  private async pullOllama(taskId: string, tag: string, signal: AbortSignal): Promise<void> {
    const ollama = await detectOllama(this.fetchImpl)
    const response = await this.fetchImpl(`${ollama.endpoint.replace(/\/$/, '')}/api/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: tag, stream: true }),
      signal,
    })
    if (!response.ok || response.body === null) {
      throw new Error(`Ollama pull 失败：HTTP ${String(response.status)}`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line) as { status?: string; completed?: number; total?: number; error?: string }
            if (data.error) throw new Error(data.error)
            const task = this.tasks.get(taskId)
            if (!task) return
            task.phase = 'downloading'
            if (data.completed !== undefined && data.total) {
              task.percent = Math.min(99, Math.round((data.completed / data.total) * 100))
            }
            if (data.status) task.detail = data.status
            task.updatedAt = now()
          } catch (e) {
            if (e instanceof Error && e.message !== '' && !e.message.startsWith('Unexpected')) throw e
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  private downloadMutate(fields: Record<string, unknown>, phase: string) {
    const task = this.tasks.get(str(fields, 'taskId'))
    if (!task || task.kind !== 'download') return { errcode: '404', errmsg: '未找到下载任务。', stub: false }
    if (phase === 'paused' && !['connecting', 'downloading', 'verifying'].includes(task.phase)) {
      return { errcode: '409', errmsg: '当前阶段不可暂停。', stub: false }
    }
    if (phase === 'cancelled' && str(fields, 'confirm') !== 'yes') {
      return { errcode: '400', errmsg: '取消任务需要确认；部分文件可保留续传。', stub: false }
    }
    task.phase = phase
    task.updatedAt = now()
    this.abort.get(task.taskId)?.abort()
    this.abort.delete(task.taskId)
    if (phase === 'paused') {
      task.error = '已暂停，部分文件保留可续传'
      task.recoverable = true
    }
    if (phase === 'cancelled') {
      task.error = '已取消，部分文件保留'
      task.recoverable = true
    }
    return ok({ task }, false)
  }

  private async downloadMutateResume(fields: Record<string, unknown>) {
    const task = this.tasks.get(str(fields, 'taskId'))
    if (!task || task.kind !== 'download') return { errcode: '404', errmsg: '未找到下载任务。', stub: false }
    if (task.phase !== 'paused' && task.phase !== 'failed') {
      return { errcode: '409', errmsg: '当前阶段不可继续。', stub: false }
    }
    delete (task as { error?: string }).error
    task.phase = 'connecting'
    task.percent = Math.max(task.percent, 2)
    task.updatedAt = now()
    void this.runDownload(task.taskId)
    return ok({ task }, false)
  }

  private downloadSnapshot(fields: Record<string, unknown>) {
    const id = str(fields, 'taskId')
    if (id) {
      const task = this.tasks.get(id)
      if (!task) return { errcode: '404', errmsg: '未找到任务。', stub: false, tasks: [] }
      return ok({ task, tasks: [task] }, false)
    }
    return ok({ tasks: [...this.tasks.values()].filter(t => t.kind === 'download') }, false)
  }

  private async benchmarkStart(fields: Record<string, unknown>) {
    const id = str(fields, 'id')
    const entry = this.loadRegistry().find(e => e.id === id)
    if (!entry || !entry.mounted || entry.missing) {
      return { errcode: '409', errmsg: '模型未挂载或文件缺失，无法测试。', stub: false }
    }
    const running = [...this.tasks.values()].find(
      t => t.kind === 'benchmark' && t.modelId === id && t.phase === 'running',
    )
    if (running) return ok({ task: running, result: this.lastBench.get(running.taskId) }, false)
    const task = this.newTask('benchmark', entry.name, entry.name, 'running', 10, false)
    task.modelId = id
    task.detail = '测量 TTFT…'
    const controller = new AbortController()
    this.abort.set(task.taskId, controller)
    void this.runBenchmark(task.taskId, entry, controller.signal)
    return ok({ task }, false)
  }

  private async runBenchmark(taskId: string, entry: RegistryEntry, signal: AbortSignal): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return
    try {
      let result: BenchmarkResult
      if (entry.kind === 'Ollama' || entry.path.startsWith('ollama:')) {
        const ollama = await detectOllama(this.fetchImpl)
        if (ollama.status !== 'running') {
          result = unavailableBenchmark('Ollama 未运行，无法测量 TTFT。', 'Ollama missing', 'Ollama')
        } else {
          const tag = entry.path.startsWith('ollama:') ? entry.path.slice('ollama:'.length) : entry.name
          result = await measureOllamaTtft(ollama.endpoint, tag, this.fetchImpl, signal)
        }
      } else {
        const llama = findLlamaServer()
        if (!llama) {
          const ollama = await detectOllama(this.fetchImpl)
          result = ollama.status === 'running'
            ? unavailableBenchmark('GGUF 未导入 Ollama，且 llama-server 缺失。', 'llama.cpp missing', 'GGUF')
            : unavailableBenchmark('内置 llama.cpp 运行时缺失，且 Ollama 未运行。性能测试不可用。', 'no local runtime', 'unavailable')
        } else {
          result = await measureLlamaCppTtft(llama, entry.path, this.fetchImpl, signal)
        }
      }
      if (signal.aborted || task.phase === 'cancelled') return
      this.lastBench.set(taskId, result)
      task.phase = result.unavailable ? 'unavailable' : 'done'
      task.percent = 100
      task.detail = result.unavailable ? result.note : `${result.display.firstToken} · ${result.display.tokensPerSec}`
      task.updatedAt = now()
      const registry = this.loadRegistry()
      const row = registry.find(e => e.id === entry.id)
      if (row) {
        row.lastBenchmark = {
          firstTokenMs: result.firstTokenMs,
          tokensPerSec: result.tokensPerSec,
          testedAt: result.testedAt,
          backend: result.backend,
          ...(result.unavailable ? { unavailable: true as const } : {}),
          ...(result.note ? { note: result.note } : {}),
        }
        await this.persistRegistry(registry)
      }
    } catch (error) {
      const current = this.tasks.get(taskId)
      if (!current || current.phase === 'cancelled') return
      const note = error instanceof Error ? error.message : String(error)
      const result = unavailableBenchmark(note, 'error', entry.kind)
      this.lastBench.set(taskId, result)
      current.phase = 'failed'
      current.error = note
      current.recoverable = true
      current.updatedAt = now()
    } finally {
      this.abort.delete(taskId)
    }
  }

  private benchmarkCancel(fields: Record<string, unknown>) {
    const task = this.tasks.get(str(fields, 'taskId'))
    if (!task || task.kind !== 'benchmark') return { errcode: '404', errmsg: '未找到测试任务。', stub: false }
    task.phase = 'cancelled'
    task.updatedAt = now()
    this.abort.get(task.taskId)?.abort()
    this.abort.delete(task.taskId)
    return ok({ task }, false)
  }

  private benchmarkSnapshot(fields: Record<string, unknown>) {
    const id = str(fields, 'taskId')
    const task = id ? this.tasks.get(id) : [...this.tasks.values()].filter(t => t.kind === 'benchmark').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    if (!task) return { errcode: '404', errmsg: '未找到测试任务。', stub: false }
    return ok({ task, result: this.lastBench.get(task.taskId) ?? null }, false)
  }

  private cloudValidate(fields: Record<string, unknown>) {
    const name = str(fields, 'name')
    const provider = str(fields, 'provider')
    const model = str(fields, 'model')
    const base = str(fields, 'base')
    if (!name || !provider || !model || !base) {
      return { errcode: '400', errmsg: '显示名称、服务商 ID、模型 ID 和 Base URL 必填。', stub: false, valid: false }
    }
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(provider)) {
      return { errcode: '400', errmsg: '服务商 ID 只允许字母、数字、下划线和短横线，最长 64 字符。', stub: false, valid: false }
    }
    let url: URL
    try { url = new URL(base) } catch {
      return { errcode: '400', errmsg: 'Base URL 无效。', stub: false, valid: false }
    }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      return { errcode: '400', errmsg: '请使用不带用户名和密码的 HTTP(S) 地址。', stub: false, valid: false }
    }
    const existing = this.providers.find(p => p.id === provider)
    if (existing && existing.base !== base) {
      return { errcode: '409', errmsg: '服务商 ID 已绑定其他地址，请使用新的 ID。', stub: false, valid: false }
    }
    if (existing?.models.some(m => m.call === model)) {
      return { errcode: '409', errmsg: '该服务商下已存在相同调用模型。', stub: false, valid: false }
    }
    return ok({ valid: true }, false)
  }

  private async cloudSetKey(fields: Record<string, unknown>) {
    const id = str(fields, 'providerId')
    const key = str(fields, 'key')
    const provider = this.providers.find(p => p.id === id)
    if (!provider) return { errcode: '404', errmsg: '未找到服务商。', stub: false }
    if (!key) return { errcode: '400', errmsg: '请填写 API Key（不会回显）。', stub: false }
    provider.keyConfigured = true
    const flags = parseJsonObject(this.settings.get().cloudConfiguredJson)
    flags[id] = '1'
    const secrets = parseJsonObject(this.settings.get().cloudSecretsJson)
    secrets[id] = key
    await this.settings.update({
      cloudConfiguredJson: JSON.stringify(flags),
      cloudSecretsJson: JSON.stringify(secrets),
    })
    return ok({ provider: { ...provider, models: provider.models.map(m => ({ ...m })) } }, false)
  }

  private async cloudTest(fields: Record<string, unknown>) {
    const id = str(fields, 'providerId')
    const modelId = str(fields, 'modelId')
    const provider = this.providers.find(p => p.id === id)
    if (!provider) return { errcode: '404', errmsg: '未找到服务商。', stub: false }
    if (!provider.keyConfigured) return { errcode: '401', errmsg: '请先配置服务商凭据。', stub: false }
    const secrets = parseJsonObject(this.settings.get().cloudSecretsJson)
    const key = secrets[id] || ''
    const model = provider.models.find(m => m.id === modelId) || provider.models[0]
    const shown = this.publicProviders().find(p => p.id === id)

    try {
      const url = provider.base.replace(/\/$/, '') + '/models'
      const headers: Record<string, string> = {}
      if (key) headers.Authorization = `Bearer ${key}`
      const res = await this.fetchImpl(url, { method: 'GET', headers, signal: AbortSignal.timeout(4000) })
      if (res.status === 401 || res.status === 403) {
        const result = `连接失败：凭据无效（${res.status}）。`
        if (model) model.lastTest = result
        return { errcode: '401', errmsg: result, stub: false, unavailable: true, result, provider: shown }
      }
      if (!res.ok) {
        const result = `连接探测返回 HTTP ${res.status}。密钥状态已保存；推理仍走 DSH LLM。`
        if (model) model.lastTest = result
        return { errcode: String(res.status), errmsg: result, stub: false, unavailable: true, result, provider: shown }
      }
      const result = `连接探测成功（HTTP ${res.status}）。推理 Provider 仍待 DSH LLM 接线。`
      if (model) model.lastTest = result
      return ok({ result, provider: shown }, false)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      const timeout = /abort|timeout|Timeout/i.test(msg)
      const result = timeout
        ? '连接失败：请求超时，请检查网络和 Base URL。'
        : `连接探测未完成（${msg}）。凭据状态已保存；此结果不代表对话可用。`
      if (model) model.lastTest = result
      return {
        errcode: timeout ? '408' : '503',
        errmsg: result,
        stub: false,
        unavailable: true,
        result,
        provider: shown,
      }
    }
  }

  private async savePlazaSettings(fields: Record<string, unknown>) {
    const patch: Partial<PlazaPersisted> = {}
    if (typeof fields.autoCheck === 'boolean') patch.autoCheck = fields.autoCheck
    if (typeof fields.scanRoots === 'string') patch.scanRoots = fields.scanRoots
    await this.settings.update(patch)
    return ok({
      autoCheck: this.settings.get().autoCheck !== false,
      scanRoots: this.settings.get().scanRoots ?? '',
    }, false)
  }

  private newTask(kind: TaskSnapshot['kind'], idHint: string, label: string, phase: string, percent: number, stub: boolean): TaskSnapshot {
    const task: TaskSnapshot = {
      taskId: `t${this.seq++}-${idHint}`.replace(/\s+/g, ''),
      kind,
      phase,
      percent,
      label,
      stub,
      updatedAt: now(),
      recoverable: true,
    }
    this.tasks.set(task.taskId, task)
    return task
  }
}

/** @deprecated Alias kept for any leftover imports. */
export { ModelHubBackend as ModelHubStubBackend }
