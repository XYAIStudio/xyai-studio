/**
 * Smart context handoff for long multi-turn chats.
 *
 * Pack layers (into model messages):
 *  1. Durable memory facts (cross-session)
 *  2. Rolling session summary (compressed older turns)
 *  3. Recent verbatim messages (working set)
 *
 * Full transcript stays on disk; the model only sees a packed window.
 */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface SessionMemoryState {
  /** Rolling handoff summary of older turns (Chinese OK). */
  rollingSummary: string;
  /** Index into full transcript: messages[0..cursor) already folded into summary. */
  summarizedThrough: number;
  /** Durable facts (also mirrored in global memory store). */
  sessionFacts: string[];
}

export interface PackOptions {
  /** How many recent messages to keep verbatim (default 24 ≈ 12 turns). */
  recentCount?: number;
  /** Soft char budget for packed payload (default ~24k for small local models). */
  charBudget?: number;
  /** Global long-term memory facts. */
  durableFacts?: string[];
}

export function emptySessionMemory(): SessionMemoryState {
  return { rollingSummary: '', summarizedThrough: 0, sessionFacts: [] };
}

/** Approx chars; CJK counts as 1 char each (good enough for local budget). */
export function estimateChars(messages: ChatMessage[]): number {
  let n = 0;
  for (const m of messages) n += (m.content?.length || 0) + 8;
  return n;
}

/**
 * Fold older messages into rollingSummary when transcript grows past recentCount.
 * Extractive (no LLM required) so weak PCs stay responsive.
 */
export function advanceRollingSummary(
  full: ChatMessage[],
  mem: SessionMemoryState,
  recentCount = 24,
): SessionMemoryState {
  const keepFrom = Math.max(0, full.length - recentCount);
  if (keepFrom <= mem.summarizedThrough) return mem;

  const chunk = full.slice(mem.summarizedThrough, keepFrom);
  if (!chunk.length) return mem;

  const lines: string[] = [];
  for (const m of chunk) {
    if (m.role === 'system') continue;
    const who = m.role === 'user' ? '用户' : '助手';
    const text = m.content.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const clip = text.length > 180 ? `${text.slice(0, 180)}…` : text;
    lines.push(`- ${who}：${clip}`);
  }
  if (!lines.length) {
    return { ...mem, summarizedThrough: keepFrom };
  }

  const addition = lines.join('\n');
  const prev = (mem.rollingSummary || '').trim();
  let rollingSummary = prev
    ? `${prev}\n${addition}`
    : `【会话迄今要点】\n${addition}`;

  // Cap summary itself so it cannot grow without bound.
  const SUMMARY_CAP = 6000;
  if (rollingSummary.length > SUMMARY_CAP) {
    rollingSummary =
      '【会话迄今要点｜已压缩】\n' +
      rollingSummary.slice(-(SUMMARY_CAP - 40));
  }

  return {
    ...mem,
    rollingSummary,
    summarizedThrough: keepFrom,
  };
}

function buildSystemHandoff(
  mem: SessionMemoryState,
  durableFacts: string[],
): string | null {
  const parts: string[] = [];
  const facts = [
    ...durableFacts.map((f) => f.trim()).filter(Boolean),
    ...mem.sessionFacts.map((f) => f.trim()).filter(Boolean),
  ];
  // dedupe
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const f of facts) {
    const k = f.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(f);
  }
  if (uniq.length) {
    parts.push('【长期记忆】\n' + uniq.map((f) => `- ${f}`).join('\n'));
  }
  if (mem.rollingSummary.trim()) {
    parts.push(mem.rollingSummary.trim());
  }
  if (!parts.length) return null;
  parts.push(
    '【交接说明】以上为压缩上下文；下方「近期对话」为准。若冲突，以近期对话与用户最新表述为准。',
  );
  return parts.join('\n\n');
}

/**
 * Build messages for the model for this turn.
 * `full` is the complete session transcript (user/assistant), already including the new user turn.
 */
export function packMessagesForTurn(
  full: ChatMessage[],
  mem: SessionMemoryState,
  opts: PackOptions = {},
): { messages: ChatMessage[]; mem: SessionMemoryState } {
  const recentCount = opts.recentCount ?? 24;
  const charBudget = opts.charBudget ?? 24_000;
  const durableFacts = opts.durableFacts ?? [];

  let nextMem = advanceRollingSummary(full, mem, recentCount);
  const recent = full.slice(Math.max(0, full.length - recentCount));

  const packed: ChatMessage[] = [];
  const handoff = buildSystemHandoff(nextMem, durableFacts);
  if (handoff) {
    packed.push({ role: 'system', content: handoff });
  }
  for (const m of recent) {
    if (m.role === 'system') continue;
    packed.push({ role: m.role, content: m.content });
  }

  // If still over budget, shrink recent window (keep handoff).
  while (estimateChars(packed) > charBudget && packed.length > 3) {
    // drop earliest non-system
    const idx = packed.findIndex((m) => m.role !== 'system');
    if (idx < 0) break;
    packed.splice(idx, 1);
  }

  return { messages: packed, mem: nextMem };
}

