/** MCP manifests are data, never executable configuration.  A record starts
 * pending review and this module deliberately has no process-spawning API. */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type McpReviewStatus = 'pending-review' | 'approved' | 'revoked'
export interface ReviewedMcpServer {
  readonly id: string
  readonly name: string
  readonly command: string
  readonly args: readonly string[]
  readonly credentialNames: readonly string[]
  readonly status: McpReviewStatus
  readonly registeredAt: string
  readonly reviewedAt?: string
  readonly reviewer?: string
  readonly reviewNote?: string
}
interface State { readonly schemaVersion: 1; readonly servers: ReviewedMcpServer[] }

function now(): string { return new Date().toISOString() }
function requiredText(value: unknown, label: string): string {
  const result = typeof value === 'string' ? value.trim() : ''
  if (!result) throw new Error(`${label} is required`)
  return result
}
function validateCommand(value: string): string {
  if (!/^[A-Za-z0-9_.:@+\\/-]+$/u.test(value) || value.includes('..')) throw new Error('MCP command contains unsupported characters')
  return value
}
function validateCredentialNames(value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('credentialNames must be an array')
  return [...new Set(value.map(item => requiredText(item, 'credential name')).map(name => {
    if (!/^[A-Z][A-Z0-9_]{1,127}$/u.test(name)) throw new Error('credential names must be environment variable names')
    return name
  }))]
}
async function save(path: string, state: State): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
}

export class McpReviewRegistry {
  private state: State = { schemaVersion: 1, servers: [] }
  constructor(private readonly filePath: string) {}
  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<State>
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.servers)) throw new Error('unsupported MCP review registry')
      this.state = { schemaVersion: 1, servers: parsed.servers }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  list(): readonly ReviewedMcpServer[] { return this.state.servers.map(item => structuredClone(item)) }
  async register(input: { name: unknown; command: unknown; args?: unknown; credentialNames?: unknown }): Promise<ReviewedMcpServer> {
    const name = requiredText(input.name, 'MCP name').slice(0, 120)
    const command = validateCommand(requiredText(input.command, 'MCP command'))
    if (input.args !== undefined && !Array.isArray(input.args)) throw new Error('MCP args must be an array')
    const args = (input.args ?? []).map(item => requiredText(item, 'MCP arg')).slice(0, 32)
    const server: ReviewedMcpServer = { id: `mcp-${randomUUID()}`, name, command, args, credentialNames: validateCredentialNames(input.credentialNames), status: 'pending-review', registeredAt: now() }
    this.state = { schemaVersion: 1, servers: [...this.state.servers, server] }
    await save(this.filePath, this.state)
    return structuredClone(server)
  }
  async review(id: string, input: { reviewer: string; approved: boolean; note?: string }): Promise<ReviewedMcpServer> {
    const server = this.state.servers.find(item => item.id === id)
    if (!server) throw new Error('MCP server is not registered')
    const reviewer = requiredText(input.reviewer, 'reviewer').slice(0, 120)
    const updated: ReviewedMcpServer = { ...server, status: input.approved ? 'approved' : 'revoked', reviewer, reviewedAt: now(), ...(input.note?.trim() ? { reviewNote: input.note.trim().slice(0, 800) } : {}) }
    this.state = { schemaVersion: 1, servers: this.state.servers.map(item => item.id === id ? updated : item) }
    await save(this.filePath, this.state)
    return structuredClone(updated)
  }
}
