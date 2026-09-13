---
description: "配置 AI 员工，并在 DSH Agent Teams 上启动持久单聊或群组协作，包括持久队内消息和共享任务。"
kind: "package-reference"
---

# @xyai/dsh-ai-employees

[English](README.md) | 中文

## 概述

本插件让操作者搜索、分类筛选和配置 AI 员工，先审阅草稿差异再发布，并启动一人单聊或二至六人群组协作。每张员工卡片可直接打开一对一聊天；勾选两人后才可创建群聊。创建或复用 Session 后会直接进入协作 View。已有协作可邀请新员工创建新群聊，原 Session 保持不变。当绑定的 Session 仍然存在时，一人协作会重新打开该 Session。运行中的协作使用 DSH Agent Teams 管理队友生命周期、队内消息、共享任务和 Session 恢复。每个团队 Session 还会持久保存成果，支持修订、退回和确认；未组合真实同步提供者时，线上成果同步保持不可用。群名修改调用 DSH Session 控制器；持久化失败时保留编辑内容并显示错误。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

从对话 View 标签打开 **AI 团队**，或使用输入框中的 **添加 AI 员工**。

### 何时选择

当 XYAI 桌面 Profile 已组合 DSH Agent Teams，并需要面向员工的配置和协作流程时，选择本插件。当不需要员工草稿和持久单聊绑定时，可以直接使用 DSH Agent Teams UI。

### 最小配置

```yaml
- id: xyai-ai-employees
  name: '@xyai/dsh-ai-employees'
```

本包没有插件配置字段。它需要 Host 侧的 `connection`、`settings`、`agents` 和 `agentTeams` 服务；浏览器半需要插槽、语言、连接和 Session 控制器。XYAI Profile 提供这些依赖。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

Host 把员工库、草稿版本和单聊绑定存入 `xyai-ai-team` 设置命名空间。Connection RPC 校验浏览器载荷，并把队友、邮箱和任务操作委托给 `ctx.agentTeams`。浏览器注册完整的对话 View、打开协作对话框的输入框入口，以及团队感知的改名控件。

| 文件 | 用途 |
|---|---|
| `src/index.ts` | 经校验的 Host RPC 与 DSH Agent Teams 适配器 |
| `src/protocol.ts` | 共享员工记录与 RPC 信封 |
| `src/client/plugin.tsx` | 员工编辑、协作创建、名册、消息和任务 |
| `src/client/styles.ts` | 包内限定的响应式样式 |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [DSH 架构](../../docs/architecture.zh.md) — 插件组合与应用启动
- [Agent Teams](../../packages/experimental/agent-team/README.zh.md) — 持久名册、邮箱和任务语义
- [XYAI Profile](../../profiles/xyai/package.json) — 交付的 Bundle 顺序

-----

<a id="model-experience"></a>
## 模型体验

### AI 员工队友提示词

#### 模型看到什么

所选员工已发布的 `instructions`、记忆、技能、例行任务和集成成为新队友的初始用户提示词。后续团队消息和任务使用已记录的 DSH Agent Teams 机制。

#### Token 影响

每个队友为其配置的初始提示词支付一次 Token；后续队内消息和任务工具调用消耗普通消息和工具 Token。

#### KV Cache 影响

稳定的已发布员工指令位于新队友 Session 的前部，可以参与前缀缓存；编辑并发布指令会改变后续 Session 的该前缀。

## Known Limitations and Deferred Work

- 例行任务仍是员工配置；本包不注册调度器任务。
- 市场安装和线上员工同步需要所属的商业或线上适配器。
- 当绑定的 Session 仍在浏览器 Session 列表中时才复用单聊；删除 Session 后，下次启动会创建新的绑定目标。
- 本包不发布 `./invariant`，因为 Loader 组合测试和 DSH 注册表直接观测每项自有注册。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
