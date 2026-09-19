# CHAT-ARCHITECTURE — 对话区架构（对标 Cindy）

- 文档版本：v0.5.2-arch
- 日期：2026-09-17（CST）
- 状态：阶段 A/B/C 已落地；对话侧栏 AgentRail（开发空间）已落地；D 打包门禁、E 后置
- 对标来源：https://github.com/makecindy/cindy（已实现行为；薄壳借用交互与分层，不整仓搬运 React/TipTap）

## 0. 原则

1. **Cindy 同构**：对话是「连接层」产品面，智能来自 Harness / 本地运行时，不在 Renderer 里重造 Agent Loop。
2. **能借则借**：交互合同、信息架构、状态机对齐 Cindy；实现落在 XYAI 自有 Core + Adapter + 薄 Electron。
3. **契约优先**：会话 / 消息 / 模型选择 / 流式事件走 `@xyai/contracts`，UI 只消费事件。
4. **系统科学**：先理顺模块边界与阶段，再编码；每阶段有验收，过门禁再进入下一阶段。
5. **用户只验收体验**：技术选型由助手拍板；交付前必须真实进程冒烟（见 `apps/desktop/PACK-GATE.md`）。

## 1. 问题诊断（当前 0.5）

| 现象 | 根因（架构层） |
|---|---|
| 对话区「不像 Cindy」 | Renderer 把会话/输入/模型塞进单文件脚本，缺少 Cindy 式 Composer / ModelPicker / SessionStore 边界 |
| 选不了本地已注册模型 | 模型目录（model-hub）与对话发送路径（CodexHost）未统一进「会话绑定的 modelRef」 |
| 输入异常 | 壳层交互面（chrome drag / composer 焦点）与对话面未按 Cindy「composer 卡片」隔离 |
| 反复启动崩 | ESM 源码 vs CJS 打包合同未门禁化（已单独立规，仍须遵守） |

**结论**：先补「对话子系统架构」，再按阶段接线；继续在 `renderer/main.ts` 堆逻辑只会越改越歪。

## 2. Cindy 已实现结构（借用地图）

Cindy 桌面端（概念映射，非逐文件复制）：

| Cindy（参考路径） | 职责 | XYAI 0.5 落点 |
|---|---|---|
| 左侧 Sessions（sidebar + New） | 多会话持久、切换、记忆 agent/model/cwd | `SessionStore`（Core 扩展）+ UI SessionRail |
| `ChatInput` / composer 卡片 | 多行输入、Enter 发送、IME、发送↔停止、工具条 | `Composer` 模块（renderer） |
| `ModelSelector` / `ModelHarnessPicker` / `UnifiedModel*` | 统一模型面板：按 Harness 分组 + 搜索 + 当前选择 chip | `ModelPicker`（读 `ModelCatalog`） |
| `makerChatStore` + delta batching | 流式增量合并、进行中气泡、完成对齐 | `TranscriptStore`（renderer）← IPC `AgentEvent` |
| `useCCAgentChat` send/stop/queue | 忙时停止；后续可排队 | `TurnController`（main：Host） |
| help：sessions-and-chat | 产品行为说明书 | 本文 §4 交互合同 |

Cindy 明确行为（首期必须对齐）：

- **+ 新对话**；侧栏切换；会话记住 **agent（harness）+ model**
- Composer 内 **选模型**（不是只在设置页藏着）
- 生成中 **Send → Stop**；Stop 干净中断
- Enter 发送 / Shift+Enter 换行 / **IME composition 不误发送**
- 流式：`message.delta` 累加到稳定 in-progress 气泡，完成再定稿；助手/用户气泡按 Markdown 渲染为 HTML（标题/加粗/列表/代码/链接），不是原文符号
- 助手气泡操作：复制、引用、转发（本条或整段对话 → 其它会话草稿）、保存至本机知识库、发给智能体（写入目标对话草稿；无独立多智能体运行时）

首期明确后置（写进路线，避免假对标）：

- 消息队列重排、斜杠 `/`、附件托盘、工具调用折叠卡、Thinking/Plan、跨端/跨窗口续聊

## 3. XYAI 对话子系统分层

```text
┌──────────────────────────────────────────────────────────┐
│  Shell Chrome（0.3 顶栏：空间导航）                         │
│  开发空间 → 对话 | 模型 | …                                │
└──────────────────────────────────────────────────────────┘
┌──────────────┬───────────────────────────────────────────┐
│ AgentRail /  │  TranscriptView                           │
│ SessionRail  │  气泡 Markdown / 流式 / 消息操作            │
│ 智能体|会话  ├───────────────────────────────────────────┤
│ + 新对话     │                                           │
│              │  Composer                                 │
│              │  [ModelPicker chip]  [输入区]  [发送|停止]  │
└──────────────┴───────────────────────────────────────────┘
                         │ preload IPC
                         ▼
┌──────────────────────────────────────────────────────────┐
│  Desktop Main                                            │
│  TurnController（CodexHost 演进）                         │
│    · 绑定 sessionId + modelRef + harnessId                │
│    · send / stop / 事件扇出                               │
└───────────┬───────────────────────────┬──────────────────┘
            ▼                           ▼
   Harness Adapters              Model Runtime
   adapter-codex（首个）          model-hub → Ollama 本地
   （后：claude / dsh）           cloud providers（设置落盘，路由后置）
            ▲                           ▲
            └──────────┬────────────────┘
                       ▼
              @xyai/contracts
              Session · AgentEvent · ModelEntry · modelRef
```

