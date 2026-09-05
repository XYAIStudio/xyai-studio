/**
 * DSH 会话事件流桥（由 DshAdapter 通过 --patch 挂载到 headless profile）。
 *
 * 职责：把 DSH 智能体运行过程中的 SessionEvent（think/tool/call/tool/result 等）
 * 逐行 JSONL 写入 DSH_EVENT_STREAM 指定的文件，供 XYOS 后端 tail 后实时推送到群聊，
 * 让「read / edit / pwsh / grep / write / web_search …」这些工具过程在业务空间可见。
 *
 * 注意：本文件只依赖 node 内建模块与全局 process，不 import 任何 @deepseek-ai/* 包，
 * 以便被 DSH 的 tsx loader 从任意路径加载（避免模块解析依赖 DSH node_modules）。
 */
import { appendFileSync } from 'node:fs'

export const name = 'dsh-chat-event-stream'
export const inject: string[] = []

export function apply(ctx: any): void {
  const file = process.env.DSH_EVENT_STREAM
  if (!file) return
  ctx.on('session/event', (_session: unknown, event: any) => {
    try {
      // 只转发有展示价值的步骤事件，减少噪声
      const t = event && event.type
      if (
        t === 'tool/call' ||
        t === 'tool/result' ||
        t === 'step/start' ||
        t === 'step/end' ||
        t === 'assistant/message' ||
        t === 'turn/start' ||
        t === 'turn/end'
      ) {
        appendFileSync(file, JSON.stringify(event) + '\n')
      }
    } catch {
      /* 事件流失败不阻断 agent 运行 */
    }
  })
}
