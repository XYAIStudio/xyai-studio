---
description: "XYAI 知识库模块的可组合 DSH bundle。"
kind: "package-reference"
---

# @xyai/dsh-knowledge-app

[English](README.md) | 中文

此 bundle 在 DSH Web 应用上插入 `@xyai/dsh-knowledge`。`xyai-knowledge` profile 用它独立组装和验收知识库模块；完整 `xyai` profile 仍通过 `@xyai/dsh-xyai-app` 装载同一个插件。

必须通过受支持的 DSH profile 入口启动：

```sh
dsh --profile xyai-knowledge
```
