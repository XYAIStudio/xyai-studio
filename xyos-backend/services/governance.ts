import { dbRun, dbGet, dbAll } from "../db";

export interface PermissionCheck {
  tenantId: number;
  actorLevel: number;
  actorType: string;
  actionType?: string;
  targetType?: string;
  actorId?: number;
  targetId?: number | string;
  action?: string;
}

export interface CommRuleCheck {
  tenantId: number;
  senderLevel: number;
  receiverLevel: number;
  commType: string;
}

export class GovernanceEngine {
  static validateAction(params: PermissionCheck): { allowed: boolean; reason: string; rule?: any } {
    const permission = dbGet(
      "SELECT * FROM h2a2a_permission_matrix WHERE tenant_id = ? AND role_level = ? AND permission_type = ?",
      [params.tenantId, params.actorLevel, params.actionType]
    );

    if (!permission) {
      return { allowed: false, reason: "无匹配权限规则" };
    }

    if (params.targetType && (permission as any).target_type !== "both" && (permission as any).target_type !== params.targetType) {
      return { allowed: false, reason: "目标类型不匹配", rule: permission };
    }

    return { allowed: true, reason: "通过", rule: permission };
  }

  static checkCommRule(params: CommRuleCheck): { allowed: boolean; reason: string; rule?: any } {
    const rule = dbGet(
      "SELECT * FROM h2a2a_comm_rules WHERE tenant_id = ? AND sender_level = ? AND receiver_level = ? AND comm_type = ?",
      [params.tenantId, params.senderLevel, params.receiverLevel, params.commType]
    );

    if (!rule) {
      return { allowed: true, reason: "无规则限制，默认允许" };
    }

    if (!(rule as any).is_allowed) {
      return { allowed: false, reason: "通信规则禁止", rule };
    }

    if ((rule as any).require_approval) {
      return { allowed: true, reason: `需要L${(rule as any).approval_level}审批`, rule };
    }

    return { allowed: true, reason: "通过", rule };
  }

  static smartRoute(params: { tenantId: number; taskComplexity: string; teamHasManager: boolean }): { mode: string; reason: string } {
    if (params.taskComplexity === "complex" && params.teamHasManager) {
      return { mode: "hierarchical", reason: "复杂任务+有管理者，使用层级制" };
    }
    return { mode: "peer", reason: "简单任务或无管理者，使用平级制" };
  }

  // 级联否决校验（三维治理）
  static cascadeValidation(params: {
    tenantId: number;
    actorLevel: number;
    actionType: string;
    senderLevel?: number;
    receiverLevel?: number;
    commType?: string;
    targetType?: string;
  }): { allowed: boolean; checks: any[]; reason: string } {
    const checks: any[] = [];

    // 1. 职级治理校验
    const permCheck = this.validateAction({
      tenantId: params.tenantId,
      actorLevel: params.actorLevel,
      actorType: "",
      actionType: params.actionType,
      targetType: params.targetType,
    });
    checks.push({ type: "permission", ...permCheck });
    if (!permCheck.allowed) {
      return { allowed: false, checks, reason: `职级校验失败: ${permCheck.reason}` };
    }

    // 2. 权限治理校验（如涉及跨层级通信）
    if (params.senderLevel && params.receiverLevel && params.commType) {
      const commCheck = this.checkCommRule({
        tenantId: params.tenantId,
        senderLevel: params.senderLevel,
        receiverLevel: params.receiverLevel,
        commType: params.commType,
      });
      checks.push({ type: "comm_rule", ...commCheck });
      if (!commCheck.allowed) {
        return { allowed: false, checks, reason: `通信规则校验失败: ${commCheck.reason}` };
      }
    }

    // 3. 流程治理校验
    const template = dbGet(
      "SELECT * FROM h2a2a_process_templates WHERE tenant_id = ? AND is_default = 1",
      [params.tenantId]
    );
    if (template) {
      checks.push({ type: "process", allowed: true, reason: `使用流程模板: ${(template as any).name}` });
    }

    return { allowed: true, checks, reason: "三维治理校验通过" };
  }

