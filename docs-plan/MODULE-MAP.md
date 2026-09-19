# MODULE-MAP — 模块地图

| 路径 | 包名 | 职责 |
|---|---|---|
| `packages/xyai-contracts` | `@xyai/contracts` | 平台契约（session/task、SessionFacade、PermissionMode、AgentKind、TurnCapability、agent-runtime、assembly…） |
| `packages/xyai-core` | `@xyai/core` | AssemblyGraph 加载/校验、SessionRegistry stub |
| `packages/xyai-core-runtime` | `@xyai/core-runtime` | Core 连接层：RuntimeSession、文本能力推断、权限映射、停滞看门狗（见 [XYAI-CORE.md](../docs/XYAI-CORE.md)） |
| `packages/adapter-codex` | `@xyai/adapter-codex` | **首个** Harness Adapter（MOCK → 未来真二进制） |
| `packages/xyos-bridge` | `@xyai/xyos-bridge` | OpenXYOS `healthCheck` 等宿主 API |
| `packages/xyai-ui-shell` | `@xyai/ui-shell` | UI 壳占位（完整 UI 未落地） |
| `apps/desktop` | `desktop` | 宿主入口；`src/smoke.ts` 冒烟 |
| `assembly/profiles/` | — | 声明式装配图 |
| `components/openxyos/` | — | OpenXYOS **submodule 占位** |

## 后续 Adapter（未建包）

- `adapter-dsh` — DeepSeek Harness（后置）
- `adapter-claude` — Claude Code（后置）

## 模块启用（0.5.0-dev 示例）

- 启用：`conversation`、`model-catalog`、`approval`
- 禁用可选：`ai-employees`（首个内测可省略）
