# XYAI Core

XYAI 自有 Core：连接层，不是自研 Agent Loop。形态借鉴 Cindy（Session 包住 Runtime、审批政策、停滞看门狗、兼容脑注入），目标按 XYAI 四条产品线对齐，且比 Cindy 更完整。

产品文案不出现 Harness 品牌名，也不发明「闲聊 / 高级引擎」双产品模式。一条产品：流式长记忆对话，需要写文件时才走工具运行时。

## 四条产品目标

1. **本地 + 云端模型** — 本机 Ollama / 自定义云端脑与写文件运行时正交；同一目录、同一网关。
2. **本地 + 云端知识库** — Core 只保留检索契约；具体后端是薄适配器（本机索引 / ima·HTTP / OpenXYOS 导入）。
3. **流式长记忆对话** — 对话过程中沉淀文档 / 技能 / 插件 / MCP / 智能体 / 管理系统。
4. **开发资产 ↔ 业务资产** — 工作目录 / 个性化与 OpenXYOS 资产共用登记处；跨空间发现，promote 无需手拷。

## 原则

| 原则 | 含义 |
|---|---|
| Core 是连接层 | 不重写 Agent Loop。`AgentRuntime` 由 Adapter 实现；Core 负责会话、审批政策、事件订阅、停滞看门狗、模型目录与网关、知识检索计划、Forge 计划、资产登记处。 |
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
| `KnowledgeSourceKind` | `local \| cloud` | 本机挂接或已配置的云端知识库。与模型 `CatalogSource` 分列。 |
| `KnowledgeHit` / `KnowledgeQuery` | — | 统一检索行：id / sourceKind / sourceId / title / snippet / score。 |
| `KnowledgeGateway` | `search` + 可选 `ingest` | 检索契约。`ingest` 在 Core 为 stub；解析仍在宿主索引器。 |
| `ForgeAssetKind` | `skill \| plugin \| mcp \| agent \| doc \| system` | 对话可沉淀的资产种类。`doc` = 文档，`system` = 管理系统。 |
| `ForgeRequest` / `ForgeResult` | — | 空请求与 `capability: chat` 为空操作。`PermissionMode` 不是输入。 |
| `AssetSpace` | `dev \| biz` | 开发空间或业务空间。与互通清单 `sourceSpace` 对齐。 |
| `AssetRegistryEntry` | — | 登记行：id / space / kind / name / origin (`personalize\|workspace\|openxyos`) / sourceId / 可选 ref、linkedId。 |
| `AssetRegistry` | `list` / `get` / `link` / `promote` | 内存索引。空快照为空列表；无业务根时 `promote` 为空操作。 |
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

## 知识库网关（C2）

本地挂接与已配置的云端知识库进入**同一条** Session `send`，不另开对话路径。Core 只计划是否附加片段；`@xyai/knowledge` / ima·HTTP / OpenXYOS `knowledge-mount` 导入仍是薄适配器。

| 步骤 | 行为 |
|---|---|
| 规范化 | `normalizeKnowledgeHits` 合并本机索引行与云端检索行。字段：`id`、`sourceKind`、`sourceId`、`title`、`snippet`、`score`。空 snippet 丢弃。 |
| 计划 | `planKnowledgeContext({ query, sources, hits? })`：无挂接 → 空操作；寒暄（`你好`）→ 空操作；检索型 chat/tools 回合才附加。 |
| 执行 | 宿主 `KnowledgeGateway.search`（桌面 = KnowledgeHost：本机 `searchKb` + ima `search_knowledge`）。无命中仍空操作，不中断回合。 |
| 注入 | 命中片段前置到本次 `send` 的模型可见文本。`planTurn` / `TurnCapability` 仍只看用户原文。`PermissionMode` 不参与。 |
| 缺口 | `ingest` 为 stub。解析、蒸馏、OpenXYOS 导入仍走知识库页与 xyos-bridge。 |

Composer `@` 已注入的横幅不再二次附加。无挂接、无云配置时与未接线相同。`你好` 保持流式。

## Forge（C3）

对话在工具回合把文档 / 技能 / 插件 / MCP / 智能体 / 管理系统写进工作目录，再装入「个性化」。Core 只出计划；宿主执行 Cindy 式 scaffold → pack → `installAsset`。不另起资产库，不改 Agent Loop。

