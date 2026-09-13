/**
 * Local inference probes used by Model Plaza: llama.cpp binary presence and
 * bounded Ollama TTFT plus llama-server cold-start and generation-rate measurements.
 * Missing runtimes stay unavailable; numbers are never invented.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { cpus } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { BenchmarkResult } from './protocol.ts'

const BENCH_PROMPT = '请只回答：本地模型已就绪。'

function nowIso(): string {
  return new Date().toISOString()
}

function displayMs(ms: number | null, suffix: string): string {
  if (ms == null) return '未测'
  return `${(ms / 1000).toFixed(2)} 秒 · ${suffix}`
}

/** Build a benchmark row that is either measured or explicitly unavailable. */
export function benchmarkDisplay(
  partial: Omit<BenchmarkResult, 'display' | 'testedAt'> & { testedAt?: string },
): BenchmarkResult {
  const suffix = partial.simulated ? '模拟' : (partial.unavailable ? '不可用' : '实测')
  return {
    ...partial,
    testedAt: partial.testedAt ?? nowIso(),
    display: {
      firstToken: partial.firstTokenMs == null ? (partial.unavailable ? 'TTFT 不可用' : 'TTFT 未测') : displayMs(partial.firstTokenMs, suffix),
      tokensPerSec: partial.tokensPerSec == null ? (partial.unavailable ? '速度不可用' : '速度未测') : `${partial.tokensPerSec} token/s · ${suffix}`,
      coldStart: partial.coldStartMs == null ? (partial.unavailable ? '冷启动不可用' : '冷启动未测') : displayMs(partial.coldStartMs, suffix),
      peakMemory: partial.peakMemoryMb == null ? '峰值内存未测' : `${partial.peakMemoryMb} MB`,
    },
  }
}

export function unavailableBenchmark(note: string, hardware: string, backend: string): BenchmarkResult {
  return benchmarkDisplay({
    firstTokenMs: null,
    tokensPerSec: null,
    coldStartMs: null,
    peakMemoryMb: null,
    peakVramMb: null,
    context: null,
    backend,
    quant: '',
    hardware,
    simulated: false,
    unavailable: true,
    note,
  })
}

