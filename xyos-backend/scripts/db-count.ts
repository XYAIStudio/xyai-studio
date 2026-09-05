import { initDatabase, dbAll } from '../db'

async function main() {
  await initDatabase()
  const exec = ['chairman','ceo','cto','cfo','cmo','coo','cho','cao','cpo','cdo','cso','cco']
  for (const t of exec) {
    const r = dbAll(`SELECT COUNT(*) as c FROM employees WHERE agent_type='${t}' AND employee_type='ai'`)
    const human = dbAll(`SELECT COUNT(*) as c FROM employees WHERE agent_type='${t}'`)
    console.log(`${t}: ai=${(r as any[])[0]?.c} (any=${(human as any[])[0]?.c})`)
  }
  // 各租户的 AI 员工 agent_type 是否含 ceo/cto
  for (const tid of [1,2,3]) {
    const r = dbAll(`SELECT agent_type, COUNT(*) c FROM employees WHERE tenant_id=${tid} AND employee_type='ai' AND agent_type IN ('ceo','cto','cfo','cmo','coo') GROUP BY agent_type`)
    console.log(`tenant ${tid} 高管AI: ${JSON.stringify(r)}`)
  }
  // 人类员工（是否有陈远/林技等）
  const humans = dbAll(`SELECT id, name, role, agent_type, employee_type FROM employees WHERE employee_type='human' LIMIT 20`)
  console.log('--- human 员工抽样 ---')
  for (const h of humans as any[]) console.log(`  #${h.id} ${h.name}(${h.role}) agent=${h.agent_type} type=${h.employee_type}`)
  process.exit(0)
}
main()
