import { Router } from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";
import { upload } from "../middleware/upload";
import { AuditTrailEngine } from "../services/audit-trail";
import { callLLM } from "../services/ai";
import { extractText, isImageFile, extractImageForAI } from "../services/doc-parser";
import { dbGet } from "../db";
import {
  getContracts, getContract, getContractStats,
  createContract, updateContract, deleteContract,
  getPayments, addPayment, updatePayment, deletePayment, markPaymentPaid,
  batchAddPayments, batchMarkPaid,
  getAlertConfig, updateAlertConfig,
  getUpcomingPayments, getOverduePayments, getPaymentStats, getPaymentDetails,
  archiveContractToKnowledge, acknowledgeAlert, dismissAlert,
  getClauses, addClause, updateClause, deleteClause, batchAddClauses,
  getProgressList, getPendingReviews, addProgress, submitProgress, reviewProgress, updateProgress, deleteProgress,
  getApprovalRules, addApprovalRule, batchAddApprovalRules, updateApprovalRule, deleteApprovalRule,
  getApprovalRecords, getPendingApprovals, submitContractForApproval, approveStep, deleteApprovalRecords,
  getMultiLevelAlerts, getAlertLevelConfig,
  getEscalationHistory, recordEscalation, detectAndEscalateAlerts,
  getGanttData, getDashboardData,
} from "../services/contract";
import path from "path";

// 检查AI合同解析插件是否启用
function checkAIPluginEnabled(tenantId: number): boolean {
  const plugin = dbGet(
    "SELECT id FROM plugins WHERE tenant_id = ? AND slug = ? AND status = 'active'",
    [tenantId, "ai合同智能解析"]
  );
  return !!plugin;
}

export const contractRoutes = Router();
contractRoutes.use(authenticate);

