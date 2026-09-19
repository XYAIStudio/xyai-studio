# 本地推理机 × Codex 大脑（Local Harness）

> English blurb: **Ollama is the local inference server; Codex is the agent brain.** Selecting `ollama:*` in XYAI Studio runs a real Codex agent loop via `codex exec --oss --local-provider ollama`, with streaming JSONL events — not a dumb chat completion bypass.

## 角色分工

| 组件 | 角色 |
|---|---|
| **Ollama** | 本地推理机（只负责跑模型权重 / HTTP API） |
| **Codex CLI** | Agent 大脑 / Harness（工具循环、沙箱、jsonl 事件） |
| **XYAI Studio** | 薄壳：模型选择、会话、把本地模型接到 Codex OSS |

## 默认行为（0.5 P0）

- 在模型选择器里选 `ollama:<name>`（例如 `ollama:qwen3:8b`）时，默认走：

  ```text
  codex exec --json --ephemeral --skip-git-repo-check \
    -s <sandbox> -C <cwd> \
    --oss --local-provider ollama \
    -m <bare-name> \
    <prompt>
  ```

  其中 `-m` 传 **裸模型名**（`qwen3:8b`），**不要**带 `ollama:` 前缀。

- 发送前会先 `ensureOllamaRunning`；Codex 二进制缺失时给出明确错误（安装 Codex / 设置 `XYAI_CODEX_BIN`），**不会**静默退回直连 Ollama。

## 设置开关

| 键 | 默认 | 含义 |
|---|---|---|
| `localModelViaHarness` | **`true`** | `true`：本地模型走 Codex `--oss`；`false`：高级逃生舱，直连 `runOllamaTurn` 聊天流 |

UI：模型页 →「Codex 对话引擎」→「本地模型走 Codex harness（推荐；关闭则直连 Ollama 聊天）」。

## 上下文窗口（重要）

Ollama / Codex OSS 路径建议模型上下文 **≥ 64k**。上下文过小可能导致工具调用截断或奇怪错误。

- 用 `ollama show <model>` / Modelfile 检查 `num_ctx`。
- 需要时可在用户 Codex 配置中调大上下文；Studio 不会静默吞掉失败——错误会以 agent `error` 事件展示。

## 如何验证（UI）

1. 启动 Ollama，确保已拉好聊天模型（非 embedding）。
2. 安装并确认 Codex CLI 可用（`codex --version`），或在设置中填写路径。
3. 打开 Studio → 对话 → 模型 chip 选本地模型；chip 应显示类似「… · Codex · 本地 Ollama」。
4. 发一条消息：应看到 Codex 风格的流式 agent 事件（而非纯 chat delta 旁路）。
5. （可选）关闭 harness 开关后重试：回到直连 Ollama 聊天流。

## 与 Phase A 的关系

Phase A 曾将 `ollama:*` 直接路由到 `runOllamaTurn`（dumb chat bypass）。该路径现仅作为 **`localModelViaHarness: false`** 的逃生舱；默认已被 Codex OSS harness 取代。详见 `CHAT-ARCHITECTURE.md` / `ROADMAP.md`。


> 2026-09-19: Chat qualification line is **direct Ollama stream** by default. Set localModelViaHarness: true only when you want harness enhancement. See CONTEXT-HANDOFF.md.
