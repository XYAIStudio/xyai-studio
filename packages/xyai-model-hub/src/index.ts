import type { HardwareProfile, ModelEntry } from '@xyai/contracts';
import { detectHardware } from './hardware.js';
import {
  discoverOllamaModels,
  getOllamaDependencyStatus,
  installOllama,
  listOllamaModels,
  listOllamaModelsFromApi,
  pullOllamaModel,
  streamOllamaChat,
  probeOllamaApi,
  startOllama,
  ensureOllamaRunning,
  createOllamaFromFile,
} from './ollama.js';
import { recommendModels } from './recommend.js';
import { LocalModelRegistry } from './registry.js';
import {
  mergeModelEntries,
  type LocalModelDiscoverySource,
} from './ollama-discover.js';
import {
  scanDiskWeightModels,
  type DiskScanMode,
} from './disk-weights.js';

export interface ModelHubSnapshot {
  hardware: HardwareProfile;
  ollama: Awaited<ReturnType<typeof getOllamaDependencyStatus>>;
  installed: ModelEntry[];
  registry: ModelEntry[];
  recommendations: ReturnType<typeof recommendModels>;
  discoverySource: LocalModelDiscoverySource;
  discoveryCounts: {
    ollama: number;
    disk: number;
    registry: number;
  };
  defaultModelId?: string;
}

export type CollectSnapshotOptions = {
  extraRoots?: string[];
  mode?: DiskScanMode;
  defaultModelId?: string;
};

export async function collectModelHubSnapshot(
  userDataPath: string,
  options: CollectSnapshotOptions = {},
): Promise<ModelHubSnapshot> {
  const hardware = await detectHardware();
  await ensureOllamaRunning({ timeoutMs: 15000 });
  const ollama = await getOllamaDependencyStatus();
  const discovered = await discoverOllamaModels();
  const diskWeights = scanDiskWeightModels({
    extraRoots: options.extraRoots,
    mode: options.mode ?? 'common',
  });
  const registry = new LocalModelRegistry(userDataPath);
  const registered = registry.load();
  const installed = mergeModelEntries([
    discovered.models,
    diskWeights,
    registered,
  ]);
  const names = new Set<string>();
  for (const m of installed) {
    names.add(m.displayName.replace(/:latest$/, ''));
    names.add(m.displayName);
    if (m.displayName.includes(':')) {
      names.add(m.displayName.split(':')[0]!);
    }
  }
  const recommendations = recommendModels(hardware, names);
  const source: LocalModelDiscoverySource =
    discovered.models.length && diskWeights.length
      ? 'mixed'
      : discovered.source;
  return {
    hardware,
    ollama,
    installed,
    registry: registered,
    recommendations,
    discoverySource: source,
    discoveryCounts: {
      ollama: discovered.models.length,
      disk: diskWeights.length,
      registry: registered.length,
    },
    defaultModelId: options.defaultModelId,
  };
}

export {
  detectHardware,
  getOllamaDependencyStatus,
  installOllama,
  listOllamaModels,
  listOllamaModelsFromApi,
  pullOllamaModel,
  streamOllamaChat,
  probeOllamaApi,
  startOllama,
  ensureOllamaRunning,
  discoverOllamaModels,
  createOllamaFromFile,
  recommendModels,
  LocalModelRegistry,
};
export type { OllamaChatMessage } from './ollama.js';
export type { StartOllamaResult } from './ollama-start.js';
export type { LocalModelDiscoverySource } from './ollama-discover.js';
export type { DiskScanMode } from './disk-weights.js';
export {
  formatLocalModelScanResult,
  parseOllamaListOutput,
  modelNameFromManifestPath,
  pickDiscoverySource,
  mergeModelEntries,
  normalizeOllamaInventoryKey,
} from './ollama-discover.js';
export {
  DISK_WEIGHT_CAP,
  commonModelRoots,
  extraManualScanRoots,
  fullDiskScanRoots,
  scanDiskWeightModels,
  walkWeightHits,
  weightFileToEntry,
  isProjectorWeightName,
  sanitizeOllamaCreateName,
} from './disk-weights.js';
export {
  registerLocalModel,
  speedTestOllamaModel,
  tokensPerSecFromOllamaGenerate,
  formatSpeedTestMessage,
  ollamaNameForRegister,
} from './model-ops.js';
export type { RegisterModelInput, RegisterModelResult, SpeedTestResult } from './model-ops.js';
export {
  OLLAMA_NOT_RUNNING_CODE,
  OLLAMA_NOT_RUNNING_MESSAGE,
  mapOllamaNetworkError,
  missingOllamaModelMessage,
  ollamaTagsIncludeModel,
  explainOllamaHttpFailure,
} from './ollama-errors.js';
export { startOllamaWithDeps } from './ollama-start.js';
export {
  detectHardwareUsage,
  gpuAccelHintFor,
  isHeavyLocalModelName,
  shouldRefuseHeavyLocalJob,
} from './hardware-usage.js';
export {
  classifyGpuCapability,
  formatGpuUsageLine,
  HARDWARE_ADAPT_NOTE,
  hasUsefulDiscreteGpu,
  recommendTier,
  usefulVramMb,
} from './gpu-capability.js';
