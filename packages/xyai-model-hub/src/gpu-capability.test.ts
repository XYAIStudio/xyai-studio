import { describe, expect, it } from 'vitest';
import type { HardwareProfile } from '@xyai/contracts';
import { recommendModels } from './recommend.js';
import {
  classifyGpuCapability,
  formatGpuUsageLine,
  gpuAccelHintFor,
  HARDWARE_ADAPT_NOTE,
  recommendTier,
} from './gpu-capability.js';
import { assessHardwarePressure } from './hardware-usage.js';

function profile(
  partial: Pick<HardwareProfile, 'ramTotalMb' | 'gpus' | 'primaryVramMb'> & {
    platform?: string;
  },
): HardwareProfile {
  return {
    platform: partial.platform ?? 'win32',
    cpuName: 'Test CPU',
    cpuCores: 8,
    ramTotalMb: partial.ramTotalMb,
    gpus: partial.gpus,
    primaryVramMb: partial.primaryVramMb,
    collectedAt: new Date().toISOString(),
  };
}

describe('gpu capability + recommend tiers', () => {
  it('8GB RAM no GPU: tiny recs only, CPU path, no CUDA hint', () => {
    const hw = profile({
      ramTotalMb: 8192,
      gpus: [{ name: '未检测到独立 GPU', vramTotalMb: null, vendor: 'other' }],
      primaryVramMb: 0,
    });
    expect(recommendTier(hw)).toBe('small');
    expect(gpuAccelHintFor(hw.gpus)).toBeUndefined();
    const rec = recommendModels(hw);
    expect(rec.chat.every((r) => r.vramHintMb <= 2200)).toBe(true);
    expect(rec.chat.some((r) => r.ollamaName.includes('1.7b'))).toBe(true);
    expect(rec.chat.every((r) => !/14b/i.test(r.ollamaName))).toBe(true);
    expect(rec.chat[0]?.reason).toMatch(/CPU\/Ollama/);
  });

  it('AMD 4GB: small tier, Adrenalin hint, never 14B/7B', () => {
    const gpus = [
      { name: 'Radeon RX 6400', vramTotalMb: 4096, vendor: 'amd' as const },
    ];
    const hw = profile({ ramTotalMb: 16384, gpus, primaryVramMb: 4096 });
    expect(classifyGpuCapability(gpus[0]!)).toBe('discrete');
    expect(recommendTier(hw)).toBe('small');
    expect(gpuAccelHintFor(gpus)).toMatch(/AMD|Adrenalin|ROCm/);
    expect(gpuAccelHintFor(gpus)).not.toMatch(/CUDA|RTX|请安装 CUDA/);
    const rec = recommendModels(hw);
    expect(rec.chat.every((r) => r.vramHintMb <= 2200)).toBe(true);
    expect(rec.chat.every((r) => r.vramHintMb < 5500)).toBe(true);
  });

  it('NVIDIA 8GB: mid tier, 7B ok, never 14B; hint is not CUDA-only', () => {
    const gpus = [
      { name: 'GeForce RTX 5060', vramTotalMb: 8151, vendor: 'nvidia' as const },
    ];
    const hw = profile({ ramTotalMb: 32000, gpus, primaryVramMb: 8151 });
    expect(recommendTier(hw)).toBe('mid');
    const hint = gpuAccelHintFor(gpus);
    expect(hint).toMatch(/NVIDIA/);
    expect(hint).toMatch(/不是唯一/);
    expect(hint).not.toMatch(/^请安装 CUDA/);
    const rec = recommendModels(hw);
    expect(rec.chat.some((r) => r.vramHintMb >= 5000)).toBe(true);
    expect(rec.chat.every((r) => r.vramHintMb < 10000)).toBe(true);
    expect(rec.chat.every((r) => !/14b/i.test(r.ollamaName))).toBe(true);
  });

  it('skips accel hint for Intel iGPU / unknown', () => {
    expect(
      gpuAccelHintFor([
        { name: 'Intel UHD Graphics', vramTotalMb: 128, vendor: 'intel' },
      ]),
    ).toBeUndefined();
    expect(
      gpuAccelHintFor([
        { name: 'AMD Radeon Graphics', vramTotalMb: 512, vendor: 'amd' },
      ]),
    ).toBeUndefined();
    expect(
      gpuAccelHintFor([
        { name: '未检测到独立 GPU', vramTotalMb: null, vendor: 'other' },
      ]),
    ).toBeUndefined();
  });

  it('RAM-only critical when nvidia-smi / util missing', () => {
    expect(
      assessHardwarePressure({
        ramUsedPct: 94,
        gpus: [
          {
            name: '未检测到独立 GPU',
            vendor: 'other',
            vramTotalMb: null,
            vramUsedMb: null,
            vramUsedPct: null,
            utilizationPct: null,
          },
        ],
      }),
    ).toBe('critical');
    expect(
      assessHardwarePressure({
        ramUsedPct: 50,
        gpus: [
          {
            name: 'Radeon RX 6400',
            vendor: 'amd',
            vramTotalMb: 4096,
            vramUsedMb: null,
            vramUsedPct: null,
            utilizationPct: null,
          },
        ],
      }),
    ).toBe('ok');
  });

  it('GPU lines say 暂无利用率数据 instead of empty', () => {
    expect(
      formatGpuUsageLine({
        name: 'Radeon RX 6400',
        vramUsedMb: null,
        vramTotalMb: 4096,
        vramUsedPct: null,
        utilizationPct: null,
      }),
    ).toMatch(/暂无利用率数据/);
    expect(
      formatGpuUsageLine({
        name: '未检测到独立 GPU',
        vramUsedMb: null,
        vramTotalMb: null,
        vramUsedPct: null,
        utilizationPct: null,
      }),
    ).toMatch(/暂无利用率数据/);
    expect(HARDWARE_ADAPT_NOTE).toMatch(/因电脑配置不同/);
  });
});
