/**
 * P26+P27 种子数据植入脚本
 * 为考勤、请假、报销、日报表植入演示数据
 * 从 server.ts 的 initDatabase() 后调用: import { seedOATables } from "./seed-oa"; seedOATables();
 */

import { dbRun, dbGet, dbAll, saveDb } from "./db";

// 辅助函数：获取日期字符串
function dateStr(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split("T")[0];
}

// 辅助函数：获取日期时间字符串
function datetimeStr(daysOffset: number, hour: number, minute: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

// 辅助函数：获取员工ID（按名称）
function getEmployeeId(name: string): number | null {
  const emp = dbGet("SELECT id FROM employees WHERE name = ? LIMIT 1", [name]) as any;
  return emp ? emp.id : null;
}

// 辅助函数：获取部门ID（按名称）
function getDeptId(name: string): number | null {
  const dept = dbGet("SELECT id FROM departments WHERE name = ? LIMIT 1", [name]) as any;
  return dept ? dept.id : null;
}

async function seedOA() {
  console.log("[OA种子] 开始植入演示数据...");

  // ========== 为所有租户植入数据 ==========
  const tenantIds = [1, 2]; // 主租户 + demo租户

  for (const tenantId of tenantIds) {
    console.log(`\n[OA种子] 处理租户 ${tenantId}...`);
    await seedTenantData(tenantId);
  }

  console.log("\n✅ [OA种子] 演示数据植入完成！");
}

async function seedTenantData(tenantId: number) {
  const tenantLabel = tenantId === 1 ? "主租户" : "Demo租户";

  // ========== 1. 考勤排班数据 ==========
  console.log(`[${tenantLabel}] 1/5 考勤排班...`);

  // 为租户2创建demo公司的部门
  if (tenantId === 2) {
    const existingCompany = dbGet("SELECT id FROM companies WHERE tenant_id = ?", [tenantId]) as any;
    if (!existingCompany) {
      dbRun("INSERT INTO companies (name, tenant_id) VALUES (?, ?)", ["Demo公司", tenantId]);
    }

    // 创建demo部门的员工（如果没有的话）
    const demoEmp = dbGet("SELECT id FROM employees WHERE tenant_id = ? AND name = ?", [tenantId, "演示员工"]) as any;
    if (!demoEmp) {
      // 获取或创建demo部门
      let demoDept = dbGet("SELECT id FROM departments WHERE tenant_id = ? AND name = ?", [tenantId, "演示部门"]) as any;
      let deptId: number;
      if (!demoDept) {
        const result = dbRun("INSERT INTO departments (company_id, name, sort_order, tenant_id) VALUES (?, ?, ?, ?)",
          [1, "演示部门", 0, tenantId]) as any;
        deptId = result.lastInsertRowid;
      } else {
        deptId = demoDept.id;
      }

      // 创建演示员工
      const userHash = "demo123"; // 简单hash用于种子数据
      dbRun("INSERT INTO users (email, password_hash, nickname, role, tenant_id) VALUES (?, ?, ?, ?, ?)",
        [`demo${tenantId}@demo.com`, userHash, "演示员工", "user", tenantId]);

      const user = dbGet("SELECT id FROM users WHERE email = ?", [`demo${tenantId}@demo.com`]) as any;
      if (user) {
        dbRun("INSERT INTO employees (user_id, name, role, department_id, employee_type, tenant_id) VALUES (?, ?, ?, ?, ?, ?)",
          [user.id, "演示员工", "员工", deptId, "human", tenantId]);
      }
    }
  }

  const existingSchedule1 = dbGet("SELECT id FROM attendance_schedules WHERE tenant_id = ? AND shift_name = ?", [tenantId, "标准行政班"]);
  if (!existingSchedule1) {
    dbRun(
      `INSERT INTO attendance_schedules (tenant_id, department_id, shift_name, work_start, work_end, flexible_minutes, effective_from)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, null, "标准行政班", "09:00", "18:00", 30, dateStr(-365)]
    );
    dbRun(
      `INSERT INTO attendance_schedules (tenant_id, department_id, shift_name, work_start, work_end, flexible_minutes, effective_from)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, null, "弹性研发班", "10:00", "19:00", 60, dateStr(-365)]
    );
  }
  console.log(`  ✅ [${tenantLabel}] 考勤排班已植入`);

  // ========== 2. 考勤记录数据 ==========
  console.log(`[${tenantLabel}] 2/5 考勤记录...`);

  // 获取该租户的所有员工
  const employees = dbAll("SELECT id, name FROM employees WHERE tenant_id = ? LIMIT 5", [tenantId]) as any[];

  for (const emp of employees) {
    // 过去7天 + 今天
    for (let i = -7; i <= 0; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dayOfWeek = d.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      const date = dateStr(i);
      const existing = dbGet("SELECT id FROM attendance_records WHERE tenant_id = ? AND employee_id = ? AND check_date = ?",
        [tenantId, emp.id, date]);

      if (!existing) {
        const checkIn = datetimeStr(i, 9, 5);
        const checkOut = datetimeStr(i, 18, 10);

        dbRun(
          `INSERT INTO attendance_records
           (tenant_id, employee_id, check_date, check_in_time, check_out_time, status, work_hours, check_in_location, check_out_location)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [tenantId, emp.id, date, checkIn, checkOut, "normal", 9.1, "公司办公区", "公司办公区"]
        );
      }
    }

    // 插入一条迟到记录
    const lateDate = dateStr(-3);
    const existingLate = dbGet("SELECT id FROM attendance_records WHERE tenant_id = ? AND employee_id = ? AND check_date = ?",
      [tenantId, emp.id, lateDate]);
    if (!existingLate) {
      dbRun(
        `INSERT INTO attendance_records
         (tenant_id, employee_id, check_date, check_in_time, check_out_time, status, work_hours, check_in_location)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, emp.id, lateDate, datetimeStr(-3, 9, 45), datetimeStr(-3, 18, 0), "late", 8.25, "外出办公"]
      );
    }
  }

  console.log(`  ✅ [${tenantLabel}] 考勤记录已植入（包含迟到记录）`);

  // ========== 3. 请假申请数据 ==========
  console.log(`[${tenantLabel}] 3/5 请假申请...`);

  const leaveData = [
    { type: "annual", start: -5, end: -3, days: 3, status: "approved", reason: "年度旅游休假" },
    { type: "sick", start: -2, end: -2, days: 1, status: "approved", reason: "身体不适就医" },
    { type: "personal", start: 3, end: 4, days: 2, status: "pending", reason: "私人事务处理" },
    { type: "annual", start: 7, end: 11, days: 5, status: "pending", reason: "年假安排" },
    { type: "marriage", start: 10, end: 14, days: 5, status: "pending", reason: "婚礼筹备及蜜月" },
  ];

  for (const leave of leaveData) {
    const emp = employees[0];
    if (!emp) continue;

    const existing = dbGet(
      `SELECT id FROM leave_requests WHERE tenant_id = ? AND employee_id = ? AND start_date = ? AND end_date = ?`,
      [tenantId, emp.id, dateStr(leave.start), dateStr(leave.end)]
    );
    if (existing) continue;

    dbRun(
      `INSERT INTO leave_requests
       (tenant_id, employee_id, department_id, leave_type, start_date, end_date, total_days, reason, status, reviewed_by, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId, emp.id, null, leave.type,
        dateStr(leave.start), dateStr(leave.end), leave.days,
        leave.reason, leave.status,
        leave.status === "approved" && employees[1] ? employees[1].id : null,
        leave.status === "approved" ? datetimeStr(-1, 10, 0) : null
      ]
    );
  }
  console.log(`  ✅ [${tenantLabel}] 请假申请已植入`);

  // ========== 4. 报销记录数据 ==========
  console.log(`[${tenantLabel}] 4/5 报销记录...`);

  const expenseData = [
    { type: "travel", amount: 3500, items: 2, status: "paid", payStatus: "paid", date: -10, desc: "上海出差差旅费" },
    { type: "business", amount: 1200, items: 1, status: "approved", payStatus: "paid", date: -5, desc: "客户商务接待" },
    { type: "entertainment", amount: 2800, items: 3, status: "approved", payStatus: "unpaid", date: -3, desc: "项目签约宴请" },
    { type: "training", amount: 5000, items: 2, status: "pending", payStatus: "unpaid", date: -1, desc: "技术培训费用" },
    { type: "office", amount: 450, items: 1, status: "approved", payStatus: "paid", date: -7, desc: "办公用品采购" },
    { type: "communication", amount: 200, items: 1, status: "approved", payStatus: "paid", date: -15, desc: "通讯补贴报销" },
  ];

  for (const exp of expenseData) {
    const emp = employees[Math.floor(Math.random() * employees.length)];
    if (!emp) continue;

    const existing = dbGet(
      `SELECT id FROM expense_records WHERE tenant_id = ? AND employee_id = ? AND expense_date = ? AND amount = ?`,
      [tenantId, emp.id, dateStr(exp.date), exp.amount]
    );
    if (existing) continue;

    const result = dbRun(
      `INSERT INTO expense_records
       (tenant_id, employee_id, expense_type, amount, expense_date, description, invoice_count, status, payment_status, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId, emp.id, exp.type, exp.amount, dateStr(exp.date),
        exp.desc, exp.items, exp.status, exp.payStatus,
        exp.payStatus === "paid" ? datetimeStr(-2, 12, 0) : null
      ]
    ) as any;

    // 插入报销明细
    const recordId = result.lastInsertRowid;
    for (let i = 0; i < exp.items; i++) {
      const itemAmount = exp.items > 1 ? (exp.amount / exp.items) : exp.amount;
      dbRun(
        `INSERT INTO expense_items (expense_record_id, item_type, amount, description, invoice_no)
         VALUES (?, ?, ?, ?, ?)`,
        [recordId, exp.type, itemAmount.toFixed(2), `发票明细${i + 1}`, `FP${dateStr(exp.date).replace(/-/g, "")}${String(i + 1).padStart(4, "0")}`]
      );
    }
  }
  console.log(`  ✅ [${tenantLabel}] 报销记录已植入`);

  // ========== 5. 日报/周报数据 ==========
  console.log(`[${tenantLabel}] 5/5 日报周报...`);

  const reportData = [
    { type: "daily", dateOffset: -1, title: "日常工作汇报", work: "完成当日工作计划，处理日常事务", plan: "明日继续推进工作" },
    { type: "daily", dateOffset: -2, title: "工作进度汇报", work: "完成项目开发任务，参加团队会议", plan: "继续开发工作" },
  ];

  for (const rep of reportData) {
    const emp = employees[0];
    if (!emp) continue;

    const reportDate = dateStr(rep.dateOffset);
    const existing = dbGet(
      `SELECT id FROM daily_reports WHERE tenant_id = ? AND employee_id = ? AND report_date = ? AND report_type = ?`,
      [tenantId, emp.id, reportDate, rep.type]
    );
    if (existing) continue;

    dbRun(
      `INSERT INTO daily_reports
       (tenant_id, employee_id, report_type, report_date, title, work_summary, tomorrow_plan, submit_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, emp.id, rep.type, reportDate, rep.title, rep.work, rep.plan, "submitted"]
    );
  }

  // 插入一条周报
  const weekDate = dateStr(-7);
  const existingWeekly = dbGet(`SELECT id FROM daily_reports WHERE tenant_id = ? AND report_type = 'weekly' AND report_date = ?`, [tenantId, weekDate]);
  if (!existingWeekly && employees[0]) {
    const weekNum = getWeekNumber(new Date(weekDate));
    dbRun(
      `INSERT INTO daily_reports
       (tenant_id, employee_id, report_type, report_date, week_number, title, work_summary, tomorrow_plan, submit_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, employees[0].id, "weekly", weekDate, weekNum, "第" + weekNum + "周工作总结", "本周完成各项任务", "下周工作计划", "submitted"]
    );
  }

  // 插入日报评论
  if (employees[0]) {
    const dailyReport = dbGet(`SELECT id FROM daily_reports WHERE tenant_id = ? AND employee_id = ? AND report_type = 'daily' ORDER BY report_date DESC LIMIT 1`, [tenantId, employees[0].id]) as any;
    if (dailyReport && employees[1]) {
      const existingComment = dbGet(`SELECT id FROM daily_report_comments WHERE tenant_id = ? AND report_id = ? LIMIT 1`, [tenantId, dailyReport.id]);
      if (!existingComment) {
        dbRun(
          `INSERT INTO daily_report_comments (tenant_id, report_id, employee_id, content) VALUES (?, ?, ?, ?)`,
          [tenantId, dailyReport.id, employees[1].id, "工作进展不错，继续保持！"]
        );
      }
    }
  }

  console.log(`  ✅ [${tenantLabel}] 日报周报已植入`);
  saveDb();
}

// 获取一年中的周数
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function seedOATables() {
  return seedOA();
}

// 由 server.ts 显式调用，不在模块加载时自动执行
// seedOA().catch(console.error);
