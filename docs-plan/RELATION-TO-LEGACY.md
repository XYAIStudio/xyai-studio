# RELATION-TO-LEGACY — 与历史工程的关系

## 历史源（只读参照，不在此仓继续开发）

| 历史目录/线 | 角色 |
|---|---|
| XYOSStudioDesktop / xyai-studio-legacy | Electron / DSH 母体审计源 |
| XYAI-Studio-0.3-latest-dsh | v0.3.x 组合构建树 |
| 0.4「DSH 全插件脊椎」策划 | **降级为可选适配说明，不作 0.5 总架构** |

## 0.5 相对旧路线

| 旧方向 | 0.5 选择 |
|---|---|
| 开发空间 = 纯 DSH + DOM/双 View | **废弃为总架构**；单 chrome、契约 + Adapter |
| 首个 Runtime = DSH | **改为 Codex 优先** |
| XYOS 打进同一构建树 | **OpenXYOS submodule + bridge** |
| AI 员工强绑定首发 | **首个内测可省略（M4）** |

可选择性吸收：Electron 窗口生命周期、打包与安全 Runtime 经验。  
禁止：整体复制 fusion/legacy 覆盖新壳；迁移 `node_modules`/密钥/绝对路径符号链接。
