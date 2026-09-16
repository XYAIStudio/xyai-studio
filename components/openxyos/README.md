# OpenXYOS 组件占位

本目录是 **OpenXYOS** 的安装位，在 XYAI Studio 0.5 架构中作为 **独立组件**（git submodule），
由壳侧 `@xyai/xyos-bridge` 做健康探针与资产桥接。Studio **不吞并** OpenXYOS 的构建树。

## 锁定决策

- OpenXYOS = **git submodule**（路径：`components/openxyos`）
- **不要**在本仓库伪造远程 URL
- 当前仅为占位（`README.md` + `.gitkeep`）；`healthCheck()` 在组件未真正安装时返回 `{ ok: false, reason: 'not-installed' }`

## 如何接入真实子模块

在仓库根目录由维护者执行（将 `<url>` 替换为真实 OpenXYOS 远程地址）：

```bash
# 若已有占位内容，先移走或清空本目录后再 add
git submodule add <url> components/openxyos
git submodule update --init --recursive
```

初始化已存在 submodule 配置的克隆：

```bash
git submodule update --init --recursive
```

## 与装配图的关系

见 `assembly/profiles/0.5.0-dev.example.json` 中 `components[]` 条目：
`kind: "submodule"`，`required: false`（缺省时 Studio 核心对话仍可启动，业务空间功能降级可见）。
