---
description: "XYAI 智能体兵工厂浏览器入口，通过 DSH agentLoop 与 agentTeams 主机服务呈现智能体与团队创建。"
kind: "package-reference"
---

# @xyai/dsh-agent-forge

[English](README.md) | 中文

## 概述

浏览器半在会话头部注册「兵工厂」工具（`conversation.session.header.utilities`）。智能体与团队创建仍由 DSH `agentLoop` 与 `agentTeams` 主机服务承担；本包仅提供入口，不增加模型上下文或工具。

## 目录

- 概述
- 模型体验
- 已知限制与延期工作
- 开发备注

## 模型体验

无。本包只注册浏览器侧会话工具，不增加模型上下文或工具。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

- **仅入口**：选模型、人设、名册、@交接与任务卡的锻造向导推迟到后续阶段，将走 `agentTeams` 与 system-prompt 分区。
- **未发布 `./invariant`**：slot 注册由 UI 插槽注册表观测，本包没有可独立发生偏离的运行时关系。

### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
