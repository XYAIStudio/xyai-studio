import type { HardwareProfile, ModelEntry } from '@xyai/contracts';
import { detectHardware } from './hardware.js';
import {
  getOllamaDependencyStatus,
  installOllama,
  listOllamaModels,
  pullOllamaModel,
  streamOllamaChat,
  probeOllamaApi,
} from './ollama.js';
import { recommendModels } from './recommend.js';
import { LocalModelRegistry } from './registry.js';

export interface ModelHubSnapshot {
  hardware: HardwareProfile;
  ollama: Awaited<ReturnType<typeof getOllamaDependencyStatus>>;
  installed: ModelEntry[];
  registry: ModelEntry[];
  recommendations: ReturnType<typeof recommendModels>;
}

export async function collectModelHubSnapshot(
  userDataPath: string,
): Promise<ModelHubSnapshot> {
  const hardware = await detectHardware();
  const ollama = await getOllamaDependencyStatus();
  const installed = ollama.running || ollama.installed ? await listOllamaModels() : [];
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
  return { hardware, ollama, installed, registry: merged, recommendations };
}

export {
  detectHardware,
  getOllamaDependencyStatus,
  installOllama,
  listOllamaModels,
  pullOllamaModel,
  streamOllamaChat,
  probeOllamaApi,
  recommendModels,
  LocalModelRegistry,
};
export type { OllamaChatMessage } from './ollama.js';
