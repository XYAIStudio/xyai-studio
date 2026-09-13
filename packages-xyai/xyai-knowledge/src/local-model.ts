/** Real Ollama discovery, measurement and semantic distillation. */
import type { LocalModelSelection } from './protocol.ts'

/** JSON artifact written beside extracted text. */
export interface SemanticArtifact {
  schemaVersion: 1
  source: { path: string; size: number; modified: number; sha256: string }
  model: LocalModelSelection
  distilledAt: string
  chunks: Array<{ index: number; summary: string; keywords: string[]; topics: string[]; entities: string[]; questions: string[] }>
}

/** Model runner limits. */
export interface ModelConfig { endpoint: string; benchmarkTimeoutMs: number; modelTimeoutMs: number; chunkChars: number; maxBenchmarkModels: number }
type Fetch = typeof fetch

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error('OLLAMA_INVALID_RESPONSE')
  return value as Record<string, unknown>
}

async function request(fetcher: Fetch, url: string, init: RequestInit, timeoutMs: number, outer?: AbortSignal): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const abort = (): void => controller.abort(outer?.reason)
  outer?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(new Error('OLLAMA_TIMEOUT')), timeoutMs)
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal })
    if (!response.ok) throw new Error(`OLLAMA_HTTP_${response.status}`)
    return record(await response.json())
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener('abort', abort)
  }
}

/** Ollama execution adapter used only by the local knowledge provider. */
export class OllamaModelRunner {
  constructor(private readonly config: ModelConfig, private readonly fetcher: Fetch = fetch) {}

  /** List installed Ollama tags without treating the Ollama binary as model readiness. */
  async list(signal?: AbortSignal): Promise<string[]> {
    const data = await request(this.fetcher, `${this.config.endpoint}/api/tags`, { method: 'GET' }, this.config.benchmarkTimeoutMs, signal)
    if (!Array.isArray(data.models)) throw new Error('OLLAMA_TAGS_INVALID')
    return data.models.flatMap(item => {
      const value = typeof item === 'object' && item !== null ? (item as Record<string, unknown>).name : undefined
      return typeof value === 'string' && value !== '' ? [value] : []
    })
  }

  /** Measure installed candidates with a real generation and select the highest measured throughput. */
  async fastest(signal?: AbortSignal): Promise<LocalModelSelection> {
    const names = (await this.list(signal)).slice(0, this.config.maxBenchmarkModels)
    if (names.length === 0) throw new Error('NO_LOCAL_MODEL')
    const measured: LocalModelSelection[] = []
    for (const name of names) {
      const started = performance.now()
      try {
        const data = await request(this.fetcher, `${this.config.endpoint}/api/generate`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: name, prompt: 'Return JSON: {"ok":true}', stream: false, format: 'json', options: { temperature: 0, num_predict: 8 } }),
        }, this.config.benchmarkTimeoutMs, signal)
        const durationMs = Math.max(1, Math.round(performance.now() - started))
        const count = typeof data.eval_count === 'number' ? data.eval_count : 0
        const duration = typeof data.eval_duration === 'number' ? data.eval_duration : 0
        measured.push({ name, measuredAt: new Date().toISOString(), tokensPerSecond: count > 0 && duration > 0 ? count / (duration / 1e9) : null, durationMs })
      } catch (error) {
        if (signal?.aborted === true) throw error
      }
    }
    if (measured.length === 0) throw new Error('NO_RESPONDING_LOCAL_MODEL')
    return measured.sort((a, b) => (b.tokensPerSecond ?? 0) - (a.tokensPerSecond ?? 0) || a.durationMs - b.durationMs)[0]!
  }

  /** Distill extracted text through the selected model into durable semantic chunks. */
  async distill(input: { text: string; path: string; size: number; modified: number; sha256: string; model: LocalModelSelection }, signal?: AbortSignal): Promise<SemanticArtifact> {
    const chunks: SemanticArtifact['chunks'] = []
    for (let offset = 0, index = 0; offset < input.text.length; offset += this.config.chunkChars, index += 1) {
      const source = input.text.slice(offset, offset + this.config.chunkChars)
      const data = await request(this.fetcher, `${this.config.endpoint}/api/generate`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: input.model.name, stream: false, format: 'json', options: { temperature: 0 },
          prompt: `Extract faithful reusable knowledge from the source. Return only JSON with keys summary (string), keywords (string[]), topics (string[]), entities (string[]), questions (string[]). Do not invent facts.\nSOURCE:\n${source}`,
        }),
      }, this.config.modelTimeoutMs, signal)
      if (typeof data.response !== 'string') throw new Error('OLLAMA_GENERATION_INVALID')
      const parsed = record(JSON.parse(data.response))
      const strings = (key: string): string[] => Array.isArray(parsed[key]) ? parsed[key].filter((item): item is string => typeof item === 'string') : []
      chunks.push({ index, summary: typeof parsed.summary === 'string' ? parsed.summary : '', keywords: strings('keywords'), topics: strings('topics'), entities: strings('entities'), questions: strings('questions') })
    }
    return { schemaVersion: 1, source: { path: input.path, size: input.size, modified: input.modified, sha256: input.sha256 }, model: input.model, distilledAt: new Date().toISOString(), chunks }
  }
}
