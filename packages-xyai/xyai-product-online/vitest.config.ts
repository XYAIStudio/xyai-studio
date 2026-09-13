import { fileURLToPath } from 'node:url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  root: repoRoot,
  plugins: [tsconfigPaths({ projects: [`${repoRoot.replace(/\\/g, '/')}/tsconfig.base.json`] })],
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['packages-xyai/xyai-product-online/tests/**/*.spec.{ts,tsx}'],
  },
})
