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
