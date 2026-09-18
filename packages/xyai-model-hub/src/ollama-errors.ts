export const OLLAMA_NOT_RUNNING_CODE = 'OLLAMA_NOT_RUNNING';

export const OLLAMA_NOT_RUNNING_MESSAGE =
  'Ollama 服务未运行。请点击「启动 Ollama」后重试。';

export const OLLAMA_NOT_INSTALLED_MESSAGE =
  '未检测到 Ollama。请先安装 Ollama，安装后可自动识别本机模型。';

export type OllamaNetworkError = Error & { code: typeof OLLAMA_NOT_RUNNING_CODE };

export function mapOllamaNetworkError(err: unknown): Error {
  if (err instanceof Error && err.name === 'AbortError') {
    return err;
  }
  const raw = err instanceof Error ? err.message : String(err);
  const cause =
    err instanceof Error && 'cause' in err
      ? String((err as { cause?: unknown }).cause ?? '')
      : '';
  const blob = `${raw} ${cause}`;
  if (
    /fetch failed|Failed to fetch|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|network|socket/i.test(
      blob,
    )
  ) {
    const mapped = new Error(OLLAMA_NOT_RUNNING_MESSAGE) as OllamaNetworkError;
    mapped.code = OLLAMA_NOT_RUNNING_CODE;
    return mapped;
  }
  return err instanceof Error ? err : new Error(raw);
}

export function isOllamaNotRunningError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as { code?: string }).code === OLLAMA_NOT_RUNNING_CODE;
}

export function missingOllamaModelMessage(model: string): string {
  return `本地 Ollama 中没有模型「${model}」。请到「模型」页刷新列表或重新拉取后再发送。`;
}

export function normalizeOllamaTag(name: string): string {
  return name.replace(/^ollama:/i, '').replace(/:latest$/i, '').toLowerCase();
}

/**
 * Exact tag match with `:latest` equivalence only.
 * `qwen3` does not satisfy `qwen3:8b`; `qwen3:1.7b` does not satisfy `qwen3:8b`.
 */
export function ollamaTagsIncludeModel(names: string[], want: string): boolean {
  const w = normalizeOllamaTag(want);
  if (!w) return false;
  return names.some((raw) => normalizeOllamaTag(raw) === w);
}

export function explainOllamaHttpFailure(
  status: number,
  body: string,
  model: string,
): string {
  const text = body || '';
  if (
    status === 404 ||
    /not found|does not exist|unknown model|model .* not found/i.test(text)
  ) {
    return missingOllamaModelMessage(model);
  }
  return `Ollama HTTP ${status}: ${text.slice(0, 200)}`;
}
