# 多 Harness 与用户体验

## 用户看到的

- **真流式对话**（资格线）
- **模型选择**、**能力选择**（人话）
- 不出现 Codex / DSH / Claude 等引擎品牌作为必选项

## 我们做的

| 层 | 职责 |
| --- | --- |
| TurnRouter | 按健康度/能力需求选 adapter |
| adapter-codex | 已接通（本地可 `--oss`） |
| adapter-dsh | 脚手架 |
| adapter-claude 等 | 后续 |
| local-stream | 无 harness 时仍保证真流式 |

缺引擎二进制时：**软提示 + 本机流式续答**，不中断对话。
