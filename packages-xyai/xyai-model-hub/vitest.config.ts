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
      'packages-xyai/xyai-model-hub/tests/host-backend.host.spec.ts',
      'packages-xyai/xyai-model-hub/tests/native-download.spec.ts',
      'packages-xyai/xyai-model-hub/tests/audit-regressions.spec.ts',
    ],
  },
})
