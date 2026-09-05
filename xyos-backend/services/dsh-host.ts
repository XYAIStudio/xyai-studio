/**
 * 雄元智脑XYOS — 进程内 DSH Host（把 DeepSeek Harness 引擎嵌入 XYOS 后端进程）。
 *
 * 与旧的 dsh-adapter（每次深度执行 spawn 一次性子进程）不同：本模块在 XYOS
 * 后端进程内直接挂载 DSH 的 Cordis 组合，创建【持久 agent】（session 常驻、
 * 记忆跨会话延续），让每个 AI 员工成为"带全量工具的真人 agent"。
 *
 * 模块解析：本后端通过 node_modules/@deepseek-ai 的 junction 指向
 * D:\Program Files\DeepSeek Harness\resources\host\node_modules\@deepseek-ai，
 * 直接复用已构建的 DSH 运行时包（只读，不改动部署）。
 */
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'

// ── 核心服务 ──
import * as CordisAgent from '@deepseek-ai/dsh-agent'
import * as LlmRuntime from '@deepseek-ai/dsh-llm'
import * as SessionStore from '@deepseek-ai/dsh-session'
import * as SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import * as SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as ToolRuntime from '@deepseek-ai/dsh-tools'
import * as AgentLoop from '@deepseek-ai/dsh-agent-loop'
import * as DefaultModel from '@deepseek-ai/dsh-agent-default-model'
import * as CredentialsLocal from '@deepseek-ai/dsh-credentials-local'
import * as SettingsFile from '@deepseek-ai/dsh-settings-file'
import * as LlmRetry from '@deepseek-ai/dsh-llm-retry'
import * as JobsLocal from '@deepseek-ai/dsh-jobs-local'
import * as TokenMeter from '@deepseek-ai/dsh-token-meter'
import * as JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic'
import ToolResultPruner from '@deepseek-ai/dsh-compaction-tool-result-pruner'
import * as SessionCheckpointPolicy from '@deepseek-ai/dsh-session-checkpoint-policy'

// ── 模型适配器 ──
import * as LlmDeepSeek from '@deepseek-ai/dsh-llm-deepseek'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'

// ── 沙箱 / 命令执行 ──
import * as SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import * as ShellEnv from '@deepseek-ai/dsh-shell-env'
import * as BashLocal from '@deepseek-ai/dsh-bash-local'
import * as ToolBash from '@deepseek-ai/dsh-tool-bash'
import * as ToolPwsh from '@deepseek-ai/dsh-tool-pwsh'
import * as PwshSandbox from '@deepseek-ai/dsh-pwsh-sandbox'
import * as SandboxLocal from '@deepseek-ai/dsh-sandbox-local'
import * as SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'

// ── 文件系统工具（read/write/edit/grep/glob）──
import * as ToolFs from '@deepseek-ai/dsh-tool-fs'
import * as FsSandbox from '@deepseek-ai/dsh-fs-sandbox'
import * as FsObservation from '@deepseek-ai/dsh-fs-observation-policy'

// ── 网络搜索 ──
import * as Web from '@deepseek-ai/dsh-web'
import * as WebSearchDeepseek from '@deepseek-ai/dsh-web-search-deepseek'
import * as ToolWeb from '@deepseek-ai/dsh-tool-web'

// ── 任务组织 ──
import * as ToolTodo from '@deepseek-ai/dsh-tool-todo'

// ── 多 agent / workflow / goal / skill（全量）──
import * as Subagent from '@deepseek-ai/dsh-subagent'
import * as SubagentSpawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import * as ToolSubagent from '@deepseek-ai/dsh-tool-subagent'
import * as WorkflowWorker from '@deepseek-ai/dsh-workflow-worker-thread'
import * as ToolWorkflow from '@deepseek-ai/dsh-tool-workflow'
import * as Goal from '@deepseek-ai/dsh-goal'
import * as GoalDriver from '@deepseek-ai/dsh-goal-round-driver'
import * as ToolGoal from '@deepseek-ai/dsh-tool-goal'
import * as Skill from '@deepseek-ai/dsh-skill'
import * as ToolSkill from '@deepseek-ai/dsh-tool-skill'

/** 每个 DSH 包要么 default 导出插件对象，要么自身带 apply；统一归一化。 */
function pluginOf(mod: any): any {
  return mod && typeof mod.apply === 'function' ? mod : mod?.default
}

let hostCtx: Context | null = null
let bootPromise: Promise<Context> | null = null

