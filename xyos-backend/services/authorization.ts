/**
 * V1.0 H2A2A2H 四级授权引擎 + 三道关拒绝回喂 + 敏感动作门控
 *
 * 不变量（方案既定）：
 *   1. AI 产出永远是草稿，需人类 approve（人在回路，见 chats.ts / reviews.ts）
 *   2. 一切流转经状态机，非法跳转拒绝留痕（见 h2a2a2h-state-machine.ts）
 *   3. AI 动作过三道关（权限/通信规则/流程），拒绝必须回喂给 agent
 *   4. 全过程审计只增不改（governance_log + pending_reviews）
 *
 * 四级授权（L0–L3）：
 *   L0 自主       → 直接执行，仅审计留痕
 *   L1 报备       → 直接执行，但额外写入报备记录（供人事后审阅）
 *   L2 事前确认   → 阻断执行，写入 pending_reviews，等待人类 approve 后放行
 *   L3 禁止       → 永久拒绝，拒绝原因回喂 agent
 *
 * 三道关（任一关拒绝则整体拒绝）：
 *   Gate1 权限关     → h2a2a_permission_matrix（role_level × permission_type × scope）
 *   Gate2 通信规则关 → h2a2a_comm_rules（跨层级通信约束）
 *   Gate3 流程关     → h2a2a_process_templates（默认流程模板）
 */

import { dbGet, dbRun, dbAll } from "../db";

// ============================================================
// 类型定义
// ============================================================

/** 授权级别 */
export type AuthzLevel = 0 | 1 | 2 | 3;

/** 授权决策 */
export type AuthzDecision = "auto" | "report" | "confirm" | "deny";

export const AUTHZ_LEVEL_LABEL: Record<AuthzLevel, string> = {
  0: "L0 自主",
  1: "L1 报备",
  2: "L2 事前确认",
  3: "L3 禁止",
};

export interface ActionContext {
  tenantId: number;
  actorType: "human" | "ai";
  actorId: number;
  /** 角色/职级层级，用于权限矩阵匹配 */
  actorLevel: number;
  /** 动作类型，如 delete_file / payment / create_employee */
  actionType: string;
  /** 展示用动作标签 */
  actionLabel?: string;
  targetType?: string;
  targetId?: number | string;
  /** 跨层级通信参数（可选） */
  comm?: { senderLevel?: number; receiverLevel?: number; commType?: string };
  /** 动作描述文本，用于敏感关键词检测 */
  description?: string;
}

export interface GateCheck {
  gate: "permission" | "comm_rule" | "process";
  passed: boolean;
  reason: string;
  level?: AuthzLevel;
}

export interface AuthorizationResult {
  decision: AuthzDecision;
  level: AuthzLevel;
  /** 是否被放行（deny 为 false，其余为 true） */
  allowed: boolean;
  /** 是否需要等待人类（confirm）或永久禁止（deny） */
  blocked: boolean;
  reason: string;
  checks: GateCheck[];
  /** 命中的敏感类别（中文名） */
  sensitiveCategories: string[];
  /** 若创建了 pending_review，此处为 id */
  reviewId?: number;
  /** 拒绝回喂指令（供 agent loop 消费） */
  feedback?: string;
}

// ============================================================
// 敏感动作清单（10 类，默认 L2 事前确认；部分 L3 禁止）
// ============================================================

export interface SensitiveCategory {
  category: string;
  /** 默认授权级别 */
  level: AuthzLevel;
  /** 检测关键词（中文 + 英文，小写匹配） */
  keywords: string[];
}

export const SENSITIVE_ACTION_REGISTRY: SensitiveCategory[] = [
  { category: "财务",           level: 2, keywords: ["财务", "报销", "发票", "付款", "转账", "budget", "expense", "invoice", "finance"] },
  { category: "支付",           level: 2, keywords: ["支付", "付款", "打款", "汇款", "收款", "结算", "payment", "pay", "transfer", "settle"] },
  { category: "审批",           level: 2, keywords: ["审批", "核准", "签批", "approval", "approve", "authorize"] },
  { category: "数据删除",       level: 3, keywords: ["删除", "清空", "销毁", "抹除", "drop table", "delete", "truncate", "purge"] },
  { category: "系统配置",       level: 2, keywords: ["系统配置", "改配置", "权限配置", "部署", "发布上线", "system_config", "deploy", "config"] },
  { category: "人事任免",       level: 2, keywords: ["人事", "任免", "晋升", "降级", "解雇", "裁员", "录用", "personnel", "hire", "fire", "promote"] },
  { category: "合同签署",       level: 2, keywords: ["合同", "签署", "签约", "盖章", "用印", "contract", "sign", "seal"] },
  { category: "对外发布",       level: 2, keywords: ["对外发布", "公开声明", "新闻稿", "公告发布", "publish", "press release", "announce"] },
  { category: "法务合规",       level: 2, keywords: ["法务", "合规", "诉讼", "仲裁", "尽调", "legal", "compliance", "lawsuit", "litigation"] },
  { category: "信息安全",       level: 3, keywords: ["敏感数据", "越权访问", "密码", "密钥", "泄露", "security", "credential", "password", "secret"] },
];