| 步骤 | 行为 |
|---|---|
| 计划 | `forgePlan(request)`：空请求或 `capability: chat` → 空操作；否则规范化 kind，映射 `workspaceRel`（`plugins/<名>` … `systems/<名>`）与 personalize kind。 |
| 脚手架 | 宿主把文件写到 `userData/workspace/<folder>/<name>/`。 |
| 打包 | 登记为 `discovered`（`workspace\|kind\|absPath` id），仍走现有 personalize 目录。 |
| 安装 | 调用 `installAsset`（imports → `installed/<kind>/<id>`）。工具回合结束后扫描 `plugins\|skills\|mcp\|agents\|docs\|systems` 同样走这条路径。 |
| 业务 | OpenXYOS 运行根存在时 `pushToBiz`（`doc` → `knowledge-mount`）；缺省为空操作。 |

`PermissionMode` 只进沙箱。`你好` 保持流式，不写盘。创建插件无需用户手贴 HTML 或 PowerShell。

## 资产登记处（C4）

开发空间资产与 OpenXYOS 业务资产进入**同一份**登记处，不另起资产库。Core 只索引宿主已有的 personalize、工作目录 Forge 产出、以及在场的 OpenXYOS 互通挂接。

| 步骤 | 行为 |
|---|---|
| 索引 | `indexAssetRegistry` / `createAssetRegistry` 合并三路快照。personalize + workspace → `dev`；OpenXYOS 互通 → `biz`。同一 `sourceId` 自动 `linkedId`。 |
| 发现 | `list` / `get` 可按 space / kind / origin 过滤。空快照为空列表。 |
| 互通 | `link` 在内存记下跨空间对。`promote` 调用宿主已有 `pushToBiz`；无业务根或已是 biz 时为成功空操作。 |
| 刷新 | 桌面在 Forge 安装与个性化变更后 `refreshAssetRegistry`。IPC：`xyai:asset-registry-list`（及 get / promote）。 |

`PermissionMode` 不参与。无 OpenXYOS 根时与未接线相同。产品 UI 选型面板仍可后做；本切片只提供统一发现。

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
- 知识附加：`CodexHost.sendMessage` 用用户原文跑 `planTurn`；检索型查询把 `planKnowledgeContext` 前缀接到同一条 `send` 的模型输入。无本地/云挂接或寒暄时为空操作。
- Forge：工具回合结束后 `installWorkspacePlugins` → `installAsset`。空 `forgePlan` 不写盘。`accessMode` / `PermissionMode` 不参与。
- 登记处：Forge 安装 / 个性化变更后刷新；`assetRegistryList` 给后续 UI。无业务根时 `promote` 空操作。`accessMode` / `PermissionMode` 不参与。

## 路线图（C0–C4）

| 阶段 | 范围 |
|---|---|
| **C0** | 权威类型、`RuntimeSession`、权限映射、文本能力推断、停滞看门狗、CORE 文档。 |
| **C1** | 统一模型目录 + 网关计划；DeepSeek / OpenAI 兼容脑注入 Codex 工具路径；Anthropic Messages 缺口。 |
| **C2** | 知识库网关：本地 + 云挂接到 Session `send`；Core 检索契约；ingest stub。 |
| **C3** | Forge：对话沉淀文档 / 技能 / 插件 / MCP / 智能体 / 管理系统 → 工作目录 → 个性化（`installAsset`）；OpenXYOS 在场时薄 biz 推送。 |
| **C4**（本文件） | 资产登记处：personalize + 工作目录 Forge 产出 + OpenXYOS 挂接同一索引；跨空间 list/get/link；无业务根时 promote 空操作。 |

C0–C4 Core 切片已齐（会话门面、模型网关、知识网关、Forge、双空间登记处）。余下是产品打磨（登记处 UI、双向同步交互、选型面板、ingest、Anthropic 工具路径），不是再改 Agent Loop。

后续增强与 Cindy 结构对照的**执行基线**见 [XYAI-CORE-ENHANCEMENT.md](./XYAI-CORE-ENHANCEMENT.md)（结构轨开槽 + 能力轨填槽；勿另起平行方案文）。

## 相关

- 分层总图：[ARCHITECTURE.md](../ARCHITECTURE.md)
- 模块表：[MODULE-MAP.md](../MODULE-MAP.md)
- 回合路由（实现细节）：[CHAT-ARCHITECTURE.md](../CHAT-ARCHITECTURE.md)
