# INTEROP — 开发空间 ↔ 业务空间 资产互通

日期：2026-09-18（CST）  
范围：XYAI Studio 0.5 本地桥（file + HTTP），对齐 OpenXYOS 官方 Studio 导入合同。

## 产品约定

| 空间 | 对象 | 推送后 |
|---|---|---|
| **开发空间** | AI智能助手 | OpenXYOS **备选员工**（`employment_category=reserve`）。人才市场状态为 `recruited`，**不会**出现在「招募」列表。 |
| **开发空间** | 知识挂接 | OpenXYOS 知识库 `knowledge_files`（`folder=/`）+ `knowledge_notes` |
| **业务空间** | 安装/注册 / 选用 | 幂等再同步同一 `external_id` |

反向：业务侧资产可 `pushToDev` → 开发侧 inbox →「注册到开发空间」。

## 资产种类（MVP）

- `agent` — 开发空间 AI智能助手 → `POST /api/xyai/agents/import`
- `knowledge-mount` — 知识库挂接 → `POST /api/xyai/knowledge/import`
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

## OpenXYOS HTTP（官方合同）

请求头（两类导入相同）：

- `Authorization: Bearer <tenant JWT>`（Studio 用 demo 管理员登录获取）
- `X-XYAI-Interop: studio`

### 智能体 `POST /api/xyai/agents/import`

Body（扁平字段；`asset` 包装仍被 OpenXYOS 接受）：

- `name`（必填）
- `role` / `title`、`description`、`positioning`、`industry`
- `department` / `department_name` / `department_id`
- `agent_type`、`skills[]` / `capabilities[]`、`avatar_emoji`
- `employee_type`（默认 `ai`）
- `external_id` / `source_id` / `studio_id`（幂等键 = 互通资产 id）

落地：

- `talent_pool`：`source=studio`，`status=recruited`（**不是** `available`），`integration_type=studio-interop`，schema `openxyos.studio-agent.v1`
- `employees`：`employment_category=reserve`，`status=active`，`source=studio:{external_id}`
- 幂等：同一租户 + `external_id` 更新同一行

OpenXYOS UI 操作：

- **编辑** `PUT /api/org/employees/:id`（Studio 备选对租户成员放开；管理员始终可改）
- **录用** `POST /api/employees/:id/onboard`（reserve → internal）
- **不要**对 Studio 推送走人才市场「招募」（市场只列出 `status=available`）

### 知识库 `POST /api/xyai/knowledge/import`

Body：`name`（必填）、`description`、`external_id`、`payload`（`kbId` / `mountKind` / `sourceRoot` / `indexRoot`）。

落地：`knowledge_files.folder=/` + `knowledge_notes`，幂等 `external_id`。列表：`GET /api/knowledge/files/list?folder=/` 与 `GET /api/knowledge`。

## API（`@xyai/xyos-bridge` · `InteropHost`）

| 方法 | 说明 |
|---|---|
| `pushToBiz(asset)` | 写入 outbox + package；agent / knowledge-mount 自动 HTTP 导入 |
| `installIncoming(id)` | 业务侧安装 + 幂等再导入 |
| `selectAsset(id, 'biz'\|'dev')` | 标记选用；biz 再确保 OpenXYOS 行存在 |
| `lastPublishResult` | 最近一次导入结果（UI tip） |

IPC / `window.xyai`：`interopPushToBiz`、`interopInstall`、`interopSelect`、`interopListPendingBiz` 等。

## UI

- 开发空间 AgentRail / 知识库面板：**推送到业务空间**
- 业务空间工具栏：**资产互通** → 待安装「安装/注册」、已安装「选用」
- 安装成功 tip：人机资源 → **备选员工** 编辑 / 录用；知识库页刷新可见

## 验证

1. 业务空间已启动 OpenXYOS（demo 租户即可；Studio 会用 demo 账号取 JWT）
2. 开发空间推送智能体 → OpenXYOS **备选员工** 可见；人才市场不可见
3. 备选员工可 **编辑**、**录用**
4. 推送知识库 → 知识库文件（`/`）与笔记可见
5. 再次推送同一资产 → 不产生重复行

```bash
pnpm --filter @xyai/xyos-bridge test
pnpm --filter desktop test
```