  static logGovernance(params: {
    tenantId: number;
    actionId?: string;
    actorType: string;
    actorId: number;
    actorLevel?: number;
    targetType?: string;
    targetId?: number;
    permissionCheck?: string;
    commRuleCheck?: string;
    processCheck?: string;
    result: string;
    reason?: string;
  }) {
    dbRun(
      `INSERT INTO h2a2a_governance_log (tenant_id, action_id, actor_type, actor_id, actor_level, target_type, target_id, permission_check, comm_rule_check, process_check, result, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [params.tenantId, params.actionId, params.actorType, params.actorId, params.actorLevel, params.targetType, params.targetId, params.permissionCheck, params.commRuleCheck, params.processCheck, params.result, params.reason]
    );
  }

  static getPermissionMatrix(tenantId: number) {
    return dbAll("SELECT * FROM h2a2a_permission_matrix WHERE tenant_id = ? ORDER BY role_level, permission_type", [tenantId]);
  }

  static getCommRules(tenantId: number) {
    return dbAll("SELECT * FROM h2a2a_comm_rules WHERE tenant_id = ? ORDER BY sender_level, receiver_level", [tenantId]);
  }

  static getProcessTemplates(tenantId: number) {
    return dbAll("SELECT * FROM h2a2a_process_templates WHERE tenant_id = ?", [tenantId]);
  }

  static getGovernanceLogs(tenantId: number, limit = 50) {
    return dbAll("SELECT * FROM h2a2a_governance_log WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?", [tenantId, limit]);
  }

  // 获取治理统计概览
  static getGovernanceStats(tenantId: number) {
    const totalLogs = dbGet("SELECT COUNT(*) as count FROM h2a2a_governance_log WHERE tenant_id = ?", [tenantId])?.count || 0;
    const allowedLogs = dbGet("SELECT COUNT(*) as count FROM h2a2a_governance_log WHERE tenant_id = ? AND result = 'allow'", [tenantId])?.count || 0;
    const deniedLogs = dbGet("SELECT COUNT(*) as count FROM h2a2a_governance_log WHERE tenant_id = ? AND result = 'deny'", [tenantId])?.count || 0;
    const pendingLogs = dbGet("SELECT COUNT(*) as count FROM h2a2a_governance_log WHERE tenant_id = ? AND result = 'pending'", [tenantId])?.count || 0;

    const permCount = dbGet("SELECT COUNT(*) as count FROM h2a2a_permission_matrix WHERE tenant_id = ?", [tenantId])?.count || 0;
    const commRuleCount = dbGet("SELECT COUNT(*) as count FROM h2a2a_comm_rules WHERE tenant_id = ?", [tenantId])?.count || 0;
    const templateCount = dbGet("SELECT COUNT(*) as count FROM h2a2a_process_templates WHERE tenant_id = ?", [tenantId])?.count || 0;

    // 按操作类型统计
    const actionStats = dbAll(
      "SELECT permission_check as action, COUNT(*) as count, SUM(CASE WHEN result = 'allow' THEN 1 ELSE 0 END) as allowed FROM h2a2a_governance_log WHERE tenant_id = ? GROUP BY permission_check",
      [tenantId]
    );

    // 按角色层级统计
    const levelStats = dbAll(
      "SELECT actor_level, COUNT(*) as count, SUM(CASE WHEN result = 'allow' THEN 1 ELSE 0 END) as allowed FROM h2a2a_governance_log WHERE tenant_id = ? GROUP BY actor_level",
      [tenantId]
    );

    // 最近7天趋势
    const recentTrend = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDateStr = nextDate.toISOString().split('T')[0];
      
      const count = dbGet(
        "SELECT COUNT(*) as count FROM h2a2a_governance_log WHERE tenant_id = ? AND created_at >= ? AND created_at < ?",
        [tenantId, dateStr, nextDateStr]
      )?.count || 0;
      const allowed = dbGet(
        "SELECT COUNT(*) as count FROM h2a2a_governance_log WHERE tenant_id = ? AND result = 'allow' AND created_at >= ? AND created_at < ?",
        [tenantId, dateStr, nextDateStr]
      )?.count || 0;
      
      recentTrend.push({ date: dateStr, total: count, allowed, denied: count - allowed });
    }

    return {
      overview: {
        totalLogs,
        allowedLogs,
        deniedLogs,
        pendingLogs,
        allowRate: totalLogs > 0 ? Math.round((allowedLogs / totalLogs) * 100) : 0,
        permCount,
        commRuleCount,
        templateCount,
      },
      actionStats,
      levelStats,
      recentTrend,
    };
  }

  // 获取治理规则详情（用于编辑）
  static getPermissionDetail(tenantId: number, id: number) {
    return dbGet("SELECT * FROM h2a2a_permission_matrix WHERE tenant_id = ? AND id = ?", [tenantId, id]);
  }

  static getCommRuleDetail(tenantId: number, id: number) {
    return dbGet("SELECT * FROM h2a2a_comm_rules WHERE tenant_id = ? AND id = ?", [tenantId, id]);
  }

  // 创建/更新流程模板
  static createProcessTemplate(tenantId: number, params: {
    name: string;
    description?: string;
    template_type: string;
    steps_json: string;
    is_default?: number;
  }) {
    dbRun(
      `INSERT INTO h2a2a_process_templates (tenant_id, name, description, template_type, steps_json, is_default)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, params.name, params.description || null, params.template_type, params.steps_json, params.is_default || 0]
    );
  }

  static updateProcessTemplate(tenantId: number, id: number, params: {
    name?: string;
    description?: string;
    template_type?: string;
    steps_json?: string;
    is_default?: number;
  }) {
    const fields: string[] = [];
    const values: any[] = [];
    
    if (params.name !== undefined) { fields.push("name = ?"); values.push(params.name); }
    if (params.description !== undefined) { fields.push("description = ?"); values.push(params.description); }
    if (params.template_type !== undefined) { fields.push("template_type = ?"); values.push(params.template_type); }
    if (params.steps_json !== undefined) { fields.push("steps_json = ?"); values.push(params.steps_json); }
    if (params.is_default !== undefined) { fields.push("is_default = ?"); values.push(params.is_default); }
    
    if (fields.length === 0) return;
    
    values.push(tenantId, id);
    dbRun(`UPDATE h2a2a_process_templates SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`, values);
  }

  static deleteProcessTemplate(tenantId: number, id: number) {
    dbRun("DELETE FROM h2a2a_process_templates WHERE tenant_id = ? AND id = ?", [tenantId, id]);
  }

  static updatePermissionMatrix(tenantId: number, rules: { role_level: number; permission_type: string; scope: string; target_type: string }[]) {
    for (const rule of rules) {
      dbRun(
        "INSERT OR REPLACE INTO h2a2a_permission_matrix (tenant_id, role_level, permission_type, scope, target_type) VALUES (?, ?, ?, ?, ?)",
        [tenantId, rule.role_level, rule.permission_type, rule.scope, rule.target_type]
      );
    }
  }

  static updateCommRules(tenantId: number, rules: { sender_level: number; receiver_level: number; comm_type: string; is_allowed: number; require_approval: number; approval_level?: number }[]) {
    for (const rule of rules) {
      dbRun(
        "INSERT OR REPLACE INTO h2a2a_comm_rules (tenant_id, sender_level, receiver_level, comm_type, is_allowed, require_approval, approval_level) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [tenantId, rule.sender_level, rule.receiver_level, rule.comm_type, rule.is_allowed, rule.require_approval, rule.approval_level || null]
      );
    }
  }
}
