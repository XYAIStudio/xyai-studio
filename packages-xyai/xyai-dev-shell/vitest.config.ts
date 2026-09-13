import { fileURLToPath } from 'node:url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  root: repoRoot,
  plugins: [tsconfigPaths({ projects: [`${repoRoot.replace(/\\/g, '/')}/tsconfig.base.json`] })],
  resolve: { tsconfigPaths: true },
  css: { modules: { classNameStrategy: 'non-scoped' } },
  test: {
    environment: 'jsdom',
    include: [
      'packages-xyai/xyai-dev-shell/tests/interact.spec.ts',
      'packages-xyai/xyai-dev-shell/tests/plugin.client.spec.tsx',
    ],
  },
})
