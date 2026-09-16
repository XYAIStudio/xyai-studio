# PRODUCT-VISION — 产品愿景

XYAI Studio 要成为 **自有 AI 桌面基座**：

- Electron：桌面容器、窗口、托盘、安装与系统能力；
- **自有 Core**：会话/任务、装配、审批、本地数据归属；
- **Harness Adapters**：Codex / DSH / Claude / 本地模型等可切换 Runtime（**首发 Codex**）；
- **OpenXYOS**：企业业务空间与资产（**独立 submodule 组件**，壳不吞并构建树）；
- 自有 UI 表面：工作台、Composer、知识库、模型广场等（**非上游 DOM 注入**）。

## 0.5 首个内测边界

| 包含 | 可不含 |
|---|---|
| Electron 薄宿主 + 最小 Codex 对话窗 | 完整工作台 / 知识库 / 模型广场 |
| 契约 + Core 装配校验 | **AI 员工（M4 延后）** |
| Codex 真实 `exec --json` + MOCK 回退 | Claude / DSH 多 Harness |
| OpenXYOS submodule + 桥接探针 | OpenXYOS 业务全量与登录资产流 |

差异化不靠「换皮上游」，而靠 **连接层产品化** + **OpenXYOS 企业业务层**。
