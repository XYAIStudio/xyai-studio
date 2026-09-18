import type {
  HardwareProfile,
  ModelRecommendation,
  ModelRole,
} from '@xyai/contracts';

interface RecDef {
  id: string;
  displayName: string;
  role: ModelRole;
  ollamaName: string;
  vramHintMb: number;
  minRamMb: number;
  priority: number;
  reasonWhenFit: string;
}

/** Curated catalog — sized for consumer NVIDIA laptops / desktops */
const CATALOG: RecDef[] = [
  // embeddings first-class
  {
    id: 'rec-nomic-embed',
    displayName: 'nomic-embed-text（向量）',
    role: 'embedding',
    ollamaName: 'nomic-embed-text',
    vramHintMb: 512,
    minRamMb: 4096,
    priority: 100,
    reasonWhenFit: '轻量通用向量模型，适合知识库检索',
  },
  {
    id: 'rec-bge-m3',
    displayName: 'bge-m3（多语向量）',
    role: 'embedding',
    ollamaName: 'bge-m3',
    vramHintMb: 1500,
    minRamMb: 8192,
    priority: 95,
    reasonWhenFit: '中英多语嵌入更强，适合中文知识库',
  },
  {
    id: 'rec-mxbai-embed',
    displayName: 'mxbai-embed-large（向量）',
    role: 'embedding',
    ollamaName: 'mxbai-embed-large',
    vramHintMb: 1200,
    minRamMb: 8192,
    priority: 90,
    reasonWhenFit: '检索质量较好的英文向嵌入模型',
  },
  // chat / code by VRAM tiers
  {
    id: 'rec-gemma3-4b',
    displayName: 'gemma3:4b',
    role: 'chat',
    ollamaName: 'gemma3:4b',
    vramHintMb: 3500,
    minRamMb: 8192,
    priority: 88,
    reasonWhenFit: '4B 级对话，显存占用低，响应快',
  },
  {
    id: 'rec-qwen25-7b',
    displayName: 'qwen2.5:7b',
    role: 'chat',
    ollamaName: 'qwen2.5:7b',
    vramHintMb: 5500,
    minRamMb: 16384,
    priority: 92,
    reasonWhenFit: '中文对话均衡之选（约 6–8GB 显存）',
  },
  {
    id: 'rec-qwen25-coder-7b',
    displayName: 'qwen2.5-coder:7b',
    role: 'code',
    ollamaName: 'qwen2.5-coder:7b',
    vramHintMb: 5500,
    minRamMb: 16384,
    priority: 91,
    reasonWhenFit: '本地代码助手，适合工程问答与补全',
  },
  {
    id: 'rec-llama31-8b',
    displayName: 'llama3.1:8b',
    role: 'chat',
    ollamaName: 'llama3.1:8b',
    vramHintMb: 6000,
    minRamMb: 16384,
    priority: 85,
    reasonWhenFit: '通用英文向 8B，生态成熟',
  },
  {
    id: 'rec-qwen25-14b',
    displayName: 'qwen2.5:14b',
    role: 'chat',
    ollamaName: 'qwen2.5:14b',
    vramHintMb: 11000,
    minRamMb: 24576,
    priority: 70,
    reasonWhenFit: '更高质量中文，需要约 12GB+ 显存',
  },
  {
    id: 'rec-qwen3-1p7b',
    displayName: 'qwen3:1.7b',
    role: 'chat',
    ollamaName: 'qwen3:1.7b',
    vramHintMb: 2000,
    minRamMb: 8192,
    priority: 80,
    reasonWhenFit: '超轻量，核显/低显存也能跑',
  },
];

export function recommendModels(
  hw: HardwareProfile,
  installedOllamaNames: Set<string> = new Set(),
): {
  chat: ModelRecommendation[];
  embedding: ModelRecommendation[];
  code: ModelRecommendation[];
} {
  const vram = hw.primaryVramMb || 0;
  const ram = hw.ramTotalMb;
  const pressure = hw.usage?.pressure ?? 'ok';
  const slack = pressure === 'critical' ? 0.45 : pressure === 'elevated' ? 0.65 : 0.85;

  const fit = (d: RecDef): boolean => {
    if (ram < d.minRamMb) return false;
    if (pressure === 'critical' && d.vramHintMb >= 4000) return false;
    if (pressure === 'elevated' && d.vramHintMb >= 8000) return false;
    // Allow CPU-offload slack: accept if vram >= 70% of hint OR plenty of system RAM
    if (vram <= 0) return d.vramHintMb <= (pressure === 'ok' ? 3500 : 1800);
    return vram + 1024 >= d.vramHintMb * slack;
  };

  const toRec = (d: RecDef): ModelRecommendation => {
    const installed = [...installedOllamaNames].some(
      (n) => n === d.ollamaName || n.startsWith(d.ollamaName + ':') || n.includes(d.ollamaName),
    );
    return {
      id: d.id,
      displayName: d.displayName + (installed ? '（已安装）' : ''),
      role: d.role,
      reason: installed
        ? `已在本机 Ollama 中检测到；${d.reasonWhenFit}`
        : d.reasonWhenFit + `（估算显存 ~${Math.round(d.vramHintMb / 1024)}GB）`,
      ollamaName: d.ollamaName,
      vramHintMb: d.vramHintMb,
      priority:
        d.priority +
        (installed ? 20 : 0) +
        (pressure !== 'ok' && d.vramHintMb <= 3500 ? 15 : 0),
    };
  };

  const pick = (role: ModelRole, limit: number) =>
    CATALOG.filter((d) => d.role === role && fit(d))
      .map(toRec)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit);

  // Always recommend at least one embedding if any fit; else still suggest nomic
  let embedding = pick('embedding', 3);
  if (embedding.length === 0) {
    embedding = [toRec(CATALOG.find((c) => c.id === 'rec-nomic-embed')!)];
  }

  return {
    chat: pick('chat', 4),
    code: pick('code', 2),
    embedding,
  };
}
