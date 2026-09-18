import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  HardwareGpu,
  HardwareGpuUsage,
  HardwarePressure,
  HardwareUsage,
} from '@xyai/contracts';
import { gpuAccelHintFor } from './gpu-capability.js';

export {
  classifyGpuCapability,
  formatGpuUsageLine,
  gpuAccelHintFor,
  HARDWARE_ADAPT_NOTE,
  hasUsefulDiscreteGpu,
  recommendTier,
  usefulVramMb,
} from './gpu-capability.js';

const execFileAsync = promisify(execFile);

async function run(
  cmd: string,
  args: string[],
  timeoutMs = 4000,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      timeout: timeoutMs,
      windowsHide: true,
      encoding: 'utf8',
    });
    return String(stdout ?? '');
  } catch {
    return '';
  }
}

export function parseNvidiaSmiUsage(csv: string): HardwareGpuUsage[] {
  const gpus: HardwareGpuUsage[] = [];
  for (const line of csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 3) continue;
    const name = parts[0]!;
    const total = Number.parseInt(parts[1]!.replace(/[^\d]/g, ''), 10);
    const used = Number.parseInt(parts[2]!.replace(/[^\d]/g, ''), 10);
    const util =
      parts[3] != null
        ? Number.parseInt(parts[3]!.replace(/[^\d]/g, ''), 10)
        : NaN;
    const vramTotalMb = Number.isFinite(total) ? total : null;
    const vramUsedMb = Number.isFinite(used) ? used : null;
    const vramUsedPct =
      vramTotalMb && vramTotalMb > 0 && vramUsedMb != null
        ? Math.round((vramUsedMb / vramTotalMb) * 100)
        : null;
    gpus.push({
      name,
      vendor: 'nvidia',
      vramTotalMb,
      vramUsedMb,
      vramUsedPct,
      utilizationPct: Number.isFinite(util) ? util : null,
    });
  }
  return gpus;
}

export function assessHardwarePressure(input: {
  ramUsedPct: number;
  gpus: HardwareGpuUsage[];
}): HardwarePressure {
  const gpuMax = Math.max(
    0,
    ...input.gpus.map((g) => g.vramUsedPct ?? g.utilizationPct ?? 0),
  );
  if (input.ramUsedPct >= 92 || gpuMax >= 92) return 'critical';
  if (input.ramUsedPct >= 80 || gpuMax >= 80) return 'elevated';
  return 'ok';
}

/** 14B+ class names are treated as heavy pulls under elevated GPU/RAM pressure. */
export function isHeavyLocalModelName(name: string): boolean {
  const n = name.toLowerCase();
  return /\b(1[4-9]b|2[0-9]b|[3-9][0-9]b|70b|72b)\b/.test(n);
}

export function shouldRefuseHeavyLocalJob(
  usage: HardwareUsage,
  opts?: { modelName?: string },
): {
  refuse: boolean;
  message?: string;
} {
  if (usage.pressure === 'critical') {
    return {
      refuse: true,
      message:
        '本机内存或 GPU 显存压力过高，已暂停新的大模型拉取/重任务。请关闭其他占显存程序后再试。',
    };
  }
  if (
    usage.pressure === 'elevated' &&
    opts?.modelName &&
    isHeavyLocalModelName(opts.modelName)
  ) {
    return {
      refuse: true,
      message:
        '当前 GPU/内存占用较高，已暂缓拉取该大模型。请先选更小的模型，或关闭占显存程序后再试。',
    };
  }
  return { refuse: false };
}

export async function detectHardwareUsage(
  knownGpus: HardwareGpu[] = [],
): Promise<HardwareUsage> {
  const ramTotalMb = Math.round(os.totalmem() / (1024 * 1024));
  const ramUsedMb = Math.max(
    0,
    ramTotalMb - Math.round(os.freemem() / (1024 * 1024)),
  );
  const ramUsedPct =
    ramTotalMb > 0 ? Math.round((ramUsedMb / ramTotalMb) * 100) : 0;

  const smi = await run('nvidia-smi', [
    '--query-gpu=name,memory.total,memory.used,utilization.gpu',
    '--format=csv,noheader,nounits',
  ]);
  let gpus = parseNvidiaSmiUsage(smi);
  if (gpus.length === 0) {
    gpus = knownGpus.map((g) => ({
      name: g.name,
      vendor: g.vendor,
      vramTotalMb: g.vramTotalMb,
      vramUsedMb: null,
      vramUsedPct: null,
      utilizationPct: null,
    }));
  }
  if (gpus.length === 0) {
    gpus = [
      {
        name: '未检测到独立 GPU',
        vendor: 'other',
        vramTotalMb: null,
        vramUsedMb: null,
        vramUsedPct: null,
        utilizationPct: null,
      },
    ];
  }

  return {
    ramTotalMb,
    ramUsedMb,
    ramUsedPct,
    gpus,
    pressure: assessHardwarePressure({ ramUsedPct, gpus }),
    gpuAccelHint: gpuAccelHintFor(knownGpus.length ? knownGpus : gpus.map((g) => ({
      name: g.name,
      vramTotalMb: g.vramTotalMb,
      vendor: g.vendor,
    }))),
    collectedAt: new Date().toISOString(),
  };
}