/** 检测文本命中的敏感类别 */
export function detectSensitiveCategories(text: string): SensitiveCategory[] {
  const lower = (text || "").toLowerCase();
  return SENSITIVE_ACTION_REGISTRY.filter(cat => cat.keywords.some(k => lower.includes(k.toLowerCase())));
}

// ============================================================
// 默认治理规则种子（幂等）
// ============================================================

/** 确保权限矩阵 / 通信规则 / 流程模板有默认数据，否则治理引擎对所有动作返回 deny */
export function ensureGovernanceDefaults(tenantId: number): void {
  // 1. 权限矩阵：为常见动作类型 × 职级层级建立默认授权（scope = L0/L1/L2/L3）
  const permCount = dbGet("SELECT COUNT(*) as c FROM h2a2a_permission_matrix WHERE tenant_id = ?", [tenantId]) as any;
  if ((permCount?.c ?? 0) === 0) {
    // 敏感动作在矩阵里记为 L2/L3，其余通用动作记为 L0
    const rules: Array<[string, AuthzLevel]> = [
      ["payment", 2], ["finance", 2], ["approval", 2], ["personnel", 2],
      ["contract", 2], ["publish", 2], ["legal", 2], ["system_config", 2],
      ["data_delete", 3], ["security", 3],
    ];
    for (let level = 1; level <= 5; level++) {
      for (const [ptype, lvl] of rules) {
        dbRun(
          "INSERT OR IGNORE INTO h2a2a_permission_matrix (tenant_id, role_level, permission_type, scope, target_type) VALUES (?, ?, ?, ?, 'both')",
          [tenantId, level, ptype, `L${lvl}`]
        );
      }
    }
  }

  // 2. 通信规则：默认同层级直接通信；跨层级需 L2 审批（高层→低层 direct 放行，低层→高层 escalate）
  const commCount = dbGet("SELECT COUNT(*) as c FROM h2a2a_comm_rules WHERE tenant_id = ?", [tenantId]) as any;
  if ((commCount?.c ?? 0) === 0) {
    dbRun(
      "INSERT OR IGNORE INTO h2a2a_comm_rules (tenant_id, sender_level, receiver_level, comm_type, is_allowed, require_approval, approval_level) VALUES (?, ?, ?, 'escalate', 1, 1, 2)",
      [tenantId, 1, 5]
    );
  }

  // 3. 默认流程模板
  const tplCount = dbGet("SELECT COUNT(*) as c FROM h2a2a_process_templates WHERE tenant_id = ? AND is_default = 1", [tenantId]) as any;
  if ((tplCount?.c ?? 0) === 0) {
    dbRun(
      "INSERT INTO h2a2a_process_templates (tenant_id, name, description, template_type, steps_json, is_default) VALUES (?, ?, ?, ?, ?, 1)",
      [tenantId, "标准任务流程", "创建→认领→执行→提交→审核→完成", "standard",
        JSON.stringify([
          { step: "created", name: "创建" },
          { step: "claimed", name: "认领" },
          { step: "executing", name: "执行" },
          { step: "submitted", name: "提交" },
          { step: "reviewing", name: "审核" },
          { step: "completed", name: "完成" },
        ])]
    );
  }
}

// ============================================================
// 四级授权级别解析
// ============================================================

/**
 * 解析某个动作的授权级别。
 * 优先级：敏感清单 L3 禁止 > 权限矩阵 scope > 敏感清单默认 L2 > L0 自主。
 */
export function resolveAuthorizationLevel(ctx: ActionContext): { level: AuthzLevel; categories: string[]; matrixRule?: any } {
  ensureGovernanceDefaults(ctx.tenantId);
  const text = [ctx.actionType, ctx.actionLabel, ctx.description].filter(Boolean).join(" ");
  const categories = detectSensitiveCategories(text).map(c => c.category);

  // 1. 敏感清单 L3 禁止优先
  const banned = detectSensitiveCategories(text).filter(c => c.level === 3);
  if (banned.length > 0) {
    return { level: 3, categories };
  }

  // 2. 权限矩阵 scope（L0/L1/L2/L3）
  const matrixRule = dbGet(
    "SELECT * FROM h2a2a_permission_matrix WHERE tenant_id = ? AND role_level = ? AND permission_type = ?",
    [ctx.tenantId, ctx.actorLevel, ctx.actionType]
  );
  const scope = (matrixRule as any)?.scope;
  if (scope && /^L[0-3]$/.test(String(scope))) {
    return { level: Number(String(scope)[1]) as AuthzLevel, categories, matrixRule };
  }

  // 3. 敏感清单默认级别（多数为 L2）
  const sensitive = detectSensitiveCategories(text);
  if (sensitive.length > 0) {
    const maxLevel = Math.max(...sensitive.map(c => c.level)) as AuthzLevel;
    return { level: maxLevel, categories, matrixRule };
  }

  // 4. 默认自主
  return { level: 0, categories, matrixRule };
}

