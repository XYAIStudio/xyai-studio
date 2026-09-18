# PHASE-RAIL-DONE — 对话协作侧栏（智能体 | 项目/任务/单聊·群聊）

- 完成日：2026-09-17（CST）
- 工作区：`/workspace/xyai-studio-0.5`

## 交付

1. Tab：智能体列表 | 会话列表；页脚「新对话」「新建项目」
2. 默认智能体 `agent-general`（扁平、无组织树）
3. 会话树：Project → Task → 单聊/群聊（图标与徽章区分）
4. 默认落点：`默认项目` / `通用对话`
5. 项目：名称 + cwd（文本 / 浏览目录）
6. 任务：新建 / 编辑 / 删除 / 归档
7. 安排工作：多选智能体 → 单聊或群聊 → 创建并绑定 host session
8. 持久化：`userData/collab-rail.json`
9. 文档：`AGENT-RAIL.md`；CHAT-ARCHITECTURE 领域注记
10. 蓝天主题 CSS

## 明确未做 / stub

- 真实多智能体编排运行时（创建会话即够）
- 创建群组 UI 独立入口（用任务「安排」→ 群聊）
- AI 员工 HR / 部门树
- Windows 打包（父任务）

## 验收

- [x] 单聊 vs 群聊视觉区分
- [x] 项目/任务 CRUD + 归档
- [x] 安排工作创建 DM/Group
- [x] collab-rail.json 持久化路径就绪
- [x] `pnpm --filter desktop build` 通过
