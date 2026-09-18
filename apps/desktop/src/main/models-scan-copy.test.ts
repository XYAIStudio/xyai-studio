import { describe, expect, it } from 'vitest';
import { formatLocalModelScanResult } from '../renderer/models-scan-copy.js';

describe('formatLocalModelScanResult', () => {
  it('does not say 未发现本地模型 when Ollama is only stopped', () => {
    const msg = formatLocalModelScanResult({
      count: 0,
      installed: true,
      running: false,
    });
    expect(msg).not.toMatch(/未发现本地模型/);
    expect(msg).toMatch(/启动 Ollama/);
  });
});
