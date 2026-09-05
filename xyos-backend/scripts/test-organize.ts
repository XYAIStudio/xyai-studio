/** 验证「能组织」：多步任务是否触发 todo_write / subagent 等组织工具 */
process.env.DSH_HOME = 'C:\\Users\\Lenovo\\.dsh'
import { initDatabase } from '../db'
import { streamSingleEmployeeResponse } from '../services/ai'

const employee = { id: 3, name: '赵产', role: '产品总监', agent_type: 'product_manager', skills: '', description: '' }

async function main() {
  await initDatabase()
  const tools: string[] = []
  let content = ''
  await streamSingleEmployeeResponse(
    employee,
    '请分三步完成一个产品小调研：1) 用 todo 列出步骤；2) 搜索 2024 年 AI 咨询行业趋势；3) 把结论写入工作区 report.md 文件。',
    [],
    1,
    {
      onReasoning: () => {},
      onToken: (t) => { content += t },
      onTool: (name, summary) => { tools.push(`${name}: ${summary}`) },
      onComplete: (full) => {
        console.log('=== 工具步骤（', tools.length, '）===')
        for (const t of tools) console.log('  ' + t.slice(0, 110))
        console.log('=== 最终回答 ===')
        console.log((full || content).slice(0, 700))
      },
      onError: (e) => { console.log('ERROR:', e.message) },
    },
  )
  process.exit(0)
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1) })
