/**
 * V1.0 H2A2A2H 人机混聊交互 — 人类话语权控制
 *
 * 不变量：AI 产出永远是草稿，人类拥有最终话语权（叫停 / 纠偏 / 确认 / 驳回）。
 *
 * 分类：
 *   stop     → 叫停当前 AI 讨论/执行（覆盖级，立即中断）
 *   steer    → 纠偏锚点（覆盖级 steering，注入更高优先级上下文）
 *   confirm  → 确认（结束讨论 / 批准草稿）
 *   reject   → 驳回（带理由重做）
 *   normal   → 普通消息
 *
 * 设计原则：叫停/确认类指令仅在「短消息」时判定，避免长句中子串误伤；
 * 纠偏/驳回可携带理由，长消息同样判定。
 */

export type HumanControlType = "stop" | "steer" | "confirm" | "reject" | "normal";

export interface HumanControlClassification {
  type: HumanControlType;
  /** 覆盖级标记：该消息应打断当前 AI 运行 */
  preemptive: boolean;
  /** 供回喂的纠偏/驳回理由（非 normal 时非空） */
  anchor?: string;
}

/** 明确的叫停指令（英文需整词，避免"stop"在长句里的误伤） */
const STOP_WORDS = ["停止", "停下", "停一下", "别说了", "先别", "暂停", "中止", "打住", "别继续了", "取消执行", "取消这个任务", "别做了", "住手"];
const STOP_EXACT = ["停", "stop", "halt", "abort", "cancel", "quit"];
const STEER_WORDS = ["不对", "不是这样", "应该", "改成", "改为", "换个", "重新想", "换个思路", "纠正", "纠偏", "方向错了", "你理解错了", "注意", "改一下思路", "换个角度", "我说的是", "我指的是", "重新考虑"];
const CONFIRM_WORDS = ["确认", "没问题", "可以", "同意", "通过", "好的", "就这样", "定稿", "认可", "批准", "approve", "接受"];
const REJECT_WORDS = ["驳回", "不同意", "不行", "重做", "重来", "修改", "改一下", "重写", "不通过", "重新做", "reject", "revise", "推翻"];

function hasAny(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some(w => lower.includes(w.toLowerCase()));
}

/**
 * 分类人类控制消息。
 * 优先级：stop > steer > reject > confirm > normal。
 */
export function classifyHumanControl(content: string): HumanControlClassification {
  const c = content.trim();
  if (!c) return { type: "normal", preemptive: false };
  const short = c.length <= 12;
  const lower = c.toLowerCase();

  // 1) 叫停：短消息 + 明确指令（英文整词）
  const exactStop = STOP_EXACT.some(w => {
    const wl = w.toLowerCase();
    return short && (c === wl || c === wl + "！" || c === wl + "!" || c === wl + "。" || c === wl + "？" || c === wl + "?");
  });
  if (exactStop || (short && hasAny(lower, STOP_WORDS))) {
    return { type: "stop", preemptive: true, anchor: c };
  }

  // 2) 纠偏锚点（覆盖级 steering）
  if (hasAny(lower, STEER_WORDS)) {
    return { type: "steer", preemptive: true, anchor: c };
  }

  // 3) 驳回（带理由重做）
  if (hasAny(lower, REJECT_WORDS)) {
    return { type: "reject", preemptive: false, anchor: c };
  }

  // 4) 确认（仅短消息）
  if (short && hasAny(lower, CONFIRM_WORDS)) {
    return { type: "confirm", preemptive: false, anchor: c };
  }

  return { type: "normal", preemptive: false };
}
