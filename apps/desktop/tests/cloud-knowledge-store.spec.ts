import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CredentialVault, type SecretCipher } from '../src/credential-vault.ts'
import { CloudKnowledgeStore } from '../src/xyai-core/cloud-knowledge-store.ts'

const cipher: SecretCipher = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(value, 'utf8'),
  decryptString: (value) => value.toString('utf8'),
}

let dir: string
let vault: CredentialVault
let store: CloudKnowledgeStore

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'xyai-cloud-kb-'))
  vault = new CredentialVault(join(dir, 'vault.json'), cipher)
  await vault.load()
  store = new CloudKnowledgeStore(join(dir, 'cloud.json'), vault)
  await store.load()
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('W-106 云知识库挂接注册表', () => {
  it('未配置凭据时 hasCredentials 为 false', async () => {
    expect(await store.hasCredentials()).toBe(false)
  })

  it('保存凭据后 hasCredentials 为 true 且 credentials 可读回', async () => {
    await store.setCredentials('cid-1', 'secret-1')
    expect(await store.hasCredentials()).toBe(true)
    const cred = await store.credentials()
    expect(cred?.clientId).toBe('cid-1')
    expect(cred?.apiKey).toBe('secret-1')
  })

  it('add 登记挂接且重复挂接返回同一实例', async () => {
    const first = await store.add('kb-1', '产品资料库')
    expect(first.kind).toBe('ima')
    expect(store.list()).toHaveLength(1)
    const second = await store.add('kb-1', '换个名字')
    expect(second.id).toBe(first.id)
    expect(store.list()).toHaveLength(1)
  })

  it('remove 解除挂接', async () => {
    const mount = (await store.add('kb-2', '会议纪要库'))
    await store.remove(mount.id)
    expect(store.list().some((item) => item.id === mount.id)).toBe(false)
  })

  it('answer/listItems 对不存在或未配置的挂接诚实报错', async () => {
    await expect(store.answer('missing-id', '问题')).rejects.toThrow('不存在或已解除挂接')
    await store.add('kb-3', '空库')
    const emptyVault = new CredentialVault(join(dir, 'empty.json'), cipher)
    await emptyVault.load()
    const bareStore = new CloudKnowledgeStore(join(dir, 'bare.json'), emptyVault)
    await bareStore.load()
    const bareMount = await bareStore.add('kb-3', '空库')
    await expect(bareStore.listItems(bareMount.id)).rejects.toThrow('尚未连接 ima')
  })
})
