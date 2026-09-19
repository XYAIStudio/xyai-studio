# 本地推理机 × 本机写文件

> 资格线是 **本机 Ollama NDJSON 真流式**。写文件循环是可选增强，不是默认品牌墙。

## 角色分工

| 组件 | 角色 |
|---|---|
| **Ollama** | 本地推理机（跑模型权重 / HTTP API） |
| **本机写文件**（内部：Codex CLI） | 创建 / 写入 / 安装 / 规划时的增强循环 |
| **XYAI Studio** | 薄壳：模型、会话、权限 |

## 默认行为（0.5）

- 设置默认 **自动**（`engineMode: auto`）：选 `ollama:<name>` 时走 `runOllamaTurn` 真流式。
- **本机流式对话** 强制上述路径。
- **本机写文件**（`codex-oss`）在二进制可用时走：

  ```text
  codex exec --json --ephemeral --skip-git-repo-check \
    -s <sandbox> -C <cwd> \
    --oss --local-provider ollama \
    -m <bare-name> \
    <prompt>
  ```

  `-m` 传 **裸模型名**（`qwen3:8b`），不要带 `ollama:` 前缀。

- **创建 / 写入 / 安装**（由用户文本判定，与 accessMode 无关）：`engineMode` 为自动或本机写文件时，本地 **与** 自定义云端模型都走写文件循环，并带可写沙箱（cwd = `userData/workspace`，个性化目录 `--add-dir`）。`accessMode` 只映射沙箱强度（default/auto → workspace-write，full → danger-full-access），**绝不**把闲聊抬到写文件路径。
- 闲聊（如「你好」）始终走本机 / 云端真流式，即使权限是「完全访问」。
- 写文件路径失败 / 空结果 / 超时 / 组件未打包：同一回合软提示 + 回落到 ollama 或自定义 HTTP 流，不假装已写文件，也不让发送卡住。

## 设置

| 键 | 默认 | 含义 |
|---|---|---|
| `engineMode` | **`auto`** | 见 `MULTI-HARNESS.md` |
| `localModelViaHarness` | 派生 | 仅 `codex-oss` 为 true；旧文件 `true`→`codex-oss`，`false`→`local-stream` |

UI：模型页 →「对话能力」→ 能力选择（高级项折叠：引擎路径、强制 Mock）。

## 上下文窗口

Ollama / 本机写文件路径建议模型上下文 **≥ 64k**。用 `ollama show <model>` 检查 `num_ctx`。

## 如何验证（UI）

1. 启动 Ollama，确保已拉好聊天模型。
2. 打开 Studio → 对话 → 选本地模型；默认不应出现「必须先选 Codex」之类文案。
3. 发一条消息：应看到真流式 delta。
4. （可选）选「本机写文件」：有二进制则走 `--oss`，没有则软提示后仍流式回答。
