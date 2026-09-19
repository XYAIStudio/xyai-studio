# MODULE-MAP — 模块地图

| 路径 | 包名 | 职责 |
|---|---|---|
| `packages/xyai-contracts` | `@xyai/contracts` | 平台契约（session/task、SessionFacade、PermissionMode、AgentKind、TurnCapability、agent-runtime、assembly…） |
| `packages/xyai-core` | `@xyai/core` | AssemblyGraph 加载/校验、SessionRegistry stub |
| `packages/xyai-core-runtime` | `@xyai/core-runtime` | Core 连接层：RuntimeSession、文本能力推断、权限映射、模型目录/网关、知识检索计划、Forge 计划、资产登记处、停滞看门狗（见 [docs/XYAI-CORE.md](docs/XYAI-CORE.md)） |
| `packages/adapter-codex` | `@xyai/adapter-codex` | **首个** Harness Adapter（真实 `codex exec --json` + MOCK 回退） |
| `packages/xyos-bridge` | `@xyai/xyos-bridge` | OpenXYOS `healthCheck` 等宿主 API |
| `packages/xyai-ui-shell` | `@xyai/ui-shell` | UI 壳占位（完整 UI 未落地） |
| `packages/xyai-knowledge` | `@xyai/knowledge` | 知识库：本机/云挂接、解析索引、检索与引用 |
| `apps/desktop` | `desktop` | Electron 薄宿主（main/preload/renderer）+ `smoke` CLI |
| `assembly/profiles/` | — | 声明式装配图 |
| `components/openxyos/` | — | OpenXYOS **submodule 占位** |

## 后续 Adapter（未建包）

- `adapter-dsh` — DeepSeek Harness（后置）
- `adapter-claude` — Claude Code（后置）

## 模块启用（0.5.0-dev 示例）

- 启用：`conversation`、`model-catalog`、`approval`
- 禁用可选：`ai-employees`（首个内测可省略）


## 对话子系统（见 CHAT-ARCHITECTURE.md）

| 目标模块 | 职责 |
|---|---|
| SessionStore | 多会话（main / host） |
| TurnController | send/stop + modelRef 路由（Codex / Ollama）— Phase A |
| ModelCatalogFacade | 统一模型列表供 Picker — Phase A |
| `apps/desktop/src/renderer/chat/` | Phase B+C + Collab Rail：智能体 + Project/Task/单聊·群聊；`collab-store` → `userData/collab-rail.json`；见 `AGENT-RAIL.md` |

## 知识库（见 apps/desktop/KNOWLEDGE.md）

| 模块 | 职责 |
|---|---|
| KnowledgeHost | mounts / parse queue / search / citations IPC |
| `@xyai/core-runtime` `planKnowledgeContext` | 本地+云命中 → Session `send` 前缀；空挂接 / 寒暄空操作 |
| `@xyai/knowledge` | 只读列举、抽取、分块、Ollama embed、路径安全 |
| renderer/knowledge | 「知识库」subtab UI |
| Composer `@` | 检索注入 + 引用芯片 |

## Forge / 个性化

| 模块 | 职责 |
|---|---|
| `@xyai/core-runtime` `forgePlan` | 空请求 / `chat` 空操作；kind → `workspaceRel` + personalize kind |
| `forge-execute` / `installWorkspacePlugins` | 写工作目录 → `installAsset`；OpenXYOS 在场时 `pushToBiz` |
| `personalize/actions` `installAsset` | 唯一安装入口（imports → installed） |
| `@xyai/core-runtime` `createAssetRegistry` | personalize + workspace + OpenXYOS 挂接同一索引；无业务根 promote 空操作 |
| `asset-registry-host` | 桌面刷新 + `xyai:asset-registry-list` IPC；不另起存储 |