// ===== 合同 CRUD =====
contractRoutes.get("/", (req: AuthRequest, res) => {
  try {
    const contracts = getContracts(req.user!.tenant_id, {
      status: req.query.status as string,
      direction: req.query.direction as string,
      contract_type: req.query.type as string,
      search: req.query.search as string,
    });
    res.json({ success: true, data: contracts });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.get("/stats", (req: AuthRequest, res) => {
  try {
    res.json({ success: true, data: getContractStats(req.user!.tenant_id) });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== Phase 5: 甘特图 + 仪表盘 =====
// 甘特图数据
contractRoutes.get("/gantt", (req: AuthRequest, res) => {
  try {
    const data = getGanttData(req.user!.tenant_id, {
      direction: req.query.direction as string,
      status: req.query.status as string,
    });
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 仪表盘数据
contractRoutes.get("/dashboard", (req: AuthRequest, res) => {
  try {
    const data = getDashboardData(req.user!.tenant_id);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.get("/:id", (req: AuthRequest, res) => {
  try {
    const contract = getContract(parseInt(req.params.id), req.user!.tenant_id);
    if (!contract) return res.status(404).json({ success: false, error: "合同不存在" });
    res.json({ success: true, data: contract });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.post("/", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { title, party_a, party_b } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: "请填写合同标题" });
    }
    if (!party_a || !party_b) {
      return res.status(400).json({ success: false, error: "请填写合同甲、乙双方" });
    }
    const id = createContract({ ...req.body, tenant_id: req.user!.tenant_id, created_by: req.user!.id });
    AuditTrailEngine.logOrgBehavior({
      tenantId: req.user!.tenant_id, actorType: "user", actorId: req.user!.id,
      actorName: req.user!.nickname, actionType: "contract_create",
      actionDetail: `创建合同: ${req.body.title}`,
      targetType: "contract", targetId: id, targetName: req.body.title,
      afterState: JSON.stringify(req.body),
    });
    const newContract = getContract(id, req.user!.tenant_id);
    res.json({ success: true, data: { id, contract_no: newContract?.contract_no } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.put("/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    const before = getContract(parseInt(req.params.id), req.user!.tenant_id);
    updateContract(parseInt(req.params.id), req.user!.tenant_id, req.body);
    AuditTrailEngine.logOrgBehavior({
      tenantId: req.user!.tenant_id, actorType: "user", actorId: req.user!.id,
      actorName: req.user!.nickname, actionType: "contract_update",
      actionDetail: `更新合同: ${req.body.title || ""}`,
      targetType: "contract", targetId: parseInt(req.params.id), targetName: req.body.title,
      beforeState: JSON.stringify(before), afterState: JSON.stringify(req.body),
    });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.delete("/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    deleteContract(parseInt(req.params.id), req.user!.tenant_id);
    AuditTrailEngine.logOrgBehavior({
      tenantId: req.user!.tenant_id, actorType: "user", actorId: req.user!.id,
      actorName: req.user!.nickname, actionType: "contract_delete",
      actionDetail: `删除合同 #${req.params.id}`,
      targetType: "contract", targetId: parseInt(req.params.id),
    });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== 进度款管理 =====
contractRoutes.get("/:id/payments", (req: AuthRequest, res) => {
  try {
    res.json({ success: true, data: getPayments(parseInt(req.params.id), req.user!.tenant_id) });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.post("/:id/payments", requireAdmin, (req: AuthRequest, res) => {
  try {
    const pid = addPayment(parseInt(req.params.id), req.user!.tenant_id, req.body);
    AuditTrailEngine.logOrgBehavior({
      tenantId: req.user!.tenant_id, actorType: "user", actorId: req.user!.id,
      actorName: req.user!.nickname, actionType: "payment_add",
      actionDetail: `添加进度款: ${req.body.label}`,
      targetType: "payment", targetId: pid, targetName: req.body.label,
      afterState: JSON.stringify(req.body),
    });
    res.json({ success: true, data: { id: pid } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.put("/:id/payments/:paymentId", requireAdmin, (req: AuthRequest, res) => {
  try {
    updatePayment(parseInt(req.params.paymentId), req.user!.tenant_id, req.body);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.delete("/:id/payments/:paymentId", requireAdmin, (req: AuthRequest, res) => {
  try {
    deletePayment(parseInt(req.params.paymentId), req.user!.tenant_id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.post("/:id/payments/:paymentId/pay", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { paid_date } = req.body;
    markPaymentPaid(parseInt(req.params.paymentId), req.user!.tenant_id, paid_date || new Date().toISOString().split("T")[0]);
    AuditTrailEngine.logOrgBehavior({
      tenantId: req.user!.tenant_id, actorType: "user", actorId: req.user!.id,
      actorName: req.user!.nickname, actionType: "payment_paid",
      actionDetail: `标记进度款已付 #${req.params.paymentId}`,
      targetType: "payment", targetId: parseInt(req.params.paymentId),
      afterState: JSON.stringify({ paid_date }),
    });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== V4: 批量操作 =====
contractRoutes.post("/:id/payments/batch", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { payments } = req.body;
    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({ success: false, error: "请提供付款节点数组" });
    }
    const ids = batchAddPayments(parseInt(req.params.id), req.user!.tenant_id, payments);
    AuditTrailEngine.logOrgBehavior({
      tenantId: req.user!.tenant_id, actorType: "user", actorId: req.user!.id,
      actorName: req.user!.nickname, actionType: "payment_batch_add",
      actionDetail: `批量添加 ${ids.length} 个付款节点到合同 #${req.params.id}`,
      targetType: "contract", targetId: parseInt(req.params.id),
    });
    res.json({ success: true, data: { ids, count: ids.length } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.post("/:id/payments/batch-pay", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { payment_ids, paid_date } = req.body;
    if (!payment_ids || !Array.isArray(payment_ids) || payment_ids.length === 0) {
      return res.status(400).json({ success: false, error: "请提供要标记已付的付款节点ID列表" });
    }
    const count = batchMarkPaid(parseInt(req.params.id), req.user!.tenant_id, payment_ids, paid_date);
    AuditTrailEngine.logOrgBehavior({
      tenantId: req.user!.tenant_id, actorType: "user", actorId: req.user!.id,
      actorName: req.user!.nickname, actionType: "payment_batch_paid",
      actionDetail: `批量标记 ${count} 个付款节点已付，合同 #${req.params.id}`,
      targetType: "contract", targetId: parseInt(req.params.id),
    });
    res.json({ success: true, data: { count, total: payment_ids.length } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== 预警 =====
contractRoutes.get("/alerts/upcoming", (req: AuthRequest, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string) : undefined;
    res.json({ success: true, data: getUpcomingPayments(req.user!.tenant_id, days) });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.get("/alerts/config", (req: AuthRequest, res) => {
  try {
    res.json({ success: true, data: getAlertConfig(req.user!.tenant_id) });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.put("/alerts/config", requireAdmin, (req: AuthRequest, res) => {
  try {
    updateAlertConfig(req.user!.tenant_id, req.body);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// V4: 预警确认/忽略
contractRoutes.post("/alerts/:paymentId/acknowledge", requireAdmin, (req: AuthRequest, res) => {
  try {
    acknowledgeAlert(parseInt(req.params.paymentId), req.user!.tenant_id);
    AuditTrailEngine.logOrgBehavior({
      tenantId: req.user!.tenant_id, actorType: "user", actorId: req.user!.id,
      actorName: req.user!.nickname, actionType: "alert_acknowledge",
      actionDetail: `确认预警已处理 #${req.params.paymentId}`,
      targetType: "payment", targetId: parseInt(req.params.paymentId),
    });
    res.json({ success: true, data: { acknowledged: true } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.post("/alerts/:paymentId/dismiss", requireAdmin, (req: AuthRequest, res) => {
  try {
    const dismissDays = parseInt(req.body.days as string) || 3;
    dismissAlert(parseInt(req.params.paymentId), req.user!.tenant_id, dismissDays);
    AuditTrailEngine.logOrgBehavior({
      tenantId: req.user!.tenant_id, actorType: "user", actorId: req.user!.id,
      actorName: req.user!.nickname, actionType: "alert_dismiss",
      actionDetail: `推迟预警 #${req.params.paymentId} (${dismissDays}天)`,
      targetType: "payment", targetId: parseInt(req.params.paymentId),
    });
    res.json({ success: true, data: { dismissed: true, dismiss_days: dismissDays } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// V4: 获取逾期付款列表
contractRoutes.get("/alerts/overdue", (req: AuthRequest, res) => {
  try {
    res.json({ success: true, data: getOverduePayments(req.user!.tenant_id) });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// Phase 4: 多级预警 (30/15/7/3天分类)
contractRoutes.get("/alerts/multi-level", (req: AuthRequest, res) => {
  try {
    const result = getMultiLevelAlerts(req.user!.tenant_id);
    res.json({ success: true, data: result });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// Phase 4: 预警级别配置
contractRoutes.get("/alerts/level-config", (req: AuthRequest, res) => {
  try {
    res.json({ success: true, data: getAlertLevelConfig(req.user!.tenant_id) });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// Phase 4: 升级历史
contractRoutes.get("/alerts/escalations/:paymentId", (req: AuthRequest, res) => {
  try {
    const history = getEscalationHistory(parseInt(req.params.paymentId), req.user!.tenant_id);
    res.json({ success: true, data: history });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// Phase 4: 手动触发预警检测与升级
contractRoutes.post("/alerts/detect-escalate", requireAdmin, (req: AuthRequest, res) => {
  try {
    const result = detectAndEscalateAlerts(req.user!.tenant_id);
    AuditTrailEngine.logOrgBehavior({
      tenantId: req.user!.tenant_id, actorType: "user", actorId: req.user!.id,
      actorName: req.user!.nickname, actionType: "alert_escalate",
      actionDetail: `手动触发多级预警升级: ${result.escalated}条升级, 总计${result.summary.total}条预警`,
      targetType: "system", targetId: 0,
    });
    res.json({ success: true, data: result });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== 合同条款节点 CRUD (Phase 1) =====
contractRoutes.get("/:id/clauses", (req: AuthRequest, res) => {
  try {
    const clauses = getClauses(parseInt(req.params.id), req.user!.tenant_id);
    res.json({ success: true, data: clauses });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.post("/:id/clauses", requireAdmin, (req: AuthRequest, res) => {
  try {
    const contractId = parseInt(req.params.id);
    const contract = getContract(contractId, req.user!.tenant_id);
    if (!contract) return res.status(404).json({ success: false, error: "合同不存在" });

    if (Array.isArray(req.body)) {
      const count = batchAddClauses(contractId, req.user!.tenant_id, req.body);
      res.json({ success: true, data: { count } });
    } else {
      const id = addClause(contractId, req.user!.tenant_id, req.body);
      res.json({ success: true, data: { id } });
    }
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.put("/:id/clauses/:clauseId", requireAdmin, (req: AuthRequest, res) => {
  try {
    updateClause(parseInt(req.params.clauseId), req.user!.tenant_id, req.body);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.delete("/:id/clauses/:clauseId", requireAdmin, (req: AuthRequest, res) => {
  try {
    deleteClause(parseInt(req.params.clauseId), req.user!.tenant_id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== 进度验收 + 总部审核 (Phase 2) =====
// 获取某合同的全部进度节点
contractRoutes.get("/:id/progress", (req: AuthRequest, res) => {
  try {
    const list = getProgressList(parseInt(req.params.id), req.user!.tenant_id);
    res.json({ success: true, data: list });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 总部审核台：获取所有待审核的进度节点
contractRoutes.get("/progress/pending-reviews", (req: AuthRequest, res) => {
  try {
    const list = getPendingReviews(req.user!.tenant_id);
    res.json({ success: true, data: list });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 新增进度节点
contractRoutes.post("/:id/progress", requireAdmin, (req: AuthRequest, res) => {
  try {
    const contractId = parseInt(req.params.id);
    const contract = getContract(contractId, req.user!.tenant_id);
    if (!contract) return res.status(404).json({ success: false, error: "合同不存在" });
    const id = addProgress(contractId, req.user!.tenant_id, req.body);
    res.json({ success: true, data: { id } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 外派机构提交验收资料
contractRoutes.put("/:id/progress/:progressId/submit", requireAdmin, (req: AuthRequest, res) => {
  try {
    submitProgress(parseInt(req.params.progressId), req.user!.tenant_id, req.user!.id, req.body);
    res.json({ success: true, data: { status: "pending" } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 总部审核验收（通过/驳回）
contractRoutes.put("/:id/progress/:progressId/review", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { approved, comment } = req.body;
    if (typeof approved !== "boolean") return res.status(400).json({ success: false, error: "approved 字段必填(boolean)" });
    reviewProgress(parseInt(req.params.progressId), req.user!.tenant_id, req.user!.id, approved, comment);
    res.json({ success: true, data: { status: approved ? "approved" : "rejected" } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 更新进度节点（未提交前）
contractRoutes.put("/:id/progress/:progressId", requireAdmin, (req: AuthRequest, res) => {
  try {
    updateProgress(parseInt(req.params.progressId), req.user!.tenant_id, req.body);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 删除进度节点
contractRoutes.delete("/:id/progress/:progressId", requireAdmin, (req: AuthRequest, res) => {
  try {
    deleteProgress(parseInt(req.params.progressId), req.user!.tenant_id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== 审批权限引擎 (Phase 3) =====
// 审批规则管理
contractRoutes.get("/approval/rules", (req: AuthRequest, res) => {
  try {
    res.json({ success: true, data: getApprovalRules(req.user!.tenant_id) });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.post("/approval/rules", requireAdmin, (req: AuthRequest, res) => {
  try {
    if (Array.isArray(req.body)) {
      const count = batchAddApprovalRules(req.user!.tenant_id, req.body);
      res.json({ success: true, data: { count } });
    } else {
      const id = addApprovalRule(req.user!.tenant_id, req.body);
      res.json({ success: true, data: { id } });
    }
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.put("/approval/rules/:ruleId", requireAdmin, (req: AuthRequest, res) => {
  try {
    updateApprovalRule(parseInt(req.params.ruleId), req.user!.tenant_id, req.body);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

contractRoutes.delete("/approval/rules/:ruleId", requireAdmin, (req: AuthRequest, res) => {
  try {
    deleteApprovalRule(parseInt(req.params.ruleId), req.user!.tenant_id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// AI 解析审批权限表 → 自动生成规则
contractRoutes.post("/approval/rules/parse", requireAdmin, upload.single("file"), async (req: AuthRequest, res) => {
  try {
    if (!checkAIPluginEnabled(req.user!.tenant_id)) {
      return res.status(402).json({ success: false, error: "AI合同智能解析插件未启用" });
    }
    if (!req.file) return res.status(400).json({ success: false, error: "请上传审批权限表文件" });

    const ext = path.extname(req.file.originalname).toLowerCase();
    const filePath = req.file.path;

    let text: string;
    try { text = await extractText(filePath, ext); }
    catch (parseErr: any) { return res.status(400).json({ success: false, error: `文档解析失败: ${parseErr.message}` }); }

    const aiResult = await callLLM([
      { role: "system", content: `你是企业管理制度分析专家。请从审批权限表中提取审批规则。每条规则包含：
- rule_name: 规则名称（如"10万以下部门审批"）
- min_amount: 金额下限（万元），无下限则为null
- max_amount: 金额上限（万元），无上限则为null
- contract_type: 合同类型（sales/purchase/employment/lease/nda/other），不限则为null
- direction: 方向（receivable/payable），不限则为null
- approval_chain: 审批链，数组格式，每项包含{position_level_name: "职级名称", description: "审批说明"}

注意：position_level_name 必须对应系统中的职级名称（如：董事长/CEO/COO/CFO/CTO/部门经理/总监 等）。` },
      { role: "user", content: `请解析以下审批权限表，提取所有审批规则。返回JSON格式：{"rules": [{rule_name, min_amount, max_amount, contract_type, direction, approval_chain: [{position_level_name, description}]}]}\n\n${text.slice(0, 8000)}` },
    ], 0.3, 4096);

    let parsed: any = null;
    const jsonMatch = aiResult.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) { try { parsed = JSON.parse(jsonMatch[0]); } catch {} }

    if (!parsed || !parsed.rules || !Array.isArray(parsed.rules)) {
      return res.json({ success: true, data: { rules: [], preview: true, raw_text: text.slice(0, 2000), raw_ai: aiResult.content } });
    }

    // 解析职级名称 → position_level_id
    const rules = [];
    for (const r of parsed.rules) {
      const chainJson = [];
      for (const step of (r.approval_chain || [])) {
        const pl = dbGet(
          "SELECT id FROM position_levels WHERE name LIKE ? AND tenant_id = ? LIMIT 1",
          [`%${step.position_level_name}%`, req.user!.tenant_id]
        ) as any;
        chainJson.push({
          position_level_id: pl?.id || null,
          position_level_name: step.position_level_name,
          description: step.description || "",
        });
      }
      rules.push({
        rule_name: r.rule_name,
        min_amount: r.min_amount,
        max_amount: r.max_amount,
        contract_type: r.contract_type || null,
        direction: r.direction || null,
        approval_chain_json: JSON.stringify(chainJson),
      });
    }

    res.json({ success: true, data: { rules, preview: true } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 确认入库 AI 解析的审批规则
contractRoutes.post("/approval/rules/confirm", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { rules } = req.body;
    if (!rules || !Array.isArray(rules)) return res.status(400).json({ success: false, error: "请提供规则数组" });
    const count = batchAddApprovalRules(req.user!.tenant_id, rules);
    res.json({ success: true, data: { count } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 获取合同的审批记录
contractRoutes.get("/:id/approval", (req: AuthRequest, res) => {
  try {
    const records = getApprovalRecords(parseInt(req.params.id), req.user!.tenant_id);
    res.json({ success: true, data: records });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 提交合同进入审批流程
contractRoutes.post("/:id/approval/submit", requireAdmin, (req: AuthRequest, res) => {
  try {
    const records = submitContractForApproval(parseInt(req.params.id), req.user!.tenant_id);

    AuditTrailEngine.logOrgBehavior({
      tenantId: req.user!.tenant_id, actorType: "user", actorId: req.user!.id,
      actorName: req.user!.nickname, actionType: "contract_submit_approval",
      actionDetail: `提交合同审批 #${req.params.id}，生成${records.length}步审批链`,
      targetType: "contract", targetId: parseInt(req.params.id),
    });

    res.json({ success: true, data: records });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 审批（通过/驳回）某一步
contractRoutes.put("/:id/approval/:recordId", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { approved, comment } = req.body;
    if (typeof approved !== "boolean") return res.status(400).json({ success: false, error: "approved 字段必填(boolean)" });

    const result = approveStep(parseInt(req.params.recordId), req.user!.tenant_id, req.user!.id, approved, comment);

    AuditTrailEngine.logOrgBehavior({
      tenantId: req.user!.tenant_id, actorType: "user", actorId: req.user!.id,
      actorName: req.user!.nickname, actionType: approved ? "contract_approve" : "contract_reject",
      actionDetail: `${approved ? "通过" : "驳回"}合同审批步骤 #${req.params.recordId} → 合同状态: ${result.nextStatus}`,
      targetType: "contract", targetId: parseInt(req.params.id),
    });

    res.json({ success: true, data: result });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 获取当前用户的待审批列表
contractRoutes.get("/approval/pending", (req: AuthRequest, res) => {
  try {
    const list = getPendingApprovals(req.user!.tenant_id, req.user!.id);
    res.json({ success: true, data: list });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== AI 智能解析（增值功能）=====
contractRoutes.post("/upload", requireAdmin, upload.single("file"), async (req: AuthRequest, res) => {
  try {
    if (!checkAIPluginEnabled(req.user!.tenant_id)) {
      return res.status(402).json({ success: false, error: "AI合同智能解析插件未启用，请在技能插件中启用后使用" });
    }
    if (!req.file) return res.status(400).json({ success: false, error: "请上传文件" });

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const ourSide = req.body.our_side || "party_a";
    const direction = ourSide === "party_a" ? "receivable" : "payable";
    const directionText = direction === "receivable" ? "收款" : "付款";
    const sideText = ourSide === "party_a" ? "甲方" : "乙方";

    // V4: 判断是否为图片
    const isImage = isImageFile(ext);

    // V4: 图片处理分支
    if (isImage) {
      try {
        const imageData = extractImageForAI(filePath);

        // 图片大小检查（base64 > 20MB 可能导致 LLM 调用失败）
        if (imageData.base64.length > 20 * 1024 * 1024) {
          return res.json({
            success: true,
            data: {
              preview: true,
              extracted_text: `[图片合同] ${req.file.originalname} — 图片过大(${(imageData.fileSize / 1024 / 1024).toFixed(1)}MB)，请压缩后重新上传或手动填写合同信息`,
              contractInfo: {
                title: path.basename(req.file.originalname, ext),
                our_side: ourSide,
              },
              payments: [],
              risks: [],
              confidence: 0,
              our_side: ourSide,
              direction,
              file_path: filePath,
              file_type: ext,
              upload_type: "image",
              needs_manual_input: true,
              image_too_large: true,
            },
          });
        }

        // 检查 AI 是否支持视觉模型
        const llmModel = process.env.LLM_MODEL || "";
        const isVisionModel = llmModel.includes("vision") || llmModel.includes("gpt-4o") || llmModel.includes("claude-3");

        if (isVisionModel) {
          // 视觉模型：传递图片 base64
          const systemPrompt = `你是雄元科技的法务顾问AI，专精合同审查。本方（雄元科技）是${sideText}，合同方向是${directionText}。请从上传的合同图片中提取信息并返回严格的JSON格式。金额以万元为单位。同时提取合同关键条款节点（如付款条件、交付节点、验收标准、违约责任、质保条款、保密条款、知识产权等）。`;
          const aiResult = await callLLM([
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: "请解析这张合同图片，提取合同信息、收/付款节点和关键条款节点。返回JSON格式：{contractInfo:{title,party_a,party_b,contract_type,amount,start_date,end_date,key_terms},payments:[{label,amount,due_date,condition}],clauses:[{clause_type,clause_title,clause_content,sort_order,is_critical}],risks:[{level,description}],confidence}" },
                { type: "image_url", image_url: { url: `data:${imageData.mimeType};base64,${imageData.base64}` } },
              ],
            } as any,
          ], 0.3, 4096);

          let parsed: any = null;
          const jsonMatch = aiResult.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) { try { parsed = JSON.parse(jsonMatch[0]); } catch {} }

          return res.json({
            success: true,
            data: {
              preview: true,
              extracted_text: `[图片合同] ${req.file.originalname} (${(imageData.fileSize / 1024).toFixed(1)}KB)`,
              contractInfo: parsed?.contractInfo || {},
              payments: parsed?.payments || [],
              clauses: parsed?.clauses || [],
              risks: parsed?.risks || [],
              confidence: parsed?.confidence || 0.5,
              our_side: ourSide,
              direction,
              file_path: filePath,
              file_type: ext,
              upload_type: "image",
            },
          });
        } else {
          // 非视觉模型：返回提示，让用户手动补充
          return res.json({
            success: true,
            data: {
              preview: true,
              extracted_text: `[图片合同] ${req.file.originalname} (${(imageData.fileSize / 1024).toFixed(1)}KB) — 当前AI模型不支持图片解析，请参考图片手动填写合同信息`,
              contractInfo: {
                title: path.basename(req.file.originalname, ext),
                our_side: ourSide,
              },
              payments: [],
              clauses: [],
              risks: [],
              confidence: 0,
              our_side: ourSide,
              direction,
              file_path: filePath,
              file_type: ext,
              upload_type: "image",
              needs_manual_input: true,
            },
          });
        }
      } catch (imgErr: any) {
        return res.status(400).json({ success: false, error: `图片处理失败: ${imgErr.message}` });
      }
    }

    // PDF/DOCX/TXT 文本解析
    let text: string;
    try {
      text = await extractText(filePath, ext);
    } catch (parseErr: any) {
      return res.status(400).json({ success: false, error: `文档解析失败: ${parseErr.message}，支持 PDF、DOCX、TXT 格式` });
    }

    // AI 解析（增强版：提取条款节点）
    const systemPrompt = `你是雄元科技的法务顾问AI，专精合同审查。本方（雄元科技）是${sideText}，合同方向是${directionText}。请从以下合同文本中提取信息并返回JSON。金额以万元为单位。请特别注意提取合同中的关键条款节点（付款条件、交付节点、验收标准、违约责任、质保条款、保密条款、知识产权等），每个条款节点包含clause_type（payment_condition/delivery/acceptance/breach/warranty/confidentiality/ip/termination/other）、clause_title（条款标题）、clause_content（条款内容）、sort_order（序号）、is_critical（是否关键条款，0或1）。`;
    const aiResult = await callLLM([
      { role: "system", content: systemPrompt },
      { role: "user", content: `请解析以下合同文本，提取合同信息、收/付款节点和关键条款节点。返回JSON格式：\n{\n  contractInfo: {title,party_a,party_b,contract_type,amount,start_date,end_date,key_terms},\n  payments: [{label,amount,due_date,condition}],\n  clauses: [{clause_type,clause_title,clause_content,sort_order,is_critical}],\n  risks: [{level,description}],\n  confidence\n}\n\n合同文本：\n\n${text}` },
    ], 0.3, 4096);

    // 提取JSON
    let parsed: any = null;
    const jsonMatch = aiResult.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch {}
    }

    if (!parsed || !parsed.contractInfo) {
      return res.json({
        success: true,
        data: {
          preview: true,
          extracted_text: text.slice(0, 2000),
          contractInfo: null,
          payments: [],
          clauses: [],
          risks: [],
          confidence: 0,
          our_side: ourSide,
          direction,
          file_path: filePath,
          file_type: ext,
          raw_ai_response: aiResult.content,
          upload_type: "document",
        },
      });
    }

    res.json({
      success: true,
      data: {
        preview: true,
        extracted_text: text.slice(0, 2000),
        contractInfo: parsed.contractInfo || {},
        payments: parsed.payments || [],
        clauses: parsed.clauses || [],
        risks: parsed.risks || [],
        confidence: parsed.confidence || 0.5,
        our_side: ourSide,
        direction,
        file_path: filePath,
        file_type: ext,
        upload_type: "document",
      },
    });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 确认AI解析结果并入库
contractRoutes.post("/upload/confirm", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { contractInfo, payments, clauses, file_path, file_type, our_side, direction, alert_days, extracted_text } = req.body;

    const contractId = createContract({
      tenant_id: req.user!.tenant_id,
      title: contractInfo.title,
      party_a: our_side === "party_a" ? "雄元科技" : contractInfo.party_a || "对方",
      party_b: our_side === "party_b" ? "雄元科技" : contractInfo.party_b || "对方",
      direction: direction || "payable",
      our_side: our_side || "party_a",
      contract_type: contractInfo.contract_type || "other",
      amount: (contractInfo.amount || 0) * 10000, // 万元转元
      start_date: contractInfo.start_date || null,
      end_date: contractInfo.end_date || null,
      key_terms: contractInfo.key_terms || null,
      alert_days: alert_days || 7,
      file_path,
      file_type,
      created_by: req.user!.id,
      parsed_text: extracted_text ? extracted_text.slice(0, 5000) : null,
    });

    // 批量插入付款节点
    for (const p of (payments || [])) {
      addPayment(contractId, req.user!.tenant_id, {
        label: p.label,
        amount: (p.amount || 0) * 10000, // 万元转元
        due_date: p.due_date || null,
        completion_condition: p.condition || null,
      });
    }

    // Phase 1: 批量插入AI解析的条款节点
    if (clauses && Array.isArray(clauses) && clauses.length > 0) {
      batchAddClauses(contractId, req.user!.tenant_id, clauses);
    }

    // V4: 自动归档到知识库
    let archiveResult = null;
    if (file_path) {
      try {
        archiveResult = archiveContractToKnowledge(
          contractId,
          req.user!.tenant_id,
          file_path,
          file_type,
          extracted_text || ""
        );
      } catch (archiveErr: any) {
        console.error("[合同归档] 自动归档失败:", archiveErr.message);
      }
    }

    AuditTrailEngine.logOrgBehavior({
      tenantId: req.user!.tenant_id, actorType: "user", actorId: req.user!.id,
      actorName: req.user!.nickname, actionType: "contract_create",
      actionDetail: `AI解析入库: ${contractInfo.title}`,
      targetType: "contract", targetId: contractId, targetName: contractInfo.title,
      afterState: JSON.stringify({ contractInfo, payments_count: payments?.length, archived: !!archiveResult }),
    });

    const newContract = getContract(contractId, req.user!.tenant_id);
    res.json({
      success: true,
      data: {
        id: contractId,
        contract_no: newContract?.contract_no,
        archived_to_knowledge: !!archiveResult,
        knowledge_file_id: archiveResult?.knowledgeFileId || null,
        knowledge_note_id: archiveResult?.knowledgeNoteId || null,
      },
    });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 已有合同重新AI分析
contractRoutes.post("/:id/analyze", requireAdmin, async (req: AuthRequest, res) => {
  try {
    if (!checkAIPluginEnabled(req.user!.tenant_id)) {
      return res.status(402).json({ success: false, error: "AI合同智能解析插件未启用，请在技能插件中启用后使用" });
    }
    const contract = getContract(parseInt(req.params.id), req.user!.tenant_id);
    if (!contract) return res.status(404).json({ success: false, error: "合同不存在" });
    if (!contract.file_path) return res.status(400).json({ success: false, error: "该合同无关联文件，无法AI解析" });

    const ext = contract.file_type || path.extname(contract.file_path);
    const text = await extractText(contract.file_path, ext);
    const directionText = contract.direction === "receivable" ? "收款" : "付款";
    const sideText = contract.our_side === "party_a" ? "甲方" : "乙方";

    const aiResult = await callLLM([
      { role: "system", content: `你是雄元科技的法务顾问AI。本方是${sideText}，合同方向是${directionText}。请提取付款节点。金额以万元为单位。` },
      { role: "user", content: `请分析以下合同文本中的收/付款节点：\n\n${text}` },
    ], 0.3, 4096);

    let parsed: any = null;
    const jsonMatch = aiResult.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch {}
    }

    res.json({
      success: true,
      data: {
        payments: parsed?.payments || [],
        risks: parsed?.risks || [],
        confidence: parsed?.confidence || 0,
        contract_id: contract.id,
      },
    });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== V4: 手动归档合同到知识库 =====
contractRoutes.post("/:id/archive-to-knowledge", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const contract = getContract(parseInt(req.params.id), req.user!.tenant_id);
    if (!contract) return res.status(404).json({ success: false, error: "合同不存在" });

    const result = archiveContractToKnowledge(
      parseInt(req.params.id),
      req.user!.tenant_id,
      contract.file_path || undefined,
      contract.file_type || undefined,
      contract.parsed_text || undefined,
    );

    AuditTrailEngine.logOrgBehavior({
      tenantId: req.user!.tenant_id, actorType: "user", actorId: req.user!.id,
      actorName: req.user!.nickname, actionType: "contract_archive",
      actionDetail: `归档合同到知识库: ${contract.title}`,
      targetType: "contract", targetId: contract.id, targetName: contract.title,
    });

    res.json({
      success: true,
      data: {
        archived: true,
        knowledge_file_id: result?.knowledgeFileId || null,
        knowledge_note_id: result?.knowledgeNoteId || null,
        folder_created: result?.folderCreated || false,
      },
    });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== 统计导出 =====
// 日期范围解析辅助函数
function resolveDateRange(period: string, start?: string, end?: string): { start: string; end: string } | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  if (start && end) {
    return { start, end };
  }

  switch (period) {
    case "this_month": {
      const lastDay = new Date(y, m, 0).getDate();
      return { start: `${y}-${String(m).padStart(2, "0")}-01`, end: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}` };
    }
    case "next_month": {
      const nm = m + 1;
      const ny = nm > 12 ? y + 1 : y;
      const adjM = nm > 12 ? nm - 12 : nm;
      const lastDay = new Date(ny, adjM, 0).getDate();
      return { start: `${ny}-${String(adjM).padStart(2, "0")}-01`, end: `${ny}-${String(adjM).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}` };
    }
    case "this_year": {
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    }
    case "custom":
    default:
      return null;
  }
}

contractRoutes.get("/payments/stats", (req: AuthRequest, res) => {
  try {
    const { period, start, end } = req.query;
    const dateRange = resolveDateRange((period as string) || "this_month", start as string, end as string);
    if (!dateRange) return res.status(400).json({ success: false, error: "请提供日期范围（period 或 start+end）" });

    const stats = getPaymentStats(req.user!.tenant_id, dateRange);
    const details = getPaymentDetails(req.user!.tenant_id, dateRange);
    res.json({ success: true, data: { stats, details, dateRange } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// Excel 导出
contractRoutes.get("/payments/export/xlsx", async (req: AuthRequest, res) => {
  try {
    const { period, start, end } = req.query;
    const dateRange = resolveDateRange((period as string) || "this_month", start as string, end as string);
    if (!dateRange) return res.status(400).json({ success: false, error: "请提供日期范围（period 或 start+end）" });

    const stats = getPaymentStats(req.user!.tenant_id, dateRange);
    const receivableDetails = getPaymentDetails(req.user!.tenant_id, dateRange, "receivable");
    const payableDetails = getPaymentDetails(req.user!.tenant_id, dateRange, "payable");

    const ExcelJS: any = await import("exceljs");
    const workbook = new (ExcelJS.default?.Workbook || ExcelJS.Workbook)();
    workbook.creator = "雄元智脑XYOS";

    const headerStyle: any = {
      font: { bold: true, size: 11 },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } },
      border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } },
    };

    const dirLabel = (d: string) => d === "receivable" ? "应收" : "应付";

    // Sheet 1: 应收明细
    const sheet1 = workbook.addWorksheet("应收明细");
    sheet1.columns = [
      { header: "合同编号", key: "contract_no", width: 16 },
      { header: "合同名称", key: "title", width: 24 },
      { header: "对方", key: "party_b", width: 20 },
      { header: "付款标签", key: "label", width: 12 },
      { header: "金额(元)", key: "amount", width: 14 },
      { header: "到期日", key: "due_date", width: 14 },
      { header: "状态", key: "status", width: 10 },
      { header: "完成条件", key: "condition", width: 24 },
    ];
    sheet1.getRow(1).eachCell((cell: any) => Object.assign(cell, headerStyle));
    for (const r of receivableDetails) {
      sheet1.addRow({ contract_no: r.contract_no, title: r.contract_title, party_b: r.party_b, label: r.label, amount: r.amount, due_date: r.due_date, status: r.paid ? "已完成" : "待处理", condition: r.completion_condition || "" });
    }

    // Sheet 2: 应付明细
    const sheet2 = workbook.addWorksheet("应付明细");
    sheet2.columns = sheet1.columns;
    sheet2.getRow(1).eachCell((cell: any) => Object.assign(cell, headerStyle));
    for (const r of payableDetails) {
      sheet2.addRow({ contract_no: r.contract_no, title: r.contract_title, party_b: r.party_b, label: r.label, amount: r.amount, due_date: r.due_date, status: r.paid ? "已完成" : "待处理", condition: r.completion_condition || "" });
    }

    // Sheet 3: 汇总
    const sheet3 = workbook.addWorksheet("汇总");
    sheet3.columns = [
      { header: "方向", key: "direction", width: 10 },
      { header: "总金额(元)", key: "total", width: 16 },
      { header: "已收/付(元)", key: "done", width: 16 },
      { header: "待收/付(元)", key: "pending", width: 16 },
      { header: "笔数", key: "count", width: 8 },
      { header: "逾期笔数", key: "overdue", width: 10 },
    ];
    sheet3.getRow(1).eachCell((cell: any) => Object.assign(cell, headerStyle));
    sheet3.addRow({ direction: "应收", total: stats.receivable.total, done: stats.receivable.done, pending: stats.receivable.pending, count: stats.receivable.count, overdue: stats.receivable.overdue });
    sheet3.addRow({ direction: "应付", total: stats.payable.total, done: stats.payable.done, pending: stats.payable.pending, count: stats.payable.count, overdue: stats.payable.overdue });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `合同进度款明细_${dateRange.start}_${dateRange.end}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(Buffer.from(buffer));
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// CSV 导出
contractRoutes.get("/payments/export/csv", (req: AuthRequest, res) => {
  try {
    const { period, start, end, direction } = req.query;
    const dateRange = resolveDateRange((period as string) || "this_month", start as string, end as string);
    if (!dateRange) return res.status(400).json({ success: false, error: "请提供日期范围（period 或 start+end）" });

    const details = getPaymentDetails(req.user!.tenant_id, dateRange, direction as string | undefined);

    const headers = ["合同编号", "合同名称", "对方", "付款标签", "金额(元)", "到期日", "状态", "完成条件", "方向"];
    const rows = details.map((r: any) => [
      r.contract_no, r.contract_title, r.party_b, r.label,
      r.amount, r.due_date, r.paid ? "已完成" : "待处理",
      (r.completion_condition || "").replace(/"/g, '""'),
      r.direction === "receivable" ? "应收" : "应付",
    ]);

    const csv = "\uFEFF" +
      headers.join(",") + "\n" +
      rows.map((r: string[]) => r.map(c => `"${c}"`).join(",")).join("\n");

    const filename = `合同进度款明细_${dateRange.start}_${dateRange.end}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(csv);
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});
