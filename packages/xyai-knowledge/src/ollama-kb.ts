/**
 * Optional Ollama helpers for KB: embeddings + short summarize + model pickers.
 * Fail soft when Ollama is unavailable — callers decide whether to block.
 */

const OLLAMA_API = process.env.XYAI_OLLAMA_HOST ?? 'http://127.0.0.1:11434';

export const NO_LOCAL_MODEL_HINT =
  '未检测到可用的本地 Ollama 模型。请先打开「模型」页安装/启动本地模型（对话或嵌入均可），再点「开始解析」。';

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 2000,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function probeOllama(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${OLLAMA_API}/api/tags`, {}, 2000);
    return res.ok;
  } catch {
    return false;
  }
}

export async function listOllamaModelNames(): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(`${OLLAMA_API}/api/tags`, {}, 2000);
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: { name?: string }[] };
    return (data.models || [])
      .map((m) => m.name || '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** True for embed-only / projector / mmproj adapters — not usable as chat. */
export function isNonChatModel(name: string): boolean {
  const n = name.toLowerCase();
  if (n.startsWith('mmproj') || n.includes('mmproj-') || n.includes('/mmproj')) {
    return true;
  }
  if (/projector|clip-vision|vision-encoder/i.test(n)) return true;
  if (/embed|bge-m3|bge-|minilm|nomic-embed|mxbai-embed/i.test(n)) return true;
  return false;
}

/**
 * Size hint in billions of params for sorting fastest-first.
 * Handles: gemma-3-270m-it-q4_k_m → 0.27, qwen3-1.7b → 1.7, qwen2.5:3b → 3,
 * minicpm5-1b-q4_k_m → 1, qwen3.6-35b → 35.
 */
export function sizeHint(name: string): number {
  const n = name.toLowerCase();
  // Million-param tags: 270m, 500m (before matching bare "b")
  const mMatch = n.match(/(?:^|[^a-z0-9])(\d+(?:\.\d+)?)\s*m(?:[^a-z]|$)/i);
  if (mMatch) {
    return parseFloat(mMatch[1]!) / 1000;
  }
  // Billion-param: 1b, 1.7b, 3b, 8b, 12b, 35b (also qwen3-1.7b-q4)
  const bMatch = n.match(/(\d+(?:\.\d+)?)\s*b(?:[^a-z]|$)/i);
  if (bMatch) {
    return parseFloat(bMatch[1]!);
  }
  if (/tiny|mini|small|270m/i.test(n)) return 0.5;
  return 99;
}

export function pickEmbedModel(names: string[]): string | null {
  const prefer = [
    'nomic-embed-text',
    'mxbai-embed-large',
    'bge-m3',
    'all-minilm',
  ];
  for (const pref of prefer) {
    const hit = names.find(
      (n) =>
        !/mmproj/i.test(n) &&
        (n === pref || n.startsWith(pref + ':') || n.includes(pref)),
    );
    if (hit) return hit;
  }
  return (
    names.find(
      (n) =>
        !/mmproj/i.test(n) &&
        /embed|bge-m3|bge-|minilm|nomic-embed|mxbai-embed/i.test(n),
    ) || null
  );
}

export function pickChatModel(names: string[]): string | null {
  return pickFastChatModel(names);
}

/** Models too small for useful silent KB summaries (e.g. gemma 270m). */
export function isToyChatModel(name: string): boolean {
  const n = name.toLowerCase();
  if (/(?:^|[^a-z0-9])270\s*m(?:[^a-z]|$)/i.test(n)) return true;
  if (/tinyllama|qwen2\.5:0\.5b|qwen2\.5:0\.5\b/i.test(n)) return true;
  if (sizeHint(name) > 0 && sizeHint(name) < 1.5) return true;
  return false;
}

/**
 * Prefer smallest *useful* local chat model for distill / silent parse summary.
 * Skips toy models (< ~1.5B / *270m*) when a larger chat model exists.
 * Excludes mmproj-*, embed-only, projector adapters.
 */
export function pickFastChatModel(names: string[]): string | null {
  return pickFastestLocalModel(names);
}

/**
 * Best chat model for silent KB summary — never prefers toy 270m over qwen3:8b.
 */
export function pickBestChatModelForSummary(names: string[]): string | null {
  return pickFastestLocalModel(names);
}

/**
 * Fastest usable local generative model from an Ollama tag list.
 * When any model is ≥ ~1.5B, toy models under 1.5B are excluded.
 */
export function pickFastestLocalModel(names: string[]): string | null {
  let usable = names.filter((n) => n && !isNonChatModel(n));
  if (!usable.length) return null;

  const hasUseful = usable.some((n) => !isToyChatModel(n));
  if (hasUseful) {
    usable = usable.filter((n) => !isToyChatModel(n));
  }

  const preferExact = [
    'qwen2.5:1.5b',
    'qwen3-1.7b',
    'llama3.2:1b',
    'minicpm5-1b',
    'qwen3-5-2b',
    'gemma2:2b',
    'qwen2.5vl:3b',
    'qwen2.5-coder-3b',
    'llama3.2:3b',
    'qwen2.5:3b',
    'gemma3:4b',
    'phi3:mini',
    'qwen3:8b',
    'qwen2.5:7b',
    'llama3.1:8b',
  ];
  for (const p of preferExact) {
    const hit = usable.find(
      (n) =>
        n === p ||
        n.startsWith(p + ':') ||
        n.startsWith(p + '-') ||
        n.toLowerCase().includes(p.toLowerCase()),
    );
    if (hit) return hit;
  }

  const bySize = [...usable].sort((a, b) => {
    const sa = sizeHint(a);
    const sb = sizeHint(b);
    if (sa !== sb) return sa - sb;
    return a.length - b.length;
  });
  return bySize[0] || null;
}

/**
 * Reject repetitive / non-CJK loops from tiny models on Chinese source docs.
 */
export function isAcceptableSummary(
  summary: string,
  sourceText: string,
): boolean {
  const s = (summary || '').trim();
  if (s.length < 8) return false;

  // Phrase repetition: any 12–24 char window appearing ≥3 times
  const windowSizes = [12, 16, 20, 24];
  for (const w of windowSizes) {
    if (s.length < w * 3) continue;
    const counts = new Map<string, number>();
    for (let i = 0; i + w <= s.length; i += Math.max(1, Math.floor(w / 4))) {
      const part = s.slice(i, i + w);
      counts.set(part, (counts.get(part) || 0) + 1);
      if ((counts.get(part) || 0) >= 3) return false;
    }
  }

  // Unique trigram ratio (catches tight loops)
  const grams = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) grams.add(s.slice(i, i + 3));
  if (s.length > 40 && grams.size / Math.max(s.length - 2, 1) < 0.2) {
    return false;
  }

  const sourceCjk = (sourceText.match(/[\u4e00-\u9fff]/g) || []).length;
  const summaryCjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  if (sourceCjk >= 40 && summaryCjk < 4 && s.length > 20) {
    // Chinese source but English-only nonsense loop
    return false;
  }
  return true;
}


export async function ollamaEmbed(
  model: string,
  text: string,
): Promise<number[] | null> {
  try {
    const res = await fetchWithTimeout(
      `${OLLAMA_API}/api/embeddings`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt: text.slice(0, 8000) }),
      },
      15000,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { embedding?: number[] };
    return Array.isArray(data.embedding) ? data.embedding : null;
  } catch {
    return null;
  }
}

export async function ollamaSummarize(
  model: string,
  text: string,
): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      `${OLLAMA_API}/api/generate`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: `用一两句话概括以下文档要点，不要编造：\n\n${text.slice(0, 4000)}`,
          stream: false,
        }),
      },
      45000,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: string };
    return typeof data.response === 'string' ? data.response.trim() : null;
  } catch {
    return null;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
