import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CredentialVault, startCredentialBroker, type SecretCipher } from '../src/credential-vault.ts'

const temporaryDirectories: string[] = []
const cipher: SecretCipher = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
  decryptString: (value) => value.toString('utf8').replace(/^encrypted:/u, ''),
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'xyai-vault-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('desktop credential vault', () => {
  it('keeps an XYOS key encrypted at rest and only exposes it to an authorized loopback client', async () => {
    const directory = await temporaryDirectory()
    const vault = new CredentialVault(join(directory, 'runtime', 'xyai', 'credential-vault.json'), cipher)
    const broker = await startCredentialBroker(vault)
    try {
      const name = 'xyos:tenant:7:llm_api_key'
      const unauthorized = await fetch(`${broker.origin}/v1/credentials?name=${encodeURIComponent(name)}`)
      expect(unauthorized.status).toBe(401)
      const saved = await fetch(`${broker.origin}/v1/credentials`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-xyai-credential-token': broker.token },
        body: JSON.stringify({ name, secret: 'very-secret-key' }),
      })
      expect(saved.status).toBe(200)
      const loaded = await fetch(`${broker.origin}/v1/credentials?name=${encodeURIComponent(name)}`, {
        headers: { 'x-xyai-credential-token': broker.token },
      })
      expect(await loaded.json()).toMatchObject({ configured: true, secret: 'very-secret-key' })
      const stored = await readFile(join(directory, 'runtime', 'xyai', 'credential-vault.json'), 'utf8')
      expect(stored).not.toContain('very-secret-key')
      expect(await vault.get(name)).toBe('very-secret-key')
    } finally {
      await broker.close()
    }
  })

  it('serializes concurrent tenant writes so neither credential is lost', async () => {
    const directory = await temporaryDirectory()
    const vault = new CredentialVault(join(directory, 'credential-vault.json'), cipher)
    await Promise.all([
      vault.set('xyos:tenant:1:llm_api_key', 'tenant-one'),
      vault.set('xyos:tenant:2:llm_api_key', 'tenant-two'),
    ])
    expect(await vault.get('xyos:tenant:1:llm_api_key')).toBe('tenant-one')
    expect(await vault.get('xyos:tenant:2:llm_api_key')).toBe('tenant-two')
  })
})
