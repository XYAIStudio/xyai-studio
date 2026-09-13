import { defineConfig } from 'tsdown'
import { typertPlugin } from './packages/typert/generator/lib/types/tsdown-plugin.js'

function isBuildFaceClient(value: unknown): boolean {
  if (value === undefined || value === 'host') return false
  if (value === 'client') return true
  throw new Error(`tsdown: --env.DSH_BUILD_FACE must be host or client, received ${String(value)}`)
}

/**
 * The ordinary workspace build consumes JavaScript emitted by the Host
 * TypeScript project and runs Typert. The Client pass selects packages that
 * declare a browser bundle and lets their package-local configs emit both
 * their Node loader entry and browser artifact.
 */
export default defineConfig(({ env }) => {
  const client = isBuildFaceClient(env?.DSH_BUILD_FACE)
  const faceWorkspaces = client
    ? ['vendor/*', 'packages/*/*', 'apps/cli']
    : ['vendor/*', 'packages/*/*', 'apps/cli', 'apps/desktop', 'apps/desktop-host']
  // The monorepo is too large for one workspace bundle on a laptop: release
  // builds slice the workspace into per-top-level batches (see
  // scripts/release-build.mjs) and inject a smaller patterns list per batch.
  const injected = process.env.DSH_TSDOWN_PATTERNS
  const patterns = injected !== undefined && injected !== '' ? JSON.parse(injected) : faceWorkspaces
  const injectedTypertPackages = process.env.DSH_TSDOWN_TYPERT_PACKAGES
  const typertPackages = injectedTypertPackages === undefined || injectedTypertPackages === ''
    ? undefined
    : JSON.parse(injectedTypertPackages) as string[]
  return {
    workspace: {
      patterns,
      // website (vitepress) and the out-of-tree XYAI v0.4 layer build through
      // their own commands; the ordinary workspace tsdown must not touch them.
      exclude: ['website/**', 'packages-xyai/**'],
    },
    entry: client ? '' : ['lib/types/{index,invariant,startup}.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    plugins: client ? [] : [typertPlugin({
      mode: 'workspace',
      faces: ['host'],
      ...(typertPackages === undefined ? {} : { packages: typertPackages }),
    })],
  }
})
