import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getRecommendedModels, scanLocalGgufModels } from '../src/model-marketplace/model-marketplace.ts'
import { ModelMarketplaceService } from '../src/model-marketplace/service.ts'

describe('migrated model marketplace assets', () => {
  it('keeps one-click native downloads restricted to a hardware-safe recommendation', async () => {
    const models = await getRecommendedModels({
      name: 'test gpu', vendor: 'nvidia', vramMiB: 8_192, vramFreeMiB: 7_500,
    })
    expect(models.length).toBeGreaterThan(0)
    expect(models.some(model => model.nativeDownload !== undefined)).toBe(true)
    expect(models.every(model => model.minVramMiB <= 8_192)).toBe(true)
  })

  it('discovers a pre-existing GGUF file without requiring a manual registration path', () => {
    const directory = mkdtempSync(join(tmpdir(), 'xyai-model-discovery-'))
    const file = join(directory, 'Qwen3-1.7B-Q4_K_M.gguf')
    try {
      writeFileSync(file, 'xyai test model')
      const models = scanLocalGgufModels([directory])
      expect(models).toEqual(expect.arrayContaining([
        expect.objectContaining({ filePath: file, inferredName: 'Qwen3 1.7B' }),
      ]))
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('detects local hardware and exposes a packaged local inference backend', async () => {
    const snapshot = await new ModelMarketplaceService().snapshot()
    expect(snapshot.hardware.cpuCores).toBeGreaterThan(0)
    expect(snapshot.hardware.memoryGiB).toBeGreaterThan(0)
    expect(snapshot.hardware.memoryFreeMiB).toBeGreaterThanOrEqual(0)
    expect(snapshot.hardware.memoryUsedMiB).toBeGreaterThanOrEqual(0)
    expect(snapshot.backends).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'xyai-native', state: 'ready' }),
    ]))
  })
})
