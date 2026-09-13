/**
 * Model-hub wire facts shared by Host and browser halves: the Connection
 * channel this plugin owns, the envelope every endpoint returns, and the
 * structured task-snapshot shapes Host emits.
 */

/** Logical Connection channel: the Host registers it, the browser half calls it. */
export const MODEL_HUB_CHANNEL = '/xyai-model-hub'

/**
 * Envelope every model-hub endpoint returns. Each endpoint adds its own fields;
 * `errcode === '0'` marks success and every other value carries `errmsg`.
 */
export interface ModelHubEnvelope {
  /** `'0'` on success; a refusal code on failure. */
  errcode?: string
  /** Operator-readable failure reason; empty on success. */
  errmsg?: string
  /**
   * `true` when the answer (or parts of it) is simulated / demo-shaped.
   * Real OS inspect, disk scan, and Host-settings persistence clear this where applicable.
   */
  stub?: boolean
}

/** Long-running Host work the browser half re-reads as a snapshot. */
export interface TaskSnapshot {
  /** Stable id for pause / resume / cancel / reconnect. */
  taskId: string
  /** Task family matching setup-plan verbs. */
  kind: 'environment' | 'scan' | 'download' | 'benchmark' | 'registry'
  /** Current stage (connecting / downloading / verifying / registering / …). */
  phase: string
  /** 0–100 progress. */
  percent: number
  /** Operator-facing label (model name, disk list, …). */
  label: string
  /** Recoverable error text when phase is failed. */
  error?: string
  /** Whether the operator can resume or retry from this snapshot. */
  recoverable?: boolean
  /** True when progress / result is simulated rather than measured. */
  stub: boolean
  /** ISO timestamp of the last Host mutation. */
  updatedAt: string
  /** Optional model / catalog id the task targets. */
  modelId?: string
  /** Optional path or node hint shown in the UI. */
  detail?: string
  /** Stage labels for multi-step prepare / download UIs. */
  stages?: { id: string; title: string; done: boolean }[]
}

/** Hardware / runtime inspect answer. */
export interface EnvironmentInspect extends ModelHubEnvelope {
  inspectedAt: string
  platform: string
  arch: string
  cpu: string
  cpuCores: number | null
  memoryGb: number | null
  memoryFreeGb: number | null
  gpu: string | null
  vramGb: number | null
  freeDiskGb: number | null
  runtime: {
    gguf: 'ready' | 'installed' | 'missing' | 'unknown'
    ollama: 'running' | 'installed' | 'missing' | 'unknown'
    ollamaVersion?: string
    ollamaEndpoint?: string
  }
  /** True when CPU/RAM/platform came from Node `os.*`. */
  realOs: boolean
  /** True when GPU came from nvidia-smi (or similar); false if unknown. */
  realGpu: boolean
  notes: string[]
}

/** One recommended / discoverable model card. */
export interface RecommendModel {
  id: string
  name: string
  vendor: string
  origin: '国内' | '国外' | string
  use: string
  size: string
  vram: string
  license: string
  reason: string
  tag: string
  quant?: string
  file?: string
  /** Allow-listed Hugging Face GGUF used by one-click download. */
  nativeDownload?: {
    repository: string
    fileName: string
    expectedSizeMiB: number
  }
}

/** One local registry row. */
export interface RegistryEntry {
  id: string
  name: string
  kind: 'GGUF' | 'Ollama' | string
  size: string
  path: string
  mounted: boolean
  missing: boolean
  isDefault?: boolean
  source?: 'scan' | 'download' | 'manual' | 'ollama' | string
  /** Last measured (or unavailable) performance row shown on the local list. */
  lastBenchmark?: {
    firstTokenMs: number | null
    tokensPerSec: number | null
    testedAt: string
    backend: string
    unavailable?: boolean
    note?: string
  }
}

/** Cloud provider row; never echoes the secret. */
export interface CloudProvider {
  id: string
  name: string
  base: string
  /** Whether a key has been configured (boolean only — no secret). */
  keyConfigured: boolean
  models: { id: string; name: string; call: string; custom?: boolean; lastTest?: string }[]
}

/** Structured benchmark result — fields marked simulated must say so. */
export interface BenchmarkResult {
  firstTokenMs: number | null
  tokensPerSec: number | null
  coldStartMs: number | null
  peakMemoryMb: number | null
  peakVramMb: number | null
  context: number | null
  backend: string
  quant: string
  hardware: string
  testedAt: string
  /** True when numbers are demo/simulated, not measured. */
  simulated: boolean
  /** True when the runtime is missing or the measurement could not run. */
  unavailable?: boolean
  note: string
  /** Display strings for the plaza cards. */
  display: {
    firstToken: string
    tokensPerSec: string
    coldStart: string
    peakMemory: string
  }
}
