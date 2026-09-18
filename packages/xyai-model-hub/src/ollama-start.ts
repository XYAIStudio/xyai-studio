export type StartOllamaResult = {
  ok: boolean;
  running: boolean;
  started: boolean;
  message: string;
};

export type StartOllamaDeps = {
  probe: () => Promise<boolean>;
  isInstalled: () => Promise<boolean>;
  spawnServe: () => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_TIMEOUT_MS = 20000;

export async function startOllamaWithDeps(
  deps: StartOllamaDeps,
  opts?: { timeoutMs?: number },
): Promise<StartOllamaResult> {
  if (await deps.probe()) {
    return {
      ok: true,
      running: true,
      started: false,
      message: 'Ollama 已在运行',
    };
  }
  if (!(await deps.isInstalled())) {
    return {
      ok: false,
      running: false,
      started: false,
      message: '未检测到 Ollama，请先安装',
    };
  }
  try {
    deps.spawnServe();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      running: false,
      started: false,
      message: `启动 Ollama 失败：${message}`,
    };
  }

  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? Date.now;
  const deadline = now() + timeoutMs;
  let delay = 250;
  while (now() < deadline) {
    await sleep(delay);
    if (await deps.probe()) {
      return {
        ok: true,
        running: true,
        started: true,
        message: 'Ollama 已启动',
      };
    }
    delay = Math.min(Math.floor(delay * 1.5), 1500);
  }
  return {
    ok: false,
    running: false,
    started: true,
    message: '已尝试启动 Ollama，但服务仍未就绪。请手动打开 Ollama 后重试。',
  };
}
