import { describe, expect, it, vi } from 'vitest'
import { createCall } from '../src/client/plugin.tsx'

describe('knowledge Client RPC', () => {
  it('returns the value from the DSH result without a second envelope', async () => {
    const rpc = { call: vi.fn().mockResolvedValue({ ok: true, value: { mounts: [] } }) }
    const call = createCall({ rpc } as never)
    await expect(call('snapshot')).resolves.toEqual({ mounts: [] })
    expect(rpc.call).toHaveBeenCalledWith('/xyai-knowledge', 'snapshot', null)
  })

  it('surfaces the Host failure message', async () => {
    const rpc = { call: vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'xyai-knowledge/operation-failed', message: 'source missing', details: {} },
    }) }
    const call = createCall({ rpc } as never)
    await expect(call('precheck', { path: 'Z:/missing' })).rejects.toThrow('source missing')
  })
})
