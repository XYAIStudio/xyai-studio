/**
 * XYAI-owned desktop model marketplace service.
 *
 * This is a direct migration boundary around the verified historical model
 * catalogue, detector and resumable downloader.  It deliberately stores
 * models only in the user's XYAI model directory and never reads a historical
 * checkout at runtime.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cpus } from 'node:os'
import { dirname, join } from 'node:path'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { downloadNativeModel, nativeModelDirectory, type NativeModelDownloadProgress } from './model-download.ts'
import { getRecommendedModels, scanLocalGgufModels, type LocalGgufModel, type MarketplaceModel } from './model-marketplace.ts'
import { detectHardware, detectOllama, type HardwareInfo, type OllamaStatus } from './ollama-detect.ts'
import { OllamaClient, type OllamaModel, type OllamaPullProgress } from './ollama-client.ts'

export interface LocalModelBenchmark {
  readonly tokensPerSecond?: number
  readonly loadDurationMs?: number
  readonly elapsedMs?: number
  readonly mode: 'cpu-safe'
  readonly error?: string
}

export interface ModelMarketplaceSnapshot {
  readonly detectedAt: string
  readonly hardware: HardwareInfo
  readonly models: readonly MarketplaceModel[]
  readonly localModels: readonly LocalGgufModel[]
  readonly ollamaStatus: OllamaStatus
  readonly ollamaModels: readonly OllamaModel[]
  readonly backends: readonly {
    readonly id: 'xyai-native' | 'xyai-ollama'
    readonly displayName: string
    readonly role: 'primary' | 'optional'
    readonly state: 'ready' | 'standby' | 'unavailable'
    readonly acceleration: string
    readonly detail: string
  }[]
}

function embeddedRuntimePath(): string {
  const bundled = process.resourcesPath === undefined
    ? join(import.meta.dirname, '../../resources/llama-cpp/llama-server.exe')
    : join(process.resourcesPath, 'llama-cpp', 'llama-server.exe')
  const installedComponent = process.env.XYAI_COMPONENTS_DIR === undefined
    ? undefined
    : join(process.env.XYAI_COMPONENTS_DIR, 'llama-cpp', 'llama-server.exe')
  return [bundled, installedComponent].find(candidate => candidate !== undefined && existsSync(candidate)) ?? bundled
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      server.close(error => error === undefined ? resolve(port) : reject(error))
    })
  })
}

function backendCapabilities(hardware: HardwareInfo, ollama: OllamaStatus) {
  const embedded = embeddedRuntimePath()
  return [
    {
      id: 'xyai-native' as const,
      displayName: 'XYAI 本地 GGUF',
      role: 'primary' as const,
      state: existsSync(embedded) ? 'ready' as const : 'unavailable' as const,
      acceleration: hardware.gpu === undefined ? 'CPU 自适应' : `${hardware.gpu.name} 自适应`,
      detail: existsSync(embedded)
        ? `内置 llama.cpp 已就绪；模型保存在 ${nativeModelDirectory()}，多轮对话复用已加载权重。`
        : '内置 llama.cpp 运行时缺失，不能启动本地 GGUF。',
    },
    {
      id: 'xyai-ollama' as const,
      displayName: 'Ollama',
      role: 'optional' as const,
      state: ollama.running ? 'ready' as const : ollama.installed ? 'standby' as const : 'unavailable' as const,
      acceleration: '由 Ollama 自动选择',
      detail: ollama.running ? `服务已运行：${ollama.endpoint}` : ollama.installed ? '已安装，点击部署时可启动。' : '未检测到 Ollama；可直接使用 XYAI 内置 GGUF 部署。',
    },
  ]
}

export class ModelMarketplaceService {
  readonly ollama = new OllamaClient()

  async snapshot(): Promise<ModelMarketplaceSnapshot> {
    const [hardware, ollamaStatus] = await Promise.all([detectHardware(), detectOllama()])
    const [models, ollamaModels] = await Promise.all([
      getRecommendedModels(hardware.gpu ?? null),
      ollamaStatus.running ? this.ollama.listModels() : Promise.resolve([]),
    ])
    return {
      detectedAt: new Date().toISOString(),
      hardware,
      models,
      localModels: scanLocalGgufModels([nativeModelDirectory()]),
      ollamaStatus,
      ollamaModels,
      backends: backendCapabilities(hardware, ollamaStatus),
    }
  }

  async pullNative(modelId: string, onProgress: (progress: NativeModelDownloadProgress) => void): Promise<string> {
    const snapshot = await this.snapshot()
    const model = snapshot.models.find(candidate => candidate.id === modelId)
    if (model === undefined) throw new Error('该模型不在当前电脑的安全推荐目录中，已拒绝下载。')
    return await downloadNativeModel(model, onProgress)
  }

  async *pullOllama(modelName: string): AsyncIterable<OllamaPullProgress> {
    const status = await detectOllama()
    if (!status.running) throw new Error('Ollama 服务未运行。请先在模型广场启动 Ollama。')
    yield* this.ollama.pullModel(modelName)
  }

  async startOllama(): Promise<OllamaStatus> {
    const current = await detectOllama()
    if (current.running) return current
    if (!current.installed || current.installPath === undefined) throw new Error('未检测到 Ollama。可直接使用“XYAI 本地 GGUF”一键部署。')
    await new Promise<void>((resolve, reject) => {
      const child = spawn(current.installPath!, ['serve'], { detached: true, windowsHide: true, stdio: 'ignore' })
      child.once('error', reject)
      child.once('spawn', () => { child.unref(); resolve() })
    })
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await delay(500)
      const ready = await detectOllama()
      if (ready.running) return ready
    }
    throw new Error('Ollama 已启动，但 12 秒内未就绪。请检查其日志或端口 11434。')
  }

  /**
   * A real, bounded smoke benchmark. The normal conversation path uses the
   * migrated local-GGUF provider, whose adaptive GPU/CPU plan and persistent
   * server are more capable; this check only verifies that a registered file
   * is executable before the user selects it in a conversation.
   */
  async benchmark(filePath: string): Promise<LocalModelBenchmark> {
    const model = scanLocalGgufModels([nativeModelDirectory()]).find(item => item.filePath === filePath)
    if (model === undefined) throw new Error('模型文件不存在、已移动，或不在 XYAI 模型目录中。')
    const executable = embeddedRuntimePath()
    if (!existsSync(executable)) throw new Error('内置 llama.cpp 运行时缺失。')
    const port = await freePort()
    const startedAt = Date.now()
    const child = spawn(executable, [
      '--model', model.filePath, '--host', '127.0.0.1', '--port', String(port), '--ctx-size', '2048',
      '--threads', String(Math.max(1, cpus().length - 1)), '--n-gpu-layers', '0', '--no-webui',
    ], { cwd: dirname(executable), windowsHide: true, stdio: 'ignore' })
    try {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        if (child.exitCode !== null) throw new Error(`llama.cpp 启动失败（退出码 ${String(child.exitCode)}）。`)
        try {
          if ((await fetch(`http://127.0.0.1:${String(port)}/health`, { signal: AbortSignal.timeout(1_000) })).ok) break
        } catch { /* still loading */ }
        await delay(250)
        if (attempt === 119) throw new Error('本地模型加载超过 30 秒，已停止性能测试。')
      }
      const replyStartedAt = Date.now()
      const response = await fetch(`http://127.0.0.1:${String(port)}/v1/chat/completions`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: model.fileName, messages: [{ role: 'user', content: '请只回答：本地模型已就绪。' }], max_tokens: 16, stream: false }),
        signal: AbortSignal.timeout(60_000),
      })
      if (!response.ok) throw new Error(`模型测试失败（HTTP ${String(response.status)}）。`)
      const body = await response.json() as { usage?: { completion_tokens?: number } }
      const elapsedMs = Date.now() - replyStartedAt
      const tokens = Math.max(1, Number(body.usage?.completion_tokens ?? 1))
      return { mode: 'cpu-safe', loadDurationMs: replyStartedAt - startedAt, elapsedMs, tokensPerSecond: Number((tokens / Math.max(0.001, elapsedMs / 1_000)).toFixed(2)) }
    } finally {
      if (!child.killed) child.kill()
    }
  }
}
