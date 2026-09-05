/** Freework Ollama 检测：探测本机 Ollama 安装状态、版本、GPU 信息。 */

import { execFileSync, execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { cpus, freemem, totalmem } from 'node:os'

/** Ollama 安装状态。 */
export interface OllamaStatus {
  /** 是否已安装。 */
  readonly installed: boolean
  /** 是否正在运行（API 可达）。 */
  readonly running: boolean
  /** 版本号（未安装时为 undefined）。 */
  readonly version: string | undefined
  /** API 端点（默认 http://localhost:11434）。 */
  readonly endpoint: string
  /** 安装路径（未找到时为 undefined）。 */
  readonly installPath: string | undefined
}

/** GPU 信息。 */
export interface GpuInfo {
  /** GPU 型号名称。 */
  readonly name: string
  /** 显存总量（MiB）。 */
  readonly vramMiB: number
  /** 显存可用量（MiB）。 */
  readonly vramFreeMiB: number
  /** 当前已用显存（MiB）。 */
  readonly vramUsedMiB?: number
  /** 当前 GPU 利用率（0-100）。 */
  readonly utilizationPercent?: number
  /** GPU 供应商（nvidia/amd/intel/unknown）。 */
  readonly vendor: 'nvidia' | 'amd' | 'intel' | 'unknown'
}

export interface HardwareInfo {
  readonly cpuModel: string
  readonly cpuCores: number
  readonly memoryGiB: number
  /** Available physical memory at the time of the local-model recommendation. */
  readonly memoryFreeMiB: number
  /** Physical memory currently in use.  This is local telemetry only. */
  readonly memoryUsedMiB: number
  readonly gpu: GpuInfo | undefined
}

/** Local-only hardware profile used to rank downloadable GGUF models. */
export async function detectHardware(): Promise<HardwareInfo> {
  const processors = cpus()
  const totalMemoryBytes = totalmem()
  const freeMemoryBytes = freemem()
  return {
    cpuModel: processors[0]?.model.trim() ?? '未知 CPU',
    cpuCores: processors.length,
    memoryGiB: Math.round(totalMemoryBytes / 1024 ** 3),
    memoryFreeMiB: Math.round(freeMemoryBytes / 1024 ** 2),
    memoryUsedMiB: Math.max(0, Math.round((totalMemoryBytes - freeMemoryBytes) / 1024 ** 2)),
    gpu: await detectGpu(),
  }
}

/** 检测 Ollama 安装状态。 */
export async function detectOllama(): Promise<OllamaStatus> {
  const endpoint = process.env.OLLAMA_HOST ?? 'http://localhost:11434'

  // 检查安装路径
  const installPath = findOllamaBinary()

  // 检查版本
  let version: string | undefined
  if (installPath !== undefined) {
    try {
      version = execSync(`"${installPath}" --version`, { encoding: 'utf8', timeout: 5000 }).trim()
      // 提取版本号（格式：ollama version x.y.z）
      const match = version.match(/ollama version (\d+\.\d+\.\d+)/)
      if (match !== null) version = match[1]
    } catch { /* 版本检测失败 */ }
  }

  // 检查 API 是否可达。已运行的服务是版本信息的更可靠来源：
  // GUI 启动的 Electron 进程可能无法继承 Ollama CLI 的 PATH。
  let running = false
  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    })
    running = response.ok
    if (running) {
      try {
        const versionResponse = await fetch(`${endpoint}/api/version`, { signal: AbortSignal.timeout(3000) })
        if (versionResponse.ok) {
          const payload = await versionResponse.json() as { version?: unknown }
          if (typeof payload.version === 'string' && payload.version.trim() !== '') version = payload.version.trim()
        }
      } catch { /* tags 已证明服务可用，版本端点失败不影响运行状态 */ }
    }
  } catch { /* API 不可达 */ }

  return {
    installed: installPath !== undefined,
    running,
    version,
    endpoint,
    installPath,
  }
}

/** 检测 GPU 信息。 */
export async function detectGpu(): Promise<GpuInfo | undefined> {
  // 优先尝试 NVIDIA（nvidia-smi）
  const nvidiaInfo = await detectNvidiaGpu()
  if (nvidiaInfo !== undefined) return nvidiaInfo

  // TODO: 支持 AMD (rocm-smi) 和 Intel GPU
  return undefined
}

/** 检测 NVIDIA GPU。 */
async function detectNvidiaGpu(): Promise<GpuInfo | undefined> {
  const candidates = process.platform === 'win32'
    ? [
        join(process.env.WINDIR ?? 'C:\\Windows', 'System32', 'nvidia-smi.exe'),
        join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'NVIDIA Corporation', 'NVSMI', 'nvidia-smi.exe'),
        'nvidia-smi.exe',
      ]
    : ['nvidia-smi']
  for (const executable of candidates) {
    if (executable.includes('\\') && !existsSync(executable)) continue
    try {
      // Electron/NSIS processes do not always inherit System32 on PATH. Use
      // the absolute Windows driver path first and avoid shell parsing.
      const output = execFileSync(executable, [
        '--query-gpu=name,memory.total,memory.free,memory.used,utilization.gpu',
        '--format=csv,noheader,nounits',
      ], { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim()

      const lines = output.split(/\r?\n/u)
      if (lines.length === 0) continue

      const firstLine = lines[0]
      if (firstLine === undefined) continue

      const parts = firstLine.split(',').map(s => s.trim())
      if (parts.length < 3 || parts[0] === undefined || parts[1] === undefined || parts[2] === undefined) continue
      const vramMiB = Number.parseInt(parts[1], 10); const vramFreeMiB = Number.parseInt(parts[2], 10)
      if (!Number.isFinite(vramMiB) || !Number.isFinite(vramFreeMiB)) continue

      return {
        name: parts[0],
        vramMiB,
        vramFreeMiB,
        ...(parts[3] === undefined ? {} : { vramUsedMiB: Number.parseInt(parts[3], 10) }),
        ...(parts[4] === undefined ? {} : { utilizationPercent: Number.parseInt(parts[4], 10) }),
        vendor: 'nvidia',
      }
    } catch { /* try next known driver location */ }
  }
  return undefined
}

/** 查找 Ollama 二进制路径。 */
function findOllamaBinary(): string | undefined {
  // Windows 常见路径
  if (process.platform === 'win32') {
    const paths = [
      join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Ollama', 'ollama.exe'),
      join(process.env.PROGRAMFILES ?? '', 'Ollama', 'ollama.exe'),
      join(process.env['PROGRAMFILES(X86)'] ?? '', 'Ollama', 'ollama.exe'),
    ]
    for (const p of paths) {
      if (existsSync(p)) return p
    }
  }

  // macOS/Linux：检查 PATH
  try {
    return execSync('which ollama', { encoding: 'utf8', timeout: 3000 }).trim()
  } catch { /* 不在 PATH 中 */ }

  // macOS 常见路径
  if (process.platform === 'darwin') {
    const homebrewPath = '/opt/homebrew/bin/ollama'
    if (existsSync(homebrewPath)) return homebrewPath
  }

  return undefined
}
