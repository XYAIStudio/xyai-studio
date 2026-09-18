# MODULE-MAP — 模块地图

| 路径 | 包名 | 职责 |
|---|---|---|
| `packages/xyai-contracts` | `@xyai/contracts` | 平台契约（session/task、agent-runtime、assembly…） |
| `packages/xyai-core` | `@xyai/core` | AssemblyGraph 加载/校验、SessionRegistry stub |
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
| `@xyai/knowledge` | 只读列举、抽取、分块、Ollama embed、路径安全 |
| renderer/knowledge | 「知识库」subtab UI |
| Composer `@` | 检索注入 + 引用芯片 |
