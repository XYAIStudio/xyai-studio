/** 验证进程内 DSH Host：启动 → 建 agent → 跑一轮（能搜/能读/能执行） */
process.env.DSH_HOME = 'C:\\Users\\Lenovo\\.dsh'
import { initDshHost, getEmployeeAgent, runEmployeeTurn, disposeDshHost } from '../services/dsh-host'
import fs from 'node:fs'

async function main() {
  const ws = 'E:\\XYOSStudio\\runtime-workspace\\tenant-test-dsh-host'
  fs.mkdirSync(ws, { recursive: true })
  fs.writeFileSync(ws + '\\README.md', '# 测试工作区\n这是给 AI 员工读的文件。\n', 'utf8')

  console.log('[1] 启动 DSH Host ...')
  await initDshHost()
  console.log('[1] Host 已启动')

  console.log('[2] 创建持久 agent ...')
  const handle = await getEmployeeAgent('1', '你是 XYOS 的 AI 员工「测试员」，负责文件操作与信息检索，回答简洁。', ws)
  console.log('[2] agent 已创建, sessionId =', (handle.agent.session as any)?.id)

  console.log('[3] 跑一轮（要求读文件 + 列目录）...')
  let steps = 0
  const { text, ok } = await runEmployeeTurn(
    handle,
    '请读取工作区里的 README.md 文件，告诉我里面写了什么，并列出当前工作区有哪些文件。',
    (step) => {
      steps++
      const name = step.kind === "tool_call" ? ` ${step.name}` : ""
      console.log(`    step[${step.kind}]${name}: ${(step.text || '').slice(0, 80)}`)
    },
  )
  console.log('[3] 完成 ok=', ok, 'steps=', steps)
  console.log('=== 最终回答 ===')
  console.log(text.slice(0, 2000))

  await disposeDshHost()
  console.log('[4] Host 已释放')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1) })
