# INTEROP — 开发空间 ↔ 业务空间 资产互通

日期：2026-09-18（CST）  
范围：XYAI Studio 0.5 本地桥（file + HTTP），OpenXYOS 人才市场 / 备选员工联动。

## 产品约定

| 空间 | 对象 | 推送后 |
|---|---|---|
| **开发空间** | AI智能助手 / 知识挂接 / 自定义模型元数据 | 进入业务侧「待安装」；**agent 同时自动写入 OpenXYOS 人才市场 + 备选员工** |
| **业务空间** | AI员工候选 / 知识安装包 / 模型供应商候选 | 「安装/注册」（幂等再同步）→「选用」 |

反向：业务侧资产可 `pushToDev` → 开发侧 inbox →「注册到开发空间」。

## 资产种类（MVP）

- `agent` — 开发空间 AI智能助手 → OpenXYOS `talent_pool`（`source=xyai-studio`）+ `employees`（`employment_category=reserve`）
- `knowledge-mount` — 知识库挂接快照 / 索引包元数据（仅互通清单）
- `model-provider` — 自定义模型供应商元数据（仅互通清单）

## 存储合同

`userData/interop/`：

```
interop/
  outbox.json          # Dev→Biz 待安装
  inbox.json           # Biz→Dev 待注册
  installed-biz.json   # 业务侧已安装/已选用
  installed-dev.json   # 开发侧已注册
  packages/<id>.json   # 资产包正文
```

若能解析到 OpenXYOS runtime root，额外镜像到：

`{openxyosRoot}/uploads/xyai-inbox/<id>.json`

## OpenXYOS HTTP

Agent 推送 / 安装 / 选用时调用（幂等）：

- `POST {baseUrl}/api/xyai/agents/import`
- 回退 `POST {baseUrl}/api/xyai/inbox`

请求头：`X-XYAI-Interop: studio`（或环境变量 `XYAI_INTEROP_SECRET`）。  
Body：`{ "asset": { id, kind, name, description, payload }, "tenant_id": 1 }`。

写入规则：

- `talent_pool`：`talent_type=ai`，`status=available`，`source=xyai-studio`，`agent_type=xyai-<slug(id)>`
- `employees`：`employee_type=ai`，`employment_category=reserve`，`status=active`，同一 `agent_type`
- 重复推送 / 安装按 `agent_type`（或 capabilities 内 `interop_id`）更新，不造重复行

## API（`@xyai/xyos-bridge` · `InteropHost`）

| 方法 | 说明 |
|---|---|
| `listOutgoingAssets()` | 开发侧已推送（含 pending + installed） |
| `listIncomingAssets()` | 业务→开发 inbox + installed-dev |
| `pushToBiz(asset)` | 写入 outbox + package + **agent 自动 publish** |
| `installIncoming(id)` / `pullInstallFromBiz(id)` | 业务侧安装 + agent 幂等 publish |
| `selectAsset(id, 'biz'\|'dev')` | 标记选用；biz agent 确保备选员工存在 |
| `pushToDev(asset)` | 反向 stub/实装 |
| `registerInDev(id)` | 开发侧注册 inbox 资产 |
| `lastPublishResult` | 最近一次 OpenXYOS 导入结果（UI tip） |

IPC / `window.xyai`：`interopPushToBiz`、`interopInstall`、`interopSelect`、`interopListPendingBiz` 等。

## UI

- 开发空间 AgentRail / 知识库面板：**推送到业务空间**
- 业务空间工具栏：**资产互通** → 待安装「安装/注册」、已安装「选用」
- 安装成功 tip：人机资源 → 人才市场 / 备选员工

## 验证

1. 业务空间已启动 OpenXYOS 并登录（demo 租户即可）
2. 开发空间选「通用智能体」→ 推送到业务空间
3. OpenXYOS **人机资源 → 人才市场** 可见该 agent；**备选员工** 同步可见
4. 再次推送 / 安装同一资产 → 不产生重复行
5. （可选）资产互通面板安装/注册 → tip 提示已在人才市场/备选员工

```bash
# 包级单测
pnpm --filter @xyai/xyos-bridge test
```
