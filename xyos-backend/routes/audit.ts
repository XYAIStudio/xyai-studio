import { Router } from "express";
import { authenticate, requireSuperAdmin, AuthRequest } from "../middleware";
import { AuditTrailEngine } from "../services/audit-trail";

export const auditRoutes = Router();
auditRoutes.use(authenticate);
auditRoutes.use(requireSuperAdmin);

// 获取审计统计概览
auditRoutes.get("/stats/overview", (req: AuthRequest, res) => {
  try {
    const data = AuditTrailEngine.getStatsOverview(req.user!.tenant_id);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取7天趋势数据
auditRoutes.get("/stats/trend", (req: AuthRequest, res) => {
  try {
    const days = req.query.days ? Number(req.query.days) : 7;
    const data = AuditTrailEngine.getDailyTrend(req.user!.tenant_id, days);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取行为类型分布
auditRoutes.get("/stats/distribution", (req: AuthRequest, res) => {
  try {
    const data = AuditTrailEngine.getActionTypeDistribution(req.user!.tenant_id);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 搜索聊天记录
auditRoutes.get("/chat/search", (req: AuthRequest, res) => {
  try {
    const { keyword, sender_type, sender_id, chat_id, date_from, date_to, page, limit } = req.query;
    const params = {
      tenantId: req.user!.tenant_id,
      keyword: keyword as string,
      senderType: sender_type as string,
      senderId: sender_id ? Number(sender_id) : undefined,
      chatId: chat_id ? Number(chat_id) : undefined,
      dateFrom: date_from as string,
      dateTo: date_to as string,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50
    };
    const data = AuditTrailEngine.searchChatHistory(params);
    const total = AuditTrailEngine.countChatHistory(params);
    res.json({ success: true, data, total });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 查询聊天历史
auditRoutes.get("/chat/history", (req: AuthRequest, res) => {
  try {
    const { chat_id, page, limit } = req.query;
    if (!chat_id) return res.status(400).json({ success: false, error: "chat_id必填" });
    const params = {
      tenantId: req.user!.tenant_id,
      chatId: Number(chat_id),
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50
    };
    const data = AuditTrailEngine.searchChatHistory(params);
    const total = AuditTrailEngine.countChatHistory(params);
    res.json({ success: true, data, total });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 查询组织行为
auditRoutes.get("/behaviors", (req: AuthRequest, res) => {
  try {
    const { actor_type, actor_id, action_type, target_type, target_id, date_from, date_to, page, limit } = req.query;
    const params = {
      tenantId: req.user!.tenant_id,
      actorType: actor_type as string,
      actorId: actor_id ? Number(actor_id) : undefined,
      actionType: action_type as string,
      targetType: target_type as string,
      targetId: target_id ? Number(target_id) : undefined,
      dateFrom: date_from as string,
      dateTo: date_to as string,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50
    };
    const data = AuditTrailEngine.queryOrgBehaviors(params);
    const total = AuditTrailEngine.countOrgBehaviors(params);
    res.json({ success: true, data, total });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 行为时间线
auditRoutes.get("/behaviors/timeline", (req: AuthRequest, res) => {
  try {
    const { date_from, date_to, limit } = req.query;
    const data = AuditTrailEngine.getTimeline({
      tenantId: req.user!.tenant_id,
      dateFrom: date_from as string,
      dateTo: date_to as string,
      limit: limit ? Number(limit) : 100
    });
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 查询AI员工行为
auditRoutes.get("/agents/:id/behaviors", (req: AuthRequest, res) => {
  try {
    const { behavior_type, date_from, date_to, page, limit } = req.query;
    const params = {
      tenantId: req.user!.tenant_id,
      agentId: Number(req.params.id),
      behaviorType: behavior_type as string,
      dateFrom: date_from as string,
      dateTo: date_to as string,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50
    };
    const data = AuditTrailEngine.queryAgentBehaviors(params);
    const total = AuditTrailEngine.countAgentBehaviors(params);
    res.json({ success: true, data, total });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
