import { defineConfig } from 'tsdown'

/** Bundle the Electron main entry and the sandboxed preload while preserving Electron as a runtime builtin. */
export default defineConfig({
  entry: ['lib/types/main.js', 'lib/types/preload.js', 'lib/types/dsh-preload.js'],
  outDir: 'lib',
  // CJS 输出：Electron 主进程/预加载对 CJS 兼容最稳（ESM 命名导出在部分组合下 interop 失败）
  format: ['cjs'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  deps: { neverBundle: ['electron'] },
})