// ============================================================
// 三道关校验
// ============================================================

export function threeGates(ctx: ActionContext, level: AuthzLevel): GateCheck[] {
  const checks: GateCheck[] = [];

  // Gate1 权限关：L3 直接拒绝
  if (level === 3) {
    checks.push({ gate: "permission", passed: false, reason: `动作被列为 L3 禁止`, level: 3 });
  } else {
    const rule = dbGet(
      "SELECT * FROM h2a2a_permission_matrix WHERE tenant_id = ? AND role_level = ? AND permission_type = ?",
      [ctx.tenantId, ctx.actorLevel, ctx.actionType]
    );
    if (!rule) {
      // 无明确规则：L0 自主放行（已由 ensureGovernanceDefaults 兜底常见动作）
      checks.push({ gate: "permission", passed: true, reason: "无禁止规则，默认放行", level });
    } else if (String((rule as any).scope).startsWith("L3")) {
      checks.push({ gate: "permission", passed: false, reason: "权限矩阵标记为 L3 禁止", level: 3 });
    } else {
      checks.push({ gate: "permission", passed: true, reason: `权限矩阵授权 ${(rule as any).scope}`, level });
    }
  }

  // Gate2 通信规则关
  if (ctx.comm && ctx.comm.senderLevel != null && ctx.comm.receiverLevel != null) {
    const rule = dbGet(
      "SELECT * FROM h2a2a_comm_rules WHERE tenant_id = ? AND sender_level = ? AND receiver_level = ? AND comm_type = ?",
      [ctx.tenantId, ctx.comm.senderLevel, ctx.comm.receiverLevel, ctx.comm.commType || "direct"]
    );
    if (rule && !(rule as any).is_allowed) {
      checks.push({ gate: "comm_rule", passed: false, reason: "通信规则禁止该跨层级通信", level });
    } else {
      checks.push({ gate: "comm_rule", passed: true, reason: rule ? "通信规则放行" : "无通信限制" });
    }
  } else {
    checks.push({ gate: "comm_rule", passed: true, reason: "无跨层级通信" });
  }

  // Gate3 流程关：需存在默认流程模板
  const template = dbGet(
    "SELECT * FROM h2a2a_process_templates WHERE tenant_id = ? AND is_default = 1",
    [ctx.tenantId]
  );
  if (!template) {
    checks.push({ gate: "process", passed: false, reason: "缺少默认流程模板，拒绝无流程执行" });
  } else {
    checks.push({ gate: "process", passed: true, reason: `流程模板: ${(template as any).name}` });
  }

  return checks;
}

// ============================================================
// 授权主入口
// ============================================================

/**
 * 对 AI 动作执行四级授权 + 三道关。
 * - decision=auto   → 放行执行
 * - decision=report → 放行 + 写报备
 * - decision=confirm→ 阻断，写 pending_reviews，等人类 approve
 * - decision=deny   → 拒绝，回喂原因
 */
