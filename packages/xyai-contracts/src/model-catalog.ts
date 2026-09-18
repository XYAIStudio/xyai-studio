/** 模型目录契约 — 本地/云端/Auto，形式版本，防止静默漂移 */

export type ModelProvider = 'local' | 'cloud' | 'auto' | 'harness-builtin';

export type ModelRole = 'chat' | 'code' | 'vision' | 'embedding' | 'rerank' | 'other';

export interface ModelEntry {
  id: string;
  displayName: string;
  provider: ModelProvider;
  version: string;
  harnessIds: string[];
  capabilities?: string[];
  /** chat / embedding / … */
  role?: ModelRole;
  /** Approximate VRAM needed in MiB (hint for recommendations) */
  vramHintMb?: number;
  /** Disk size hint in bytes */
  sizeBytes?: number;
  /** Where it was discovered */
  source?: 'ollama' | 'lmstudio' | 'manual' | 'catalog';
  installed?: boolean;
}

export interface ModelCatalog {
  list(): Promise<ModelEntry[]>;
  get(id: string): Promise<ModelEntry | undefined>;
}

export interface HardwareGpu {
  name: string;
  vramTotalMb: number | null;
  vendor: 'nvidia' | 'amd' | 'intel' | 'apple' | 'other';
}

export interface HardwareProfile {
  platform: string;
  cpuName: string;
  cpuCores: number;
  ramTotalMb: number;
  gpus: HardwareGpu[];
  /** Best estimate of usable GPU VRAM for local inference */
  primaryVramMb: number;
  collectedAt: string;
}

export interface ModelRecommendation {
  id: string;
  displayName: string;
  role: ModelRole;
  reason: string;
  ollamaName: string;
  vramHintMb: number;
  priority: number;
}

export interface DependencyStatus {
  id: 'ollama';
  name: string;
  installed: boolean;
  running: boolean;
  version: string | null;
  path: string | null;
  installCommand: string;
}
