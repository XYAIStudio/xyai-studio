# Agent Note: XYAI 桌面壳层 chrome

Status: implemented

[English](2026-09-14-xyai-desktop-shell-chrome.md) | 中文

## Problem

XYAI Studio 0.4 桌面冷启动后窗口标题已经品牌化，但渲染层叠了两套产品界面：XYAI 欢迎区下面露出官方 DSH 首屏文案、残留启动环、侧栏中悬浮的「模型广场」，以及除「关于我们」外无响应的产品空间页。

## Decision

首屏布局 CSS 以 `[data-xyai-hero-welcome]` 为键：撑开鱼标命中盒，隐藏相邻官方标题组，并且仅在存在 `[data-slot="root"]` 时隐藏残留的 `[data-dsh-boot]`。侧栏底部承载产品导航或互动列表的 `action` 插槽把 `display: contents` 改回纵向排列，避免「模型广场」贴在空的互动块旁边。空间浮层是顶栏的兄弟节点，而不是零高度且 `pointer-events: none` 包裹器的子节点。Electron `dsh-app:` 窗口无法承载远程 `https:` iframe，因此业务/生态/浏览器渲染可复制地址的壳内面板；关于我们继续使用 `srcDoc` 文档。模型广场与知识库留在 `@xyai/dsh-product-base`，因为它们的 Host inject 并不等待 `webServer`。AI 员工留在 `@xyai/dsh-product-collab`；Host 加载时 `agentTeams` 可选，以便桌面上激活员工库，而在缺少 Agent Teams 时队友拉起、邮箱和任务 RPC 以 `AGENT_TEAMS_UNAVAILABLE` 拒绝。这三个客户端插件各自在 `<html>` 上设置 `data-xyai-surface-*`；产品导航在该属性出现之前禁用对应入口。

## Alternatives considered

**哈希后的 CSS module 类选择器。** 重新构建会改变 `HeroShell.module.css` 哈希，因此 `.pXSMma_headline` 以及已经不存在的 `.pXSMma_headlineText` 无法在 DSH UI 重建后隐藏官方文案。

**在桌面上清空 `xyai-collab/cordis.patch.yml`。** Web 版 XYAI Profile 仍通过该包挂载 AI 员工，组合测试也要求这条 insert。让 `agentTeams` 可选可以保住员工库，而不删除协作层。

**为远程空间增加 `shell.openExternal` IPC。** 桌面 Electron 主进程尚无该通道。可复制的壳内地址在这次改动里不虚构 Host API。

**分叉 DSH EmptyHero。** XYAI 仍是补丁层产品；数据属性 CSS 加上语言包所有的导语，让其他 Profile 继续使用官方对话首屏。

## Consequences

开发空间保留 DSH 的新建会话、工作区和输入框，而不再出现第二套标题。「关于我们」在离线时仍可用。业务/生态/浏览器在桌面上以可复制 URL 到达，在普通 `http(s)` 页面上仍用 iframe。插件不在组合中时，侧栏入口降级为禁用控件，而不是叠在一起的失效芯片。桌面仍不组合实验性 Agent Teams，因此在后续 Profile 变更之前，协作中的团队操作在桌面上仍不可用。Electron 仍没有 `openExternal` 路径。

## Testing

品牌包 `hero-layout.spec.ts` 锁定选择器稳定性。开发壳 `chrome.spec.ts` 与 `plugin.client.spec.tsx` 覆盖拒绝远程嵌入、关于我们 `srcDoc`、导航禁用/启用，以及空互动列表的压缩。AI 员工 `backend.spec.ts` 覆盖没有 Agent Teams 时的员工库 RPC。
