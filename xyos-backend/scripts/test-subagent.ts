/** 验证 manager 带 subagent 工具的编排能力：manager agent 能否 spawn 子 agent 委派任务 */
process.env.DSH_HOME = 'C:\\Users\\Lenovo\\.dsh'
import { initDshHost, getEmployeeAgent, runEmployeeTurn, disposeDshHost } from '../services/dsh-host'

async function main() {
  await initDshHost()
  // 管理者人设：明确列出团队 + 强制 subagent 委派
  const persona = `你是「陈远 · CEO」，管理咨询公司的 AI 高管。你的团队有这些 AI 下属：
- 林技(CTO)：技术、编程、架构
- 赵产(产品总监)：产品、市场调研、用户研究

工作纪律：凡是需要调研、分析、写代码、做文件等具体执行类工作，你【必须】调用 subagent 工具把子任务委派给对应下属，并把你和下属的分工写清楚；不得自己直接用 web_search/read 等工具代劳。最后汇总下属的结果。保持简洁。`
  // Use a fresh session for this smoke test so an old persisted cloud-model
  // selection cannot mask the current desktop Host routing.
  const handle = await getEmployeeAgent(`mgr-ceo-smoke-${Date.now()}`, persona, 'E:\\XYOSStudio\\runtime-workspace\\tenant-1')
  const tools: string[] = []
  const { text, ok } = await runEmployeeTurn(
    handle,
    '请委派「赵产」用 subagent 调研 2024 年 AI 咨询行业趋势，委派「林技」写一段 Python 脚本算 1 到 100 的和，然后汇总两位的结果。',
    (step) => { if (step.kind === 'tool_call') tools.push(`${step.name}: ${step.text.slice(0, 60)}`) },
  )
  console.log('=== 工具调用 ===')
  for (const t of tools) console.log('  ' + t)
  console.log('=== 最终回答 ===')
  console.log(text.slice(0, 800))
  if (!ok || !text.trim()) throw new Error('manager agent turn did not complete with a response; verify the configured model provider and credentials')
  if (!tools.some(item => item.startsWith('subagent:'))) throw new Error('manager agent did not invoke the subagent tool')
  await disposeDshHost()
  process.exit(0)
}
main().catch((e) => { console.error('FAILED:', e); process.exit(1) })
