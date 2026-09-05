/**
 * 雄元智脑XYOS — Runtime Gateway REST 路由
 *
 * GET  /api/runtime/providers     列出可用运行时（mock / dsh）
 * POST /api/runtime/runs          创建运行（202 立即返回，异步执行）
 * GET  /api/runtime/runs          运行历史
 * GET  /api/runtime/runs/:id      运行详情（含结果/证据）
 */
import { Router, Request, Response } from "express";
import { authenticateOptional, AuthRequest, readLocalGuestSession } from "../middleware";
import { listProviders, createRun, getRun, listRuns, listGuestRuns, dispatchRun, buildRunArchive } from "../services/runtime/registry";
import { RunKind, RunRequest } from "../services/runtime/types";

const router = Router();

router.use(authenticateOptional);

function resolveRunOwner(req: AuthRequest, res: Response): { tenantId?: number; guestSession?: string } | undefined {
  if (req.user) return { tenantId: req.user.tenant_id };
  const guestSession = readLocalGuestSession(req);
  if (!guestSession) {
    res.status(401).json({ success: false, error: "未登录：本机试运行仅限 XYAI Studio 本地桌面端" });
    return undefined;
  }
  return { guestSession };
}

function canReadRun(req: AuthRequest, run: ReturnType<typeof getRun>): boolean {
  if (!run) return false;
  if (typeof run.tenant_id === "number") return req.user?.tenant_id === run.tenant_id;
  const guestSession = readLocalGuestSession(req);
  return guestSession !== undefined && guestSession === run.guest_session;
}

// 列出 providers
router.get("/providers", (_req: Request, res: Response) => {
  res.json({ success: true, data: listProviders() });
});

// 创建运行（异步执行模型）
router.post("/runs", (req: AuthRequest, res: Response) => {
  const { provider, task, cwd, modelProvider, model, timeoutMs, metadata } = req.body || {};
  if (!provider || !task || !String(task).trim()) {
    return res.status(400).json({ success: false, error: "provider 与 task 为必填" });
  }
  const owner = resolveRunOwner(req, res);
  if (!owner) return;
  const runReq: RunRequest = {
    provider,
    task: String(task).trim(),
    cwd,
    modelProvider,
    model,
    timeoutMs,
    ...owner,
    metadata,
  };
  try {
    const { id, record } = createRun(runReq);
    dispatchRun(id, runReq); // 不阻塞响应
    res.status(202).json({ success: true, data: { id, status: record.status, provider: record.provider } });
  } catch (error) {
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
});

// 创建结构化运行：DSH+ 可以直接提交 Team / Workflow，而不再退化成单句 prompt。
router.post("/runs/structured", (req: AuthRequest, res: Response) => {
  const { provider, runKind, task, team, workflow, inputs, policy, execution, cwd, modelProvider, model, timeoutMs, metadata } = req.body || {};
  const kind = String(runKind || (workflow ? "workflow" : team ? "team" : "task")) as RunKind;
  if (!provider || !task || !String(task).trim()) {
    return res.status(400).json({ success: false, error: "provider 与 task 为必填" });
  }
  if (!["task", "team", "workflow"].includes(kind)) {
    return res.status(400).json({ success: false, error: "runKind 必须是 task/team/workflow" });
  }
  if (kind === "team" && (!team || !Array.isArray(team.members) || team.members.length === 0)) {
    return res.status(400).json({ success: false, error: "team 运行必须提供 members" });
  }
  if (kind === "workflow" && (!workflow || !Array.isArray(workflow.nodes) || workflow.nodes.length === 0)) {
    return res.status(400).json({ success: false, error: "workflow 运行必须提供 nodes" });
  }
  const owner = resolveRunOwner(req, res);
  if (!owner) return;
  const runReq: RunRequest = {
    provider,
    runKind: kind,
    task: String(task).trim(),
    team,
    workflow,
    inputs: inputs || {},
    policy: policy || {},
    execution,
    cwd,
    modelProvider,
    model,
    timeoutMs,
    ...owner,
    metadata,
  };
  try {
    const { id, record } = createRun(runReq);
    dispatchRun(id, runReq);
    res.status(202).json({
      success: true,
      data: {
        id,
        status: record.status,
        provider: record.provider,
        runKind: record.run_kind,
        planSnapshot: record.plan_snapshot ? JSON.parse(record.plan_snapshot) : null,
      },
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
});

// 运行历史
router.get("/runs", (req: AuthRequest, res: Response) => {
  if (req.user) return res.json({ success: true, data: listRuns(100, req.user.tenant_id) });
  const guestSession = readLocalGuestSession(req);
  if (!guestSession) return res.status(401).json({ success: false, error: "未登录" });
  res.json({ success: true, data: listGuestRuns(100, guestSession) });
});

// 运行详情
router.get("/runs/:id", (req: AuthRequest, res: Response) => {
  const run = getRun(String(req.params.id));
  if (!canReadRun(req, run)) return res.status(404).json({ success: false, error: "运行不存在" });
  res.json({ success: true, data: { ...run, ...buildRunArchive(run) } });
});

export const runtimeRoutes = router;
