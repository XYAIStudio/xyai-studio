# OPENXYOS-PACKAGING — OpenXYOS 打包与接入

## 锁定决策

**OpenXYOS = git submodule**，路径固定为 `components/openxyos`。

- **禁止**在文档或脚本中发明虚假远程 URL
- 维护者自行提供真实仓库地址后执行：

```bash
git submodule add <url> components/openxyos
git submodule update --init --recursive
```

## 工程原则

1. OpenXYOS 是 **独立安装单元**；Studio 壳侧只通过 `@xyai/xyos-bridge` 交互。
2. 壳 **不吞并** OpenXYOS 构建树（不把其源码当普通 workspace package 混编进 Core）。
3. 组件缺失时：`healthCheck()` → `{ ok: false, reason: 'not-installed' }`；存在 `package.json` 等标记时 → `{ ok: true, reason: 'submodule-present' }`；核心对话始终可启动。
4. 装配图 `components[]` 中 `required: false`（0.5.0-dev 示例）。

## 占位内容

当前目录仅有 `README.md` 与 `.gitkeep`，用于保留路径与说明，**不等于已安装**。
