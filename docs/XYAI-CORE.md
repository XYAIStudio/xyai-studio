# XYAI Core

XYAI 自有 Core：连接层，不是自研 Agent Loop。形态借鉴 Cindy（Session 包住 Runtime、审批政策、停滞看门狗、兼容脑注入），目标按 XYAI 四条产品线对齐，且比 Cindy 更完整。

产品文案不出现 Harness 品牌名，也不发明「闲聊 / 高级引擎」双产品模式。一条产品：流式长记忆对话，需要写文件时才走工具运行时。

## 四条产品目标

1. **本地 + 云端模型** — 本机 Ollama / 自定义云端脑与写文件运行时正交；同一目录、同一网关。
2. **本地 + 云端知识库** — Core 只保留挂接与检索契约；网关在后续里程碑。
3. **流式长记忆对话** — 对话过程中沉淀文档 / 技能 / 插件 / MCP / 智能体 / 管理系统。
4. **开发资产 ↔ 业务资产** — 工作目录与 OpenXYOS 资产互通；登记处在后续里程碑。

## 原则

| 原则 | 含义 |
|---|---|
| Core 是连接层 | 不重写 Agent Loop。`AgentRuntime` 由 Adapter 实现；Core 负责会话、审批政策、事件订阅、停滞看门狗、模型目录与网关计划。 |
| Core 保持瘦 | 工作流进 Skill；富 UI 进后续插件。本阶段不把编排或卡片堆进 Core。 |
| 审批 ≠ 路由 | `PermissionMode` 只映射沙箱 / 审批强度。闲聊不会因为「完全访问」被抬到写文件路径。 |
| 一种产品 | 不按权限或设置拆成「仅聊天」与「高级引擎」两套产品。回合能力只由用户文本判定。 |
| 文案不露品牌 | 用户可见字符串不出现 Codex / DSH / Claude / harness / 「高级引擎」。 |

## 权威类型

包：`@xyai/contracts`（类型）+ `@xyai/core-runtime`（薄实现）。`@xyai/core` 仍只做装配图与 `SessionRegistry`。

| 类型 | 取值 | 说明 |
|---|---|---|
| `PermissionMode` | `ask \| default \| auto \| bypass` | 审批政策。落盘芯片 `accessMode`：`default/auto/full` → `default/auto/bypass`。`ask` 尚无芯片。 |
| `AgentKind` | `codex \| dsh \| claude` | 与装配 harness id 对齐。当前实现以 `codex` 为先；后两者可 stub。 |
| `TurnCapability` | `chat \| tools \| planning` | **只**由用户文本推断。`PermissionMode` 不得改写。 |
| `NormalizedModelEntry` | `id, displayName, source: local\|cloud, protocol` | 本地 Ollama 与云端/自定义脑的同一目录行。 |
| `GatewayPlan` | `stream \| agent` | `modelRef` + `TurnCapability` 的唯一计划。`agent` 可带 `injectProviderId`。 |
| `Session` | 持久化记录 | id / title / harnessId / 可选 `agentKind` / `permissionMode`。 |
| `SessionFacade` | 运行时门面 | `start` / `send` / `abort` / `dispose` + `on` / `events()`。`RuntimeSession` 包住 `AgentRuntime`。 |

`inferTurnCapability` 与桌面 `inferCapabilityNeed` 同一套启发式：寒暄保持 `chat`；创建 / 写入 / 安装语言为 `tools`；分步规划为 `planning`。

## 模型网关（C1）

本地 Ollama 与云端/自定义供应商进入同一 Agent / Session 路径。目录与路由在 `@xyai/core-runtime`；宿主只执行计划。

| 步骤 | 行为 |
|---|---|
| 目录 | `normalizeGatewayCatalog` 合并现场 Ollama tags、已存自定义供应商、内置 Codex 模型。行字段：`id`（modelRef）、`displayName`、`source`、`protocol`。 |
| 计划 | `planModelGateway({ modelRef, capability, lift, protocol })` → `stream`（Ollama NDJSON 或 OpenAI 兼容 HTTP）或 `agent`（`AgentRuntime` Codex）。 |
| 注入 | 工具回合的 Chat Completions / Responses 脑走 `customProviderCodexInjection`（`--config` + `OPENAI_API_KEY`），不是裸 chat 写文件。DeepSeek V4 未命名工具用 `sanitizeDeepSeekV4CustomTools` 丢掉（Cindy `codex-proxy-host` 同类处理；本层不另起 loopback 代理进程）。 |
| 缺口 | `anthropic-messages` **不能**驱动 Codex 工具回合。网关记 `gap: 'anthropic-messages'` 并保持 `stream`；宿主提示改用 Chat Completions。 |

`你好` 保持流式；「创建一个插件」抬到 Codex（本地 `--oss`，云端注入供应商）。`PermissionMode` 仍只进沙箱。桌面 `CodexHost` 按 `GatewayPlan.mode` 执行，缺二进制时仍软降级回落流式。

协议：`ollama` / `chat-completions` / `openai-responses` / `codex` 可走工具路径；`anthropic-messages` 仅缺口记录。

## 停滞看门狗

Cindy Session 用 45 分钟无事件判定会话挂死。XYAI 用更短的**回合级**沉默超时：流式对话应持续出事件。

| 回合 | 默认沉默超时 | 常量 |
|---|---|---|
| `tools` / `planning` | 45s（可配置区间 20–45s） | `STALL_TIMEOUT_TOOLS_MS` |
| `chat` | 3 分钟 | `STALL_TIMEOUT_CHAT_MS` |

实现：`createStallWatchdog({ timeoutMs, onStall })` 与 `watchStall(iter, …)`。每来一个事件就 `reset()`；超时调用 `onStall`（宿主里即 abort）。桌面 `CodexHost` 在发送流上套 `watchStall`。超时可在 `RuntimeSession` 构造参数覆盖。

## 桌面接线（权限）

- 设置里的 `accessMode` 仍是 `default \| auto \| full`（「使用权限」芯片）。
- 主进程经 `accessModeToPermissionMode` 得到 `PermissionMode`，再映射 Codex `-s` / `-a`（`bypass` → `danger-full-access`；其余 workspace-write）。`ask` → `on-request`，当前 UI 不会选出。
- `planTurn` 的 `capabilityNeed` 仍只看文本；`accessMode` / `PermissionMode` 只进沙箱与看门狗超时。网关 `lift` 来自 `engineMode`（`local-stream` → never，`codex-oss` → always，其余 auto）。

## 路线图（C2–C4）

| 阶段 | 范围 |
|---|---|
| **C0** | 权威类型、`RuntimeSession`、权限映射、文本能力推断、停滞看门狗、CORE 文档。 |
| **C1**（本文件） | 统一模型目录 + 网关计划；DeepSeek / OpenAI 兼容脑注入 Codex 工具路径；Anthropic Messages 缺口。 |
| **C2** | 知识库网关：本地 + 云挂接的统一检索 / 引用。 |
| **C3** | Forge：对话中沉淀文档 / 技能 / 插件 / MCP / 智能体 / 管理系统。 |
| **C4** | 资产登记处：开发资产与 OpenXYOS 业务资产互通。 |

C2–C4 不在本里程碑实现。

## 相关

- 分层总图：[ARCHITECTURE.md](../ARCHITECTURE.md)
- 模块表：[MODULE-MAP.md](../MODULE-MAP.md)
- 回合路由（实现细节）：[CHAT-ARCHITECTURE.md](../CHAT-ARCHITECTURE.md)