/** 归一化 $DSH_HOME（凭证 / 设置 / 会话持久化都依赖它）。 */
function dshHome(): string {
  return process.env.DSH_HOME || path.join(process.env.USERPROFILE || '', '.dsh')
}

/**
 * 启动进程内 DSH Host（幂等，单例）。挂载全量 agent 组合。
 */
export async function initDshHost(): Promise<Context> {
  if (hostCtx) return hostCtx
  if (bootPromise) return bootPromise
  bootPromise = (async () => {
    const ctx = new Context()
    ctx.provide('dshHomePath', (p: string) => path.join(dshHome(), p))

    const mount = async (mod: any, config?: any) => {
      // `Context.plugin()` returns a Fiber; awaiting the Fiber object itself
      // does not wait for its constructor/effects.  Await the lifecycle so
      // later consumers (notably `agents.create`) observe every service.
      const fiber = ctx.plugin(pluginOf(mod), config ?? {})
      if (fiber && typeof (fiber as any).await === 'function') await (fiber as any).await()
    }

    // 1) 核心服务（顺序对齐 dsh-base bundle）
    await mount(LlmRuntime)
    await mount(SessionStore)
    await mount(SessionProjectionRegistry)
    await mount(SystemPrompt, { persona: '' })
    await mount(ToolRuntime)
    await mount(CordisAgent)
    await mount(LlmRetry)
    await mount(JobsLocal)
    await mount(SettingsFile)
    await mount(CredentialsLocal)
    await mount(DefaultModel, { provider: 'xyai-ollama', model: 'qwen2.5vl:3b' })
    await mount(TokenMeter)
    // 自动压缩上下文：接近上下文窗口时压缩旧历史、截断超大工具结果，继续生成
    await mount(ToolResultPruner, { thresholdChars: 8192, headChars: 4096, tailChars: 1024 })
    await mount(BasicCompactionEngine, { thresholdRatio: 0.8, retainRatio: 0.16, maxTokens: 8192, compactionRetries: 1 })
    await mount(SessionCheckpointPolicy)

    // 2) 模型适配器
    await mount(LlmDeepSeek)
    // The desktop's installed Ollama runtime is a first-class local fallback
    // for XYOS-managed DSH agents. It keeps the native Harness execution
    // usable when no cloud credential is configured, without exposing any
    // secret or opening a non-loopback endpoint.
    // pi-ai requires a credential value for OpenAI-compatible transports.
    // Ollama ignores the bearer value on loopback, so this is a non-secret
    // transport sentinel rather than a user credential.
    process.env.XYAI_OLLAMA_LOCAL_KEY ??= 'xyai-local-ollama'
    await mount(LlmPiAi, {
      providers: {
        'xyai-ollama': {
          displayName: 'XYAI 本机 Ollama', api: 'openai-completions', baseURL: 'http://127.0.0.1:11434/v1',
          apiKeyEnv: 'XYAI_OLLAMA_LOCAL_KEY',
          models: [{ id: 'qwen2.5vl:3b', name: 'Qwen2.5-VL 3B', input: ['text', 'image'] }],
          defaultContextWindow: 8192, defaultMaxTokens: 1536,
        },
      },
    })

    // 3) 沙箱 + 命令执行（Windows 用 pwsh）
    await mount(SubprocessLocal)
    await mount(SandboxLocal)
    await mount(SandboxPolicy, { mode: 'workspace-write', workspaceRoot: process.cwd() })
    await mount(PwshSandbox)
    await mount(ShellEnv)
    await mount(ToolPwsh)

    // 4) 文件系统工具
    await mount(FsSandbox)
    await mount(FsObservation)
    await mount(ToolFs)

    // 5) 网络搜索
    await mount(Web, { searchProvider: 'deepseek-official' })
    await mount(WebSearchDeepseek, { apiKeyEnv: 'DEEPSEEK_API_KEY' })
    await mount(ToolWeb, { fetch: false, searchTimeoutMs: 60000 })

    // 6) 任务组织
    await mount(ToolTodo, { allowParallelInProgress: true })

    // 7) 多 agent / workflow / goal / skill（全量）
    await mount(Subagent)
    await mount(SubagentSpawn, { providerName: 'spawn' })
    // one-shot（前台阻塞）：管理者 subagent 委派时等待子 agent 结果返回后继续汇总；
    // agentOptions 应用到每个子 agent（否则子 agent 用默认小 maxTokens，写文件/长报告会被截断）
    await mount(ToolSubagent, { provider: 'spawn', toolName: 'subagent', backgroundMode: 'one-shot', enableRunInBackground: false, maxDepth: 1, agentOptions: { maxTokens: 16384 } })
    await mount(WorkflowWorker, { provider: 'spawn' })
    await mount(ToolWorkflow)
    await mount(Goal)
    await mount(GoalDriver)
    await mount(ToolGoal)
    await mount(Skill)
    await mount(ToolSkill)

    // 8) 会话持久化（记忆跨会话延续）
    await mount(JsonlPersistence, { root: path.join(dshHome(), 'sessions') })

    // 9) agent 循环（最后挂载，consumers 就绪）
    await mount(AgentLoop, { agents: [] })
    // Cordis services are lazy.  This host creates agents immediately after
    // boot, so force the AgentLoop service to construct now; otherwise the
    // `agents` registry has no factory and the first employee/subagent turn
    // fails before it can create a session.
    const agentLoop = (ctx as any).agentLoop
    if (agentLoop === undefined) throw new Error('DSH agent-loop service failed to initialize')

    hostCtx = ctx
    return ctx
  })()
  return bootPromise
}

