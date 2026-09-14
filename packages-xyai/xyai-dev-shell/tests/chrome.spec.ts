import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  advertiseXyaiSurface,
  canEmbedRemoteFrames,
  isXyaiSurfaceMounted,
  SHELL_CHROME_CSS,
  watchXyaiSurfaces,
} from '../src/client/chrome.ts'

afterEach(() => {
  document.documentElement.removeAttribute('data-xyai-surface-models')
  document.documentElement.removeAttribute('data-xyai-surface-employees')
  document.documentElement.removeAttribute('data-xyai-surface-knowledge')
  vi.unstubAllGlobals()
})

it('treats dsh-app as unable to embed remote frames', () => {
  vi.stubGlobal('location', { protocol: 'dsh-app:' })
  expect(canEmbedRemoteFrames()).toBe(false)
})

it('allows remote frames on ordinary http(s) pages', () => {
  vi.stubGlobal('location', { protocol: 'https:' })
  expect(canEmbedRemoteFrames()).toBe(true)
})

it('advertises and watches product-surface attributes', async () => {
  const seen: boolean[] = []
  const stop = watchXyaiSurfaces(() => seen.push(isXyaiSurfaceMounted('models')))
  expect(isXyaiSurfaceMounted('models')).toBe(false)
  const dispose = advertiseXyaiSurface('models')
  expect(isXyaiSurfaceMounted('models')).toBe(true)
  await vi.waitFor(() => expect(seen).toContain(true))
  dispose()
  expect(isXyaiSurfaceMounted('models')).toBe(false)
  stop()
})

it('stacks footer product-nav without hashed CSS-module class names', () => {
  expect(SHELL_CHROME_CSS).not.toMatch(/p[A-Z]{5}_/)
  expect(SHELL_CHROME_CSS).toContain('[data-slot="sidebar.footer.action"]:has([data-xyai-product-nav])')
  expect(SHELL_CHROME_CSS).toContain('flex-direction: column')
  expect(SHELL_CHROME_CSS).toContain('[data-xyai-interact][data-xyai-empty]')
})

it('surface plugins advertise the attributes ProductNav watches', () => {
  const root = fileURLToPath(new URL('../../..', import.meta.url))
  const model = readFileSync(`${root}/packages-xyai/xyai-model-hub/src/client/index.ts`, 'utf8')
  const knowledge = readFileSync(`${root}/packages-xyai/xyai-knowledge/src/client/plugin.tsx`, 'utf8')
  const employees = readFileSync(`${root}/packages-xyai/xyai-ai-employees/src/client/plugin.tsx`, 'utf8')
  expect(model).toContain("setAttribute('data-xyai-surface-models'")
  expect(knowledge).toContain("setAttribute('data-xyai-surface-knowledge'")
  expect(employees).toContain("setAttribute('data-xyai-surface-employees'")
})
