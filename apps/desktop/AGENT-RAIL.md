# AGENT-RAIL — 开发空间对话协作侧栏

- 日期：2026-09-17（CST）
- 范围：开发空间 → 对话 left rail（对标 openXYOS「沟通协作」IA，**蓝天主题**）

## 领域区分（产品锁定）

| 空间 | 对象 | 说明 |
|---|---|---|
| **开发空间** | **AI智能助手**（agents） | 扁平列表，无组织/部门树；无岗位/角色 HR |
| **业务空间 / openXYOS** | **AI员工 / 同事** | 仅推送到业务空间并完成组织分配后成为 AI 员工 |

本阶段 **不做** 完整 AI 员工 HR / 多智能体编排运行时；创建会话 + 元数据绑定即可。

## 侧栏 IA

1. 标题：**对话**
2. Tab：**智能体列表** | **会话列表**
3. **智能体列表**：扁平；默认 `agent-general` / **通用智能体** / **AI智能助手** / **AI** 徽章 / 在线蓝点
4. **会话列表**（层级）：
   ```
   Project（可折叠）
     Task（可折叠；已归档 muted）
       单聊 session(s)   — 图标 🤖 + 「单聊」徽章
       群聊 session(s)   — 图标 # + 「群聊」徽章
   ```
5. 未分组会话归入 **默认项目** → 任务 **通用对话**（`proj-default` / `task-general`）
6. 页脚：**新对话**（蓝）+ **新建项目**

## 项目 / 任务 / 安排工作

| 能力 | 行为 |
|---|---|
| 新建/编辑项目 | 自定义名称；挂接本地工作目录（路径文本 + 可选目录选择对话框） |
| 任务 | 每项目多任务；编辑 / 删除 / 归档 |
| 安排工作 | 选智能体（可多选）→ 单聊（每位一会话）或 群聊（共享一会话，可命名）→ 写入该任务下 |

## 持久化

- 文件：Electron `userData/collab-rail.json`（main `collab-store.ts`）
- 存：projects / tasks / session meta（`kind: dm|group`, `projectId`, `taskId`, `agentIds[]`, optional title）+ 折叠态
- 会话正文仍走 CodexHost session id；rail 只挂元数据

## 文件地图

| 文件 | 职责 |
|---|---|
| `src/main/collab-store.ts` | JSON 持久化 + CRUD |
| `src/main/main.ts` | collab IPC + `dialog.showOpenDialog` 选目录 |
| `src/preload/preload.ts` / `xyai-api.d.ts` | 暴露 collab API |
| `src/renderer/chat/agents.ts` | 默认智能体 |
| `src/renderer/chat/agent-rail.ts` | 智能体列表 UI |
| `src/renderer/chat/session-rail.ts` | Project→Task→Session 树 |
| `src/renderer/chat/collab-modals.ts` | 项目/任务/安排工作弹窗 |
| `src/renderer/chat/collab-types.ts` | 渲染侧类型 |
| `src/renderer/chat/index.ts` | 装配与绑定逻辑 |

主题：`--sky-*` / accent 蓝；禁止 openXYOS 绿主色。
