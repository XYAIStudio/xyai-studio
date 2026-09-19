# 多 Harness 与用户体验

## 用户看到的

- **真流式对话**（资格线）
- **模型选择**、**能力选择**（人话）
- 默认 **自动**：本机模型直接流式回答
- 不出现 Codex / DSH / Claude 等引擎品牌作为必选项

设置里的可选值（内部 id）：

| 界面 | `engineMode` |
| --- | --- |
| 自动（推荐） | `auto` |
| 本机流式对话 | `local-stream` |
| 高级本地引擎 | `codex-oss` |
| 高级云端引擎（即将推出） | `claude`（装配图禁用） |
| 实验室引擎 | `dsh`（装配图禁用则隐藏） |

## 我们做的

| 层 | 职责 |
| --- | --- |
| Settings `engineMode` | 用户能力选择；默认 `auto` |
| TurnRouter | 按模式/健康度/能力需求选 adapter |
| harness factory | 按装配图 id 构造 adapter（codex 可用；dsh/claude 为 stub） |
| adapter-codex | 已接通（本地可 `--oss`）；缺二进制时软降级 |
| adapter-dsh / adapter-claude | 脚手架，装配图里 `enabled: false` |
| local-stream | 无 harness 时仍保证真流式 |

缺引擎二进制时：闲聊 **软提示 + 本机流式续答**；创建/写入任务 **不得** 降级成裸 chat 再声称已写文件。
