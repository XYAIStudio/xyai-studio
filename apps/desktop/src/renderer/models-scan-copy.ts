/** Dialog copy for local-model scan — keep in sync with model-hub formatLocalModelScanResult. */

export function formatLocalModelScanResult(input: {
  count: number;
  installed: boolean;
  running: boolean;
}): string {
  if (input.count > 0) {
    return `发现 ${input.count} 个本地模型`;
  }
  if (!input.installed) {
    return '未检测到 Ollama。请先安装 Ollama，安装后可自动识别本机模型。';
  }
  if (!input.running) {
    return 'Ollama 服务未运行。请点击「启动 Ollama」后重试。';
  }
  return 'Ollama 已运行，但未发现已下载的本地模型。';
}
