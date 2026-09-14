---
description: "XYAI 开发空间壳浏览器工作台导航，基于 DSH layout 与 workspace 服务。"
kind: "package-reference"
---

# @xyai/dsh-dev-shell

[English](README.md) | 中文

## 概述

工作台菜单通过 `uiWorkspace` 新建对话，通过 `layout` 打开、关闭或切换面板。顶部空间页可切换开发空间、业务空间、生态空间、浏览器和关于我们。侧栏产品导航在对应插件于 `<html>` 上声明自身后打开模型广场、协作和知识库，未声明时禁用该控件。本包仅提供导航，不增加模型上下文或工具。

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

- **Electron 远程嵌入**：`dsh-app:` 窗口无法加载远程 `https:` iframe。业务空间、生态空间和浏览器随后显示可复制地址的壳内面板，而不是嵌入页。关于我们通过 `srcDoc` 在进程内打开。
- **侧栏入口跟随已挂载插件**：模型广场、协作和知识库在所属插件于 `<html>` 上设置 `data-xyai-surface-models`、`data-xyai-surface-employees` 或 `data-xyai-surface-knowledge` 之前保持禁用。
- **仅导航**：Electron 窗口管理、`shell.openExternal` 与安装属于桌面装配，不属于本插件。
- **未发布 `./invariant`**：插槽归属由 UI 插槽注册表观测，本包没有可独立发生偏离的运行时观测关系。

### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
