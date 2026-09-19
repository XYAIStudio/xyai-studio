# 本地推理机 × 高级本地引擎

> 资格线是 **本机 Ollama NDJSON 真流式**。Codex `--oss` 是可选增强，不是默认品牌墙。

## 角色分工

| 组件 | 角色 |
|---|---|
| **Ollama** | 本地推理机（跑模型权重 / HTTP API） |
| **高级本地引擎**（内部：Codex CLI） | 需要工具/规划时的增强循环 |
| **XYAI Studio** | 薄壳：模型、会话、能力选择 |

## 默认行为（0.5）

- 设置默认 **自动**（`engineMode: auto`）：选 `ollama:<name>` 时走 `runOllamaTurn` 真流式。
- **本机流式对话** 强制上述路径。
- **高级本地引擎**（`codex-oss`）在二进制可用时走：

  ```text
  codex exec --json --ephemeral --skip-git-repo-check \
    -s <sandbox> -C <cwd> \
    --oss --local-provider ollama \
    -m <bare-name> \
    <prompt>
  ```

  `-m` 传 **裸模型名**（`qwen3:8b`），不要带 `ollama:` 前缀。

- 二进制缺失或 spawn 失败：**同一回合**软提示 + 继续本机流式，不红字中断。

## 设置

| 键 | 默认 | 含义 |
|---|---|---|
| `engineMode` | **`auto`** | 见 `MULTI-HARNESS.md` |
| `localModelViaHarness` | 派生 | 仅 `codex-oss` 为 true；旧文件 `true`→`codex-oss`，`false`→`local-stream` |

UI：模型页 →「对话能力」→ 能力选择（高级项折叠：引擎路径、强制 Mock）。

## 上下文窗口

Ollama / 高级本地引擎路径建议模型上下文 **≥ 64k**。用 `ollama show <model>` 检查 `num_ctx`。

## 如何验证（UI）

1. 启动 Ollama，确保已拉好聊天模型。
2. 打开 Studio → 对话 → 选本地模型；默认不应出现「必须先选 Codex」之类文案。
3. 发一条消息：应看到真流式 delta。
4. （可选）选「高级本地引擎」：有二进制则走 `--oss`，没有则软提示后仍流式回答。
