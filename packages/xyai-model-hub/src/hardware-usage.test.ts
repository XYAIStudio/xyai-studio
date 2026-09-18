import { describe, expect, it } from 'vitest';
import {
  assessHardwarePressure,
  gpuAccelHintFor,
  parseNvidiaSmiUsage,
  shouldRefuseHeavyLocalJob,
} from './hardware-usage.js';

describe('hardware usage', () => {
  it('parses nvidia-smi usage csv', () => {
    const gpus = parseNvidiaSmiUsage('RTX 4060, 8188, 2048, 12');
    expect(gpus[0]?.vramUsedPct).toBe(25);
    expect(gpus[0]?.utilizationPct).toBe(12);
  });

  it('classifies pressure and refuses critical pulls', () => {
    expect(
      assessHardwarePressure({
        ramUsedPct: 50,
        gpus: [{ name: 'x', vendor: 'nvidia', vramTotalMb: 8, vramUsedMb: 2, vramUsedPct: 20, utilizationPct: 10 }],
      }),
    ).toBe('ok');
    const critical = shouldRefuseHeavyLocalJob({
      ramTotalMb: 16000,
      ramUsedMb: 15000,
      ramUsedPct: 94,
      gpus: [],
      pressure: 'critical',
      collectedAt: new Date().toISOString(),
    });
    expect(critical.refuse).toBe(true);
    expect(critical.message).toMatch(/显存|内存/);
  });

  it('hints NVIDIA driver/CUDA without inventing an installer', () => {
    const hint = gpuAccelHintFor([
      { name: 'RTX 4060', vramTotalMb: 8188, vendor: 'nvidia' },
    ]);
    expect(hint).toMatch(/NVIDIA/);
    expect(hint).not.toMatch(/winget|一键安装 CUDA/);
  });
});
