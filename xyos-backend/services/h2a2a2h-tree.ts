/**
 * V1.0 呈现层 — Turn→Step→Block 四级层级树形数据模型
 *
 * 层级：Task（用户请求）→ Phase（拆解/思考/回复/点评/总结）→ Contribution（单个 AI 员工产出）→ Block（think/tool/text）
 *
 * 从扁平的 messages 表推导出嵌套树，持久化到 h2a2a2h_nodes（可追溯、可渲染）。
 */

import { dbRun, dbAll, dbGet } from "../db";

export type NodeType = "task" | "phase" | "contribution" | "block";
export type BlockKind = "think" | "tool" | "text";

export interface TreeNode {
  type: NodeType;
  key: string;
  title: string;
  content?: string;
  blockKind?: BlockKind;
  employeeName?: string;
  employeeRole?: string;
  phase?: string;
  children: TreeNode[];
}

interface MsgLike {
  id: number;
  sender_type: string;
  sender_name?: string;
  content?: string;
  reasoning?: string;
  message_type?: string;
  phase?: string;
  step_key?: string;
}

/** 工具类 phase（DSH 的 think/read/edit/pwsh/... step 词汇） */
const TOOL_PHASES = new Set([
  "read", "edit", "write", "pwsh", "bash", "execute", "code", "grep", "glob",
  "web_search", "web_fetch", "subagent", "send_message", "list_agents", "read_image",
  "tool", "step_tool",
]);

/** message_type → 阶段名 */
function phaseOf(msg: MsgLike): string {
  switch (msg.message_type) {
    case "ai_assign": return "decompose";
    case "ai_think": return "think";
    case "ai_reply": return "reply";
    case "ai_review": return "review";
    case "ai_summary": return "summary";
    case "meeting_minutes": return "minutes";
    case "ai_deep_exec":
    case "ai_deep_exec_progress": return "execute";
    default: return "progress";
  }
}

const PHASE_ORDER: Record<string, number> = {
  decompose: 0, think: 1, reply: 2, review: 3, summary: 4, minutes: 5, execute: 6, progress: 7,
};

const PHASE_TITLE: Record<string, string> = {
  decompose: "任务拆解与分工",
  think: "独立思考",
  reply: "方案拟定",
  review: "交叉点评",
  summary: "综合汇总",
  minutes: "会议纪要",
  execute: "深度执行",
  progress: "过程",
};

/** 从一条贡献消息中提取员工身份（step_key 形如 emp_12_reply / mgr_3_analyze） */
function employeeOf(msg: MsgLike): { name?: string; role?: string } {
  const name = msg.sender_name || "";
  return { name };
}

/**
 * 把扁平的 messages 推导为嵌套树（纯函数，可测）。
 * 分组：以 user 消息切 turn（Task）；turn 内按 message_type 归 phase；phase 内按 sender 归 contribution；
 * contribution 下按 reasoning(tool)/content 派生 block。
 */
export function buildTurnTree(messages: MsgLike[]): TreeNode[] {
  const tasks: TreeNode[] = [];
  // 用对象包装游标状态：闭包会修改这些游标，TS 无法追踪 let 变量的闭包赋值，
  // 对象属性保持声明类型（TreeNode | null），避免被窄化为 never。
  const state: {
    curTask: TreeNode | null;
    curPhase: TreeNode | null;
    curContrib: TreeNode | null;
    lastContribKey: string;
  } = { curTask: null, curPhase: null, curContrib: null, lastContribKey: "" };

  const ensureTask = (msg: MsgLike): TreeNode => {
    const node: TreeNode = {
      type: "task",
      key: `task-${msg.id}`,
      title: (msg.content || "").slice(0, 60) || "新任务",
      content: msg.content || "",
      children: [],
    };
    tasks.push(node);
    state.curTask = node;
    state.curPhase = null;
    state.curContrib = null;
    return node;
  };

  const ensurePhase = (msg: MsgLike): TreeNode => {
    const p = phaseOf(msg);
    const node: TreeNode = {
      type: "phase",
      key: `phase-${p}`,
      title: PHASE_TITLE[p] || p,
      phase: p,
      children: [],
    };
    state.curPhase = node;
    state.curTask!.children.push(node);
    state.curContrib = null;
    return node;
  };

  const ensureContrib = (msg: MsgLike): TreeNode => {
    const key = `${msg.step_key || msg.sender_name || "contribution"}-${msg.id}`;
    const emp = employeeOf(msg);
    const node: TreeNode = {
      type: "contribution",
      key,
      title: emp.name || "AI 员工",
      employeeName: emp.name,
      employeeRole: emp.role,
      content: msg.content || "",
      children: [],
    };
    state.curContrib = node;
    state.curPhase!.children.push(node);
    state.lastContribKey = key;
    return node;
  };

  for (const msg of messages) {
    const type = msg.message_type || "";
    const isUser = msg.sender_type === "user";

    if (isUser) {
      ensureTask(msg);
      continue;
    }

    if (!state.curTask) continue; // 首个 AI 消息之前没有用户消息，跳过

    // ai_progress 工具类 → 作为 block 挂到当前 contribution / phase
    if (type === "ai_progress") {
      const isTool = msg.phase && TOOL_PHASES.has(msg.phase);
      if (isTool) {
        if (!state.curContrib) ensureContrib({ ...msg, message_type: "ai_reply" });
        state.curContrib!.children.push({
          type: "block",
          key: `block-tool-${msg.id}`,
          title: msg.phase || "tool",
          blockKind: "tool",
          content: msg.content || "",
          children: [],
        });
      }
      // 非工具类 progress 忽略（receiving/analyzing/routing 等进度提示不进树）
      continue;
    }

    const p = phaseOf(msg);
    // 同一 phase 且同一 sender 连续 → 复用 contribution；否则新建
    const contribKey = `${msg.step_key || msg.sender_name || ""}`;
    const phaseChanged = !state.curPhase || state.curPhase.phase !== p;
    const contribChanged = !state.curContrib || state.lastContribKey !== `${contribKey}`;

    if (phaseChanged) ensurePhase(msg);
    if (!state.curContrib || contribChanged || phaseChanged) ensureContrib(msg);
    else {
      // 复用：追加内容（同一步骤的流式分段）
      state.curContrib.content = (state.curContrib.content || "") + (msg.content || "");
    }

    // 思考块
    if (msg.reasoning && msg.reasoning.trim()) {
      state.curContrib!.children.push({
        type: "block",
        key: `block-think-${msg.id}`,
        title: "Think",
        blockKind: "think",
        content: msg.reasoning,
        children: [],
      });
    }
    // 文本块（有正文内容）
    if (msg.content && msg.content.trim() && (type !== "ai_think" || !msg.reasoning)) {
      state.curContrib!.children.push({
        type: "block",
        key: `block-text-${msg.id}`,
        title: "结论",
        blockKind: "text",
        content: msg.content,
        children: [],
      });
    }
  }

  // 按 phase 顺序排序
  for (const task of tasks) {
    task.children.sort((a, b) => (PHASE_ORDER[a.phase || ""] ?? 99) - (PHASE_ORDER[b.phase || ""] ?? 99));
  }
  return tasks;
}

