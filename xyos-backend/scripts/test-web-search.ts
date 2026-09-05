/** 验证「能搜索」：web_search 工具是否真实触发 */
process.env.DSH_HOME = 'C:\\Users\\Lenovo\\.dsh'
import { initDatabase } from '../db'
import { streamSingleEmployeeResponse } from '../services/ai'

const employee = { id: 2, name: '林技', role: 'CTO', agent_type: 'cto', skills: '', description: '' }

async function main() {
  await initDatabase()
  const tools: string[] = []
  let content = ''
  await streamSingleEmployeeResponse(
    employee,
    '请搜索一下 DeepSeek 的 R1 模型是什么时候发布的，并简述它的技术特点。',
    [],
    1,
    {
      onReasoning: () => {},
      onToken: (t) => { content += t },
      onTool: (name, summary) => { tools.push(`${name}: ${summary}`) },
      onComplete: (full) => {
        console.log('=== 工具步骤（', tools.length, '）===')
        for (const t of tools) console.log('  ' + t.slice(0, 120))
        console.log('=== 最终回答 ===')
        console.log((full || content).slice(0, 1000))
      },
      onError: (e) => { console.log('ERROR:', e.message) },
    },
  )
  process.exit(0)
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1) })
