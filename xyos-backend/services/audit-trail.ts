import { dbRun, dbGet, dbAll } from "../db";

export class AuditTrailEngine {
  // 记录聊天消息
  static archiveMessage(params: {
    tenantId: number;
    chatId: number;
    messageId: number;
    senderType: string;
    senderId: number;
    senderName: string;
    content: string;
    messageType?: string;
    metadata?: any;
    createdAt: string;
  }) {
    try {
      dbRun(
        `INSERT INTO chat_archive (tenant_id, chat_id, message_id, sender_type, sender_id, sender_name, content, message_type, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          params.tenantId,
          params.chatId,
          params.messageId,
          params.senderType,
          params.senderId,
          params.senderName,
          params.content,
          params.messageType || 'text',
          JSON.stringify(params.metadata || {}),
          params.createdAt
        ]
      );
    } catch (err) {
      console.error("[审计] 归档聊天消息失败:", err);
    }
  }

  // 记录组织行为
  static logOrgBehavior(params: {
    tenantId: number;
    actorType: string;
    actorId: number;
    actorName: string;
    actionType: string;
    actionDetail: string;
    targetType?: string;
    targetId?: number;
    targetName?: string;
    beforeState?: any;
    afterState?: any;
    context?: any;
    governanceRule?: string;
    governanceResult?: string;
  }) {
    try {
      dbRun(
        `INSERT INTO org_behavior_audit (tenant_id, actor_type, actor_id, actor_name, action_type, action_detail, target_type, target_id, target_name, before_state, after_state, context, governance_rule, governance_result)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          params.tenantId,
          params.actorType,
          params.actorId,
          params.actorName,
          params.actionType,
          params.actionDetail,
          params.targetType || null,
          params.targetId || null,
          params.targetName || null,
          params.beforeState ? JSON.stringify(params.beforeState) : null,
          params.afterState ? JSON.stringify(params.afterState) : null,
          JSON.stringify(params.context || {}),
          params.governanceRule || null,
          params.governanceResult || null
        ]
      );
    } catch (err) {
      console.error("[审计] 记录组织行为失败:", err);
    }
  }

  // 记录AI行为
  static logAgentBehavior(params: {
    tenantId: number;
    agentId: number;
    agentName: string;
    behaviorType: string;
    behaviorDetail: any;
    inputContext?: string;
    outputResult?: string;
    tokenUsed?: number;
    durationMs?: number;
    success?: boolean;
    errorMessage?: string;
  }) {
    try {
      dbRun(
        `INSERT INTO agent_behavior_log (tenant_id, agent_id, agent_name, behavior_type, behavior_detail, input_context, output_result, token_used, duration_ms, success, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          params.tenantId,
          params.agentId,
          params.agentName,
          params.behaviorType,
          JSON.stringify(params.behaviorDetail),
          params.inputContext || null,
          params.outputResult || null,
          params.tokenUsed || null,
          params.durationMs || null,
          params.success !== false ? 1 : 0,
          params.errorMessage || null
        ]
      );
    } catch (err) {
      console.error("[审计] 记录AI行为失败:", err);
    }
  }

  // 获取审计统计概览
  static getStatsOverview(tenantId: number) {
    const chatTotal = dbGet("SELECT COUNT(*) as count FROM chat_archive WHERE tenant_id = ?", [tenantId])?.count || 0;
    const behaviorTotal = dbGet("SELECT COUNT(*) as count FROM org_behavior_audit WHERE tenant_id = ?", [tenantId])?.count || 0;
    const agentTotal = dbGet("SELECT COUNT(*) as count FROM agent_behavior_log WHERE tenant_id = ?", [tenantId])?.count || 0;

    const today = new Date().toISOString().split('T')[0];
    const chatToday = dbGet("SELECT COUNT(*) as count FROM chat_archive WHERE tenant_id = ? AND created_at >= ?", [tenantId, today])?.count || 0;
    const behaviorToday = dbGet("SELECT COUNT(*) as count FROM org_behavior_audit WHERE tenant_id = ? AND created_at >= ?", [tenantId, today])?.count || 0;
    const agentToday = dbGet("SELECT COUNT(*) as count FROM agent_behavior_log WHERE tenant_id = ? AND created_at >= ?", [tenantId, today])?.count || 0;

    const agentTokenTotal = dbGet("SELECT COALESCE(SUM(token_used), 0) as total FROM agent_behavior_log WHERE tenant_id = ?", [tenantId])?.total || 0;
    const agentSuccessRate = dbGet("SELECT COUNT(CASE WHEN success = 1 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) as rate FROM agent_behavior_log WHERE tenant_id = ?", [tenantId])?.rate || 100;

    const recentBehaviors = dbAll(
      `SELECT actor_name, action_type, action_detail, created_at FROM org_behavior_audit WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 5`,
      [tenantId]
    );

    return {
      totals: { chat: chatTotal, behavior: behaviorTotal, agent: agentTotal, all: chatTotal + behaviorTotal + agentTotal },
      today: { chat: chatToday, behavior: behaviorToday, agent: agentToday, all: chatToday + behaviorToday + agentToday },
      agentStats: { tokenTotal: agentTokenTotal, successRate: Math.round(agentSuccessRate * 10) / 10 },
      recentBehaviors
    };
  }

  // 获取7天趋势数据
  static getDailyTrend(tenantId: number, days: number = 7) {
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDateStr = nextDate.toISOString().split('T')[0];

      const chat = dbGet("SELECT COUNT(*) as count FROM chat_archive WHERE tenant_id = ? AND created_at >= ? AND created_at < ?", [tenantId, dateStr, nextDateStr])?.count || 0;
      const behavior = dbGet("SELECT COUNT(*) as count FROM org_behavior_audit WHERE tenant_id = ? AND created_at >= ? AND created_at < ?", [tenantId, dateStr, nextDateStr])?.count || 0;
      const agent = dbGet("SELECT COUNT(*) as count FROM agent_behavior_log WHERE tenant_id = ? AND created_at >= ? AND created_at < ?", [tenantId, dateStr, nextDateStr])?.count || 0;

      result.push({ date: dateStr, chat, behavior, agent, total: chat + behavior + agent });
    }
    return result;
  }

  // 获取行为类型分布
  static getActionTypeDistribution(tenantId: number) {
    const chatTypes = dbAll(
      "SELECT sender_type as type, COUNT(*) as count FROM chat_archive WHERE tenant_id = ? GROUP BY sender_type",
      [tenantId]
    );
    const actionTypes = dbAll(
      "SELECT action_type as type, COUNT(*) as count FROM org_behavior_audit WHERE tenant_id = ? GROUP BY action_type",
      [tenantId]
    );
    const behaviorTypes = dbAll(
      "SELECT behavior_type as type, COUNT(*) as count FROM agent_behavior_log WHERE tenant_id = ? GROUP BY behavior_type",
      [tenantId]
    );
    return { chatTypes, actionTypes, behaviorTypes };
  }

  // 查询聊天记录
  static searchChatHistory(params: {
    tenantId: number;
    keyword?: string;
    senderType?: string;
    senderId?: number;
    chatId?: number;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    let sql = "SELECT * FROM chat_archive WHERE tenant_id = ?";
    const args: any[] = [params.tenantId];

    if (params.keyword) {
      sql += " AND content LIKE ?";
      args.push(`%${params.keyword}%`);
    }
    if (params.senderType) {
      sql += " AND sender_type = ?";
      args.push(params.senderType);
    }
    if (params.senderId) {
      sql += " AND sender_id = ?";
      args.push(params.senderId);
    }
    if (params.chatId) {
      sql += " AND chat_id = ?";
      args.push(params.chatId);
    }
    if (params.dateFrom) {
      sql += " AND created_at >= ?";
      args.push(params.dateFrom);
    }
    if (params.dateTo) {
      sql += " AND created_at <= ?";
      args.push(params.dateTo);
    }

    sql += " ORDER BY created_at DESC";
    const page = params.page || 1;
    const limit = params.limit || 50;
    sql += ` LIMIT ${limit} OFFSET ${(page - 1) * limit}`;

    return dbAll(sql, args);
  }

  // 查询聊天记录总数
  static countChatHistory(params: {
    tenantId: number;
    keyword?: string;
    senderType?: string;
    senderId?: number;
    chatId?: number;
    dateFrom?: string;
    dateTo?: string;
  }) {
    let sql = "SELECT COUNT(*) as total FROM chat_archive WHERE tenant_id = ?";
    const args: any[] = [params.tenantId];

    if (params.keyword) {
      sql += " AND content LIKE ?";
      args.push(`%${params.keyword}%`);
    }
    if (params.senderType) {
      sql += " AND sender_type = ?";
      args.push(params.senderType);
    }
    if (params.senderId) {
      sql += " AND sender_id = ?";
      args.push(params.senderId);
    }
    if (params.chatId) {
      sql += " AND chat_id = ?";
      args.push(params.chatId);
    }
    if (params.dateFrom) {
      sql += " AND created_at >= ?";
      args.push(params.dateFrom);
    }
    if (params.dateTo) {
      sql += " AND created_at <= ?";
      args.push(params.dateTo);
    }

    const result = dbGet(sql, args);
    return result?.total || 0;
  }

  // 查询组织行为
  static queryOrgBehaviors(params: {
    tenantId: number;
    actorType?: string;
    actorId?: number;
    actionType?: string;
    targetType?: string;
    targetId?: number;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    let sql = "SELECT * FROM org_behavior_audit WHERE tenant_id = ?";
    const args: any[] = [params.tenantId];

    if (params.actorType) {
      sql += " AND actor_type = ?";
      args.push(params.actorType);
    }
    if (params.actorId) {
      sql += " AND actor_id = ?";
      args.push(params.actorId);
    }
    if (params.actionType) {
      sql += " AND action_type = ?";
      args.push(params.actionType);
    }
    if (params.targetType) {
      sql += " AND target_type = ?";
      args.push(params.targetType);
    }
    if (params.targetId) {
      sql += " AND target_id = ?";
      args.push(params.targetId);
    }
    if (params.dateFrom) {
      sql += " AND created_at >= ?";
      args.push(params.dateFrom);
    }
    if (params.dateTo) {
      sql += " AND created_at <= ?";
      args.push(params.dateTo);
    }

    sql += " ORDER BY created_at DESC";
    const page = params.page || 1;
    const limit = params.limit || 50;
    sql += ` LIMIT ${limit} OFFSET ${(page - 1) * limit}`;

    return dbAll(sql, args);
  }

  // 查询组织行为总数
  static countOrgBehaviors(params: {
    tenantId: number;
    actorType?: string;
    actorId?: number;
    actionType?: string;
    targetType?: string;
    targetId?: number;
    dateFrom?: string;
    dateTo?: string;
  }) {
    let sql = "SELECT COUNT(*) as total FROM org_behavior_audit WHERE tenant_id = ?";
    const args: any[] = [params.tenantId];

    if (params.actorType) {
      sql += " AND actor_type = ?";
      args.push(params.actorType);
    }
    if (params.actorId) {
      sql += " AND actor_id = ?";
      args.push(params.actorId);
    }
    if (params.actionType) {
      sql += " AND action_type = ?";
      args.push(params.actionType);
    }
    if (params.targetType) {
      sql += " AND target_type = ?";
      args.push(params.targetType);
    }
    if (params.targetId) {
      sql += " AND target_id = ?";
      args.push(params.targetId);
    }
    if (params.dateFrom) {
      sql += " AND created_at >= ?";
      args.push(params.dateFrom);
    }
    if (params.dateTo) {
      sql += " AND created_at <= ?";
      args.push(params.dateTo);
    }

    const result = dbGet(sql, args);
    return result?.total || 0;
  }

  // 查询AI行为
  static queryAgentBehaviors(params: {
    tenantId: number;
    agentId?: number;
    behaviorType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    let sql = "SELECT * FROM agent_behavior_log WHERE tenant_id = ?";
    const args: any[] = [params.tenantId];

    if (params.agentId) {
      sql += " AND agent_id = ?";
      args.push(params.agentId);
    }
    if (params.behaviorType) {
      sql += " AND behavior_type = ?";
      args.push(params.behaviorType);
    }
    if (params.dateFrom) {
      sql += " AND created_at >= ?";
      args.push(params.dateFrom);
    }
    if (params.dateTo) {
      sql += " AND created_at <= ?";
      args.push(params.dateTo);
    }

    sql += " ORDER BY created_at DESC";
    const page = params.page || 1;
    const limit = params.limit || 50;
    sql += ` LIMIT ${limit} OFFSET ${(page - 1) * limit}`;

    return dbAll(sql, args);
  }

  // 查询AI行为总数
  static countAgentBehaviors(params: {
    tenantId: number;
    agentId?: number;
    behaviorType?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    let sql = "SELECT COUNT(*) as total FROM agent_behavior_log WHERE tenant_id = ?";
    const args: any[] = [params.tenantId];

    if (params.agentId) {
      sql += " AND agent_id = ?";
      args.push(params.agentId);
    }
    if (params.behaviorType) {
      sql += " AND behavior_type = ?";
      args.push(params.behaviorType);
    }
    if (params.dateFrom) {
      sql += " AND created_at >= ?";
      args.push(params.dateFrom);
    }
    if (params.dateTo) {
      sql += " AND created_at <= ?";
      args.push(params.dateTo);
    }

    const result = dbGet(sql, args);
    return result?.total || 0;
  }

  // 获取行为时间线
  static getTimeline(params: {
    tenantId: number;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }) {
    let sql = `
      SELECT 'chat' as source_type, id, sender_name as actor_name, content as description, created_at 
      FROM chat_archive WHERE tenant_id = ?
      UNION ALL
      SELECT 'behavior' as source_type, id, actor_name, action_type || ': ' || action_detail as description, created_at 
      FROM org_behavior_audit WHERE tenant_id = ?
      UNION ALL
      SELECT 'agent' as source_type, id, agent_name as actor_name, behavior_type || ': ' || behavior_detail as description, created_at 
      FROM agent_behavior_log WHERE tenant_id = ?
    `;
    const args: any[] = [params.tenantId, params.tenantId, params.tenantId];

    if (params.dateFrom) {
      sql += ` HAVING created_at >= ?`;
      args.push(params.dateFrom);
    }
    if (params.dateTo) {
      sql += ` AND created_at <= ?`;
      args.push(params.dateTo);
    }

    sql += " ORDER BY created_at DESC";
    const limit = params.limit || 100;
    sql += ` LIMIT ${limit}`;

    return dbAll(sql, args);
  }
}
