/**
 * Hub ops: 注册 (GGUF → ollama create, or tag → registry) and 测速.
 */

import type { ModelEntry } from '@xyai/contracts';
import { isProjectorWeightName, sanitizeOllamaCreateName } from './disk-weights.js';
import { createOllamaFromFile } from './ollama.js';
import { LocalModelRegistry } from './registry.js';
import { toOllamaModelEntry } from './ollama-discover.js';

const OLLAMA_API = process.env.XYAI_OLLAMA_HOST ?? 'http://127.0.0.1:11434';

export type RegisterModelInput = {
  id?: string;
  displayName?: string;
  source?: string;
  path?: string;
};

export type RegisterModelResult = {
  ok: boolean;
  message: string;
  entry?: ModelEntry;
};

export type SpeedTestResult = {
  ok: boolean;
  message: string;
  tokensPerSec?: number;
  elapsedMs?: number;
  evalCount?: number;
};

export function ollamaNameForRegister(input: RegisterModelInput): string {
  const raw =
    (input.displayName || input.id || '')
      .replace(/^(ollama|gguf|ggml|huggingface):/i, '')
      .trim() || 'local-gguf';
  return sanitizeOllamaCreateName(raw);
}

export async function registerLocalModel(
  userDataPath: string,
  input: RegisterModelInput,
): Promise<RegisterModelResult> {
  const display = (input.displayName || input.id || '').trim();
  if (!display && !input.path) {
    return { ok: false, message: '缺少模型 id 或权重路径' };
  }
  if (
    (input.path && isProjectorWeightName(input.path)) ||
    isProjectorWeightName(display)
  ) {
    return {
      ok: false,
      message: '该文件是 mmproj 投影器，不能作为对话模型注册。请注册同目录下的主 GGUF。',
    };
  }

  const registry = new LocalModelRegistry(userDataPath);
  const name = ollamaNameForRegister(input);
  const isGguf =
    Boolean(input.path) ||
    input.source === 'gguf' ||
    input.source === 'huggingface' ||
    (input.id || '').startsWith('gguf:') ||
    (input.id || '').startsWith('huggingface:');

  if (isGguf && input.path) {
    const created = await createOllamaFromFile(name, input.path);
    if (!created.ok) return created;
    const entry = toOllamaModelEntry(name, {
      source: 'ollama',
      path: input.path,
    });
    registry.register(entry);
    return { ok: true, message: created.message, entry };
  }

  const tagName = (input.id || '').startsWith('ollama:')
    ? (input.id || '').slice('ollama:'.length)
    : name;
  const entry = toOllamaModelEntry(tagName, { source: 'ollama', path: input.path });
  registry.register(entry);
  return { ok: true, message: `已写入本地注册表：${entry.displayName}`, entry };
}

export function tokensPerSecFromOllamaGenerate(body: {
  eval_count?: number;
  eval_duration?: number;
  total_duration?: number;
}): { tokensPerSec: number; elapsedMs: number; evalCount: number } | null {
  const evalCount = Number(body.eval_count ?? 0);
  const evalNs = Number(body.eval_duration ?? 0);
  const totalNs = Number(body.total_duration ?? 0);
  const ns = evalNs > 0 ? evalNs : totalNs;
  if (evalCount <= 0 || ns <= 0) return null;
  const elapsedMs = ns / 1e6;
  const tokensPerSec = evalCount / (ns / 1e9);
  return { tokensPerSec, elapsedMs, evalCount };
}

export function formatSpeedTestMessage(r: {
  tokensPerSec: number;
  elapsedMs: number;
  evalCount: number;
}): string {
  return `测速完成：${r.tokensPerSec.toFixed(1)} tok/s（${r.evalCount} tokens / ${(r.elapsedMs / 1000).toFixed(2)}s）`;
}

export async function speedTestOllamaModel(modelRef: string): Promise<SpeedTestResult> {
  const model = modelRef.replace(/^ollama:/i, '').trim();
  if (!model) return { ok: false, message: '缺少模型名' };
  if (isProjectorWeightName(model)) {
    return { ok: false, message: 'mmproj 投影器无法测速（不是对话模型）' };
  }
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 120_000);
    const res = await fetch(`${OLLAMA_API}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'Hello',
        stream: false,
        options: { num_predict: 16 },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const elapsedMs = Date.now() - started;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        elapsedMs,
        message: `测速失败（HTTP ${res.status}）${body ? '：' + body.slice(0, 160) : ''}`,
      };
    }
    const json = (await res.json()) as {
      eval_count?: number;
      eval_duration?: number;
      total_duration?: number;
    };
    const parsed = tokensPerSecFromOllamaGenerate(json);
    if (!parsed) {
      return { ok: false, elapsedMs, message: '测速返回缺少 eval 统计' };
    }
    return {
      ok: true,
      ...parsed,
      message: formatSpeedTestMessage(parsed),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `测速失败：${message}` };
  }
}
