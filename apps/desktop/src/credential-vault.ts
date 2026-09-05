/**
 * Desktop-owned credential vault.  XYOS configuration remains tenant scoped,
 * while secret material is encrypted by Electron/Windows and never reaches a
 * renderer or a SQLite backup.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomBytes, timingSafeEqual } from 'node:crypto'

export interface SecretCipher {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

interface VaultDocument {
  readonly schemaVersion: 1
  readonly entries: Record<string, string>
}

function assertCredentialName(name: string): void {
  if (!/^xyos:tenant:\d+:llm_api_key$/u.test(name) && name !== 'ima:client_id' && name !== 'ima:api_key') throw new Error('unsupported credential name')
}

export class CredentialVault {
  private document: VaultDocument = { schemaVersion: 1, entries: {} }
  private ready = false
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly vaultPath: string, private readonly cipher: SecretCipher) {}

  async load(): Promise<void> {
    if (this.ready) return
    try {
      const parsed = JSON.parse(await readFile(this.vaultPath, 'utf8')) as Partial<VaultDocument>
      if (parsed.schemaVersion === 1 && parsed.entries && typeof parsed.entries === 'object') {
        this.document = { schemaVersion: 1, entries: { ...parsed.entries } }
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    this.ready = true
  }

  available(): boolean { return this.cipher.isEncryptionAvailable() }

  async get(name: string): Promise<string | undefined> {
    assertCredentialName(name)
    await this.load()
    if (!this.available()) return undefined
    const encoded = this.document.entries[name]
    return encoded ? this.cipher.decryptString(Buffer.from(encoded, 'base64')) : undefined
  }

  async set(name: string, secret: string): Promise<void> {
    assertCredentialName(name)
    if (!secret.trim()) throw new Error('credential must not be empty')
    await this.load()
    if (!this.available()) throw new Error('operating-system credential encryption is unavailable')
    await this.enqueueWrite(async () => {
      this.document.entries[name] = this.cipher.encryptString(secret).toString('base64')
      await this.persist()
    })
  }

  private async enqueueWrite(operation: () => Promise<void>): Promise<void> {
    const queued = this.writeQueue.then(operation)
    this.writeQueue = queued.catch(() => undefined)
    await queued
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.vaultPath), { recursive: true })
    const temporaryPath = `${this.vaultPath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(this.document)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporaryPath, this.vaultPath)
  }
}

export interface CredentialBroker {
  readonly origin: string
  readonly token: string
  close(): Promise<void>
}

function reply(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    if (chunks.reduce((total, item) => total + item.length, 0) > 32 * 1024) throw new Error('request body too large')
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) as Record<string, unknown> : {}
}

function authorized(req: IncomingMessage, token: string): boolean {
  const supplied = req.headers['x-xyai-credential-token']
  if (typeof supplied !== 'string') return false
  const expectedBytes = Buffer.from(token)
  const suppliedBytes = Buffer.from(supplied)
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes)
}

/** A private loopback bridge. Its random capability is inherited only by XYOS. */
export async function startCredentialBroker(vault: CredentialVault): Promise<CredentialBroker> {
  await vault.load()
  const token = randomBytes(32).toString('base64url')
  const server: Server = createServer(async (req, res) => {
    if (!authorized(req, token)) return reply(res, 401, { error: 'unauthorized' })
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== '/v1/credentials') return reply(res, 404, { error: 'not found' })
    try {
      if (req.method === 'GET') {
        const name = url.searchParams.get('name') ?? ''
        const secret = await vault.get(name)
        return reply(res, 200, { configured: Boolean(secret), ...(secret ? { secret } : {}) })
      }
      if (req.method === 'PUT') {
        const payload = await readJson(req)
        if (typeof payload.name !== 'string' || typeof payload.secret !== 'string') return reply(res, 400, { error: 'name and secret are required' })
        await vault.set(payload.name, payload.secret)
        return reply(res, 200, { configured: true })
      }
      return reply(res, 405, { error: 'method not allowed' })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'credential vault error'
      return reply(res, vault.available() ? 400 : 503, { error: message })
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('credential broker did not bind a loopback port')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    token,
    close: async () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  }
}

