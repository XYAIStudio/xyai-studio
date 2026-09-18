import { describe, expect, it } from 'vitest';
import { recommendModels } from './recommend.js';
import type { HardwareProfile } from '@xyai/contracts';

describe('recommendModels', () => {
  it('recommends embeddings and chat for RTX-class 8GB', () => {
    const hw: HardwareProfile = {
      platform: 'win32',
      cpuName: 'Test CPU',
      cpuCores: 16,
      ramTotalMb: 32000,
      gpus: [{ name: 'RTX 5060', vramTotalMb: 8151, vendor: 'nvidia' }],
      primaryVramMb: 8151,
      collectedAt: new Date().toISOString(),
    };
    const rec = recommendModels(hw);
    expect(rec.embedding.length).toBeGreaterThan(0);
    expect(rec.chat.length).toBeGreaterThan(0);
    expect(rec.embedding.some((r) => r.ollamaName.includes('embed') || r.role === 'embedding')).toBe(true);
  });

  it('drops 14B-class chat recs when GPU pressure is elevated', () => {
    const usage = {
      ramTotalMb: 32000,
      ramUsedMb: 26000,
      ramUsedPct: 82,
      gpus: [
        {
          name: 'RTX 5060',
          vendor: 'nvidia' as const,
          vramTotalMb: 8151,
          vramUsedMb: 6800,
          vramUsedPct: 83,
          utilizationPct: 90,
        },
      ],
      pressure: 'elevated' as const,
      collectedAt: new Date().toISOString(),
    };
    const rec = recommendModels({
      platform: 'win32',
      cpuName: 'Test CPU',
      cpuCores: 16,
      ramTotalMb: 32000,
      gpus: [{ name: 'RTX 5060', vramTotalMb: 8151, vendor: 'nvidia' }],
      primaryVramMb: 8151,
      usage,
      collectedAt: new Date().toISOString(),
    });
    expect(rec.chat.every((r) => r.vramHintMb < 8000)).toBe(true);
    expect(rec.chat.some((r) => r.vramHintMb <= 3500)).toBe(true);
  });
});
