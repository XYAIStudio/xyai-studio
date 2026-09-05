/** 验证群聊 H2A2A2H：执行者回复已升级为真 agent（触发 read/pwsh 等工具） */
process.env.DSH_HOME = 'C:\\Users\\Lenovo\\.dsh'
import { initDatabase } from '../db'
import { runH2A2A2H } from '../services/ai'

const employees = [
  { id: 11, name: '陈远', role: 'CEO', agent_type: 'ceo', skills: '战略规划' },
  { id: 12, name: '林技', role: 'CTO', agent_type: 'cto', skills: '技术、编程' },
]

async function main() {
  await initDatabase()
  const stepEvents: string[] = []
  const toolEvents: string[] = []
  const result = await runH2A2A2H(
    '请写一个脚本，计算 1 到 100 的累加和并实际运行，把结果报给我。',
    employees,
    [],
    1,
    0,
    (phase, detail, stepKey, agentResult) => {
      if (phase === 'step_tool') toolEvents.push(`tool=${detail} ${agentResult?.toolSummary || ''}`)
      else if (phase.startsWith('step_')) stepEvents.push(`${phase}@${stepKey}: ${String(detail).slice(0, 40)}`)
    },
  )
  console.log('=== 工具事件（执行者真 agent 触发）:', toolEvents.length, '===')
  for (const t of toolEvents) console.log('  ' + t.slice(0, 100))
  console.log('=== step 事件（思考/正文）:', stepEvents.length, '===')
  for (const s of stepEvents.slice(-12)) console.log('  ' + s)
  console.log('=== 最终总结（前 500 字）===')
  console.log((result.finalContent || '').slice(0, 500))
  process.exit(0)
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1) })
