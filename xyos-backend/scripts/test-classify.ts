import { classifyConversationIntent } from '../services/workflow-engine'
import { initDatabase } from '../db'

async function main() {
  await initDatabase()
  const cases = [
    '开发一个天气预报网页',
    '今天天气怎么样',
    '帮我写个脚本计算 1 到 100 的和',
    '大家好，周末愉快',
    '实现一个登录功能',
    '查一下 2024 年咨询行业趋势',
  ]
  for (const c of cases) {
    const r = await classifyConversationIntent(c, [])
    console.log(`「${c}」 → ${r.category} (${r.priority}) ${r.reason}`)
  }
  process.exit(0)
}
main()
