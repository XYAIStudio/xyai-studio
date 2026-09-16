/** 模型目录契约 — 本地/云端/Auto；显式版本，禁止裸别名漂移 */

export type ModelProvider = 'local' | 'cloud' | 'auto' | 'harness-builtin';

export interface ModelEntry {
  id: string;
  displayName: string;
  provider: ModelProvider;
  version: string;
  harnessIds: string[];
  capabilities?: string[];
}

export interface ModelCatalog {
  list(): Promise<ModelEntry[]>;
  get(id: string): Promise<ModelEntry | undefined>;
}