/** Absolute llama-server path when the desktop component is present. */
export function findLlamaServer(): string | undefined {
  const exe = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
  const candidates = [
    process.env.XYAI_COMPONENTS_DIR ? join(process.env.XYAI_COMPONENTS_DIR, 'llama-cpp', exe) : '',
    typeof (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath === 'string'
      ? join((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath!, 'llama-cpp', exe)
      : '',
    join(process.cwd(), 'resources', 'llama-cpp', exe),
    join(process.cwd(), 'apps', 'desktop', 'resources', 'llama-cpp', exe),
  ]
  return candidates.find(p => p !== '' && existsSync(p))
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

/**
 * Measure TTFT via Ollama streaming generate.
 * @param endpoint - Ollama origin, e.g. http://localhost:11434
 * @param model - Ollama tag
 * @param fetchImpl - Injectable fetch for tests
 * @param signal - Cancel the measurement
 */
export async function measureOllamaTtft(
  endpoint: string,
  model: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<BenchmarkResult> {
  const startedAt = Date.now()
  const response = await fetchImpl(`${endpoint.replace(/\/$/, '')}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: BENCH_PROMPT,
      stream: true,
      options: { num_predict: 16, temperature: 0 },
    }),
    ...(signal ? { signal } : {}),
  })
  if (!response.ok || response.body === null) {
    throw new Error(`Ollama 测试失败（HTTP ${String(response.status)}）。`)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let firstTokenMs: number | null = null
  let evalCount: number | null = null
  let evalDurationNs: number | null = null
  let finished = false
  const accept = (line: string) => {
    if (!line.trim()) return
    const data: unknown = JSON.parse(line)
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid Ollama stream record')
    const record = data as Record<string, unknown>
    if (record.error) throw new Error(String(record.error))
    if (firstTokenMs === null && typeof record.response === 'string' && record.response.length > 0) {
      firstTokenMs = Date.now() - startedAt
    }
    if (record.done === true) {
      finished = true
      if (typeof record.eval_count === 'number' && Number.isSafeInteger(record.eval_count) && record.eval_count > 0) evalCount = record.eval_count
      if (typeof record.eval_duration === 'number' && Number.isFinite(record.eval_duration) && record.eval_duration > 0) evalDurationNs = record.eval_duration
    }
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) accept(line)
    }
    accept(buffer + decoder.decode())
    if (!finished || firstTokenMs === null) throw new Error('Ollama stream ended without a complete generated response')
  } finally {
    await reader.cancel().catch(() => undefined) // The transport may already be closed or aborted.
    reader.releaseLock()
  }
  const tokensPerSec = evalCount !== null && evalDurationNs !== null
    ? Number((evalCount / (evalDurationNs / 1e9)).toFixed(2))
    : null
  return benchmarkDisplay({
    firstTokenMs,
    tokensPerSec,
    coldStartMs: null,
    peakMemoryMb: null,
    peakVramMb: null,
    context: null,
    backend: 'Ollama',
    quant: '',
    hardware: 'Ollama runtime',
    simulated: false,
    unavailable: false,
    note: `Ollama generate · ${model}`,
  })
}

/**
 * Measure TTFT by spawning bundled llama-server against a GGUF path.
 * @param executable - llama-server binary
 * @param modelPath - Existing GGUF file
 * @param fetchImpl - Injectable fetch
 * @param signal - Cancel load / generate
 */
export async function measureLlamaCppTtft(
  executable: string,
  modelPath: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<BenchmarkResult> {
  const port = await freePort()
  const startedAt = Date.now()
  const child = spawn(executable, [
    '--model', modelPath, '--host', '127.0.0.1', '--port', String(port),
    '--ctx-size', '2048',
    '--threads', String(Math.max(1, cpus().length - 1)),
    '--n-gpu-layers', '0', '--no-webui',
  ], { cwd: dirname(executable), windowsHide: true, stdio: 'ignore' })
  let spawnError: Error | undefined
  child.once('error', error => { spawnError = error })
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()))
  const abort = () => {
    if (child.exitCode === null && !child.killed) child.kill()
  }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (signal?.aborted) throw new Error('性能测试已取消。')
      if (spawnError) throw spawnError
      if (child.exitCode !== null) throw new Error(`llama.cpp 启动失败（退出码 ${String(child.exitCode)}）。`)
      try {
        if ((await fetchImpl(`http://127.0.0.1:${String(port)}/health`, { signal: AbortSignal.timeout(1_000) })).ok) break
      } catch { /* still loading */ }
      await delay(250)
      if (attempt === 119) throw new Error('本地模型加载超过 30 秒，已停止性能测试。')
    }
    const replyStartedAt = Date.now()
    const response = await fetchImpl(`http://127.0.0.1:${String(port)}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: modelPath,
        messages: [{ role: 'user', content: BENCH_PROMPT }],
        max_tokens: 16,
        stream: false,
      }),
      signal: AbortSignal.any([AbortSignal.timeout(60_000), ...(signal ? [signal] : [])]),
    })
    if (!response.ok) throw new Error(`模型测试失败（HTTP ${String(response.status)}）。`)
    const body = await response.json() as { choices?: { message?: { content?: string } }[]; timings?: { predicted_n?: number; predicted_ms?: number } }
    if (!body.choices?.some(choice => typeof choice.message?.content === 'string' && choice.message.content.length > 0)) throw new Error('llama.cpp returned no generated text')
    const tokens = body.timings?.predicted_n
    const predictedMs = body.timings?.predicted_ms
    return benchmarkDisplay({
      firstTokenMs: null,
      tokensPerSec: typeof tokens === 'number' && Number.isSafeInteger(tokens) && tokens > 0 && typeof predictedMs === 'number' && Number.isFinite(predictedMs) && predictedMs > 0
        ? Number((tokens / (predictedMs / 1000)).toFixed(2)) : null,
      coldStartMs: replyStartedAt - startedAt,
      peakMemoryMb: null,
      peakVramMb: null,
      context: 2048,
      backend: 'llama.cpp',
      quant: '',
      hardware: 'llama-server CPU-safe',
      simulated: false,
      unavailable: false,
      note: 'llama.cpp /v1/chat/completions',
    })
  } finally {
    signal?.removeEventListener('abort', abort)
    abort()
    await closed
  }
}
