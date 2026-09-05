/** Freework Ollama 客户端：与 Ollama API 交互（模型列表、下载、删除、健康检查）。 */

import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative, sep } from 'node:path'

/** Ollama 模型信息。 */
export interface OllamaModel {
  /** 模型名称（如 'qwen3-coder:30b'）。 */
  readonly name: string
  /** 模型大小（字节）。 */
  readonly size: number
  /** 修改时间（Unix 毫秒）。 */
  readonly modifiedAt: number
  /** 模型参数详情（如量化格式、上下文长度）。 */
  readonly details: {
    readonly family?: string
    readonly parameterSize?: string
    readonly quantizationLevel?: string
  } | undefined
}

/** Ollama 模型拉取进度。 */
export interface OllamaPullProgress {
  /** 当前状态（如 'pulling manifest', 'downloading'）。 */
  readonly status: string
  /** 已下载字节数。 */
  readonly completed?: number
  /** 总字节数。 */
  readonly total?: number
  /** 进度百分比（0-100）。 */
  readonly percent?: number
}

/** Ollama 模型详情。 */
export interface OllamaModelDetails {
  /** 模型名称。 */
  readonly name: string
  /** 模型参数。 */
  readonly parameters: string | undefined
  /** 模型家族。 */
  readonly family: string | undefined
  /** 量化级别。 */
  readonly quantization: string | undefined
  /** 上下文长度。 */
  readonly contextLength: number | undefined
  /** 模型模板。 */
  readonly template: string | undefined
  /** 系统提示词。 */
  readonly system: string | undefined
}

/** Ollama API 客户端。 */
export class OllamaClient {
  private readonly endpoint: string

  constructor(endpoint: string = 'http://localhost:11434') {
    this.endpoint = endpoint
  }

  /** 获取已安装模型列表。 */
  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await this.get('/api/tags')
      const data = response as { models?: Array<{ name: string; size: number; modified_at: string; details?: unknown }> }
      return (data.models ?? []).map(model => ({
        name: model.name,
        size: model.size,
        modifiedAt: new Date(model.modified_at).getTime(),
        details: model.details as OllamaModel['details'],
      }))
    } catch {
      return this.listManifestModels()
    }
  }

  /** Ollama 未运行时从其本地 manifest 目录恢复可选择的已安装模型。 */
  private listManifestModels(): OllamaModel[] {
    const root = join(homedir(), '.ollama', 'models', 'manifests')
    if (!existsSync(root)) return []
    const files: string[] = []
    const visit = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const target = join(directory, entry.name)
        if (entry.isDirectory()) visit(target)
        else if (entry.isFile()) files.push(target)
      }
    }
    try { visit(root) } catch { return [] }
    return files.flatMap(file => {
      const parts = relative(root, file).split(sep).filter(Boolean)
      if (parts.length < 4) return []
      const tag = parts.at(-1)
      const namespaceStart = parts[1] === 'library' ? 2 : 1
      const model = parts.slice(namespaceStart, -1).join('/')
      if (tag === undefined || model === '') return []
      return [{ name: `${model}:${tag}`, size: 0, modifiedAt: 0, details: undefined }]
    })
  }

  /** 获取模型详情。 */
  async showModel(name: string): Promise<OllamaModelDetails> {
    const response = await this.post('/api/show', { name }) as {
      details?: { parameter_size?: string; family?: string; quantization_level?: string }
      model_info?: { 'llama.context_length'?: number }
      template?: string
      system?: string
    }
    return {
      name,
      parameters: response.details?.parameter_size,
      family: response.details?.family,
      quantization: response.details?.quantization_level,
      contextLength: response.model_info?.['llama.context_length'],
      template: response.template,
      system: response.system,
    }
  }

  /** 将独立 GGUF 文件注册为 Ollama 可调用模型。 */
  async importGguf(model: string, filePath: string): Promise<void> {
    await this.post('/api/create', { model, from: filePath, stream: false })
  }

  /** 拉取模型（流式进度）。 */
  async *pullModel(name: string): AsyncIterable<OllamaPullProgress> {
    const response = await fetch(`${this.endpoint}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, stream: true }),
    })

    if (!response.ok) {
      throw new Error(`Ollama pull 失败：${response.status} ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (reader === undefined) throw new Error('无法读取响应流')

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
          if (line.trim() === '') continue
          try {
            const data = JSON.parse(line) as { status: string; completed?: number; total?: number }
            const progress: OllamaPullProgress = {
              status: data.status,
              ...(data.completed !== undefined ? { completed: data.completed } : {}),
              ...(data.total !== undefined ? { total: data.total } : {}),
              ...(data.completed !== undefined && data.total !== undefined
                ? { percent: Math.round((data.completed / data.total) * 100) }
                : {}),
            }
            yield progress
          } catch { /* 忽略解析错误 */ }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /** 删除模型。 */
  async deleteModel(name: string): Promise<void> {
    await this.delete('/api/delete', { name })
  }

  /** 检查 Ollama 服务健康状态。 */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/`, {
        signal: AbortSignal.timeout(3000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  /** 单次补全(知识库深度解析等宿主批处理使用);非 200 或超时抛错,由调用方回退。 */
  async complete(model: string, system: string, prompt: string, options?: { maxTokens?: number; temperature?: number; timeoutMs?: number }): Promise<string> {
    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        options: { temperature: options?.temperature ?? 0.2, num_predict: options?.maxTokens ?? 900 },
      }),
      signal: AbortSignal.timeout(options?.timeoutMs ?? 150_000),
    })
    if (!response.ok) throw new Error(`Ollama 补全失败(HTTP ${String(response.status)})`)
    const value = await response.json() as { message?: { content?: string } }
    return typeof value.message?.content === 'string' ? value.message.content : ''
  }

  /** 发送 GET 请求。 */
  private async get(path: string): Promise<unknown> {
    const response = await fetch(`${this.endpoint}${path}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) {
      throw new Error(`Ollama API 错误：${response.status} ${response.statusText}`)
    }
    return response.json()
  }

  /** 发送 POST 请求。 */
  private async post(path: string, body: unknown): Promise<unknown> {
    const response = await fetch(`${this.endpoint}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) {
      throw new Error(`Ollama API 错误：${response.status} ${response.statusText}`)
    }
    return response.json()
  }

  /** 发送 DELETE 请求。 */
  private async delete(path: string, body: unknown): Promise<void> {
    const response = await fetch(`${this.endpoint}${path}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) {
      throw new Error(`Ollama API 错误：${response.status} ${response.statusText}`)
    }
  }
}
