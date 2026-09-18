import type { HardwareGpu, HardwareUsage } from '@xyai/contracts';
import type { ModelHubSnapshot, StartOllamaResult } from '@xyai/model-hub';
import {
  collectModelHubSnapshot,
  detectHardwareUsage,
  installOllama,
  pullOllamaModel,
  shouldRefuseHeavyLocalJob,
  startOllama,
} from '@xyai/model-hub';

export class ModelHubHost {
  private pulling = false;
  private lastGpus: HardwareGpu[] = [];

  constructor(private readonly userDataPath: string) {}

  async snapshot(): Promise<ModelHubSnapshot> {
    const snap = await collectModelHubSnapshot(this.userDataPath);
    this.lastGpus = snap.hardware.gpus || [];
    return snap;
  }

  hardwareUsage(): Promise<HardwareUsage> {
    return detectHardwareUsage(this.lastGpus);
  }

  installDependency(): Promise<{ ok: boolean; message: string }> {
    return installOllama();
  }

  startOllama(): Promise<StartOllamaResult> {
    return startOllama({ timeoutMs: 20000 });
  }

  async pullModel(
    name: string,
    onLine?: (line: string) => void,
  ): Promise<{ ok: boolean; message: string }> {
    if (this.pulling) {
      return { ok: false, message: '已有模型正在拉取，请等待完成后再开始新的下载。' };
    }
    const usage = await detectHardwareUsage(this.lastGpus);
    const guard = shouldRefuseHeavyLocalJob(usage, { modelName: name });
    if (guard.refuse) {
      return { ok: false, message: guard.message || '资源压力过高，已拒绝拉取' };
    }
    this.pulling = true;
    try {
      return await pullOllamaModel(name, onLine);
    } finally {
      this.pulling = false;
    }
  }
}
