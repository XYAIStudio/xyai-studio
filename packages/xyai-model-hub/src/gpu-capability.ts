import type { HardwareGpu, HardwareProfile } from '@xyai/contracts';

export type GpuCapability = 'discrete' | 'igpu' | 'unknown';
export type RecommendTier = 'small' | 'mid' | 'high';

/** Classify a controller so iGPU / unknown never look like an RTX. */
export function classifyGpuCapability(gpu: HardwareGpu): GpuCapability {
  const name = gpu.name.toLowerCase();
  if (
    /integrated\s*\/\s*unknown|未检测|unknown gpu|basic display/.test(name)
  ) {
    return 'unknown';
  }
  if (
    /uhd|iris xe|iris plus|\bhd graphics\b|radeon graphics|vega \d+ graphics/.test(
      name,
    ) &&
    !/\brx\b|\barc\b|\brtx\b|\bgtx\b|geforce/.test(name)
  ) {
    return 'igpu';
  }
  if (gpu.vendor === 'apple') return 'discrete';
  if (gpu.vendor === 'nvidia' || /\brtx\b|\bgtx\b|geforce|quadro/.test(name)) {
    return 'discrete';
  }
  if (/\barc\b/.test(name)) return 'discrete';
  if (gpu.vendor === 'intel') return 'igpu';
  if (gpu.vendor === 'amd') {
    if (/\brx\b|radeon pro/.test(name) || (gpu.vramTotalMb ?? 0) >= 2048) {
      return 'discrete';
    }
    return 'igpu';
  }
  if ((gpu.vramTotalMb ?? 0) >= 4096) return 'discrete';
  if ((gpu.vramTotalMb ?? 0) > 0) return 'igpu';
  return 'unknown';
}

export function hasUsefulDiscreteGpu(gpus: HardwareGpu[]): boolean {
  return gpus.some((g) => classifyGpuCapability(g) === 'discrete');
}

/** Usable VRAM for local inference; iGPU / missing GPU → 0 (CPU/Ollama path). */
export function usefulVramMb(gpus: HardwareGpu[]): number {
  const discrete = gpus.filter((g) => classifyGpuCapability(g) === 'discrete');
  if (!discrete.length) return 0;
  const withMb = discrete
    .map((g) => g.vramTotalMb ?? 0)
    .filter((n) => n > 0);
  return withMb.length ? Math.max(...withMb) : 0;
}

/**
 * small: ≤8GB RAM, ≤4GB discrete VRAM, or no useful GPU
 * mid: typical 8GB NVIDIA / 16GB+ RAM
 * high: ≥12GB VRAM and ≥24GB RAM (14B-class)
 */
export function recommendTier(hw: Pick<HardwareProfile, 'ramTotalMb' | 'gpus' | 'primaryVramMb' | 'platform'>): RecommendTier {
  const ram = hw.ramTotalMb;
  let vram = usefulVramMb(hw.gpus);
  const apple = hw.gpus.some((g) => g.vendor === 'apple') || hw.platform === 'darwin';
  if (vram <= 0 && apple && hasUsefulDiscreteGpu(hw.gpus)) {
    // Unified memory — do not invent a desktop dGPU size.
    vram = ram >= 32768 ? 16000 : ram >= 16384 ? 8000 : 2048;
  }
  if (ram <= 8192) return 'small';
  if (vram <= 4096) return 'small';
  if (vram >= 12000 && ram >= 24576) return 'high';
  return 'mid';
}

export function gpuAccelHintFor(gpus: HardwareGpu[]): string | undefined {
  if (!hasUsefulDiscreteGpu(gpus)) return undefined;
  const discrete = gpus.filter((g) => classifyGpuCapability(g) === 'discrete');
  const nvidia = discrete.filter((g) => g.vendor === 'nvidia');
  const amd = discrete.filter((g) => g.vendor === 'amd');
  const intel = discrete.filter((g) => g.vendor === 'intel');
  const apple = discrete.filter((g) => g.vendor === 'apple');
  if (nvidia.length) {
    return '已检测到独立 NVIDIA GPU。Ollama 会尽量走 GPU；请先确认驱动可用（nvidia-smi）。CUDA/cuBLAS 只是可选文档路径，不是唯一加速方式，Studio 不会代为安装。';
  }
  if (amd.length) {
    return '已检测到独立 AMD GPU。请安装/更新 AMD Adrenalin 驱动。Linux 上 Ollama 可走 ROCm（见 ollama.com）；Studio 不会代为下载安装包。';
  }
  if (intel.length) {
    return '已检测到独立 Intel GPU（如 Arc）。请安装/更新 Intel 显卡驱动；本地加速取决于 Ollama 对该设备的支持。Studio 不会代为下载安装包。';
  }
  if (apple.length) {
    return '已检测到 Apple GPU。Ollama 可走 Metal（非 CUDA）。Studio 不会代为安装额外工具包。';
  }
  return undefined;
}

export function formatGpuUsageLine(g: {
  name: string;
  vramUsedMb: number | null;
  vramTotalMb: number | null;
  vramUsedPct: number | null;
  utilizationPct: number | null;
}): string {
  const hasLive = g.vramUsedMb != null && g.vramTotalMb != null;
  const vram = hasLive
    ? `显存 ${(g.vramUsedMb! / 1024).toFixed(1)}/${(g.vramTotalMb! / 1024).toFixed(1)} GB（${g.vramUsedPct ?? 0}%）`
    : g.vramTotalMb != null
      ? `显存约 ${(g.vramTotalMb / 1024).toFixed(1)} GB · 暂无利用率数据`
      : '暂无利用率数据';
  const util =
    g.utilizationPct != null && hasLive ? ` · 利用率 ${g.utilizationPct}%` : '';
  return `GPU ${g.name}：${vram}${util}`;
}

export const HARDWARE_ADAPT_NOTE =
  '因电脑配置不同，推荐与限流会自动调整';
