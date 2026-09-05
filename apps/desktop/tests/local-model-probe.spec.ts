import { describe, expect, it } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { probeLocalModels, streamLocalModelChat } from '../src/xyai-core/local-model-probe.ts'

async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') {
    server.close()
    throw new Error('failed to bind test server')
  }
  try {
    await run('http://127.0.0.1:' + address.port)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
}

describe('W-201 local model probe', () => {
  it('detects a ready Ollama-compatible service without installing anything', async () => {
    await withServer((req, res) => {
      if ((req.url ?? '') === '/api/tags') {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ models: [{ name: 'qwen2.5:0.5b' }, { name: 'llama3.2:1b' }] }))
        return
      }
      res.statusCode = 404
      res.end()
    }, async (baseUrl) => {
      const result = await probeLocalModels(baseUrl)
      expect(result.ready).toBe(true)
      expect(result.models).toContain('qwen2.5:0.5b')
      expect(result.endpoint).toBe(baseUrl)
    })
  })

  it('reports not-ready when the local service is absent', async () => {
    const result = await probeLocalModels('http://127.0.0.1:1', 300)
    expect(result.ready).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('reports not-ready on a non-200 response', async () => {
    await withServer((_req, res) => {
      res.statusCode = 500
      res.end()
    }, async (baseUrl) => {
      const result = await probeLocalModels(baseUrl)
      expect(result.ready).toBe(false)
      expect(result.error).toContain('500')
    })
  })
})

describe('W-201 local model streaming', () => {
  it('streams NDJSON deltas and resolves with the full answer', async () => {
    const pieces = ['本机', '模型', '回答']
    await withServer((req, res) => {
      if ((req.url ?? '') !== '/api/chat') {
        res.statusCode = 404
        res.end()
        return
      }
      res.setHeader('content-type', 'application/x-ndjson')
      for (const piece of pieces) {
        res.write(JSON.stringify({ message: { content: piece }, done: false }) + String.fromCharCode(10))
      }
      res.end(JSON.stringify({ message: { content: '' }, done: true }) + String.fromCharCode(10))
    }, async (baseUrl) => {
      const seen: string[] = []
      const full = await streamLocalModelChat('kb-local', '提问', (delta) => seen.push(delta), baseUrl, 5000)
      expect(full).toBe(pieces.join(''))
      expect(seen).toEqual(pieces)
    })
  })
})
