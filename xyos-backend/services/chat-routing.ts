/**
 * V1.1 群聊相关性路由
 *
 * 把群聊从「每轮全量多智能体协作」改成「相关性驱动的持续对话」：
 *  - 明确复杂任务（需多人分工）→ 完整 H2A2A2H（保留原有协作）
 *  - 普通追问 / 讨论 / 新要求   → 谁相关谁回，不相关静默
 *  - 0 个相关                   → 主持者轻回引导（不冷场）
 *
 * @module XYOS 群聊持续对话
 */
import { callLLM } from "./ai";
import { resolveCommander } from "./workflow-engine";

// ============ 协作生命周期标记（场景②：协作进行中检测）============
// 覆盖整个协作生命周期（拆解/执行/评审/汇总），而非单个 DSH turn 瞬间。
const activeCollabs = new Set<number>();
export function markCollabActive(chatId: number): void { activeCollabs.add(chatId); }
export function markCollabDone(chatId: number): void { activeCollabs.delete(chatId); }
export function isCollabActive(chatId: number): boolean { return activeCollabs.has(chatId); }

/** 判断是否「明确复杂任务」：需要多人拆解/分工/并行协作，才触发完整 H2A2A2H。 */
export function isComplexTask(content: string): boolean {
  const c = content || "";
  const patterns = [
    /(制定|编制|设计|规划|拟定|起草).{0,12}(方案|计划|路线图|架构|报告|制度)/,
    /(拆解|拆分|分解|分工).{0,10}(任务|环节|步骤|工作|职责)/,
    /(并行|协同|协作|一起|共同|分别).{0,10}(调研|开发|分析|设计|执行|撰写|评估)/,
    /(大家|各位|全员|所有人).{0,6}(一起|共同|分别|分工|各|每)/,
    /(需求|方案|开发|测试|上线|交付).{0,4}(→|到|和|与|再).{0,4}(需求|方案|开发|测试|上线|交付)/,
  ];
  return patterns.some((p) => p.test(c));
}

/** 主持者：层级制管理者 / 平级制最高 rank（用于 0 相关时的轻回引导）。 */
export function pickHost(employees: any[]): any | undefined {
  if (employees.length === 0) return undefined;
  if (employees.length === 1) return employees[0];
  return resolveCommander(employees) ?? employees[0];
}

/**
 * 相关性路由：返回与人类消息相关的员工 id 列表。
 * 优先规则兜底（名字/技能关键词，零成本、明确命中），否则 LLM 语义判断。
 */
export async function resolveRelevantEmployees(
  message: string,
  employees: any[],
  history: { role: string; content: string }[],
  tenantId: number,
): Promise<number[]> {
  const ruleHits = ruleMatch(message, employees);
  if (ruleHits.length > 0) return ruleHits;

  try {
    const roster = employees
      .map((e) => `- id=${e.id} ${e.name}（${e.role}，擅长${e.skills || "通用"}）`)
      .join("\n");
    const recent = history
      .slice(-6)
      .map((h) => `${h.role === "user" ? "用户" : "AI"}：${(h.content || "").slice(0, 80)}`)
      .join("\n");
    const resp = await callLLM(
      [
        {
          role: "system",
          content:
            "你是群聊相关性路由助手。判断用户最新消息与哪些 AI 员工相关，返回相关员工的 id 数组 JSON。\n\n" +
            "规则：\n" +
            "1. 与消息内容、追问、新要求相关的员工才入选\n" +
            "2. 不相关的一律不选（静默）\n" +
            "3. 追问上一轮某人的产出，只选那个人\n" +
            "4. 泛泛而谈、与任何员工职责都无关时返回空数组\n\n" +
            `员工名单：\n${roster}\n\n` +
            "【输出格式，严格遵守】只输出一个 JSON 对象，不要任何解释、不要重复员工名单、不要 markdown 代码块。示例：\n" +
            '{"ids":[565]}',
        },
        {
          role: "user",
          content: `最近对话：\n${recent || "（无）"}\n\n用户最新消息：${message}\n\n只返回 JSON：{"ids":[相关员工id]}`,
        },
      ],
      0.2,
      300,
      tenantId,
    );
    console.log("[chat-routing] LLM 原始返回:", JSON.stringify(resp.content).slice(0, 300));
    const m = resp.content.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed.ids)) {
        const valid = parsed.ids.filter((id: any) => employees.some((e) => e.id === Number(id)));
        return valid.map((id: any) => Number(id));
      }
    }
  } catch {
    /* LLM 失败回退规则 */
  }
  return ruleMatch(message, employees);
}

/** 规则兜底：名字 / 技能关键词 / 角色核心词匹配（零 LLM 成本，明确命中即返回）。 */
function ruleMatch(message: string, employees: any[]): number[] {
  const lower = message.toLowerCase();
  const hits: number[] = [];
  for (const e of employees) {
    if (e.name && lower.includes(e.name.toLowerCase())) {
      hits.push(e.id);
      continue;
    }
    const keywords = String(e.skills || "")
      .split(/[,，、;；]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2)
      .slice(0, 10);
    if (keywords.some((k) => lower.includes(k.toLowerCase()))) {
      hits.push(e.id);
      continue;
    }
    // 角色核心词：去掉 AI 前缀与职位后缀（"产品经理"→"产品"，"技术架构师"→"架构"）
    const roleCore = String(e.role || "")
      .replace(/^AI/, "")
      .replace(/(经理|工程师|架构师|管理员|专员|主管|主任|顾问|分析师|设计师|审计员)$/, "");
    if (roleCore.length >= 2 && lower.includes(roleCore.toLowerCase())) hits.push(e.id);
  }
  return [...new Set(hits)];
}
