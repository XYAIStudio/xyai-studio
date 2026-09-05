/**
 * 把「热电尽调助手」智能体 seed 到所有租户（幂等）。
 * agent_type = thermal_dd，persona 在 ai.ts 的 THERMAL_DD_PROMPT 注入。
 * 运行：node node_modules/tsx/dist/cli.mjs scripts/seed-thermal-dd.ts
 */
import { initDatabase, dbAll, dbGet, dbRun, saveDb } from "../db";

async function main() {
  await initDatabase();
  const tenants = dbAll("SELECT id, name FROM tenants ORDER BY id") as any[];
  console.log(`租户数: ${tenants.length}`);

  let created = 0;
  for (const t of tenants) {
    const exists = dbGet(
      "SELECT id FROM employees WHERE tenant_id = ? AND agent_type = 'thermal_dd'",
      [t.id]
    );
    if (exists) {
      console.log(`  tenant#${t.id}(${t.name}) 已存在热电尽调助手，跳过`);
      continue;
    }
    dbRun(
      "INSERT INTO employees (name, role, agent_type, employee_type, skills, avatar_emoji, status, tenant_id) VALUES (?, ?, ?, 'ai', ?, ?, 'active', ?)",
      ["热电尽调助手", "热电尽调", "thermal_dd", "热电尽调,并购分析,风险评估,财务估值,合规审查", "🏭", t.id]
    );
    created++;
    console.log(`  tenant#${t.id}(${t.name}) 已创建热电尽调助手`);
  }

  saveDb();
  console.log(`\n完成：新建 ${created} 个，跳过 ${tenants.length - created} 个`);
  process.exit(0);
}

main().catch((e) => { console.error("seed 失败:", e); process.exit(1); });