export interface DshAgentHandle {
  agent: Agent
  ctx: Context
}

/** 已创建 agent 的缓存：employeeId → handle（持久，跨会话复用）。 */
const agentCache = new Map<string, DshAgentHandle>()

/**
 * 取（或创建）一个按 key 缓存的持久 agent。
 * @param key 缓存/session 稳定标识（同一 key 同一 session，记忆跨会话延续）
 * @param persona 该 agent 的角色人设
 * @param cwd 工作区（租户沙箱）
 */
async function getAgentCached(key: string, persona: string, cwd: string, modelOverride?: string): Promise<DshAgentHandle> {
  const cached = agentCache.get(key)
  if (cached) return cached
  fs.mkdirSync(cwd, { recursive: true })
  const ctx = await initDshHost()
  const agents: any = ctx.get('agents')
  const defaultModel: any = ctx.get('agentDefaultModel')
  if (!agents || !defaultModel) throw new Error('DSH Host 核心服务未就绪')
  const requested = defaultModel.currentSelection?.() ?? { provider: 'xyai-ollama', model: 'qwen2.5vl:3b' }
  const registeredProviders = new Set((ctx as any).llm?.listProviders?.().map((item: { id: string }) => item.id) ?? [])
  // A stale DSH settings document can name a removed desktop-only provider.
  // Do not let it make every XYOS employee fail; use the bundled loopback
  // fallback only when the requested provider has no registered adapter.
  const selection = registeredProviders.has(requested.provider)
    ? requested
    : { provider: 'xyai-ollama', model: 'qwen2.5vl:3b' }
  if (selection.provider !== requested.provider) console.warn(`[DSH agent] unavailable provider ${requested.provider}; falling back to ${selection.provider}`)
  // modelOverride：轻量问答（如首页智能助手）指定快速模型，避开默认推理模型的延迟
  const agentOptions = { provider: selection.provider, model: modelOverride || selection.model, maxTokens: 16384 }
  const setup = (agentCtx: any) => {
    // 专属人设：注册 scoped persona 段，遮蔽全局空 persona（create 与 resume 都需重新注册）
    const sp = agentCtx.get('systemPrompt')
    if (sp && typeof sp.section === 'function') {
      try { sp.section({ name: 'deployment:persona', order: 0, text: persona }) } catch { /* 忽略 */ }
    }
  }

  // 优先恢复持久化 session（跨进程重启后保留记忆）；磁盘无日志或恢复失败时再新建。
  // 切勿直接用 create 复用同名 id —— 会与磁盘旧日志发生 id collision，导致 turn 永远 error、输出 0 字。
  let agent: any
  if (typeof agents.resume === 'function') {
    try {
      const resumed = await agents.resume({ resumeSessionId: SessionId(key), agentOptions, setup })
      agent = resumed.agent
      console.log(`[DSH agent] resume 成功: ${key}`)
    } catch (resumeErr: any) {
      // 恢复失败（多为首次创建、磁盘无日志）：新建
      console.warn(`[DSH agent] resume 失败(${key}): ${resumeErr?.message ?? resumeErr}，回退 create`)
      const created = await agents.create({ sessionId: SessionId(key), meta: { cwd }, agentOptions, setup })
      agent = created.agent
      console.log(`[DSH agent] create 成功: ${key}`)
    }
  } else {
    const created = await agents.create({ sessionId: SessionId(key), meta: { cwd }, agentOptions, setup })
    agent = created.agent
  }

  const handle = { agent, ctx }
  agentCache.set(key, handle)
  return handle
}

