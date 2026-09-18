/** Dialog copy for local-model scan — keep in sync with model-hub formatLocalModelScanResult. */

export function formatLocalModelScanResult(input: {
  count: number;
  installed: boolean;
  running: boolean;
  ollamaCount?: number;
  diskCount?: number;
}): string {
  if (input.count > 0) {
    const ollama = input.ollamaCount;
    const disk = input.diskCount;
    if (ollama != null || disk != null) {
      return `发现 ${input.count} 个本地模型（Ollama ${ollama ?? 0} · 磁盘权重 ${disk ?? 0}）`;
    }
    return `发现 ${input.count} 个本地模型`;
  }
  if (!input.installed) {
    return '未检测到 Ollama。请先安装 Ollama，安装后可自动识别本机模型。仍可用「搜索本机模型」扫描磁盘 GGUF。';
  }
  if (!input.running) {
    return 'Ollama 服务未运行。请点击「启动 Ollama」后重试。';
  }
  return 'Ollama 已运行，但未发现已下载的本地模型。可点「搜索本机模型」扫描磁盘 GGUF。';
}
