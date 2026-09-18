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
} from './ollama.js';
import { recommendModels } from './recommend.js';
import { LocalModelRegistry } from './registry.js';
import type { LocalModelDiscoverySource } from './ollama-discover.js';

export interface ModelHubSnapshot {
  hardware: HardwareProfile;
  ollama: Awaited<ReturnType<typeof getOllamaDependencyStatus>>;
  installed: ModelEntry[];
  registry: ModelEntry[];
  recommendations: ReturnType<typeof recommendModels>;
  discoverySource: LocalModelDiscoverySource;
}

export async function collectModelHubSnapshot(
  userDataPath: string,
): Promise<ModelHubSnapshot> {
  const hardware = await detectHardware();
  let ollama = await getOllamaDependencyStatus();
  if (ollama.installed && !ollama.running) {
    await startOllama({ timeoutMs: 15000 });
    ollama = await getOllamaDependencyStatus();
  }
  const discovered =
    ollama.running || ollama.installed
      ? await discoverOllamaModels()
      : { models: [] as ModelEntry[], source: 'none' as const };
  const installed = discovered.models;
  const registry = new LocalModelRegistry(userDataPath);
  const merged = registry.upsertMany(installed);
  const names = new Set(
    installed.map((m) => m.displayName.replace(/:latest$/, '')),
  );
  for (const m of installed) {
    names.add(m.displayName);
    if (m.displayName.includes(':')) {
      names.add(m.displayName.split(':')[0]!);
    }
  }
  const recommendations = recommendModels(hardware, names);
  return {
    hardware,
    ollama,
    installed,
    registry: merged,
    recommendations,
    discoverySource: discovered.source,
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
  recommendModels,
  LocalModelRegistry,
};
export type { OllamaChatMessage } from './ollama.js';
export type { StartOllamaResult } from './ollama-start.js';
export type { LocalModelDiscoverySource } from './ollama-discover.js';
export {
  formatLocalModelScanResult,
  parseOllamaListOutput,
  modelNameFromManifestPath,
  pickDiscoverySource,
} from './ollama-discover.js';
export {
  OLLAMA_NOT_RUNNING_CODE,
  OLLAMA_NOT_RUNNING_MESSAGE,
  mapOllamaNetworkError,
} from './ollama-errors.js';
export { startOllamaWithDeps } from './ollama-start.js';
export {
  detectHardwareUsage,
  gpuAccelHintFor,
  shouldRefuseHeavyLocalJob,
} from './hardware-usage.js';