### 3.1 核心对象

**modelRef**（会话当前模型，统一 ID）：

- `codex:<modelId>` — 走 `adapter-codex`
- `ollama:<name>` — **默认**（`engineMode: auto`）闲聊走 model-hub 直连 NDJSON 真流式；仅创建/写入/安装（文本判定）抬到 `codex exec --oss`（可写工作目录）。`accessMode` 只映射沙箱，不把「你好」+「完全访问」抬到写文件路径。仅设置「本机写文件」/`codex-oss` 连闲聊也走 `--oss`，缺二进制时软降级回落流式
- `custom:<provider>/<model>` — 闲聊走 OpenAI 兼容 HTTP 流；创建/写入同样抬到 Codex，并把该供应商的 base URL + API key 注入 `--config`（不是裸 chat 写文件）
- 后续：`claude:…` / `cloud:openai:…` 等，仍只扩展解析表，不改 UI 合同

> 详见仓库根目录 `LOCAL-HARNESS.md`（推理机 vs 大脑）。

**Session**：

- `id, title, harnessId, modelRef, createdAt, updatedAt`
- 每会话独立 transcript（可先内存，再持久化）

**Turn**：

- 一次用户发送 → 事件流 → 完成/取消/错误
- 同时最多一个 in-flight turn / session（Cindy 忙时 Stop；队列为二期）

### 3.2 模块边界（必须拆，禁止单文件巨石）

| 模块 | 位置（目标） | 职责 |
|---|---|---|
| `SessionStore` | `packages/xyai-core` 或 `apps/desktop/src/main/session-store.ts` | 会话 CRUD、当前会话、标题 |
| `TurnController` | `apps/desktop/src/main/turn-controller.ts`（由 CodexHost 演进） | 执行 Core `planModelGateway`：stream / Codex（含自定义脑注入）；知识前缀走同一 `send`；工具回合结束后 Forge → `installAsset` → 登记处刷新；abort |
| `ModelCatalogFacade` | main：`normalizeGatewayCatalog`（Ollama + 自定义/云 + 内置） | 给 Picker 的统一列表（`source: local\|cloud`） |
| `Composer` | `apps/desktop/src/renderer/chat/composer.ts` | 输入、发送/停止、IME、焦点 |
| `ModelPicker` | `apps/desktop/src/renderer/chat/model-picker.ts` | 对标 Cindy：分组（本地 / Codex）、搜索、当前 chip |
| `TranscriptView` | `apps/desktop/src/renderer/chat/transcript.ts` | delta 批处理、气泡 Markdown→HTML、复制/引用/转发/保存/派活 |
| `SessionRail` | `apps/desktop/src/renderer/chat/session-rail.ts` | 会话列表（icon+标题+预览） |
| `AgentRail` | `apps/desktop/src/renderer/chat/agent-rail.ts` + `agents.ts` + `agent-bind.ts` | 开发空间智能体列表 + session↔agent 内存绑定；见 `apps/desktop/AGENT-RAIL.md` |

Renderer 入口只做装配，不再堆业务。


## 3.3 开发空间智能体 vs 业务空间 AI 员工

- **开发空间**侧栏「智能体列表」中的对象是 **AI智能助手**（扁平、无部门/岗位）。默认：`agent-general` 通用智能体。
- 仅当推送到 **业务空间 / openXYOS** 并完成组织分配后，才成为 **AI员工/同事**。
- 本阶段不做完整 AI 员工 HR；详见 `apps/desktop/AGENT-RAIL.md`。

会话列表层级：`默认项目` → `通用对话`（未分组）以及用户项目/任务下的 **单聊 / 群聊**；元数据持久化于 `userData/collab-rail.json`。

## 4. 交互合同（验收用语）

1. 打开「开发空间 → 对话」即可输入；焦点在 Composer；不被顶栏 drag 抢走。
2. ModelPicker 能列出 **本地已注册（Ollama 现场 tags）** 与 **Codex 引擎模型**；标题用 `ollama show` architecture（如 qwen25vl → Qwen2.5-VL），不用误标的 DeepSeek 别名；同 digest 只保留一个身份，其它 tag 标「别名」。选择后写入当前会话 `modelRef`。模型页 挂接/注册成功后须立刻刷新该列表。
3. 发送后出现用户气泡；助手气泡流式增长；按钮变为停止；停止后可继续输入。
4. 新会话 / 切换会话不丢其它会话内容（内存期）；标题可由首条消息生成。
5. 选本地模型时走 Ollama；选 Codex 模型走 adapter-codex（含 mock 回退仅开发）。