/**
 * Naive fact harvest from a finished assistant/user pair (heuristic).
 * Looks for preference / identity lines; safe no-op when nothing matches.
 */
export function harvestFactsFromTurn(
  userText: string,
  assistantText: string,
): string[] {
  const out: string[] = [];
  const u = userText.trim();
  const patterns: RegExp[] = [
    /我(?:是|叫|的名字是)\s*([^\n。！？]{2,40})/,
    /请(?:叫我|称呼我)\s*([^\n。！？]{2,40})/,
    /我(?:喜欢|偏好|习惯)\s*([^\n。！？]{2,60})/,
    /以后请\s*([^\n。！？]{2,60})/,
  ];
  for (const re of patterns) {
    const m = u.match(re);
    if (m?.[0]) out.push(m[0].trim());
  }
  // Assistant confirming "我会记住…"
  const remember = assistantText.match(
    /(?:已记住|我会记住|记下来)[：:]\s*([^\n。！？]{2,80})/,
  );
  if (remember?.[1]) out.push(remember[1].trim());
  return out;
}

/** Paths shown to the advanced harness so it can write + install for real. */
export interface HarnessPathHints {
  workspaceDir: string;
  pluginsDir: string;
  personalizeInstalledPluginDir: string;
  personalizeRoot: string;
}

/**
 * Behavior contract for advanced / Codex harness turns.
 * North star: real local work like Grok Bot — files on disk, personalize install.
 */
export function behaviorSystemPrompt(paths: HarnessPathHints): string {
  return [
    '【XYAI Studio 高级引擎行为规范】',
    '你是运行在用户本机的代理，必须像桌面助手一样完成真实本地工作，而不是只给网页代码。',
    '',
    '硬性规则：',
    '1. 当用户要求做插件 / App / 文件 / 安装到「个性化」时：禁止仅输出 HTML/CSS/JS 片段或说明文字就结束。必须在磁盘上写出真实文件，并在回复中给出绝对路径。',
    '2. 可写工作区（Codex cwd）：',
    `   - workspace: ${paths.workspaceDir}`,
    `   - 插件脚手架: ${paths.pluginsDir}`,
    '3. 若用户要求制作插件并安装到「个性化 / 个性化模块插件列表」：',
    `   a. 先在 ${paths.pluginsDir}/<plugin-id>/ 创建完整插件目录（至少含 README.md 或 plugin.json / 入口文件，内容可用）。`,
    `   b. 安装目标布局（Studio 会扫描/列出）：${paths.personalizeRoot}/installed/plugin/<plugin-id>/`,
    '   c. 优先把包写到 plugins 脚手架目录；回合结束后宿主会调用 personalize installFromDirectory 装入 installed/plugin/<id> 并写入 index.json。',
    '   d. 若你有权限直接写入，也可复制到 installed/plugin/<id>/，但仍须保证目录完整。',
    '4. 多回合：同一任务未写完文件、未完成安装前，不要停在「解释一下就结束」。继续改文件直到成功，并报告结果。',
    '5. 聊天闲聊可以短答；一旦涉及交付物，以磁盘产物为准。',
  ].join('\n');
}

/**
 * Build the single argv prompt for Codex exec: behavior + packed history + latest user text.
 */
export function buildHarnessPrompt(opts: {
  userText: string;
  paths: HarnessPathHints;
  priorMessages?: ChatMessage[];
}): string {
  const parts: string[] = [behaviorSystemPrompt(opts.paths)];
  const prior = (opts.priorMessages || []).filter(
    (m) => m.role === 'user' || m.role === 'assistant',
  );
  if (prior.length) {
    const lines: string[] = ['【近期对话】'];
    for (const m of prior.slice(-16)) {
      const who = m.role === 'user' ? '用户' : '助手';
      const body = m.content.trim();
      if (!body) continue;
      const clip = body.length > 1200 ? `${body.slice(0, 1200)}…` : body;
      lines.push(`${who}：${clip}`);
    }
    parts.push(lines.join('\n'));
  }
  parts.push(`【用户本轮请求】\n${opts.userText.trim()}`);
  parts.push(
    '请立即开始在工作区写文件并完成安装（如适用）。完成后用简短中文说明做了什么，并列出绝对路径。',
  );
  return parts.join('\n\n');
}
