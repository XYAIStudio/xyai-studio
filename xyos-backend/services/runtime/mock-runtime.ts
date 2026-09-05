/**
 * Runtime Provider: mock（模拟运行时）
 *
 * 无模型费用、无外部依赖的端到端测试/演示用 Provider。
 * 按任务关键词驱动脚本化事件序列（思考→执行→成功/失败），
 * 用于验证 Runtime Gateway 全链路（创建/事件/证据/状态流转）。
 */
import { RuntimeAdapter, RunRequest, RunResult, RunEvent } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function classifyTask(req: RunRequest): { phase: string; fakeOutput: string; fail: boolean; artifacts: string[] } {
  const task = req.task;
  const t = task.toLowerCase();
  // 失败场景必须显式触发。生产合同会正常包含“失败回炉、接口错误、报错处理”等
  // 风控文字，不能因此把一条严谨的正常生产线误判为失败。
  const simulateFailure = req.metadata?.simulateFailure === true || /^\s*(?:\[mock-fail\]|fail\b|模拟失败)/i.test(task);
  if (simulateFailure) {
    return {
      phase: "模拟失败",
      fakeOutput: "",
      fail: true,
      artifacts: [],
    };
  }
  const productionType = String(req.inputs?.productionType || "");
  const spec = req.inputs?.productionSpec && typeof req.inputs.productionSpec === "object" ? req.inputs.productionSpec as Record<string, unknown> : {};
  if (productionType === "workflow") return { phase: "模拟执行工作流", fail: false, artifacts: ["workflow-run.json(模拟)", "execution-receipt.md(模拟)"], fakeOutput: `[mock] 工作流安全模拟完成：\n- 触发：${String(spec.trigger || "未填写")}\n- 节点：${req.workflow?.nodes.length || 0} 个\n- 防重复：${String(spec.idempotencyRule || "未填写")}\n- 异常处理：${String(spec.exceptionStrategy || "未填写")}\n- 完成证据：${String(spec.completionSignal || "未填写")}\n\n本结果只验证结构、分支和门禁，不调用生产系统。` };
  if (productionType === "research") return { phase: "模拟执行研究分析", fail: false, artifacts: ["research-report.md(模拟)", "evidence-index.json(模拟)"], fakeOutput: `[mock] 研究生产线安全模拟完成：\n- 问题：${String(spec.researchQuestion || "未填写")}\n- 范围：${String(spec.timeRange || "未填写")}\n- 来源规则：${String(spec.sourceCriteria || "未填写")}\n- 指标口径：${String(spec.metricDefinitions || "未填写")}\n- 不确定性：${String(spec.uncertaintyPolicy || "未填写")}\n\n本结果只验证研究结构，不声称已获得真实外部数据。` };
  if (productionType === "team") return { phase: "模拟多智能体协作", fail: false, artifacts: ["team-contributions.json(模拟)", "final-deliverable.md(模拟)"], fakeOutput: `[mock] 多智能体团队安全模拟完成：\n- 团队目标：${String(spec.objective || "未填写")}\n- 成员：${req.team?.members.map(member => `${member.name}/${member.role}`).join("、") || "未配置"}\n- 总负责人：${String(spec.leadRole || "未填写")}\n- 独立复核：${String(spec.reviewerRole || "未填写")}\n- 最终交付物：${String(spec.finalDeliverable || "未填写")}\n\n本结果验证分工、交接与复核结构，不代表成员已完成真实业务判断。` };
  if (/报表|报告|分析/.test(t)) {
    return {
      phase: "模拟生成报告",
      fakeOutput: `[mock] 已生成分析报告（${task.slice(0, 40)}）：
- 数据核对完成
- 结构：现状 → 问题 → 建议
- 产物：report.md（模拟）`,
      fail: false,
      artifacts: ["report.md(模拟)"],
    };
  }
  return {
    phase: "模拟执行任务",
    fakeOutput: `[mock] 任务已执行完成：
${task}

（本结果由 Mock Runtime 生成，仅用于链路验证；切换 provider=dsh 可调用 DeepSeek Harness 真实执行。）`,
    fail: false,
    artifacts: ["result.md(模拟)"],
  };
}

export class MockRuntimeAdapter implements RuntimeAdapter {
  readonly id = "mock" as const;
  readonly name = "Mock Runtime（模拟）";
  readonly description = "脚本化事件模拟，用于无模型费用的链路验证与演示";
  readonly capabilities = ["execute", "events", "evidence"];

  getHealth(): { ready: boolean; message: string; details?: Record<string, unknown> } {
    return { ready: true, message: "安全模拟 provider 可用，不会调用外部模型或生产工具。" };
  }

  async execute(req: RunRequest): Promise<RunResult> {
    const events: RunEvent[] = [];
    const startedAt = new Date().toISOString();
    const push = (type: RunEvent["type"], message?: string, data?: Record<string, unknown>) => {
      events.push({ type, at: new Date().toISOString(), message, data });
    };

    push("started", "mock provider 开始执行");
    await sleep(300);
    push("progress", "分析任务…", { phase: "analyze" });
    await sleep(300);

    const { phase, fakeOutput, fail, artifacts } = classifyTask(req);
    if (fail) {
      push("failed", phase);
      return {
        status: "failed",
        output: "",
        events,
        startedAt,
        finishedAt: new Date().toISOString(),
        error: "mock: 任务被脚本判定为失败（演示用）",
        evidence: { cwd: req.cwd || "(mock)" },
      };
    }

    push("progress", phase);
    await sleep(300);
    push("succeeded", "mock provider 执行完成");
    return {
      status: "succeeded",
      output: fakeOutput,
      events,
      startedAt,
      finishedAt: new Date().toISOString(),
      evidence: { cwd: req.cwd || "(mock)", artifacts },
    };
  }
}