/** 取（或创建）某个 AI 员工的持久 agent。 */
export async function getEmployeeAgent(employeeId: string, persona: string, cwd: string, modelOverride?: string): Promise<DshAgentHandle> {
  return getAgentCached(`xyos-employee-${employeeId}`, persona, cwd, modelOverride)
}

/** 取（或创建）群聊的编排 agent（带 subagent 工具的指挥官，按 chatId 隔离 session）。 */
export async function getOrchestratorAgent(chatId: string, persona: string, cwd: string): Promise<DshAgentHandle> {
  return getAgentCached(`xyos-orchestrator-${chatId}`, persona, cwd)
}

// ============================================================
// 人机混聊：运行中 turn 的叫停 / 纠偏（人类最终话语权）
// ============================================================

interface ActiveRun {
  agent: Agent
  aborted: boolean
}

/** 正在运行的 agent turn，按 runKey（群聊为 `chat-${chatId}`）登记。 */
const activeRuns = new Map<string, ActiveRun>()

function registerRun(runKey: string, agent: Agent): void {
  activeRuns.set(runKey, { agent, aborted: false })
}

function unregisterRun(runKey: string): void {
  activeRuns.delete(runKey)
}

/** 是否仍有该 runKey 的运行中 turn。 */
export function isRunActive(runKey: string): boolean {
  return activeRuns.has(runKey)
}

/** 叫停某个运行中的 turn（覆盖级中断，用于"停止/暂停"指令）。 */
export function requestAbort(runKey: string): boolean {
  const run = activeRuns.get(runKey)
  if (!run) return false
  run.aborted = true
  try { run.agent.cancel({ kind: 'user' }) } catch { /* 忽略并发取消 */ }
  return true
}

/** 纠偏锚点：向运行中的 agent 注入 steering（覆盖级，就近 step 消费）。 */
export function requestSteer(runKey: string, text: string): boolean {
  const run = activeRuns.get(runKey)
  if (!run) return false
  try {
    run.agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    return true
  } catch { return false }
}


export type DshStep =
  | { kind: 'tool_call'; name: string; text: string }
  | { kind: 'tool_result'; name?: string; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'text'; text: string }

/**
 * 驱动一次员工回答：把用户消息交给 agent，流式回传 step 事件。
 * @param onStep 每个 step（reasoning/tool/text）实时回调
 * @param runKey 可选运行标识（群聊用 `chat-${chatId}`），用于人机叫停/纠偏
 * @returns 最终文本 + 是否正常完成
 */
