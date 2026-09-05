process.env.DSH_HOME = 'C:\\Users\\Lenovo\\.dsh'
import { initDatabase } from '../db'
import { runH2A2A2HWithRouting } from '../services/ai'

const employees = [
  { id: 11, name: '陈远', role: 'CEO', agent_type: 'ceo', skills: '战略规划' },
  { id: 12, name: '林技', role: 'CTO', agent_type: 'cto', skills: '技术、编程' },
]

async function main() {
  await initDatabase()
  const events: string[] = []
  const r = await runH2A2A2HWithRouting(
    '开发一个天气预报网页',
    employees, [], 1, 0, 0,
    (phase, detail, stepKey) => {
      if (phase === 'classify_done' || phase === 'casual_mode' || phase === 'hierarchy_mode' || phase === 'peer_mode' || phase === 'step_tool' || phase === 'manager_assign_done' || phase === 'exec_reply_done') {
        events.push(`${phase}: ${String(detail).slice(0, 70)}`)
      }
    },
  )
  console.log('=== 关键事件 ===')
  for (const e of events) console.log('  ' + e)
  console.log('=== category:', (r as any).category, '===')
  console.log('=== finalContent 长度:', (r.finalContent || '').length, '===')
  console.log((r.finalContent || '').slice(0, 300))
  process.exit(0)
}
main().catch((e) => { console.error('FAILED:', e); process.exit(1) })
