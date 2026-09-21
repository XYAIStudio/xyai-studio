# XYAI Core 增强与统筹方案

- 状态：执行基线（authoritative for planning）
- 日期：2026-09-21（CST）
- 工作目录：`E:\XYAI studio\0.5`
- 关联：[XYAI-CORE.md](./XYAI-CORE.md) · [ARCHITECTURE.md](../ARCHITECTURE.md) · [ROADMAP.md](../ROADMAP.md) · [MULTI-HARNESS.md](../MULTI-HARNESS.md)
- 外部对照：[makecindy/cindy](https://github.com/makecindy/cindy) 的 `@cindy/maker-core` 与 `docs/product-rules/core-product-principles.md`

本文合并两份讨论并消解冲突，作为今后优化执行的单一真相源：

1. **能力轨**：C0–C4 之后如何增强 Core（网关 / 知识 / Forge / 登记处 / 多 Harness…）
2. **结构轨**：向 Cindy Core 借鉴什么、不照搬什么
3. **统筹**：两轨如何同槽推进，避免 desktop 与 contracts 分叉

修订本文时请同步 `ROADMAP.md` 状态行；实现冲突以代码 + 本文件为准，不以聊天记录为准。

---

## 0. 不可破的原则（两边已对齐）

| 原则 | 含义 |
|---|---|
| Core 是连接层 | 不重写 Agent Loop；`AgentRuntime` / Adapter 提供智能 |
| Core 保持瘦 | 工作流进 Skill；富 UI 进壳 / 插件；行业流程不进 Core |
| 审批 ≠ 路由 | `PermissionMode` 只映射沙箱 / 审批强度，不得改写 `TurnCapability` |
| 一种产品 | 不拆「仅聊天 / 高级引擎」双产品；文案不暴露 Codex / DSH / Claude / harness 品牌 |
| Plan 在 Core，Do 在 Host/Adapter | `*Plan` 出在 `core-runtime`；desktop 只执行与呈现 |
| 开槽再填槽 | 结构轨开事件 / Agent 抽象槽；能力轨只往槽里填，不开平行私有协议 |

**禁止清单**

- desktop 新增 `xyai:*-codex-only` 一类第二套事件协议
- `@xyai/core` / `core-runtime` / `contracts` 出现 Electron import
- `PermissionMode` 改变闲聊 vs 写文件判定
- 为「更安全」把上游 harness 原生能力做成不可恢复的宿主死路（学 Cindy 非退化精神，按自有 Codex-first 瘦实现）

---

## 1. 现状锚点（C0–C4 已齐）

见 [XYAI-CORE.md](./XYAI-CORE.md)。已具备：

- C0：权威类型、`RuntimeSession`、权限映射、文本能力推断、停滞看门狗
- C1：统一模型目录 + 网关计划（含兼容脑注入；Anthropic Messages 工具路径仍为缺口）
- C2：知识检索计划（`ingest` 仍为 stub）
- C3：Forge 计划 → 工作目录 → personalize
- C4：双空间资产登记处（promote 无业务根时为空操作）

包边界：

```text
@xyai/contracts      类型与不变量
@xyai/core           装配图 + SessionRegistry（仍偏瘦）
@xyai/core-runtime   计划层：gateway / knowledge / forge / registry / watchdog
adapter-* / knowledge / xyos-bridge / desktop   执行与 UI
```

---

## 2. 能力轨（补什么）

| 优先级 | 方向 | 做什么 | 落点 |
|---|---|---|---|
| P0 | 契约与桌面解耦 | desktop 只消费 Plan + 统一事件；能上移的逻辑进 `core-runtime` | contracts + core-runtime + desktop 变薄 |
| P0 | 多 Harness 前置结构 | 见结构轨 S0–S2；无结构则 M5 必然分叉 | AgentEvent / BaseAgent / Maker |
| P1 | 模型网关 C1+ | `anthropic-messages` 缺口处理；目录规范化 / 别名 | `planModelGateway` / `normalizeGatewayCatalog` |
| P1 | 知识网关 C2+ | `ingest` 可观测状态机；解析仍在 `@xyai/knowledge` | `KnowledgeGateway` |
| P1 | Forge C3+ | dry-run / 冲突检测 / 结构化结果回传 Session 事件 | `forgePlan` |
| P1 | 登记处 C4+ | promote/link 持久化；biz→dev；无 XYOS 根保持空操作 | `AssetRegistry` |
| P2 | 能力推断 | 可插拔规则，仍不得被权限改写 | `turn-capability` |
| P2 | 可观测 | 首 token / stall / 降级原因进统一事件 | stall-watchdog + AgentEvent |
| P2 | AI 员工 M4 | 装配图 optional 模块；不进 Core 大腹 | assembly + 模块 |

---

## 3. 结构轨（Cindy 借鉴什么）

权威对照：Cindy `@cindy/maker-core` = Maker → Session → BaseAgent（codex / claude-code / pi）→ translator → `AgentEvent`。

### 3.1 已借鉴（保持）

| Cindy | XYAI |
|---|---|
| 连接层，不重造 Loop | 文档锁定 |
| Session 包 Runtime + 事件 | `RuntimeSession` / `SessionFacade` |
| 审批正交 | `PermissionMode` 只进沙箱 |
| 停滞看门狗 | 回合级沉默超时（比 Cindy 45min Session stall 更贴流式） |
| 兼容脑注入 | C1 网关 |
| Core 零 Electron | contracts / core / core-runtime |

### 3.2 建议移植的形状（照搬精神，瘦实现）

| ID | 项 | 说明 |
|---|---|---|
| S0 | 统一 `AgentEvent` + translator | 所有 Adapter / local-stream 映射进同一 union；UI 只订一份 |
| S1 | `BaseAgent` + `Capabilities` | 不支持则 `NotSupportedError`；禁止 desktop `if (codex)` 爆炸 |
| S2 | Maker 式 Session 工厂 | `@xyai/core`：按 `AgentKind` 注册、建/关 Session；host hooks 注入存储 / 权限 UI |
| S3 | 确定性进代码 | 校验 / 降级 / 续跑状态机不进 prompt |
| S4 | 瘦版 overflow | 检测 → 摘要交接 → fail-closed 不重放有副作用消息；**不**搬 Cindy 全套 compact/yield/SSH |
| S5 | 插件契约（后置） | Forge 稳后再做渐进发现；官方能力优先插件分发 |

### 3.3 明确不照搬

- 整棵 `claude-code/` / `codex/` / `pi/` 生产补丁树
- Orca / device-link / IM 全套（XYAI 脊椎是 OpenXYOS + 业务空间）
- Cindy 的 45min Session stall 原值
- 垂直行业流程进 Core

---

## 4. 冲突消解与统筹口诀

| 看起来像打架 | 实际 |
|---|---|
| 能力切片 C1+… vs Cindy 结构 | **补什么** vs **挂在哪**；层次不同 |
| 「瘦宿主上移 Plan」vs「先做 AgentEvent」 | **同一切**：上移时顺带定事件与 Agent 抽象 |

**口诀：结构轨开槽，能力轨填槽；不开平行槽。**

```text
结构轨（Cindy 形状）              能力轨（C / M）
─────────────────────            ──────────────────
S0 AgentEvent + translator  ←→   一切 Adapter 出入口
S1 BaseAgent / Capabilities ←→   M5 多 Harness 前置
S2 Maker 式 Session 工厂    ←→   瘦宿主：Plan 上移
S3 确定性状态机             ←→   C1+ / C2+ / C3+ / C4+
S4 瘦版 overflow            ←→   长记忆 / stall 可观测
S5 插件契约（后）           ←→   M4 / Forge 插件沉淀
```

PR 规则：

- 标签建议：`struct:`（事件 / Agent / Maker）与 `cap:`（C1+…）
- `cap:` 若引入新 IPC / 事件形状 → 必须已有或同 PR 带 `struct:`
- 每个能力 PR 自检三问：计划在哪？事件是哪条 `AgentEvent`？缺 Adapter 时如何软降级？

---

## 5. 执行冲刺（今后按此推进）

### Sprint 1 — 开槽 + 瘦宿主（P0）

1. `@xyai/contracts` 定最小 `AgentEvent` union  
2. `adapter-codex` 最小 translator；Ollama 真流式一并映射（或薄 `local-stream` adapter）  
3. desktop 发送路径只订 `AgentEvent`  
4. 审计 desktop：可变成 `*Plan` 的逻辑上移 `core-runtime`  

**完成标准**：换事件源不改 Renderer 订阅形状；单测覆盖寒暄空操作 / 工具回合有事件。

### Sprint 2 — 能力加厚（P1，同一槽）

- C1+ Anthropic 缺口  
- C2+ Knowledge ingest 状态  
- C3+ Forge dry-run / 结构化结果  
- C4+ promote/link 持久化  
- S4 瘦版 overflow  

**不做**：Cindy 全套 compact / yield / SSH。

### Sprint 3 — 多 Harness（M5）

1. `BaseAgent` / `Capabilities`  
2. 第二个真 Adapter（Claude 或 DSH 二选一）只做 translator + 能力声明  
3. Maker 式 Session 工厂落入 `@xyai/core`  

**完成标准**：换 Adapter 时工作台 / KB / XYOS 桥零改或仅配置改。

### 后置

- M4 AI 员工（装配图 optional）  
- 插件 / Ghost 渐进发现  
- system prompt / 热路径工程门禁（习惯，不必单独成功能里程碑）

---

## 6. 与 0.5 产品路线对齐

| 里程碑 | 与本文关系 |
|---|---|
| M1–M2 已完成 | 不推翻 |
| M3 OpenXYOS | 桥与登录继续在 `xyos-bridge` + 宿主；**不灌进 Agent 层** |
| M4 AI 员工 | 后置；optional 模块 |
| M5 多 Harness | = Sprint 3；前置 Sprint 1 事件槽 |

0.5 beta 出货标准不变：不含 AI 员工、不含完整多 Harness UI、不含 OpenXYOS 全量业务 runtime。

---

## 7. 质量门禁（每个增强 PR）

- 空操作路径单测：寒暄 / 无挂接 / `chat` 不写盘  
- `PermissionMode` 不得改变 `TurnCapability` 的断言  
- Adapter 缺席：软降级续聊，禁止谎称已写文件（见 `MULTI-HARNESS.md`）  
- 装配图校验失败人话可读  
- 触及 translator / 热路径：说明对事件完整性与延迟的自测（学 Cindy 纪律，力度按切片裁剪）

---

## 8. 下一步（默认开工项）

**Sprint 1 最小 PR**：`contracts` 增加 `AgentEvent` + `adapter-codex` 最小 translator，不动大 UI。

验收：

- [ ] 类型导出与单测  
- [ ] Codex MOCK / 真实路径事件可映射  
- [ ] desktop 至少一条发送路径改订统一事件（可渐进）  
- [ ] 本文与 `ROADMAP.md` 状态已勾选 Sprint 1 进行中  

---

## 修订记录

| 日期 | 说明 |
|---|---|
| 2026-09-21 | 初版：合并 Core 增强方案与 Cindy 对照，写入工作目录供执行 |