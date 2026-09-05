/** 验证单聊真 agent 的完整接线：ai.ts 的 streamSingleEmployeeResponse → DSH agent → 工具步骤 + 最终回答 */
process.env.DSH_HOME = 'C:\\Users\\Lenovo\\.dsh'
import { initDatabase } from '../db'
import { streamSingleEmployeeResponse } from '../services/ai'

const employee = { id: 1, name: '陈远', role: 'CEO', agent_type: 'ceo', skills: '', description: '' }

async function main() {
  await initDatabase()
  const tools: string[] = []
  let reasoningLen = 0
  let content = ''
  await streamSingleEmployeeResponse(
    employee,
    '请帮我写一个脚本，计算 1 到 100 的累加和并实际运行，告诉我结果。',
    [],
    1,
    {
      onReasoning: (t) => { reasoningLen += t.length },
      onToken: (t) => { content += t },
      onTool: (name, summary) => { tools.push(`${name}: ${summary}`) },
      onComplete: (full, r) => {
        console.log('=== 工具步骤（', tools.length, '）===')
        for (const t of tools) console.log('  ' + t.slice(0, 120))
        console.log('=== reasoning 字符数:', reasoningLen, '===')
        console.log('=== 最终回答 ===')
        console.log((full || content).slice(0, 1200))
      },
      onError: (e) => { console.log('ERROR:', e.message) },
    },
  )
  process.exit(0)
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1) })
