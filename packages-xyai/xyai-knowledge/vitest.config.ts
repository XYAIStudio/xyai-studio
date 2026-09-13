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
    environment: 'node',
    include: [
      'packages-xyai/xyai-knowledge/tests/store.host.spec.ts',
      'packages-xyai/xyai-knowledge/tests/page.client.spec.tsx',
      'packages-xyai/xyai-knowledge/tests/plugin.client.spec.ts',
      
    ],
  },
})

