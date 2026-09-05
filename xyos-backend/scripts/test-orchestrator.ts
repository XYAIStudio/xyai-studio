/** 验证群聊管理者 = 带 subagent 工具的编排 agent（委派下属 + 汇总） */
process.env.DSH_HOME = 'C:\\Users\\Lenovo\\.dsh'
import { initDatabase } from '../db'
import { runH2A2A2HWithRouting } from '../services/ai'

const employees = [
  { id: 11, name: '陈远', role: 'CEO', agent_type: 'ceo', skills: '战略规划' },
  { id: 12, name: '林技', role: 'CTO', agent_type: 'cto', skills: '技术、编程' },
  { id: 13, name: '赵产', role: '产品总监', agent_type: 'product_manager', skills: '产品、市场调研' },
]

async function main() {
  await initDatabase()
  const toolEvents: string[] = []
  let content = ''
  const r = await runH2A2A2HWithRouting(
    '请团队协作完成：林技写一个计算 1 到 100 和的脚本并运行，赵产调研一下 2024 年 AI 咨询趋势。',
    employees, [], 1, 0, 888,
    (phase, detail, stepKey, agentResult) => {
      if (phase === 'step_tool') toolEvents.push(`${detail}: ${(agentResult?.toolSummary || '').slice(0, 50)}`)
      else if (phase === 'step_token') content += detail
    },
  )
  console.log('=== 工具步骤（', toolEvents.length, '）===')
  for (const t of toolEvents) console.log('  ' + t)
  console.log('=== category:', (r as any).category, '===')
  console.log('=== 最终汇总（前 600 字）===')
  console.log((r.finalContent || content || '').slice(0, 600))
  process.exit(0)
}
main().catch((e) => { console.error('FAILED:', e); process.exit(1) })
