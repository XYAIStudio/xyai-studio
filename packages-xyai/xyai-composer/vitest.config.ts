import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  css: { modules: { classNameStrategy: 'non-scoped' } },
  test: {
    environment: 'jsdom',
    include: ['packages-xyai/xyai-composer/tests/**/*.spec.{ts,tsx}'],
  },
})
