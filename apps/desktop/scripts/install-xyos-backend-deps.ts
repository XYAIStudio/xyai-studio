/** Install production deps for xyos-backend so packaged node_modules/tsx exists. */

import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function run(command: string, args: readonly string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, env: process.env, stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`)
}

/** Prefer npm ci when lockfile exists; otherwise omit-dev install. */
export function installXyosBackendDeps(): void {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '.')
  const xyosRoot = resolve(desktopRoot, '../../xyos-backend')
  if (!existsSync(resolve(xyosRoot, 'package.json'))) {
    throw new Error(`xyos-backend package.json missing at ${xyosRoot}`)
  }
  const lockfile = resolve(xyosRoot, 'package-lock.json')
  if (existsSync(lockfile)) {
    console.log(`[xyos-backend] npm ci --omit=dev (${xyosRoot})`)
    run('npm', ['ci', '--omit=dev'], xyosRoot)
  } else {
    console.log(`[xyos-backend] npm install --omit=dev (${xyosRoot})`)
    run('npm', ['install', '--omit=dev'], xyosRoot)
  }
  const tsxCli = resolve(xyosRoot, 'node_modules/tsx/dist/cli.mjs')
  if (!existsSync(tsxCli)) {
    throw new Error(`xyos-backend tsx missing after install: ${tsxCli}`)
  }
  console.log(`[xyos-backend] ok: ${tsxCli}`)
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    installXyosBackendDeps()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