export async function runEmployeeTurn(
  handle: DshAgentHandle,
  text: string,
  onStep: (step: DshStep) => void,
  runKey?: string,
): Promise<{ text: string; reasoning: string; ok: boolean; aborted?: boolean }> {
  const { agent, ctx } = handle
  await agent.whenIdle()
  const firstSeq = agent.session.seq
  const rk = runKey ?? `run-${randomUUID()}`
  registerRun(rk, agent)
  const isAborted = () => activeRuns.get(rk)?.aborted === true

  // 订阅该 agent 的 session/event，实时映射为 step 事件
  const dispose = ctx.on('session/event', (_session: any, event: SessionEvent) => {
    if (event.seq <= firstSeq) return
    if (event.type === 'tool/call') {
      const d: any = event.data
      onStep({ kind: 'tool_call', name: d?.name, text: summarizeArgs(d?.name, d?.arguments) })
    } else if (event.type === 'assistant/chunk') {
      const c: any = event.data?.chunk
      if (c?.type === 'reasoning-delta') onStep({ kind: 'reasoning', text: c.text })
      else if (c?.type === 'text-delta') onStep({ kind: 'text', text: c.text })
    }
  })

  try {
    agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    await agent.whenIdle()

    // 汇总最终文本（累计所有 assistant/message 的 text 块，兼容 type/kind 两种判别）
    const collect = (): { text: string; reasoning: string } => {
      let t = ''
      let r = ''
      for (const event of agent.session.events) {
        if (event.seq <= firstSeq) continue
        if (event.type !== 'assistant/message') continue
        for (const b of (event.data?.message?.content ?? []) as any[]) {
          if (!b || typeof b.text !== 'string') continue
          if (b.type === 'text' || b.kind === 'text') t += b.text
          else if (b.type === 'reasoning' || b.kind === 'reasoning') r += b.text
        }
      }
      return { text: t, reasoning: r }
    }

    // 最近一次 turn/end 的结束原因（只看本轮 firstSeq 之后）
    const lastTurnEndReason = (): string | null => {
      let kind: string | null = null
      for (const event of agent.session.events) {
        if (event.seq <= firstSeq) continue
        if (event.type === 'turn/end') kind = (event.data as any)?.reason?.kind ?? null
      }
      return kind
    }
    const lastTurnErrorMessage = (): string | undefined => {
      for (const event of [...agent.session.events].reverse()) {
        if (event.seq <= firstSeq || event.type !== 'turn/end') continue
        const reason = (event.data as any)?.reason
        if (reason?.kind === 'error' && typeof reason.error?.message === 'string') return reason.error.message
      }
      return undefined
    }

    // 输出触顶（max-tokens）自动续跑：让模型"继续"补齐剩余结论，最多 3 次（熔断上限）
    const MAX_AUTO_CONTINUE = 3
    for (let i = 0; i < MAX_AUTO_CONTINUE; i++) {
      if (isAborted()) break
      if (lastTurnEndReason() !== 'max-tokens') break
      agent.followup(createUserMessage({ content: [{ type: 'text', text: '继续完成上面未完成的内容，直接给出剩余结论（不要再重复已写的内容）。' }], source: { kind: 'user' } }))
      await agent.whenIdle()
    }

    let { text: final, reasoning } = collect()
    // 若模型只调了工具没给文字结论，补一次"直接给结论"（已叫停则跳过）
    if (!final.trim() && !isAborted()) {
      agent.followup(createUserMessage({ content: [{ type: 'text', text: '请直接输出你的文字结论（不要再调用工具，直接给结果）。' }], source: { kind: 'user' } }))
      await agent.whenIdle()
      const again = collect()
      if (again.text.trim()) final = again.text
      else if (again.reasoning.trim()) final = again.reasoning
    }
    // 兜底：text 空但 reasoning 非空时，用 reasoning 尾部作为正文（避免"0字"）
    if (!final.trim() && reasoning.trim()) {
      const tail = reasoning.trim().split('\n').slice(-6).join('\n')
      final = `[思考要点]\n${tail}`
    }
    const endReason = lastTurnEndReason()
    const completed = !isAborted() && endReason !== 'error'
    if (!completed && !final.trim()) final = `DSH 模型调用未完成：${lastTurnErrorMessage() ?? '请检查当前模型提供商、模型名称和凭据配置。'}`
    console.log(`[DSH turn] ${rk} ok=${completed} endReason=${endReason} text=${final.length} reasoning=${reasoning.length}`)
    return { text: final, reasoning, ok: completed, aborted: isAborted() }
  } catch (err: any) {
    return { text: err?.message ?? String(err), reasoning: "", ok: false, aborted: isAborted() }
  } finally {
    unregisterRun(rk)
    dispose()
  }
}

function summarizeArgs(name?: string, argsJson?: string): string {
  let args: any = {}
  try { args = argsJson ? JSON.parse(argsJson) : {} } catch { return name ?? '' }
  const pick = (keys: string[]) => { for (const k of keys) if (typeof args[k] === 'string' && args[k]) return args[k]; return '' }
  const file = pick(['file_path', 'path', 'pattern', 'target'])
  const cmd = pick(['command', 'cmd'])
  const query = pick(['query', 'prompt', 'description', 'question'])
  const short = (s: string, n = 120) => (s.length > n ? s.slice(0, n) + '…' : s)
  if (file) return short(file)
  if (cmd) return short(cmd)
  if (query) return short(query)
  return name ?? ''
}

function summarizeResult(data: any): string {
  if (!data) return ''
  const raw = typeof data?.message?.content?.[0]?.content === 'string'
    ? data.message.content[0].content
    : typeof data?.content === 'string' ? data.content : ''
  return String(raw).slice(0, 240).replace(/\s+/g, ' ').trim()
}

/** 释放整个 DSH Host（进程退出前调用）。 */
export async function disposeDshHost(): Promise<void> {
  if (hostCtx) { await hostCtx.fiber.dispose().catch(() => {}); hostCtx = null; bootPromise = null }
  agentCache.clear()
}
