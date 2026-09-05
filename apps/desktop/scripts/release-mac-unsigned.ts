/** Build an unsigned macOS DMG for internal distribution (no Apple signing/notarization). */

import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function run(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`)
}

/** Package macOS DMG without code signing or notarization. Skips release-preflight. */
export function releaseMacUnsigned(): void {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const env: NodeJS.ProcessEnv = { ...process.env }
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  console.log('macOS unsigned build: CSC_IDENTITY_AUTO_DISCOVERY=false; no signing/notarization')
  run('pnpm', ['--workspace-root', 'run', 'build'], desktopRoot, env)
  run('pnpm', ['run', 'build'], desktopRoot, env)
  run('node', ['--import', 'tsx', 'scripts/stage-runtime.ts'], desktopRoot, env)
  run('pnpm', [
    'exec', 'electron-builder', '--mac', 'dmg',
    '--config.forceCodeSigning=false', '--config.mac.notarize=false', '--config.mac.identity=null',
  ], desktopRoot, env)
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    releaseMacUnsigned()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