## 5. 分阶段实现（锁定顺序）

### 阶段 A — 底座接线（先做）

- 固化 `modelRef` 与 Turn 路由（Codex / Ollama）
- `ModelCatalogFacade` 合并本地 + Codex 列表
- SessionStore 与 TurnController 从巨石 Host 拆清边界
- **验收**：无 UI 精修也可 CLI/IPC 测：列出本地模型、切换 modelRef、send/stop

### 阶段 B — Composer + ModelPicker（对标 Cindy）

- Composer 卡片：输入可用、IME、发送↔停止
- ModelPicker：分组 + 当前 chip（交互对齐 Cindy Unified/Harness 选择器的信息架构，不做 TipTap 搬运）
- **验收**：本机可见本地模型并可选；输入框可打字发送

### 阶段 C — Transcript / SessionRail 体验对齐 ✅ DONE (2026-09-17)

- 流式批处理、空态、错误态、会话侧栏稳定性
- 多轮 Ollama history、Stop ≠ 错误、0.4 Composer 卡片布局
- **验收**：长回复可停；多会话切换正常；详见 `apps/desktop/PHASE-C-DONE.md`

### 阶段 D — 打包门禁

- 遵守 `PACK-GATE.md`：禁裸 `import.meta.url`；`win-unpacked` 冒烟通过再 NSIS
- **验收**：安装包启动无主进程崩溃；对话区按 §4 可操作

### 阶段 E — 后置（不挡第一阶段可用）

- 队列、`/`、`@`、附件、工具折叠、持久化 SQLite（云端模型已走 C1 网关，不再后置）

## 6. 与现有包的关系

- 保留：`adapter-codex`、`xyai-model-hub`、`xyai-contracts`、Electron 薄宿主、0.3 顶栏壳
- 演进：`CodexHost` → `TurnController`（兼容现有 IPC，逐步改名）
- 不引入：整仓 Cindy React、DSH 插件脊椎、DOM 注入上游 UI

## 7. 文档维护

- 本文为对话区唯一架构真源；实现偏离须先改文档再改代码
- 同步更新：`MODULE-MAP.md`、`ROADMAP.md` 对话相关条目

## 8. Cindy 对照补强（2026-09-17，并入锁定计划）

来源：makecindy/cindy 已实现行为核对。**不改变 A→E 顺序**；下列为实施时必须遵守的收紧项。

### 8.1 借用路径别名（概念名 → Cindy 真路径）

| 概念 | Cindy 参考路径 |
|---|---|
| Composer | `apps/desktop/src/renderer/components/new-chat/ChatInput.tsx`, `SendButton.tsx` |
| ModelPicker | `ModelSelector.tsx`, `ModelHarnessPicker.tsx`, `UnifiedModelPanel.tsx`, `composerModelSelection.ts` |
| 流式状态 | `lib/makerChatStore.ts`, `hooks/useCCAgentChat.ts` |
| Enter 合同 | `docs/design-rules/DESIGN.md` §14.3；`hooks/useComposerSendShortcutPreference.ts` |
| 会话说明 | `help-knowledge/sessions-and-chat.md` |
| 侧栏 | `components/sidebar/Sidebar.tsx` |

### 8.2 Stop = busy（乐观 UI）

- 按钮显示 Stop 的条件是 **busy**（有进行中的 turn），不是「刚好有一个 delta」。
- 阶段 B 无队列时：`busy ≡ isStreaming`。
- 阶段 E 有队列后：busy 含未暂停队列；Stop 不得在队列空隙闪回 Send。
- **Stop 点击后 UI 立即退出流式态**（冲刷已合并的 delta），再 IPC abort；不等人主机确认才把 Stop 变回 Send。
- Send/Stop 同一圆形控件、约 150ms 交叉过渡（可选用 `--motion-fast`），避免硬切换两个按钮。

### 8.3 Enter 意图（阶段 B 子集）

只实现：`native（IME）| send | newline | ignore`。  
**禁止**在 B 实现 queue / steer；忙时 Enter 不得静默入队（否则像半残 Cindy）。忙时按钮仅为 Stop，输入区可打字但不发送。

### 8.4 ModelPicker 信息架构

- **一个** chip + **一个** 面板；本地 Ollama 是目录里的分组/来源，不是第二套选择器外壳。
- 分组现为「本地已注册 / Codex」；日后 Claude/Pi 只扩展分组与 `modelRef` 解析表。
- 改模型写入会话 `modelRef`，对 **下一轮 send** 生效，不改写进行中 turn。

### 8.5 其它明确分歧 / 约束

- **队列**：Cindy 可边生成边排队；XYAI 锁在阶段 E。B 必须让用户看得懂「现在只能停」。
- **附件**：E 之前不出现假芯片；可省略或禁用占位。
- **Session**：可选用 `cwd`（代码向 harness 需要时再加）；首期 `harnessId + modelRef` 足够。
- **流式**：只借「delta 合并进一条进行中气泡，stop/done/error 时 flush」；不搬 `makerChatStore` 整库。
