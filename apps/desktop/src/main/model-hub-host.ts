import type { ModelHubSnapshot } from '@xyai/model-hub';
import {
  collectModelHubSnapshot,
  installOllama,
  pullOllamaModel,
} from '@xyai/model-hub';

export class ModelHubHost {
  constructor(private readonly userDataPath: string) {}

  snapshot(): Promise<ModelHubSnapshot> {
    return collectModelHubSnapshot(this.userDataPath);
  }

  installDependency(): Promise<{ ok: boolean; message: string }> {
    return installOllama();
  }

  pullModel(
    name: string,
    onLine?: (line: string) => void,
  ): Promise<{ ok: boolean; message: string }> {
    return pullOllamaModel(name, onLine);
  }
}