/** 持久化树到 h2a2a2h_nodes（重建式，先清后插；树是投影，非审计，允许重建） */
export function persistTurnTree(chatId: number, tenantId: number, turnKey: string, tree: TreeNode[]): void {
  dbRun("DELETE FROM h2a2a2h_nodes WHERE chat_id = ? AND turn_key = ?", [chatId, turnKey]);
  let sort = 0;
  const walk = (nodes: TreeNode[], parentId: number | null) => {
    for (const n of nodes) {
      const r = dbRun(
        `INSERT INTO h2a2a2h_nodes (chat_id, tenant_id, turn_key, parent_id, node_type, block_kind, title, content, employee_name, employee_role, phase, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [chatId, tenantId, turnKey, parentId, n.type, n.blockKind ?? null, n.title, n.content ?? null, n.employeeName ?? null, n.employeeRole ?? null, n.phase ?? null, sort++]
      );
      walk(n.children, r.lastInsertRowid);
    }
  };
  walk(tree, null);
}

/** 取某聊天某轮（turnKey）的持久化树 */
export function getPersistedTree(chatId: number, turnKey: string): TreeNode[] {
  const rows = dbAll(
    "SELECT * FROM h2a2a2h_nodes WHERE chat_id = ? AND turn_key = ? ORDER BY sort_order",
    [chatId, turnKey]
  ) as any[];
  const map = new Map<number, TreeNode>();
  const roots: TreeNode[] = [];
  for (const row of rows) {
    const node: TreeNode = {
      type: row.node_type,
      key: `${row.node_type}-${row.id}`,
      title: row.title,
      content: row.content ?? undefined,
      blockKind: row.block_kind ?? undefined,
      employeeName: row.employee_name ?? undefined,
      employeeRole: row.employee_role ?? undefined,
      phase: row.phase ?? undefined,
      children: [],
    };
    map.set(row.id, node);
  }
  for (const row of rows) {
    const node = map.get(row.id)!;
    if (row.parent_id && map.has(row.parent_id)) {
      map.get(row.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** 从 chat 的 messages 构建并持久化整棵会话树（按 turn 切分）。 */
export function rebuildChatTree(chatId: number, tenantId: number): TreeNode[] {
  const messages = dbAll(
    "SELECT id, sender_type, sender_name, content, reasoning, message_type, phase, step_key FROM messages WHERE chat_id = ? AND tenant_id = ? AND deleted_at IS NULL ORDER BY created_at ASC, id ASC",
    [chatId, tenantId]
  ) as MsgLike[];

  // 按 user 消息切 turn，逐 turn 持久化
  const turns: { key: string; msgs: MsgLike[] }[] = [];
  let cur: MsgLike[] = [];
  let curKey = "";
  for (const m of messages) {
    if (m.sender_type === "user") {
      if (cur.length) turns.push({ key: curKey, msgs: cur });
      cur = [];
      curKey = `turn-${m.id}`;
    }
    cur.push(m);
  }
  if (cur.length) turns.push({ key: curKey, msgs: cur });

  const allRoots: TreeNode[] = [];
  for (const t of turns) {
    const roots = buildTurnTree(t.msgs);
    persistTurnTree(chatId, tenantId, t.key, roots);
    allRoots.push(...roots);
  }
  return allRoots;
}
