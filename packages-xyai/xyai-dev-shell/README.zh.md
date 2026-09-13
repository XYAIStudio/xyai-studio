---
description: "XYAI 开发空间壳浏览器工作台导航，基于 DSH layout 与 workspace 服务。"
kind: "package-reference"
---

# @xyai/dsh-dev-shell

[English](README.md) | 中文

## 概述

工作台菜单通过 `uiWorkspace` 新建对话，通过 `layout` 打开、关闭或切换面板。侧栏底部的新建对话入口在未选择会话时也可用。本包仅提供导航，不增加模型上下文或工具。

## 目录

- 概述
- 模型体验
- 已知限制与延期工作
- 开发备注

## 模型体验

无。本包只注册浏览器侧工作台导航，不增加模型上下文或工具。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

- **仅导航**：Electron 窗口管理与安装属于桌面装配，不属于本插件。
- **未发布 `./invariant`**：插槽归属由 UI 插槽注册表观测，本包没有可独立发生偏离的运行时观测关系。

### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
