import type { ModelHubSnapshot, StartOllamaResult } from '@xyai/model-hub';
import {
  collectModelHubSnapshot,
  installOllama,
  pullOllamaModel,
  startOllama,
} from '@xyai/model-hub';

export class ModelHubHost {
  constructor(private readonly userDataPath: string) {}

  snapshot(): Promise<ModelHubSnapshot> {
    return collectModelHubSnapshot(this.userDataPath);
  }

  installDependency(): Promise<{ ok: boolean; message: string }> {
    return installOllama();
  }

  startOllama(): Promise<StartOllamaResult> {
    return startOllama({ timeoutMs: 20000 });
  }

  pullModel(
    name: string,
    onLine?: (line: string) => void,
  ): Promise<{ ok: boolean; message: string }> {
    return pullOllamaModel(name, onLine);
  }
}
