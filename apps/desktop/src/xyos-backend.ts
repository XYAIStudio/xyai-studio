/** Spawn the XYAI Studio business backend as a supervised child process. */

import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import type { HostChild } from './host-supervisor.ts'

export interface SpawnXyosOptions {
  /** Node-compatible executable. */
  readonly nodeExecutable: string
  /** XYOS backend directory (contains package.json, server.ts, node_modules). */
  readonly backendDir: string
  /** Frozen environment: PORT / secrets / air-gap mode. */
  readonly env: NodeJS.ProcessEnv
  /** Run a packaged Electron executable through its embedded Node runtime. */
  readonly electronRunAsNode?: boolean
}

/**
 * Spawn the XYOS backend on loopback port 3030.
 * The server emits `xyos backend: http://127.0.0.1:<port>` once ready, which the
 * shared supervisor parses (readinessPrefix `xyos backend: `).
 *
 * 注意：使用 tsx CLI 入口（dist/cli.mjs）而非 `--import tsx/esm`——
 * 后者在 Node v25 下触发 statuses(express 依赖) 的 CJS/ESM interop 崩溃。
 */
export function spawnXyosBackend(options: SpawnXyosOptions): HostChild {
  const tsxCli = join(options.backendDir, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  const env = options.electronRunAsNode
    ? { ...options.env, ELECTRON_RUN_AS_NODE: '1' }
    : options.env
  const process = spawn(
    options.nodeExecutable,
    [tsxCli, 'server.ts'],
    {
      cwd: options.backendDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )
  return nodeChildAdapter(process)
}

/** Adapt Node's event overloads to the supervisor's explicit ownership API. */
function nodeChildAdapter(child: ChildProcessByStdio<null, Readable, Readable>): HostChild {
  return {
    ...(child.pid === undefined ? {} : { pid: child.pid }),
    stdout: { onData(listener) {
      const accept = (chunk: string | Buffer): void => { listener(chunk.toString()) }
      child.stdout.on('data', accept)
      return () => { child.stdout.off('data', accept) }
    } },
    stderr: { onData(listener) {
      const accept = (chunk: string | Buffer): void => { listener(chunk.toString()) }
      child.stderr.on('data', accept)
      return () => { child.stderr.off('data', accept) }
    } },
    onExit(listener) {
      child.on('exit', listener)
      return () => { child.off('exit', listener) }
    },
    onError(listener) {
      child.on('error', listener)
      return () => { child.off('error', listener) }
    },
    kill(signal) {
      child.kill(signal)
    },
  }
}
