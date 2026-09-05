/**
 * W-201 本地模型就绪度探测与流式问答编排。
 * 只探测/调用本机回环地址 (127.0.0.1) 上的 Ollama 兼容 HTTP 服务；
 * 不发起任何外网请求，也不接触任何云端凭据。模型不可用时由调用方诚实降级。
 */
import { request as httpRequest, type IncomingMessage } from 'node:http'

export const LOCAL_MODEL_ENDPOINT = 'http://127.0.0.1:11434'

export interface LocalModelProbeResult {
  readonly ready: boolean
  readonly endpoint: string
  readonly models: readonly string[]
  readonly error?: string
  readonly checkedAt: string
}

const DEFAULT_PROBE_TIMEOUT_MS = 1500
const DEFAULT_CHAT_TIMEOUT_MS = 60_000

function endpointTarget(endpoint: string): { host: string; port: number } {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    url = new URL(LOCAL_MODEL_ENDPOINT)
  }
  return { host: url.hostname || '127.0.0.1', port: url.port === '' ? 11434 : Number(url.port) }
}

function requestJson(path: string, timeoutMs: number, endpoint: string): Promise<{ status: number; data: unknown }> {
  const target = endpointTarget(endpoint)
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: target.host, port: target.port, path, method: 'GET', timeout: timeoutMs }, (res: IncomingMessage) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        let data: unknown
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { data = undefined }
        resolve({ status: res.statusCode ?? 0, data })
      })
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('本地模型探测超时')))
    req.on('error', reject)
    req.end()
  })
}

/** 探测本机 Ollama 兼容服务是否就绪，并返回可用模型名（不安装、不下载、不联网）。 */
export async function probeLocalModels(endpoint: string = LOCAL_MODEL_ENDPOINT, timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS): Promise<LocalModelProbeResult> {
  const base: LocalModelProbeResult = { ready: false, endpoint, models: [], checkedAt: new Date().toISOString() }
  try {
    const { status, data } = await requestJson('/api/tags', timeoutMs, endpoint)
    if (status !== 200 || typeof data !== 'object' || data === null) {
      return { ...base, error: '本地模型服务返回 ' + status }
    }
    const rawModels = (data as { models?: unknown }).models
    const models = Array.isArray(rawModels)
      ? rawModels
          .map((entry) => (entry !== null && typeof entry === 'object' ? String((entry as { name?: unknown }).name ?? '') : ''))
          .filter((name) => name !== '')
      : []
    return { ...base, ready: models.length > 0, models }
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) }
  }
}

/** 使用本机模型流式问答，逐段回调 delta，最终返回完整回答；失败抛错由调用方降级。 */
export function streamLocalModelChat(
  model: string,
  prompt: string,
  onDelta: (text: string) => void,
  endpoint: string = LOCAL_MODEL_ENDPOINT,
  timeoutMs: number = DEFAULT_CHAT_TIMEOUT_MS,
): Promise<string> {
  const target = endpointTarget(endpoint)
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('本地模型问答超时'))
    }, timeoutMs)
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    const body = JSON.stringify({
      model,
      stream: true,
      options: { num_ctx: 4096 },
      messages: [{ role: 'user', content: prompt }],
    })
    const req = httpRequest({
      host: target.host,
      port: target.port,
      path: '/api/chat',
      method: 'POST',
      timeout: timeoutMs,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    }, (res: IncomingMessage) => {
      if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
        res.resume()
        finish(() => reject(new Error('本地模型服务返回 ' + (res.statusCode ?? 0))))
        return
      }
      let buffer = ''
      let full = ''
      let finished = false
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => {
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed === '') continue
          try {
            const parsed = JSON.parse(trimmed) as { message?: { content?: string }; done?: boolean }
            const delta = typeof parsed.message?.content === 'string' ? parsed.message.content : ''
            if (delta !== '') { full += delta; onDelta(delta) }
            if (parsed.done === true) finished = true
          } catch { /* 忽略畸形 NDJSON 行 */ }
        }
      })
      res.on('end', () => finish(() => {
        if (!finished && full === '') reject(new Error('本地模型没有返回内容'))
        else resolve(full)
      }))
      res.on('error', (error) => finish(() => reject(error)))
    })
    req.on('timeout', () => {
      req.destroy(new Error('本地模型问答超时'))
    })
    req.on('error', (error) => finish(() => reject(error)))
    req.write(body)
    req.end()
  })
}
