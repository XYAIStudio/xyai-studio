/** 自验证：让产品经理 + 架构师开发一个天气预报网页（群聊 H2A2A2H 编排 agent 委派） */
process.env.DSH_HOME = 'C:\\Users\\Lenovo\\.dsh'
import { initDatabase } from '../db'
import { runH2A2A2HWithRouting } from '../services/ai'

const employees = [
  { id: 21, name: 'AI产品经理', role: '产品经理', agent_type: 'product_manager', skills: '产品、需求分析' },
  { id: 22, name: 'AI架构师', role: '技术架构师', agent_type: 'tech_architect', skills: '架构、技术选型' },
  { id: 23, name: 'AI全栈工程师', role: '全栈工程师', agent_type: 'fullstack_dev', skills: 'React、Node.js' },
]

async function main() {
  await initDatabase()
  const toolEvents: string[] = []
  let stepTokens = 0
  const r = await runH2A2A2HWithRouting(
    '让产品经理、架构师开发一个天气预报网页',
    employees, [], 1, 0, 999,
    (phase, detail, stepKey, agentResult) => {
      if (phase === 'step_tool') toolEvents.push(`${detail}: ${(agentResult?.toolSummary || '').slice(0, 50)}`)
      else if (phase === 'step_token') stepTokens += String(detail).length
      else if (phase === 'classify_done' || phase === 'hierarchy_mode' || phase === 'step_done') {
        console.log(`[${phase}] ${String(detail).slice(0, 70)}`)
      }
    },
  )
  console.log('=== category:', (r as any).category, '| 工具步骤数:', toolEvents.length, '| 正文token数:', stepTokens, '===')
  for (const t of toolEvents) console.log('  · ' + t)
  console.log('=== 最终汇总 ===')
  console.log((r.finalContent || '').slice(0, 1200))
  process.exit(0)
}
main().catch((e) => { console.error('FAILED:', e); process.exit(1) })