export function authorizeAction(ctx: ActionContext): AuthorizationResult {
  ensureGovernanceDefaults(ctx.tenantId);
  const { level, categories, matrixRule } = resolveAuthorizationLevel(ctx);
  const checks = threeGates(ctx, level);

  const anyDeny = checks.some(c => !c.passed);
  const decision: AuthzDecision = anyDeny || level === 3
    ? "deny"
    : level === 2
      ? "confirm"
      : level === 1
        ? "report"
        : "auto";

  const result: AuthorizationResult = {
    decision,
    level,
    allowed: decision !== "deny",
    blocked: decision === "confirm" || decision === "deny",
    reason: anyDeny
      ? checks.filter(c => !c.passed).map(c => c.reason).join("；")
      : AUTHZ_LEVEL_LABEL[level],
    checks,
    sensitiveCategories: categories,
  };

  // 审计日志（只增不改）
  try {
    dbRun(
      `INSERT INTO h2a2a_governance_log
        (tenant_id, action_id, actor_type, actor_id, actor_level, target_type, target_id, permission_check, comm_rule_check, process_check, result, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ctx.tenantId,
        `${ctx.actionType}_${ctx.actorId}_${Date.now()}`,
        ctx.actorType, ctx.actorId, ctx.actorLevel,
        ctx.targetType ?? null, ctx.targetId ?? null,
        checks.find(c => c.gate === "permission")?.passed ? "allow" : "deny",
        checks.find(c => c.gate === "comm_rule")?.passed ? "allow" : "deny",
        checks.find(c => c.gate === "process")?.passed ? "allow" : "deny",
        decision === "deny" ? "deny" : decision === "confirm" ? "pending" : "allow",
        result.reason,
      ]
    );
  } catch (e: any) {
    console.warn("[Authz] 治理日志写入失败:", e?.message ?? e);
  }

  // L2 事前确认：写 pending_reviews
  if (decision === "confirm") {
    const rid = dbRun(
      `INSERT INTO pending_reviews (tenant_id, review_type, initiator_user_id, ai_content, structured_data, status)
       VALUES (?, 'sensitive_action', ?, ?, ?, 'pending')`,
      [
        ctx.tenantId,
        ctx.actorId,
        `AI 动作「${ctx.actionLabel || ctx.actionType}」命中敏感类别[${categories.join(", ") || "敏感操作"}]，需 L2 事前确认`,
        JSON.stringify({ actionType: ctx.actionType, actionLabel: ctx.actionLabel, targetType: ctx.targetType, targetId: ctx.targetId, level, categories }),
      ]
    ).lastInsertRowid;
    result.reviewId = rid;
    result.feedback = `【治理门控】动作「${ctx.actionLabel || ctx.actionType}」需人工 L2 事前确认（命中敏感类别：${categories.join(", ")}）。已生成待审单 #${rid}，未经人类 approve 不得继续执行。`;
  }

  // L3 禁止：回喂原因
  if (decision === "deny") {
    result.feedback = `【治理门控】动作「${ctx.actionLabel || ctx.actionType}」被拒绝：${result.reason}。请改用合规的替代方案，或向人类申请授权后再执行。`;
  }

  return result;
}

// ============================================================
// 动作意图识别（区分"讨论敏感话题"与"执行敏感动作"）
// ============================================================

/** 动作动词：出现任一即视为"要动手执行"，而非仅讨论 */
const ACTION_VERBS = [
  "执行", "完成", "操作", "做", "处理", "发起", "创建", "新建", "删除", "修改", "更新",
  "支付", "打款", "付款", "转账", "签署", "签约", "盖章", "发布", "上线", "部署", "配置",
  "任免", "晋升", "降级", "解雇", "录用", "审批", "核准", "清空", "销毁", "重置", "导出",
  "批量", "批准", "授权", "execute", "create", "delete", "update", "deploy", "sign", "pay",
  "transfer", "publish", "configure", "grant", "approve", "run",
];

export function isActionRequest(text: string): boolean {
  const lower = (text || "").toLowerCase();
  return ACTION_VERBS.some(v => lower.includes(v.toLowerCase()));
}

/**
 * 对"用户请求"做门控分类：仅在「命中敏感类别 且 含动作意图」时才触发授权。
 * 纯讨论敏感话题（如"分析财务数据"）不门控，正常走 L0 自主讨论。
 */
export function classifyRequestAuthorization(params: {
  text: string;
  tenantId: number;
  actorType: "human" | "ai";
  actorId: number;
  actorLevel: number;
}): { gated: boolean; result?: AuthorizationResult } {
  const cats = detectSensitiveCategories(params.text);
  if (cats.length === 0) return { gated: false };
  if (!isActionRequest(params.text)) return { gated: false };
  const result = authorizeAction({
    tenantId: params.tenantId,
    actorType: params.actorType,
    actorId: params.actorId,
    actorLevel: params.actorLevel,
    actionType: "user_request",
    actionLabel: params.text.slice(0, 40),
    description: params.text,
  });
  return { gated: true, result };
}

// ============================================================
// 拒绝回喂（供 agent loop 消费）
// ============================================================

/**
 * 将拒绝结果格式化为可回喂给 agent 的指令文本。
 * agent 收到后应停止原动作，改写方案并重新提交。
 */
export function buildRejectionFeedback(result: AuthorizationResult): string {
  if (result.allowed) return "";
  const gateReasons = result.checks.filter(c => !c.passed).map(c => `- [${c.gate}] ${c.reason}`);
  return [
    result.feedback || "动作被治理引擎拒绝。",
    ...(gateReasons.length ? ["", "拒绝详情：", ...gateReasons] : []),
    "",
    "请停止该动作，输出修正后的方案并重新进入治理校验。",
  ].join("\n");
}

// ============================================================
// 人在回路放行查询（供确认流消费）
// ============================================================

export function getPendingAuthzReviews(tenantId: number, status = "pending") {
  return dbAll(
    "SELECT * FROM pending_reviews WHERE tenant_id = ? AND review_type = 'sensitive_action' AND status = ? ORDER BY created_at DESC",
    [tenantId, status]
  );
}
