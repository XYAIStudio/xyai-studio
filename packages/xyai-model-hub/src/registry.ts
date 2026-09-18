import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ModelEntry } from '@xyai/contracts';

export class LocalModelRegistry {
  private readonly file: string;

  constructor(userDataPath: string) {
    this.file = path.join(userDataPath, 'model-registry.json');
  }

  load(): ModelEntry[] {
    try {
      if (!existsSync(this.file)) return [];
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as {
        models?: ModelEntry[];
      };
      return Array.isArray(raw.models) ? raw.models : [];
    } catch {
      return [];
    }
  }

  save(models: ModelEntry[]): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(
      this.file,
      JSON.stringify({ updatedAt: new Date().toISOString(), models }, null, 2),
      'utf8',
    );
  }

  /** Merge discovered models into registry by id */
  upsertMany(discovered: ModelEntry[]): ModelEntry[] {
    const map = new Map<string, ModelEntry>();
    for (const m of this.load()) map.set(m.id, m);
    for (const m of discovered) map.set(m.id, { ...map.get(m.id), ...m });
    const all = [...map.values()];
    this.save(all);
    return all;
  }
}
