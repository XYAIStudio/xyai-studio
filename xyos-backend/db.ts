import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "data/xiongyuan.db");
let db: SqlJsDatabase;

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs();

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);
    console.log("[数据库] 加载已有数据库文件");
  } else {
    db = new SQL.Database();
    console.log("[数据库] 创建新数据库");
  }

  // WAL-like pragmas
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  // 确保旧数据库也包含所有新表（兼容已有数据文件的迁移）
  ensureTables(db);

  // Periodic persistence every 30 seconds
  const persistenceTimer = setInterval(() => { try { saveDb(); } catch {} }, 30000);
  persistenceTimer.unref();

  // Schema
  db.run(`
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      tenant_code VARCHAR(8) UNIQUE,
      logo_url TEXT,
      theme_color TEXT DEFAULT '#10B981',
      domain TEXT,
      status TEXT DEFAULT 'trial',
      plan TEXT DEFAULT 'free',
      trial_ends_at DATETIME,
      subscription_ends_at DATETIME,
      max_users INTEGER DEFAULT 5,
      max_ai_employees INTEGER DEFAULT 10,
      max_tokens_monthly INTEGER DEFAULT 1000000,
      settings_json TEXT,
      token_version INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nickname TEXT,
      role TEXT DEFAULT 'user',
      tenant_id INTEGER DEFAULT 1,
      token_version INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      tenant_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER,
      name TEXT NOT NULL,
      parent_id INTEGER,
      sort_order INTEGER DEFAULT 0,
      tenant_id INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pid VARCHAR(16) UNIQUE,
      company_id INTEGER,
      department_id INTEGER,
      name TEXT NOT NULL,
      role TEXT,
      agent_type TEXT,
      employee_type TEXT DEFAULT 'ai',
      skills TEXT,
      avatar_emoji TEXT,
      status TEXT DEFAULT 'active',
      tenant_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      assigned_to INTEGER,
      created_by INTEGER,
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'todo',
      tenant_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER,
      title TEXT,
      type TEXT DEFAULT 'group',
      created_by INTEGER,
      tenant_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS chat_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER,
      user_id INTEGER,
      employee_id INTEGER,
      role TEXT DEFAULT 'member'
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER,
      sender_id INTEGER,
      sender_type TEXT DEFAULT 'user',
      sender_name TEXT,
      content TEXT NOT NULL,
      message_type TEXT DEFAULT 'text',
      tenant_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS knowledge_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      content TEXT,
      source TEXT,
      tags TEXT,
      company_id INTEGER,
      tenant_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS task_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      user_id INTEGER,
      employee_id INTEGER,
      content TEXT NOT NULL,
      comment_type TEXT DEFAULT 'user',
      tenant_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS task_subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      tenant_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS task_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      file_path TEXT,
      file_size INTEGER,
      mime_type TEXT,
      uploaded_by INTEGER,
      tenant_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS message_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_message_id INTEGER NOT NULL,
      chat_id INTEGER NOT NULL,
      sender_id INTEGER,
      sender_type TEXT DEFAULT 'user',
      sender_name TEXT,
      content TEXT NOT NULL,
      tenant_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS message_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      tenant_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS read_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      read_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      content TEXT,
      link TEXT,
      read INTEGER DEFAULT 0,
      tenant_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      employee_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      details TEXT,
      tenant_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ai_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      description TEXT,
      tenant_id INTEGER DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      permissions TEXT NOT NULL,
      tenant_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      tenant_id INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS employee_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      tasks_completed INTEGER DEFAULT 0,
      tasks_failed INTEGER DEFAULT 0,
      avg_response_time REAL DEFAULT 0,
      tokens_used INTEGER DEFAULT 0,
      score REAL DEFAULT 0,
      tenant_id INTEGER DEFAULT 1,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dashboards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      config TEXT,
      user_id INTEGER,
      is_default INTEGER DEFAULT 0,
      tenant_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chart_widgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dashboard_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      config TEXT,
      position_x INTEGER DEFAULT 0,
      position_y INTEGER DEFAULT 0,
      width INTEGER DEFAULT 4,
      height INTEGER DEFAULT 3,
      tenant_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS company_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      setting_key TEXT NOT NULL,
      setting_value TEXT,
      tenant_id INTEGER DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 智能助手对话记录表
    CREATE TABLE IF NOT EXISTS assistant_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      ip_address TEXT,
      city TEXT,
      region TEXT,
      country TEXT,
      user_agent TEXT,
      messages_json TEXT,
      message_count INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      lead_captured INTEGER DEFAULT 0,
      lead_info TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- IP地理位置缓存表
    CREATE TABLE IF NOT EXISTS ip_geo_cache (
      ip TEXT PRIMARY KEY,
      city TEXT,
      region TEXT,
      country TEXT,
      isp TEXT,
      queried_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  saveDb();
  console.log("[数据库] Schema 初始化完成（含扩展表）");
  
  // 运行迁移
  runMigrations();
  ensureSecurityTokenColumns();
  ensureReportAssistantTalent();
}

/**
 * 安全令牌撤销字段必须独立于历史数据迁移执行。
 * runMigrations 为保护已有员工数据可能提前返回，但旧库仍然需要补齐这些字段。
 */
function ensureSecurityTokenColumns() {
  const ensureColumn = (table: "users" | "tenants", column: string, definition: string) => {
    const result = db.exec(`PRAGMA table_info(${table})`);
    const columns = result[0]?.values.map((row) => String(row[1])) ?? [];
    if (!columns.includes(column)) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`[迁移] 已为 ${table} 补齐 ${column}`);
    }
  };

  ensureColumn("users", "token_version", "INTEGER DEFAULT 0");
  ensureColumn("tenants", "token_version", "INTEGER DEFAULT 0");
  saveDb();
}

/**
 * 为所有已有租户幂等补录系统汇报智能助手。
 * 该步骤不能只放在 runMigrations 中：旧库为了保护业务数据会跳过全量迁移。
 */
function ensureReportAssistantTalent() {
  try {
    db.run(`
      INSERT INTO talent_pool
        (tenant_id, talent_type, name, avatar_emoji, skills, category, description, source, rating, status,
         agent_type, capabilities, token_cost_per_k, provider, integration_type)
      SELECT t.id, 'ai', '日报周报月报智能助手', '📝',
        '日报撰写,周报汇总,月报分析,进度跟踪,问题提炼', '办公协作',
        '自动整理工作日报、汇总团队周报、生成经营月报，提炼进展、问题、风险和下阶段计划',
        'system', 5, 'available', 'report_assistant',
        '["日报撰写","周报汇总","月报分析","进度跟踪","问题提炼"]',
        '¥0.03', 'XYAI Studio', 'xyos-native'
      FROM tenants t
      WHERE NOT EXISTS (
        SELECT 1 FROM talent_pool p
        WHERE p.tenant_id = t.id AND p.agent_type = 'report_assistant'
      )
    `);
    saveDb();
  } catch (e) {
    console.error('[迁移] 日报周报月报智能助手补录失败:', e);
  }
}

/**
 * 确保旧数据库文件也包含所有新增表（向后兼容迁移）
 */
function ensureTables(sqlDb: SqlJsDatabase) {
  // P25: 通知公告
  ensureTable(sqlDb, "announcements", `
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER DEFAULT 1,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'notice' CHECK(type IN ('notice','policy','news','emergency')),
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('low','normal','important','urgent')),
      is_pinned INTEGER DEFAULT 0,
      published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME
    )`);

  ensureTable(sqlDb, "announcement_reads", `
    CREATE TABLE IF NOT EXISTS announcement_reads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(announcement_id, user_id)
    )`);

  // P26: 考勤管理
  ensureTable(sqlDb, "attendance_records", `
    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER DEFAULT 1,
      employee_id INTEGER NOT NULL,
      check_date DATE NOT NULL,
      check_in_time DATETIME,
      check_out_time DATETIME,
      check_in_lat REAL,
      check_in_lng REAL,
      check_out_lat REAL,
      check_out_lng REAL,
      check_in_location TEXT,
      check_out_location TEXT,
      status TEXT DEFAULT 'normal',
      work_hours REAL DEFAULT 0,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(employee_id, check_date)
    )`);

  ensureTable(sqlDb, "attendance_schedules", `
    CREATE TABLE IF NOT EXISTS attendance_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER DEFAULT 1,
      department_id INTEGER,
      shift_name TEXT NOT NULL,
      work_start TIME NOT NULL,
      work_end TIME NOT NULL,
      flexible_minutes INTEGER DEFAULT 0,
      effective_from DATE,
      effective_to DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

  ensureTable(sqlDb, "attendance_supplements", `
    CREATE TABLE IF NOT EXISTS attendance_supplements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER DEFAULT 1,
      employee_id INTEGER NOT NULL,
      check_date DATE NOT NULL,
      supplement_type TEXT NOT NULL CHECK(supplement_type IN ('check_in', 'check_out', 'both')),
      reason TEXT,
      workflow_instance_id INTEGER,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
      reviewed_by INTEGER,
      reviewed_at DATETIME,
      review_comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

  // P27: 请假/报销/日报
  ensureTable(sqlDb, "leave_requests", `
    CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER DEFAULT 1,
      employee_id INTEGER NOT NULL,
      department_id INTEGER,
      workflow_instance_id INTEGER,
      leave_type TEXT NOT NULL CHECK(leave_type IN ('annual', 'sick', 'personal', 'marriage', 'maternity', 'bereavement', 'other')),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      total_days REAL NOT NULL,
      reason TEXT,
      substitute_employee_id INTEGER,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
      reviewed_by INTEGER,
      reviewed_at DATETIME,
      review_comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

  ensureTable(sqlDb, "expense_records", `
    CREATE TABLE IF NOT EXISTS expense_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER DEFAULT 1,
      employee_id INTEGER NOT NULL,
      department_id INTEGER,
      workflow_instance_id INTEGER,
      expense_type TEXT NOT NULL CHECK(expense_type IN ('travel', 'business', 'office', 'communication', 'vehicle', 'entertainment', 'training', 'other')),
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'CNY',
      expense_date DATE NOT NULL,
      description TEXT,
      invoice_count INTEGER DEFAULT 0,
      contract_id INTEGER,
      supplier_name TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'paid', 'cancelled')),
      payment_status TEXT DEFAULT 'unpaid',
      paid_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

  ensureTable(sqlDb, "expense_items", `
    CREATE TABLE IF NOT EXISTS expense_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_record_id INTEGER NOT NULL,
      item_type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      invoice_no TEXT,
      invoice_date DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

  ensureTable(sqlDb, "daily_reports", `
    CREATE TABLE IF NOT EXISTS daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER DEFAULT 1,
      employee_id INTEGER NOT NULL,
      department_id INTEGER,
      report_type TEXT NOT NULL CHECK(report_type IN ('daily', 'weekly')),
      report_date DATE NOT NULL,
      week_number INTEGER,
      title TEXT,
      work_summary TEXT NOT NULL,
      tomorrow_plan TEXT,
      issues_blockers TEXT,
      attachments TEXT,
      submit_status TEXT DEFAULT 'submitted' CHECK(submit_status IN ('draft', 'submitted', 'approved')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

  ensureTable(sqlDb, "daily_report_comments", `
    CREATE TABLE IF NOT EXISTS daily_report_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER DEFAULT 1,
      report_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

  // 雄元智脑XYOS — Runtime Gateway（V0.6 FR-RUN 落地）
  ensureTable(sqlDb, "runtime_providers", `
    CREATE TABLE IF NOT EXISTS runtime_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      enabled INTEGER DEFAULT 1,
      capabilities TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

  ensureTable(sqlDb, "agent_runs", `
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','cancelled')),
      task TEXT NOT NULL,
      cwd TEXT,
      model TEXT,
      result TEXT,
      error TEXT,
      events_snapshot TEXT,
      evidence_snapshot TEXT,
      metadata TEXT,
      created_at DATETIME,
      started_at DATETIME,
      finished_at DATETIME
    )`);
  // 迁移：agent_runs 绑定租户 + 算力估算（统一算力计量）
  try { sqlDb.run("ALTER TABLE agent_runs ADD COLUMN tenant_id INTEGER"); } catch { /* 列已存在 */ }
  try { sqlDb.run("ALTER TABLE agent_runs ADD COLUMN guest_session TEXT"); } catch { /* 列已存在 */ }
  try { sqlDb.run("ALTER TABLE agent_runs ADD COLUMN tokens_estimated INTEGER DEFAULT 0"); } catch { /* 列已存在 */ }
  try { sqlDb.run("ALTER TABLE agent_runs ADD COLUMN run_kind TEXT DEFAULT 'task'"); } catch { /* 列已存在 */ }
  try { sqlDb.run("ALTER TABLE agent_runs ADD COLUMN structured_input TEXT"); } catch { /* 列已存在 */ }
  try { sqlDb.run("ALTER TABLE agent_runs ADD COLUMN plan_snapshot TEXT"); } catch { /* 列已存在 */ }
  try { sqlDb.run("ALTER TABLE agent_runs ADD COLUMN events_snapshot TEXT"); } catch { /* 列已存在 */ }
  try { sqlDb.run("ALTER TABLE agent_runs ADD COLUMN evidence_snapshot TEXT"); } catch { /* 列已存在 */ }
  // 迁移：messages 增加思考过程（reasoning）列 —— 复刻 DSH 思考+回答形式
  try { sqlDb.run("ALTER TABLE messages ADD COLUMN reasoning TEXT"); } catch { /* 列已存在 */ }
  // 迁移：messages 增加 token 消耗列 —— 复刻 DSH 底部 token 统计
  try { sqlDb.run("ALTER TABLE messages ADD COLUMN tokens INTEGER DEFAULT 0"); } catch { /* 列已存在 */ }
  // 迁移：messages 增加步骤元数据列（工具步骤名 / 步骤键）—— 供 Turn→Step→Block 树形呈现持久化
  try { sqlDb.run("ALTER TABLE messages ADD COLUMN phase TEXT"); } catch { /* 列已存在 */ }
  try { sqlDb.run("ALTER TABLE messages ADD COLUMN step_key TEXT"); } catch { /* 列已存在 */ }

  // 雄元智脑XYOS — SaaS 订阅（订阅记录/订单）
  ensureTable(sqlDb, "subscriptions", `
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      plan_slug TEXT NOT NULL,
      plan_name TEXT,
      amount REAL DEFAULT 0,
      months INTEGER DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','cancelled','pending')),
      payment_method TEXT DEFAULT 'transfer',
      period_start DATETIME,
      period_end DATETIME,
      created_by INTEGER,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

  // 雄元智脑XYOS — 支付订单（订阅扫码支付）
  ensureTable(sqlDb, "payment_orders", `
    CREATE TABLE IF NOT EXISTS payment_orders (
      id TEXT PRIMARY KEY,
      sub_id TEXT,
      tenant_id INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'hupijiao',
      amount REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','closed')),
      qrcode_url TEXT,
      trade_no TEXT,
      raw TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME
    )`);

  // V1.0 H2A2A2H 状态机表（12 态 + 看门狗 + 审计）
  ensureTable(sqlDb, "h2a2a2h_tasks", `
    CREATE TABLE IF NOT EXISTS h2a2a2h_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state TEXT NOT NULL DEFAULT 'created',
      title TEXT NOT NULL,
      description TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      claimed_by INTEGER REFERENCES users(id),
      assigned_to INTEGER REFERENCES users(id),
      reviewer_id INTEGER REFERENCES users(id),
      tenant_id INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      dispute_reason TEXT,
      arbitration_result TEXT,
      entered_at DATETIME,
      timeout_ms INTEGER,
      attempts INTEGER DEFAULT 0,
      version INTEGER DEFAULT 0
    )`);

  ensureTable(sqlDb, "h2a2a2h_state_log", `
    CREATE TABLE IF NOT EXISTS h2a2a2h_state_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES h2a2a2h_tasks(id),
      from_state TEXT NOT NULL,
      to_state TEXT NOT NULL,
      actor_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

  // 向后兼容：旧版 h2a2a2h_tasks 表补齐看门狗字段
  const h2a2a2hAlters = [
    "ALTER TABLE h2a2a2h_tasks ADD COLUMN entered_at DATETIME",
    "ALTER TABLE h2a2a2h_tasks ADD COLUMN timeout_ms INTEGER",
    "ALTER TABLE h2a2a2h_tasks ADD COLUMN attempts INTEGER DEFAULT 0",
    "ALTER TABLE h2a2a2h_tasks ADD COLUMN version INTEGER DEFAULT 0",
    // V1.0 底座激活（影子接线）：协作关联字段（只增不改，回滚见 migrations/013_*_rollback.sql）
    "ALTER TABLE h2a2a2h_tasks ADD COLUMN dependencies TEXT DEFAULT '[]'",
    "ALTER TABLE h2a2a2h_tasks ADD COLUMN parent_id INTEGER",
    "ALTER TABLE h2a2a2h_tasks ADD COLUMN chat_id INTEGER",
    "ALTER TABLE h2a2a2h_tasks ADD COLUMN employee_id INTEGER",
  ];
  for (const stmt of h2a2a2hAlters) {
    try { sqlDb.run(stmt); } catch (e: any) { if (!e.message?.includes("duplicate column")) console.warn("[数据库] H2A2A2H 补列:", e.message); }
  }

  try { sqlDb.run("CREATE INDEX IF NOT EXISTS idx_h2a2a2h_tasks_state ON h2a2a2h_tasks(state)"); } catch {}
  try { sqlDb.run("CREATE INDEX IF NOT EXISTS idx_h2a2a2h_tasks_claimed ON h2a2a2h_tasks(claimed_by)"); } catch {}
  try { sqlDb.run("CREATE INDEX IF NOT EXISTS idx_h2a2a2h_tasks_tenant ON h2a2a2h_tasks(tenant_id)"); } catch {}
  try { sqlDb.run("CREATE INDEX IF NOT EXISTS idx_h2a2a2h_state_log_task ON h2a2a2h_state_log(task_id)"); } catch {}
  try { sqlDb.run("CREATE INDEX IF NOT EXISTS idx_h2a2a2h_tasks_chat ON h2a2a2h_tasks(chat_id)"); } catch {}
  try { sqlDb.run("CREATE INDEX IF NOT EXISTS idx_h2a2a2h_tasks_parent ON h2a2a2h_tasks(parent_id)"); } catch {}
  try { sqlDb.run("CREATE INDEX IF NOT EXISTS idx_h2a2a2h_tasks_employee ON h2a2a2h_tasks(employee_id)"); } catch {}

  // V1.0 呈现层：Turn→Step→Block 四级层级树形数据模型（Task→Phase→Contribution→Block）
  ensureTable(sqlDb, "h2a2a2h_nodes", `
    CREATE TABLE IF NOT EXISTS h2a2a2h_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,
      turn_key TEXT NOT NULL,
      parent_id INTEGER,
      node_type TEXT NOT NULL,
      block_kind TEXT,
      title TEXT NOT NULL,
      content TEXT,
      employee_id INTEGER,
      employee_name TEXT,
      employee_role TEXT,
      phase TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  try { sqlDb.run("CREATE INDEX IF NOT EXISTS idx_h2a2a2h_nodes_chat ON h2a2a2h_nodes(chat_id, turn_key, sort_order)"); } catch {}

  // V0.80 审计底座：关键审计表必须由启动兼容层幂等创建，不能只依赖未接线的 SQL 文件。
  ensureTable(sqlDb, "knowledge_snapshots", `
    CREATE TABLE IF NOT EXISTS knowledge_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      snapshot_type TEXT DEFAULT 'manual',
      state_json TEXT NOT NULL,
      checksum TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  ensureTable(sqlDb, "evidence_bundles", `
    CREATE TABLE IF NOT EXISTS evidence_bundles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      description TEXT,
      bundle_hash TEXT UNIQUE NOT NULL,
      previous_hash TEXT,
      content TEXT NOT NULL,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  ensureTable(sqlDb, "evidence_items", `
    CREATE TABLE IF NOT EXISTS evidence_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bundle_hash TEXT NOT NULL REFERENCES evidence_bundles(bundle_hash),
      item_type TEXT NOT NULL,
      actor TEXT,
      action TEXT NOT NULL,
      target TEXT,
      details_json TEXT DEFAULT '{}',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  ensureTable(sqlDb, "revocations", `
    CREATE TABLE IF NOT EXISTS revocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      reason TEXT,
      reverted_by INTEGER,
      tenant_id INTEGER NOT NULL,
      reverted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  try { sqlDb.run("CREATE INDEX IF NOT EXISTS idx_knowledge_snapshots_tenant ON knowledge_snapshots(tenant_id, created_at)"); } catch {}
  try { sqlDb.run("CREATE INDEX IF NOT EXISTS idx_evidence_bundles_tenant ON evidence_bundles(tenant_id, id)"); } catch {}
  try { sqlDb.run("CREATE INDEX IF NOT EXISTS idx_revocations_tenant ON revocations(tenant_id, reverted_at)"); } catch {}
  try { sqlDb.run("ALTER TABLE evidence_bundles ADD COLUMN content TEXT"); } catch (e: any) { if (!e.message?.includes("duplicate column")) console.warn("[数据库] 证据包补列:", e.message); }

  // V1.00 高可用底座：即使历史全量迁移被数据保护逻辑跳过，节点注册仍可直接使用。
  ensureTable(sqlDb, "cluster_nodes", `
    CREATE TABLE IF NOT EXISTS cluster_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instance_id TEXT UNIQUE NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'follower',
      status TEXT NOT NULL DEFAULT 'online',
      last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
      metrics_json TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  try { sqlDb.run("CREATE INDEX IF NOT EXISTS idx_cluster_nodes_status ON cluster_nodes(status, role, last_heartbeat)"); } catch {}

  ensureTable(sqlDb, "tenant_industry_packages", `
    CREATE TABLE IF NOT EXISTS tenant_industry_packages (
      tenant_id INTEGER PRIMARY KEY,
      package_id TEXT NOT NULL,
      features_json TEXT NOT NULL DEFAULT '[]',
      activated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

  ensureTable(sqlDb, "talent_pool", `
    CREATE TABLE IF NOT EXISTS talent_pool (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER DEFAULT 1,
      talent_type TEXT NOT NULL DEFAULT 'ai',
      name TEXT NOT NULL,
      avatar_emoji TEXT DEFAULT '👤',
      skills TEXT,
      category TEXT,
      description TEXT,
      source TEXT DEFAULT 'system',
      rating REAL DEFAULT 3.5,
      status TEXT DEFAULT 'available',
      experience_years INTEGER,
      expected_salary TEXT,
      availability TEXT,
      current_company TEXT,
      agent_type TEXT,
      capabilities TEXT,
      token_cost_per_k TEXT,
      provider TEXT,
      integration_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  try { sqlDb.run("CREATE INDEX IF NOT EXISTS idx_talent_pool_tenant ON talent_pool(tenant_id, talent_type)"); } catch {}
  try { sqlDb.run("CREATE INDEX IF NOT EXISTS idx_talent_pool_status ON talent_pool(status)"); } catch {}

  console.log("[数据库] 表结构兼容性检查完成");
}

/**
 * 检查并创建缺失的表
 */
function ensureTable(sqlDb: SqlJsDatabase, tableName: string, createSQL: string) {
  try {
    const result = sqlDb.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
    if (result.length === 0 || result[0].values.length === 0) {
      sqlDb.run(createSQL);
      console.log(`[数据库] 自动创建缺失表: ${tableName}`);
    }
  } catch (e) {
    console.error(`[数据库] 检查表 ${tableName} 失败:`, e);
  }
}

export function getDb(): SqlJsDatabase {
  if (!db) throw new Error("Database not initialized");
  return db;
}

/** 上次写回时间戳（节流：避免每次 db 操作都全量导出导致 wasm 内存压力 / disk I/O error）。 */
let lastSaveAt = 0;

export function saveDb(): void {
  if (!db) return;
  const now = Date.now();
  if (now - lastSaveAt < 2000) return; // 2 秒内最多写一次盘，其余依赖内存 + 30s 定时器兜底
  lastSaveAt = now;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    const tmp = `${dbPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, dbPath); // 原子替换，防止中断写半截损坏数据库文件
  } catch (e) {
    console.warn("[数据库] saveDb 写回失败:", (e as any)?.message);
  }
}

// Helper: query all rows
export function dbAll(sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  saveDb();
  return rows;
}

// Helper: query one row
export function dbGet(sql: string, params: any[] = []): any | undefined {
  const rows = dbAll(sql, params);
  return rows[0];
}

// Helper: run (insert/update/delete)
export function dbRun(sql: string, params: any[] = []): { changes: number; lastInsertRowid: number } {
  db.run(sql, params);
  const changes = db.getRowsModified();
  const lastRow = dbGet("SELECT last_insert_rowid() as id");
  saveDb();
  return { changes, lastInsertRowid: lastRow?.id || 0 };
}

// 运行数据库迁移
function runMigrations() {
  // 数据保护：如果 employees 表已有数据，说明 DB 已完整同步，跳过迁移
  try {
    const r = db.exec("SELECT COUNT(*) as c FROM employees");
    if (r.length > 0 && (r[0].values[0][0] as number) > 0) {
      console.log("[迁移] 数据库已有数据，跳过迁移保护现有数据");
      return;
    }
  } catch (_) { /* 表不存在，正常执行迁移 */ }

  try {
    // P0: 多租户SaaS基础
    db.run(`
      CREATE TABLE IF NOT EXISTS tenants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE,
        tenant_code VARCHAR(8) UNIQUE,
        logo_url TEXT,
        theme_color TEXT DEFAULT '#10B981',
        domain TEXT,
        status TEXT DEFAULT 'trial',
        plan TEXT DEFAULT 'free',
        trial_ends_at DATETIME,
        subscription_ends_at DATETIME,
        max_users INTEGER DEFAULT 5,
        max_ai_employees INTEGER DEFAULT 10,
        max_tokens_monthly INTEGER DEFAULT 1000000,
        settings_json TEXT,
        token_version INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS tenant_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT DEFAULT 'member',
        invited_by INTEGER,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, user_id)
      );
      
      CREATE TABLE IF NOT EXISTS tenant_invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        invited_by INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS tenant_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        usage_type TEXT NOT NULL,
        amount INTEGER DEFAULT 0,
        period_start DATE,
        period_end DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        price_monthly REAL DEFAULT 0,
        max_users INTEGER,
        max_ai_employees INTEGER,
        max_tokens_monthly INTEGER,
        features_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // 插入默认套餐
    const planCount = dbGet("SELECT COUNT(*) as c FROM plans") as any;
    if (planCount.c === 0) {
      db.run(`INSERT INTO plans (name, slug, price_monthly, max_users, max_ai_employees, max_tokens_monthly, features_json) VALUES 
        ('免费版', 'free', 0, 5, 10, 1000000, '{"basic_features": true}'),
        ('基础版', 'basic', 2999, 20, 50, 5000000, '{"basic_features": true, "priority_support": true}'),
        ('专业版', 'pro', 9999, 100, 200, 20000000, '{"basic_features": true, "priority_support": true, "advanced_analytics": true}'),
        ('企业版', 'enterprise', 29999, -1, -1, -1, '{"basic_features": true, "priority_support": true, "advanced_analytics": true, "custom_deployment": true}');
      `);
    }
    
    // 插入默认租户
    const tenantCount = dbGet("SELECT COUNT(*) as c FROM tenants") as any;
    if (tenantCount.c === 0) {
      db.run(`INSERT INTO tenants (name, slug, tenant_code, status, plan, max_users, max_ai_employees, max_tokens_monthly) 
              VALUES ('雄元科技', 'xiongyuan', 'XY', 'active', 'enterprise', -1, -1, -1);`);
      
      // 将现有用户添加到默认租户
      const defaultTenant = dbGet("SELECT id FROM tenants WHERE tenant_code = 'XY'") as any;
      if (defaultTenant) {
        const users = dbAll("SELECT id FROM users") as any[];
        for (const user of users) {
          db.run("INSERT OR IGNORE INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, 'owner')", 
            [defaultTenant.id, user.id]);
        }
      }
    }
    
    saveDb();
    console.log("[迁移] 多租户SaaS基础表已就绪");
    
    // P0.5: PID/PCC双码编码
    db.run(`
      CREATE TABLE IF NOT EXISTS pid_sequences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_code VARCHAR(8) NOT NULL,
        seq_type TEXT DEFAULT 'employee',
        allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS employee_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        pid VARCHAR(16) NOT NULL,
        pcc VARCHAR(32) NOT NULL,
        dept_id INTEGER,
        dept_code VARCHAR(16),
        is_primary INTEGER DEFAULT 1,
        position_type TEXT DEFAULT 'permanent',
        start_date DATETIME NOT NULL,
        end_date DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS position_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        pid VARCHAR(16) NOT NULL,
        old_pcc VARCHAR(32),
        new_pcc VARCHAR(32) NOT NULL,
        change_type TEXT NOT NULL,
        old_dept_id INTEGER,
        new_dept_id INTEGER,
        effective_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // 给employees表添加pid字段（如果不存在）
    try {
      db.run("ALTER TABLE employees ADD COLUMN pid VARCHAR(16) UNIQUE");
    } catch (e) {
      // 字段可能已存在，忽略错误
    }
    
    // 为现有员工分配PID（如果没有）
    const employeesWithoutPid = dbAll("SELECT e.*, t.tenant_code FROM employees e LEFT JOIN tenants t ON e.tenant_id = t.id WHERE e.pid IS NULL") as any[];
    for (const emp of employeesWithoutPid) {
      const tenantCode = emp.tenant_code || 'XY';
      // 插入序列号
      const seqResult = dbRun("INSERT INTO pid_sequences (tenant_code) VALUES (?)", [tenantCode]);
      const pid = `${tenantCode}-${String(seqResult.lastInsertRowid).padStart(4, '0')}`;
      
      // 更新员工PID
      dbRun("UPDATE employees SET pid = ? WHERE id = ?", [pid, emp.id]);
      
      // 获取部门信息
      const dept = dbGet("SELECT name FROM departments WHERE id = ?", [emp.department_id]) as any;
      const deptCode = dept ? getDeptCode(dept.name) : 'NIL';
      
      // 生成PCC
      const pccCount = dbGet("SELECT COUNT(*) as c FROM employee_positions WHERE pcc LIKE ?", [`${tenantCode}-${deptCode}-P%`]) as any;
      const pcc = `${tenantCode}-${deptCode}-P${String((pccCount?.c || 0) + 1).padStart(4, '0')}`;
      
      // 插入岗位记录
      dbRun(
        `INSERT INTO employee_positions (employee_id, pid, pcc, dept_id, dept_code, is_primary, position_type, start_date)
         VALUES (?, ?, ?, ?, ?, 1, 'permanent', datetime('now'))`,
        [emp.id, pid, pcc, emp.department_id, deptCode]
      );
    }
    
    if (employeesWithoutPid.length > 0) {
      console.log(`[迁移] 为 ${employeesWithoutPid.length} 名员工分配了PID/PCC`);
    }
    
    saveDb();
    console.log("[迁移] PID/PCC双码编码表已就绪");
    
    // P1: AI员工记忆系统
    db.run(`
      CREATE TABLE IF NOT EXISTS agent_short_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id INTEGER NOT NULL,
        memory_type TEXT NOT NULL DEFAULT 'conversation',
        content TEXT NOT NULL,
        reasoning_content TEXT,
        importance_score REAL DEFAULT 0,
        context_json TEXT,
        tenant_id INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS agent_long_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id INTEGER NOT NULL,
        memory_type TEXT NOT NULL,
        content TEXT NOT NULL,
        importance_score REAL DEFAULT 50,
        access_count INTEGER DEFAULT 0,
        last_accessed DATETIME,
        source_ids TEXT,
        tenant_id INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS dream_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger_type TEXT NOT NULL,
        memories_scanned INTEGER DEFAULT 0,
        memories_promoted INTEGER DEFAULT 0,
        memories_archived INTEGER DEFAULT 0,
        memories_deleted INTEGER DEFAULT 0,
        report TEXT,
        tenant_id INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    saveDb();
    console.log("[迁移] AI员工记忆系统表已就绪");
    
    // P1.5: 聊天知识自动沉淀
    db.run(`
      CREATE TABLE IF NOT EXISTS knowledge_sediment_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER,
        message_type TEXT,
        content_preview TEXT,
        extracted_count INTEGER DEFAULT 0,
        tenant_id INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    saveDb();
    console.log("[迁移] 知识沉淀日志表已就绪");
    
    // P2: Heartbeat心跳执行
    db.run(`
      CREATE TABLE IF NOT EXISTS heartbeat_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id INTEGER NOT NULL,
        cron_expression TEXT NOT NULL DEFAULT '*/30 * * * *',
        task_type TEXT NOT NULL DEFAULT 'check_tasks',
        enabled INTEGER DEFAULT 1,
        last_run DATETIME,
        next_run DATETIME,
        tenant_id INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS heartbeat_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id INTEGER NOT NULL,
        schedule_id INTEGER,
        action TEXT NOT NULL,
        result TEXT,
        duration_ms INTEGER,
        tenant_id INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // tasks表增加锁定字段
    try { db.run("ALTER TABLE tasks ADD COLUMN locked_by INTEGER"); } catch (e) {}
    try { db.run("ALTER TABLE tasks ADD COLUMN locked_at DATETIME"); } catch (e) {}
    try { db.run("ALTER TABLE tasks ADD COLUMN checkout_timeout INTEGER DEFAULT 3600"); } catch (e) {}
    
    saveDb();
    console.log("[迁移] Heartbeat心跳表已就绪");
    
    // P2.5: 多智能体任务编排
    db.run(`
      CREATE TABLE IF NOT EXISTS orchestration_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        goal TEXT,
        status TEXT DEFAULT 'pending',
        idempotency_key TEXT,
        plan_snapshot TEXT,
        execution_snapshot TEXT,
        version INTEGER DEFAULT 1,
        created_by INTEGER,
        tenant_id INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS sub_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orchestration_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        required_skills TEXT,
        assigned_to INTEGER,
        status TEXT DEFAULT 'pending',
        depends_on TEXT,
        result TEXT,
        sort_order INTEGER DEFAULT 0,
        node_id TEXT,
        dependency_ids TEXT DEFAULT '[]',
        requires_human_review INTEGER DEFAULT 0,
        tenant_id INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    try { db.run("ALTER TABLE orchestration_tasks ADD COLUMN idempotency_key TEXT"); } catch (e) {}
    try { db.run("ALTER TABLE orchestration_tasks ADD COLUMN plan_snapshot TEXT"); } catch (e) {}
    try { db.run("ALTER TABLE orchestration_tasks ADD COLUMN execution_snapshot TEXT"); } catch (e) {}
    try { db.run("ALTER TABLE orchestration_tasks ADD COLUMN version INTEGER DEFAULT 1"); } catch (e) {}
    try { db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_orchestration_idempotency ON orchestration_tasks(tenant_id, created_by, idempotency_key) WHERE idempotency_key IS NOT NULL"); } catch (e) {}
    try { db.run("ALTER TABLE sub_tasks ADD COLUMN node_id TEXT"); } catch (e) {}
    try { db.run("ALTER TABLE sub_tasks ADD COLUMN dependency_ids TEXT DEFAULT '[]'"); } catch (e) {}
    try { db.run("ALTER TABLE sub_tasks ADD COLUMN requires_human_review INTEGER DEFAULT 0"); } catch (e) {}
    
    saveDb();
    console.log("[迁移] 任务编排表已就绪");
    
    // P3: Goal目标对齐
    db.run(`
      CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        parent_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        goal_type TEXT NOT NULL DEFAULT 'company',
        owner_id INTEGER,
        owner_type TEXT DEFAULT 'human',
        department_id INTEGER,
        cycle TEXT DEFAULT 'Q2-2026',
        status TEXT DEFAULT 'active',
        progress REAL DEFAULT 0,
        start_date DATE,
        end_date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // tasks表增加goal_id字段
    try { db.run("ALTER TABLE tasks ADD COLUMN goal_id INTEGER"); } catch (e) {}
    
    saveDb();
    console.log("[迁移] Goal目标表已就绪");
    
    // P4: Budget预算成本
    db.run(`
      CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        name TEXT NOT NULL,
        budget_type TEXT NOT NULL DEFAULT 'token',
        limit_amount REAL NOT NULL DEFAULT 0,
        used_amount REAL DEFAULT 0,
        cycle TEXT DEFAULT 'monthly',
        start_date DATE,
        end_date DATE,
        alert_threshold REAL DEFAULT 80,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS token_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        user_id INTEGER,
        employee_id INTEGER,
        model TEXT,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        request_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    saveDb();
    console.log("[迁移] Budget预算表已就绪");
    
    // P5: Routines例行任务
    db.run(`
      CREATE TABLE IF NOT EXISTS routines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        name TEXT NOT NULL,
        description TEXT,
        routine_type TEXT NOT NULL DEFAULT 'task',
        cron_expression TEXT,
        interval_minutes INTEGER,
        assigned_to INTEGER,
        assigned_type TEXT DEFAULT 'ai',
        payload TEXT,
        status TEXT DEFAULT 'active',
        last_run_at DATETIME,
        next_run_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS routine_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        routine_id INTEGER NOT NULL,
        tenant_id INTEGER DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'success',
        result TEXT,
        error TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      );
    `);
    
    saveDb();
    console.log("[迁移] Routines例行任务表已就绪");
    
    // P5.5: 人机混合绩效评估
    db.run(`
      CREATE TABLE IF NOT EXISTS performance_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        employee_id INTEGER NOT NULL,
        employee_type TEXT NOT NULL DEFAULT 'ai',
        review_period TEXT NOT NULL,
        overall_score REAL DEFAULT 0,
        task_completion_score REAL DEFAULT 0,
        quality_score REAL DEFAULT 0,
        efficiency_score REAL DEFAULT 0,
        collaboration_score REAL DEFAULT 0,
        innovation_score REAL DEFAULT 0,
        review_notes TEXT,
        reviewed_by INTEGER,
        status TEXT DEFAULT 'draft',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        employee_id INTEGER NOT NULL,
        employee_type TEXT NOT NULL DEFAULT 'ai',
        metric_type TEXT NOT NULL,
        metric_value REAL DEFAULT 0,
        metric_unit TEXT,
        period TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    saveDb();
    console.log("[迁移] 绩效评估表已就绪");
    
    // P6: 反思引擎+技能积累
    db.run(`
      CREATE TABLE IF NOT EXISTS reflections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        employee_id INTEGER NOT NULL,
        task_id INTEGER,
        reflection_type TEXT NOT NULL DEFAULT 'task_completion',
        success_factors TEXT,
        failure_reasons TEXT,
        knowledge_gaps TEXT,
        improvement_plans TEXT,
        extracted_skills TEXT,
        learned_knowledge TEXT,
        importance_score REAL DEFAULT 50,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS employee_skill_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        employee_id INTEGER NOT NULL,
        skill_name TEXT NOT NULL,
        skill_category TEXT,
        proficiency_level INTEGER DEFAULT 1,
        usage_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 100,
        last_used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    saveDb();
    console.log("[迁移] 反思+技能表已就绪");
    
    // P7: 配置版本管理
    db.run(`
      CREATE TABLE IF NOT EXISTS config_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        config_type TEXT NOT NULL,
        config_key TEXT NOT NULL,
        config_value TEXT,
        version INTEGER DEFAULT 1,
        change_reason TEXT,
        created_by INTEGER,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    saveDb();
    console.log("[迁移] 配置版本表已就绪");
    
    // P8: 部门表增强字段
    const deptAlterations = [
      "ALTER TABLE departments ADD COLUMN department_code TEXT",
      "ALTER TABLE departments ADD COLUMN cost_center TEXT",
      "ALTER TABLE departments ADD COLUMN budget_allocation REAL DEFAULT 0",
      "ALTER TABLE departments ADD COLUMN headcount INTEGER DEFAULT 0",
      "ALTER TABLE departments ADD COLUMN function_type TEXT DEFAULT 'functional'",
      "ALTER TABLE departments ADD COLUMN level INTEGER DEFAULT 1",
      "ALTER TABLE departments ADD COLUMN description TEXT"
    ];

    for (const sql of deptAlterations) {
      try {
        db.run(sql);
      } catch (e: any) {
        // 字段已存在则忽略
        if (!e.message?.includes("duplicate column")) throw e;
      }
    }
    
    saveDb();
    console.log("[迁移] 部门表增强字段已就绪");
    
    // P8: 汇报关系表
    db.run(`CREATE TABLE IF NOT EXISTS reporting_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      manager_id INTEGER NOT NULL,
      line_type TEXT NOT NULL DEFAULT 'solid',
      effective_date TEXT,
      expiry_date TEXT,
      tenant_id INTEGER NOT NULL,
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (manager_id) REFERENCES employees(id)
    )`);
    
    saveDb();
    console.log("[迁移] 汇报关系表已就绪");
    
    // P8: 职级体系表
    db.run(`CREATE TABLE IF NOT EXISTS position_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      sequence TEXT NOT NULL,
      level INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL
    )`);
    
    // 员工职级字段
    try {
      db.run("ALTER TABLE employees ADD COLUMN position_level_id INTEGER");
    } catch (e: any) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
    try {
      db.run("ALTER TABLE employees ADD COLUMN position_sequence TEXT");
    } catch (e: any) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
    
    saveDb();
    console.log("[迁移] 职级体系表已就绪");
    
    // P9: 技能库（完整版，兼容原雄元OS技能市场）
    db.run(`CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER DEFAULT 1,
      company_id INTEGER,
      name TEXT NOT NULL,
      slug TEXT,
      category TEXT NOT NULL DEFAULT '其他',
      description TEXT,
      tags TEXT,
      content TEXT,
      icon TEXT DEFAULT '📦',
      source TEXT DEFAULT 'local',
      version TEXT DEFAULT '1.0.0',
      author TEXT,
      file_size INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      install_count INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      last_used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 兼容旧表：如果skills_library存在且skills为空，迁移数据
    try {
      const oldCount = dbGet("SELECT COUNT(*) as c FROM skills_library") as any;
      if (oldCount && oldCount.c > 0) {
        const newCount = dbGet("SELECT COUNT(*) as c FROM skills") as any;
        if (newCount && newCount.c === 0) {
          db.run(`INSERT INTO skills (tenant_id, name, category, tags, icon, enabled, install_count, rating, source, version, author)
            SELECT tenant_id, name, category, tags, '📦', enabled, usage_count, 0, 'local', '1.0.0', '系统' FROM skills_library`);
          console.log("[迁移] 已从skills_library迁移数据到skills表");
        }
      }
    } catch (e) {}

    db.run(`CREATE TABLE IF NOT EXISTS employee_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER DEFAULT 1,
      employee_id INTEGER NOT NULL,
      skill_id INTEGER NOT NULL,
      proficiency_level INTEGER DEFAULT 1,
      source TEXT DEFAULT 'manual',
      learned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(employee_id, skill_id)
    )`);

    try { db.run('CREATE INDEX IF NOT EXISTS idx_employee_skills_employee ON employee_skills(employee_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_employee_skills_skill ON employee_skills(skill_id)'); } catch(e) {}
    
    // 员工表增加description字段
    try {
      db.run("ALTER TABLE employees ADD COLUMN description TEXT");
    } catch (e: any) {
      if (!e.message?.includes("duplicate column")) throw e;
    }

    // 用户表增加last_login字段
    try {
      db.run("ALTER TABLE users ADD COLUMN last_login DATETIME");
    } catch (e: any) {
      if (!e.message?.includes("duplicate column")) throw e;
    }

    saveDb();
    console.log("[迁移] 技能库表已就绪");

    // P10: 组织架构版本管理
    db.run(`CREATE TABLE IF NOT EXISTS org_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_number TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'draft',
      created_by INTEGER,
      approved_by INTEGER,
      effective_date TEXT,
      tenant_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS org_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_id INTEGER NOT NULL,
      change_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      old_value TEXT,
      new_value TEXT,
      tenant_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (version_id) REFERENCES org_versions(id)
    )`);

    saveDb();
    console.log("[迁移] 组织架构版本管理表已就绪");

    // P10: 全局审计追溯体系
    db.run(`CREATE TABLE IF NOT EXISTS chat_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      chat_id INTEGER NOT NULL,
      message_id INTEGER NOT NULL,
      sender_type TEXT NOT NULL,
      sender_id INTEGER NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      message_type TEXT DEFAULT 'text',
      metadata TEXT,
      created_at DATETIME NOT NULL,
      archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    try { db.run('CREATE INDEX IF NOT EXISTS idx_chat_archive_tenant ON chat_archive(tenant_id, created_at)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_chat_archive_chat ON chat_archive(chat_id)'); } catch(e) {}

    db.run(`CREATE TABLE IF NOT EXISTS org_behavior_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id INTEGER NOT NULL,
      actor_name TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_detail TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      target_name TEXT,
      before_state TEXT,
      after_state TEXT,
      context TEXT,
      governance_rule TEXT,
      governance_result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    try { db.run('CREATE INDEX IF NOT EXISTS idx_org_audit_tenant ON org_behavior_audit(tenant_id, created_at)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_org_audit_actor ON org_behavior_audit(actor_type, actor_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_org_audit_action ON org_behavior_audit(action_type, action_detail)'); } catch(e) {}

    db.run(`CREATE TABLE IF NOT EXISTS agent_behavior_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      agent_id INTEGER NOT NULL,
      agent_name TEXT NOT NULL,
      behavior_type TEXT NOT NULL,
      behavior_detail TEXT NOT NULL,
      input_context TEXT,
      output_result TEXT,
      token_used INTEGER,
      duration_ms INTEGER,
      success INTEGER DEFAULT 1,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    try { db.run('CREATE INDEX IF NOT EXISTS idx_agent_behavior_tenant ON agent_behavior_log(tenant_id, created_at)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_agent_behavior_agent ON agent_behavior_log(agent_id, created_at)'); } catch(e) {}

    saveDb();
    console.log("[迁移] 全局审计追溯表已就绪");

    // P11: 组织效能仪表板
    db.run(`CREATE TABLE IF NOT EXISTS org_efficiency_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      metric_date DATE NOT NULL,
      task_completion_rate REAL DEFAULT 0,
      collaboration_efficiency REAL DEFAULT 0,
      knowledge_sediment_rate REAL DEFAULT 0,
      cost_saving_rate REAL DEFAULT 0,
      governance_coverage_rate REAL DEFAULT 0,
      total_tasks INTEGER DEFAULT 0,
      completed_tasks INTEGER DEFAULT 0,
      total_agents INTEGER DEFAULT 0,
      active_agents INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    try { db.run('CREATE INDEX IF NOT EXISTS idx_efficiency_tenant ON org_efficiency_metrics(tenant_id, metric_date)'); } catch(e) {}

    saveDb();
    console.log("[迁移] 组织效能指标表已就绪");

    // P12: H2A2A2H治理引擎增强
    db.run(`CREATE TABLE IF NOT EXISTS h2a2a_permission_matrix (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      role_level INTEGER NOT NULL,
      permission_type TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'any',
      target_type TEXT DEFAULT 'both',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_id, role_level, permission_type)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS h2a2a_comm_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      sender_level INTEGER NOT NULL,
      receiver_level INTEGER NOT NULL,
      comm_type TEXT NOT NULL DEFAULT 'direct',
      is_allowed INTEGER DEFAULT 1,
      require_approval INTEGER DEFAULT 0,
      approval_level INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_id, sender_level, receiver_level, comm_type)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS h2a2a_process_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      template_type TEXT NOT NULL,
      steps_json TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS h2a2a_governance_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      action_id TEXT,
      actor_type TEXT NOT NULL,
      actor_id INTEGER NOT NULL,
      actor_level INTEGER,
      target_type TEXT,
      target_id INTEGER,
      permission_check TEXT,
      comm_rule_check TEXT,
      process_check TEXT,
      result TEXT NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    try { db.run('CREATE INDEX IF NOT EXISTS idx_perm_tenant ON h2a2a_permission_matrix(tenant_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_comm_tenant ON h2a2a_comm_rules(tenant_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_gov_log_tenant ON h2a2a_governance_log(tenant_id, created_at)'); } catch(e) {}

    saveDb();
    console.log("[迁移] H2A2A2H治理引擎表已就绪");

    // P13: 企业流程再造
    db.run(`CREATE TABLE IF NOT EXISTS workflow_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      version INTEGER DEFAULT 1,
      status TEXT DEFAULT 'draft',
      definition TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS workflow_instances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      workflow_id INTEGER NOT NULL,
      title TEXT,
      status TEXT DEFAULT 'pending',
      variables TEXT,
      current_step INTEGER DEFAULT 0,
      started_by INTEGER NOT NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS workflow_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instance_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,
      step_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'approval',
      status TEXT DEFAULT 'pending',
      assignee_id INTEGER,
      assignee_type TEXT DEFAULT 'user',
      approver_ids TEXT,
      due_date DATETIME,
      completed_at DATETIME,
      result TEXT,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (instance_id) REFERENCES workflow_instances(id)
    )`);

    try { db.run('CREATE INDEX IF NOT EXISTS idx_wf_def_tenant ON workflow_definitions(tenant_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_wf_inst_tenant ON workflow_instances(tenant_id, status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_wf_task_tenant ON workflow_tasks(tenant_id, status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_wf_task_assignee ON workflow_tasks(assignee_id, status)'); } catch(e) {}

    saveDb();
    console.log("[迁移] 企业流程再造表已就绪");

    // ===== P14 员工管理（人才管理）模块 =====
    // 为 employees 表增加雇佣分类和权限字段
    try { db.run("ALTER TABLE employees ADD COLUMN employment_category TEXT DEFAULT 'internal'"); } catch(e) {}
    try { db.run("ALTER TABLE employees ADD COLUMN permissions_json TEXT"); } catch(e) {}
    try { db.run("ALTER TABLE employees ADD COLUMN user_id INTEGER REFERENCES users(id)"); } catch(e) {}
    // 员工自定义形象照上传
    try { db.run("ALTER TABLE employees ADD COLUMN avatar_url TEXT"); } catch(e: any) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
    // 修复：确保已有员工的雇佣分类不为NULL（避免前端按分类筛选时空列表）
    try { db.run("UPDATE employees SET employment_category = 'internal' WHERE employment_category IS NULL"); } catch(e) {}

    // 人才市场表
    db.run(`
      CREATE TABLE IF NOT EXISTS talent_pool (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        talent_type TEXT NOT NULL DEFAULT 'ai',
        name TEXT NOT NULL,
        avatar_emoji TEXT DEFAULT '👤',
        skills TEXT,
        category TEXT,
        description TEXT,
        source TEXT DEFAULT 'system',
        rating REAL DEFAULT 3.5,
        status TEXT DEFAULT 'available',
        -- 人类人才字段
        experience_years INTEGER,
        expected_salary TEXT,
        availability TEXT,
        current_company TEXT,
        -- AI智能体字段
        agent_type TEXT,
        capabilities TEXT,
        token_cost_per_k TEXT,
        provider TEXT,
        integration_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try { db.run('CREATE INDEX IF NOT EXISTS idx_talent_pool_tenant ON talent_pool(tenant_id, talent_type)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_talent_pool_status ON talent_pool(status)'); } catch(e) {}

    saveDb();
    console.log("[迁移] 员工管理（人才管理）表已就绪");

    // 插件中心表
    db.run(`
      CREATE TABLE IF NOT EXISTS plugins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        name TEXT NOT NULL,
        slug TEXT,
        category TEXT DEFAULT '工具',
        description TEXT,
        icon TEXT DEFAULT '🧩',
        version TEXT DEFAULT '1.0.0',
        author TEXT,
        homepage TEXT,
        price TEXT DEFAULT '免费',
        install_count INTEGER DEFAULT 0,
        rating REAL DEFAULT 0,
        tags TEXT,
        status TEXT DEFAULT 'active',
        config_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try { db.run('CREATE INDEX IF NOT EXISTS idx_plugins_tenant ON plugins(tenant_id, category)'); } catch(e) {}

    // 租户插件安装记录表
    db.run(`
      CREATE TABLE IF NOT EXISTS tenant_plugin_installs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        plugin_id INTEGER NOT NULL REFERENCES plugins(id),
        installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, plugin_id)
      )
    `);
    try { db.run('CREATE INDEX IF NOT EXISTS idx_tpi_tenant ON tenant_plugin_installs(tenant_id)'); } catch(e) {}

    saveDb();
    console.log("[迁移] 插件中心表已就绪");

    // 知识库文件表
    db.run(`
      CREATE TABLE IF NOT EXISTS knowledge_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER DEFAULT 0,
        file_type TEXT NOT NULL,
        folder TEXT DEFAULT '/',
        status TEXT DEFAULT 'pending',
        content_extracted TEXT,
        extracted_summary TEXT,
        keywords TEXT,
        page_count INTEGER,
        parsed_at DATETIME,
        uploaded_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try { db.run('CREATE INDEX IF NOT EXISTS idx_kf_tenant ON knowledge_files(tenant_id, status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_kf_folder ON knowledge_files(tenant_id, folder)'); } catch(e) {}

    // 知识库文件夹表
    db.run(`
      CREATE TABLE IF NOT EXISTS knowledge_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        parent_folder TEXT DEFAULT '/',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, parent_folder, name)
      )
    `);

    saveDb();
    console.log("[迁移] 知识库文件表已就绪");
  } catch (err) {
    console.error("[迁移] 错误:", err);
  }

  // === 访客/试用追踪表 ===
  try {
    dbRun(`CREATE TABLE IF NOT EXISTS visitor_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      tenant_id INTEGER,
      user_id INTEGER,
      ip_address TEXT,
      user_agent TEXT,
      page_path TEXT,
      referrer TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    dbRun(`CREATE INDEX IF NOT EXISTS idx_visitor_type ON visitor_logs(event_type)`);
    dbRun(`CREATE INDEX IF NOT EXISTS idx_visitor_tenant ON visitor_logs(tenant_id)`);
    dbRun(`CREATE INDEX IF NOT EXISTS idx_visitor_created ON visitor_logs(created_at)`);
    saveDb();
    console.log("[迁移] 访客追踪表已就绪");
  } catch (err) {
    console.error("[迁移] 访客追踪表 错误:", err);
  }

  // ===== P15 合同管理模块 =====
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS contracts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        title TEXT,
        contract_no TEXT,
        party_a TEXT,
        party_b TEXT,
        direction TEXT DEFAULT 'payable',
        our_side TEXT DEFAULT 'party_a',
        contract_type TEXT DEFAULT 'other',
        amount REAL DEFAULT 0,
        collected_paid REAL DEFAULT 0,
        currency TEXT DEFAULT 'CNY',
        start_date DATE,
        end_date DATE,
        status TEXT DEFAULT 'draft',
        sign_date DATE,
        key_terms TEXT,
        alert_days INTEGER DEFAULT 7,
        workflow_instance_id INTEGER,
        created_by INTEGER,
        department_id INTEGER,
        budget_id INTEGER,
        file_path TEXT,
        file_type TEXT,
        parsed_text TEXT,
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS contract_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        contract_id INTEGER REFERENCES contracts(id),
        payment_no INTEGER DEFAULT 1,
        label TEXT,
        amount REAL DEFAULT 0,
        paid INTEGER DEFAULT 0,
        paid_date DATE,
        due_date DATE,
        completion_condition TEXT,
        condition_met INTEGER DEFAULT 0,
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS contract_alert_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL UNIQUE,
        default_alert_days INTEGER DEFAULT 7,
        enable_feishu INTEGER DEFAULT 0,
        feishu_webhook TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS contract_clauses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_id INTEGER REFERENCES contracts(id) ON DELETE CASCADE,
        tenant_id INTEGER NOT NULL,
        clause_type TEXT DEFAULT 'other',
        clause_title TEXT,
        clause_content TEXT,
        sort_order INTEGER DEFAULT 0,
        is_critical INTEGER DEFAULT 0,
        ai_confidence REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS contract_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_id INTEGER REFERENCES contracts(id) ON DELETE CASCADE,
        tenant_id INTEGER NOT NULL,
        stage_name TEXT NOT NULL,
        planned_date DATE,
        actual_date DATE,
        acceptance_criteria TEXT,
        attachments TEXT DEFAULT '[]',
        submitter_id INTEGER,
        submitted_at DATETIME,
        reviewer_id INTEGER,
        reviewed_at DATETIME,
        review_status TEXT DEFAULT 'pending',
        review_comment TEXT,
        completion_ratio REAL DEFAULT 0,
        linked_payment_ids TEXT DEFAULT '[]',
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Phase 3: 审批权限引擎
    db.run(`
      CREATE TABLE IF NOT EXISTS contract_approval_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        rule_name TEXT NOT NULL,
        min_amount REAL,
        max_amount REAL,
        contract_type TEXT,
        direction TEXT,
        approval_chain_json TEXT NOT NULL DEFAULT '[]',
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS contract_approval_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        contract_id INTEGER REFERENCES contracts(id) ON DELETE CASCADE,
        step_order INTEGER NOT NULL,
        approver_id INTEGER,
        approver_position_level_id INTEGER,
        status TEXT DEFAULT 'pending',
        comment TEXT,
        approved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Phase 4: 多级预警配置（ALTER TABLE 增量）
    try { db.run('ALTER TABLE contract_alert_config ADD COLUMN level1_days INTEGER DEFAULT 30'); } catch(e) {}
    try { db.run('ALTER TABLE contract_alert_config ADD COLUMN level2_days INTEGER DEFAULT 15'); } catch(e) {}
    try { db.run('ALTER TABLE contract_alert_config ADD COLUMN level3_days INTEGER DEFAULT 7'); } catch(e) {}
    try { db.run('ALTER TABLE contract_alert_config ADD COLUMN level4_days INTEGER DEFAULT 3'); } catch(e) {}
    try { db.run('ALTER TABLE contract_alert_config ADD COLUMN enable_multi_level INTEGER DEFAULT 1'); } catch(e) {}

    // Phase 4: 预警升级历史表
    db.run(`
      CREATE TABLE IF NOT EXISTS contract_alert_escalations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        payment_id INTEGER NOT NULL,
        contract_id INTEGER NOT NULL,
        alert_level INTEGER NOT NULL,
        level_label TEXT NOT NULL,
        message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 索引
    try { db.run('CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts(tenant_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(tenant_id, status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_contracts_direction ON contracts(tenant_id, direction)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON contracts(tenant_id, end_date)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_cpayments_due ON contract_payments(tenant_id, due_date)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_cpayments_contract ON contract_payments(contract_id, paid)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_cclauses_contract ON contract_clauses(contract_id, sort_order)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_cprogress_contract ON contract_progress(contract_id, review_status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_capproval_rules ON contract_approval_rules(tenant_id, is_active)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_capproval_records ON contract_approval_records(contract_id, step_order)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_cescalations_payment ON contract_alert_escalations(payment_id)'); } catch(e) {}

    saveDb();
    console.log("[迁移] 合同管理模块表已就绪");

    // AI合同智能解析插件 - 为已有租户自动安装
    const tenants = dbAll("SELECT DISTINCT tenant_id FROM users") as any[];
    for (const t of tenants) {
      const exists = dbGet("SELECT id FROM plugins WHERE tenant_id = ? AND slug = ?", [t.tenant_id, "ai合同智能解析"]);
      if (!exists) {
        dbRun(
          `INSERT INTO plugins (tenant_id, name, slug, category, description, icon, version, author, price, tags, install_count, rating, status)
           VALUES (?, 'AI合同智能解析', 'ai合同智能解析', '法务合规', '上传PDF/DOCX合同文档，AI自动提取合同信息与收/付款节点，一键入库', '🤖', '1.0.0', '雄元科技', '¥99/月', 'AI,合同,解析,文档', 0, 5.0, 'active')`,
          [t.tenant_id]
        );
      }
    }
    saveDb();
  } catch (err) {
    console.error("[迁移] 合同管理模块 错误:", err);
  }

  // ===== 支付中心配置表 =====
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS payment_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        provider TEXT NOT NULL DEFAULT 'wechat',
        name TEXT NOT NULL,
        enabled INTEGER DEFAULT 0,
        config_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, provider)
      )
    `);
    try { db.run('CREATE INDEX IF NOT EXISTS idx_paycfg_tenant ON payment_configs(tenant_id)'); } catch(e) {}
    saveDb();
    console.log("[迁移] 支付中心配置表已就绪");
  } catch (err) {
    console.error("[迁移] 支付中心配置表 错误:", err);
  }

  // ===== V4: 合同预警增强字段 =====
  try {
    try { db.run("ALTER TABLE contract_payments ADD COLUMN last_alerted_at DATETIME"); } catch (e: any) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
    try { db.run("ALTER TABLE contract_payments ADD COLUMN alert_count INTEGER DEFAULT 0"); } catch (e: any) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
    try { db.run("ALTER TABLE contract_payments ADD COLUMN alert_dismissed_until DATETIME"); } catch (e: any) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
    saveDb();
    console.log("[迁移] V4 合同预警增强字段已就绪");
  } catch (err) {
    console.error("[迁移] V4 合同预警增强字段 错误:", err);
  }

  // ===== V4: 知识库文件关联合同来源 =====
  try {
    try { db.run("ALTER TABLE knowledge_files ADD COLUMN source_contract_id INTEGER"); } catch (e: any) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
    try { db.run("ALTER TABLE knowledge_files ADD COLUMN source_contract_no TEXT"); } catch (e: any) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
    saveDb();
    console.log("[迁移] V4 知识库合同来源字段已就绪");
  } catch (err) {
    console.error("[迁移] V4 知识库合同来源字段 错误:", err);
  }

  // ═══════════════════════════════════════════════════════════
  // V4.1 人在回路机制（Human-in-the-Loop）
  // ═══════════════════════════════════════════════════════════
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS pending_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        review_type TEXT NOT NULL,
        initiator_user_id INTEGER NOT NULL,
        ai_content TEXT NOT NULL,
        structured_data TEXT,
        status TEXT DEFAULT 'pending',
        human_response TEXT,
        reviewer_user_id INTEGER,
        reviewed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try { db.run('CREATE INDEX IF NOT EXISTS idx_pending_reviews_status ON pending_reviews(tenant_id, status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_pending_reviews_reviewer ON pending_reviews(reviewer_user_id, status)'); } catch(e) {}

    // h2a2a_governance_log 增加 orchestration_id 字段
    try { db.run("ALTER TABLE h2a2a_governance_log ADD COLUMN orchestration_id INTEGER DEFAULT NULL"); } catch (e: any) {
      if (!e.message?.includes("duplicate column")) throw e;
    }

    saveDb();
    console.log("[迁移] V4.1 人在回路表已就绪");
  } catch (err) {
    console.error("[迁移] V4.1 人在回路 错误:", err);
  }

  // ===== P16: 部署铁律反思种子（系统级 employee_id=0） =====
  try {
    // 插入 const 死区崩溃反思记录（error_learning）
    const tdZExists = dbGet(
      "SELECT id FROM reflections WHERE tenant_id = 1 AND employee_id = 0 AND reflection_type = 'error_learning' AND failure_reasons LIKE '%const 死区%'"
    );
    if (!tdZExists) {
      db.run(
        `INSERT INTO reflections (tenant_id, employee_id, task_id, reflection_type, success_factors, failure_reasons, knowledge_gaps, improvement_plans, extracted_skills, learned_knowledge, importance_score, created_at)
         VALUES (1, 0, NULL, 'error_learning', NULL, ?, ?, ?, ?, ?, 95, datetime('now'))`,
        [
          "const 临时死区（TDZ）导致员工详情页白屏崩溃。isOwnProfile 在 useState 声明前访问了 employee 变量（line 48 引用，line 51 声明），触发 ReferenceError。根因：replace_in_file 只改了局部代码，未 re-read 确认变量声明顺序。",
          "批量编辑时仅依赖单文件上下文，缺乏跨行预检步骤。AI 对大文件编辑缺乏变量声明顺序的静态扫描。",
          "【铁律1】部署前必须 npx tsc --noEmit；【铁律2】每次 replace_in_file 后必须 re-read 改动位置前后 10 行，确认 const/let/var 声明顺序；【铁律3】改 5+ 文件时按模块分批 build，不一次性全改。",
          "TypeScript 静态检查; const TDZ 预防; replace_in_file 安全编辑",
          "JavaScript const 声明在块级作用域中不会被提升（hoisting），在声明行之前访问会导致 ReferenceError。这与 var 不同（var 会被提升但值为 undefined）。在批量编辑多文件时，必须 TS 编译检查 + 逐文件 re-read 验证变量声明顺序，不能依赖单次 read_file 的碎片上下文。"
        ]
      );
      console.log("[迁移] P16 已插入 const 死区反思记录");
    }

    // 插入部署铁律知识沉淀（knowledge_capture）
    const lawsExists = dbGet(
      "SELECT id FROM reflections WHERE tenant_id = 1 AND employee_id = 0 AND reflection_type = 'knowledge_capture' AND learned_knowledge LIKE '%部署铁律%'"
    );
    if (!lawsExists) {
      db.run(
        `INSERT INTO reflections (tenant_id, employee_id, task_id, reflection_type, success_factors, failure_reasons, knowledge_gaps, improvement_plans, extracted_skills, learned_knowledge, importance_score, created_at)
         VALUES (1, 0, NULL, 'knowledge_capture', ?, NULL, NULL, NULL, ?, ?, 98, datetime('now'))`,
        [
          "7条部署铁律从多次事故中提炼：①TS编译检查；②re-read上下文；③分批build；④本地冒烟；⑤部署后文件状态确认；⑥PM2日志验证；⑦浏览器最终验证。这些规则是系统稳定性的最后防线，不可违背。",
          "部署SOP; 安全生产; 反思引擎",
          "XYOS 部署 SOP 铁律（2026-06-27 制定）：\n【铁律1-TS检查】部署前必须跑 npx tsc --noEmit，比 read_lints 更严。\n【铁律2-re-read上下文】每次 replace_in_file 后必须 re-read 改动位置前后 10 行，确认变量声明顺序、导入完整性、引用存在性。\n【铁律3-分批验证】改 5+ 文件时按模块分批 build，不在全部改完后再 build。\n【铁律4-本地冒烟】关键页面改完后本地 vite 预览确认不白屏。\n【铁律5-部署后验证文件】确认 dist/ 文件数正确，plink 查看文件清单。\n【铁律6-部署后验证PM2】pm2 logs --lines 20，排查 Cannot find module / ReferenceError。\n【铁律7-浏览器验证】关键页面逐个确认可访问、头像正常、权限正确。"
        ]
      );
      console.log("[迁移] P16 已插入部署铁律知识记录");
    }

    saveDb();
  } catch (err: any) {
    console.error("[迁移] P16 部署铁律反思种子 错误:", err.message);
  }

  // ===== P17: 资产管理模块 =====
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_no TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('INSTRUMENT','VEHICLE','OFFICE','TOOL')),
        sub_category TEXT,
        model TEXT,
        sn TEXT,
        manufacturer TEXT,
        purchase_date TEXT,
        purchase_price REAL DEFAULT 0,
        expected_life INTEGER,
        current_value REAL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'in_stock' CHECK(status IN ('in_stock','in_use','idle','repairing','transferring','scrapped','lost')),
        owner_type TEXT NOT NULL DEFAULT 'owned' CHECK(owner_type IN ('owned','leased','borrowed')),
        department_id INTEGER REFERENCES departments(id),
        location_detail TEXT,
        custodian_id INTEGER REFERENCES employees(id),
        qr_code TEXT,
        remark TEXT,
        tenant_id INTEGER DEFAULT 1,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )
    `);
    // 单列索引
    try { db.run('CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_assets_department ON assets(department_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_assets_custodian ON assets(custodian_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_assets_asset_no ON assets(asset_no)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_assets_tenant ON assets(tenant_id)'); } catch(e) {}
    // 复合索引（覆盖核心查询模式）
    try { db.run('CREATE INDEX IF NOT EXISTS idx_assets_tenant_del ON assets(tenant_id, deleted_at)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_assets_tenant_del_created ON assets(tenant_id, deleted_at, created_at DESC)'); } catch(e) {}

    saveDb();
    console.log("[迁移] P17 资产管理表已就绪（含复合索引优化）");
  } catch (err: any) {
    console.error("[迁移] P17 资产管理 错误:", err.message);
  }

  // ===== P18: 资产分类扩展表 + 流转记录 =====
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS asset_instruments (
        asset_id INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
        calibration_cycle INTEGER,
        last_calibration TEXT,
        next_calibration TEXT,
        calibration_agency TEXT,
        precision_level TEXT,
        measure_range TEXT,
        env_requirements TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS asset_vehicles (
        asset_id INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
        plate_no TEXT UNIQUE,
        vin TEXT,
        vehicle_type TEXT,
        fuel_type TEXT,
        seat_count INTEGER,
        insurance_company TEXT,
        insurance_expire TEXT,
        last_inspection TEXT,
        next_inspection TEXT,
        current_mileage INTEGER DEFAULT 0
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS asset_office (
        asset_id INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
        device_type TEXT,
        brand TEXT,
        cpu TEXT,
        ram TEXT,
        storage TEXT,
        os TEXT,
        ip_address TEXT,
        mac_address TEXT,
        consumable_model TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS asset_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK(type IN ('checkout','return','transfer','repair','scrap','calibrate','lend_out','lend_return','custodian_change')),
        from_dept_id INTEGER REFERENCES departments(id),
        to_dept_id INTEGER REFERENCES departments(id),
        from_user_id INTEGER REFERENCES employees(id),
        to_user_id INTEGER REFERENCES employees(id),
        expected_return TEXT,
        actual_return TEXT,
        condition TEXT CHECK(condition IN ('good','damaged','lost')),
        remark TEXT,
        external_party TEXT,
        external_contact TEXT,
        approval_id TEXT,
        tenant_id INTEGER DEFAULT 1,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )
    `);

    try { db.run('CREATE INDEX IF NOT EXISTS idx_ins_next_cal ON asset_instruments(next_calibration)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_veh_plate ON asset_vehicles(plate_no)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_veh_next_insp ON asset_vehicles(next_inspection)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_trans_asset ON asset_transactions(asset_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_trans_type ON asset_transactions(type)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_trans_created ON asset_transactions(created_at DESC)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_trans_tenant ON asset_transactions(tenant_id)'); } catch(e) {}

    saveDb();
    console.log("[迁移] P18 资产分类扩展表+流转记录已就绪");
  } catch (err: any) {
    console.error("[迁移] P18 资产分类扩展 错误:", err.message);
  }

  // P19：资产盘点
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS asset_count_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        title TEXT NOT NULL,
        description TEXT,
        department_id INTEGER REFERENCES departments(id),
        scope TEXT NOT NULL DEFAULT 'all' CHECK(scope IN ('all','department','category','custom')),
        scope_ids TEXT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_progress','completed','cancelled')),
        start_date TEXT,
        end_date TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS asset_count_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES asset_count_tasks(id) ON DELETE CASCADE,
        asset_id INTEGER NOT NULL REFERENCES assets(id),
        expected_location TEXT,
        actual_location TEXT,
        expected_status TEXT,
        actual_status TEXT,
        expected_custodian_id INTEGER REFERENCES employees(id),
        actual_custodian_id INTEGER REFERENCES employees(id),
        result TEXT NOT NULL DEFAULT 'pending' CHECK(result IN ('pending','match','difference','not_found')),
        remark TEXT,
        counted_by INTEGER REFERENCES users(id),
        counted_at TEXT DEFAULT (datetime('now')),
        tenant_id INTEGER DEFAULT 1
      )
    `);

    try { db.run('CREATE INDEX IF NOT EXISTS idx_count_tasks_tenant ON asset_count_tasks(tenant_id, status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_count_tasks_dept ON asset_count_tasks(department_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_count_results_task ON asset_count_results(task_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_count_results_asset ON asset_count_results(asset_id)'); } catch(e) {}

    saveDb();
    console.log("[迁移] P19 资产盘点表已就绪");
  } catch (err: any) {
    console.error("[迁移] P19 资产盘点 错误:", err.message);
  }

  // P20：车辆使用日志
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS asset_vehicle_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        log_type TEXT NOT NULL CHECK(log_type IN ('refuel','maintenance','insurance','annual_inspection','traffic_fine','other')),
        cost REAL DEFAULT 0,
        mileage REAL,
        log_date TEXT NOT NULL,
        description TEXT,
        receipt_url TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        tenant_id INTEGER DEFAULT 1
      )
    `);

    try { db.run('CREATE INDEX IF NOT EXISTS idx_vehicle_logs_asset ON asset_vehicle_logs(vehicle_asset_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_vehicle_logs_type ON asset_vehicle_logs(log_type)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_vehicle_logs_date ON asset_vehicle_logs(log_date DESC)'); } catch(e) {}

    // 添加 warranty_expire_date 冗余列（预计算列，让预警查询走索引）
    try { db.run("ALTER TABLE assets ADD COLUMN warranty_expire_date TEXT"); } catch (e: any) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
    // 回填已有数据
    try {
      db.run(`UPDATE assets SET warranty_expire_date = date(purchase_date, '+' || expected_life || ' months')
              WHERE purchase_date IS NOT NULL AND expected_life IS NOT NULL AND warranty_expire_date IS NULL`);
    } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_assets_warranty ON assets(tenant_id, deleted_at, warranty_expire_date, status)'); } catch(e) {}

    saveDb();
    console.log("[迁移] P20 车辆使用日志已就绪（含保修到期列优化）");
  } catch (err: any) {
    console.error("[迁移] P20 车辆使用日志 错误:", err.message);
  }

  // ===== P21 集团管控：矩阵式双重汇报架构 =====
  try {
    // 1. departments 增加组织类型 + 矩阵关系字段
    try { db.run("ALTER TABLE departments ADD COLUMN org_type TEXT DEFAULT 'functional'"); } catch(e) {}
    try { db.run("ALTER TABLE departments ADD COLUMN secondary_parent_id INTEGER REFERENCES departments(id)"); } catch(e) {}
    try { db.run("ALTER TABLE departments ADD COLUMN region TEXT"); } catch(e) {}
    try { db.run("ALTER TABLE departments ADD COLUMN branch_level INTEGER DEFAULT 0"); } catch(e) {}
    // 修复现有数据：已有的试验室应标记org_type
    db.run("UPDATE departments SET org_type='functional' WHERE org_type IS NULL");
    // 非总部部门默认 branch_level=0，后续种子数据会更新

    // 2. 所有资源表增加 branch_id（外派分支机构归属）
    try { db.run("ALTER TABLE assets ADD COLUMN branch_id INTEGER REFERENCES departments(id)"); } catch(e) {}
    try { db.run("ALTER TABLE contracts ADD COLUMN branch_id INTEGER REFERENCES departments(id)"); } catch(e) {}
    try { db.run("ALTER TABLE budgets ADD COLUMN branch_id INTEGER REFERENCES departments(id)"); } catch(e) {}
    try { db.run("ALTER TABLE tasks ADD COLUMN branch_id INTEGER REFERENCES departments(id)"); } catch(e) {}

    // 3. employees 增加双重归属字段
    try { db.run("ALTER TABLE employees ADD COLUMN secondary_dept_id INTEGER REFERENCES departments(id)"); } catch(e) {}

    // 4. 审批规则表
    db.run(`
      CREATE TABLE IF NOT EXISTS approval_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        resource_type TEXT NOT NULL,
        action_type TEXT NOT NULL,
        primary_approver TEXT NOT NULL DEFAULT 'branch_manager',
        secondary_approver TEXT,
        escalation_hours INTEGER DEFAULT 24,
        description TEXT,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. 默认审批规则种子
    const ruleCount = dbGet("SELECT COUNT(*) as c FROM approval_rules") as any;
    if (!ruleCount || ruleCount.c === 0) {
      const defaultRules = [
        ['asset', 'checkout', 'branch_manager', 'hm_center_director', 24, '分支内资产领用：分支经理审批'],
        ['asset', 'transfer', 'branch_manager', 'hm_center_director', 48, '跨分支资产调拨：双方分支经理 + 交付管理中心'],
        ['asset', 'scrap', 'branch_manager', 'finance_center', 48, '资产报废：分支经理 + 财务中心'],
        ['asset', 'purchase', 'branch_manager', 'coo_office', 72, '分支自行采购：分支经理 + COO办公室'],
        ['contract', 'sign', 'branch_manager', 'biz_center', 48, '合同签署：分支经理 + 商务中心'],
        ['budget', 'create', 'branch_manager', 'coo_office', 48, '预算编制：分支经理 + COO办公室'],
        ['task', 'cross_branch', 'branch_manager', 'hm_center_director', 24, '跨分支任务：双方分支经理确认'],
        ['employee', 'transfer', 'branch_manager', 'hr_center', 48, '人员借调：调出方 + HR中心 + 调入方'],
      ];
      for (const [rt, at, pa, sa, es, desc] of defaultRules) {
        db.run("INSERT INTO approval_rules (resource_type, action_type, primary_approver, secondary_approver, escalation_hours, description) VALUES (?,?,?,?,?,?)",
          [rt, at, pa, sa, es, desc]);
      }
    }

    // 6. 索引
    try { db.run('CREATE INDEX IF NOT EXISTS idx_dept_org_type ON departments(org_type)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_dept_region ON departments(region)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_dept_secondary ON departments(secondary_parent_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_assets_branch ON assets(branch_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_contracts_branch ON contracts(branch_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_approval_rules ON approval_rules(tenant_id, resource_type, action_type)'); } catch(e) {}

    saveDb();
    console.log("[迁移] P21 集团管控矩阵架构已就绪");
  } catch (err: any) {
    console.error("[迁移] P21 集团管控矩阵架构 错误:", err.message);
  }

  // ===== P22 群聊增强：公告、置顶、软删除、成员角色、消息回复 =====
  try {
    // 1. chats 增加公告和置顶消息字段
    try { db.run("ALTER TABLE chats ADD COLUMN announcement TEXT"); } catch(e) {}
    try { db.run("ALTER TABLE chats ADD COLUMN pinned_message_id INTEGER REFERENCES messages(id)"); } catch(e) {}

    // 2. chat_members 增加租户和加入时间
    try { db.run("ALTER TABLE chat_members ADD COLUMN tenant_id INTEGER DEFAULT 1"); } catch(e: any) { if (!e.message?.includes("duplicate column")) console.error("[P22] tenant_id:", e.message); }
    try { db.run("ALTER TABLE chat_members ADD COLUMN joined_at DATETIME"); } catch(e: any) { if (!e.message?.includes("duplicate column")) console.error("[P22] joined_at:", e.message); }
    try {
      db.run("UPDATE chat_members SET tenant_id = 1 WHERE tenant_id IS NULL");
      db.run("UPDATE chat_members SET joined_at = datetime('now') WHERE joined_at IS NULL");
    } catch(e) {}

    // 3. messages 增加软删除和回复引用字段
    try { db.run("ALTER TABLE messages ADD COLUMN deleted_at DATETIME"); } catch(e) {}
    try { db.run("ALTER TABLE messages ADD COLUMN reply_to_id INTEGER REFERENCES messages(id)"); } catch(e) {}

    // 4. 群聊已读标记表（用于未读计数）
    db.run(`
      CREATE TABLE IF NOT EXISTS chat_read_markers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        last_read_message_id INTEGER DEFAULT 0,
        last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(chat_id, user_id)
      )
    `);

    // 5. 索引
    try { db.run('CREATE INDEX IF NOT EXISTS idx_chat_members_tenant ON chat_members(tenant_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to_id)'); } catch(e) {}

    saveDb();
    console.log("[迁移] P22 群聊增强已就绪");
  } catch (err: any) {
    console.error("[迁移] P22 群聊增强 错误:", err.message);
  }

  // ===== P23: 资产采购联动 =====
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS asset_procurement_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('INSTRUMENT','VEHICLE','OFFICE','TOOL')),
        quantity INTEGER DEFAULT 1,
        estimated_cost REAL DEFAULT 0,
        reason TEXT,
        budget_id INTEGER REFERENCES budgets(id),
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','ordered','received','cancelled')),
        requested_by INTEGER REFERENCES users(id),
        approved_by INTEGER REFERENCES users(id),
        approved_at TEXT,
        reject_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    try { db.run('CREATE INDEX IF NOT EXISTS idx_procurement_tenant ON asset_procurement_requests(tenant_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_procurement_status ON asset_procurement_requests(status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_procurement_budget ON asset_procurement_requests(budget_id)'); } catch(e) {}

    // 工作流引擎集成：关联 workflow_instances
    try { db.run('ALTER TABLE asset_procurement_requests ADD COLUMN workflow_instance_id INTEGER'); } catch(e) {}
    try { db.run('ALTER TABLE asset_procurement_requests ADD COLUMN department_id INTEGER REFERENCES departments(id)'); } catch(e) {}

    saveDb();
    console.log("[迁移] P23 资产采购联动已就绪");
  } catch (err: any) {
    console.error("[迁移] P23 资产采购联动 错误:", err.message);
  }

  // ===== P24: 采购表单增强（申请部门 + 通知联动） =====
  try {
    try { db.run('ALTER TABLE asset_procurement_requests ADD COLUMN department_id INTEGER REFERENCES departments(id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_procurement_dept ON asset_procurement_requests(department_id)'); } catch(e) {}
    saveDb();
    console.log("[迁移] P24 采购表单增强已就绪");
  } catch (err: any) {
    console.error("[迁移] P24 采购表单增强 错误:", err.message);
  }

  // ===== P25: 通知公告（公司级公告发布/浏览/已读追踪） =====
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT DEFAULT 'notice' CHECK(type IN ('notice','policy','news','emergency')),
        priority TEXT DEFAULT 'normal' CHECK(priority IN ('low','normal','important','urgent')),
        is_pinned INTEGER DEFAULT 0,
        published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        created_by INTEGER REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS announcement_reads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(announcement_id, user_id)
      )
    `);

    try { db.run('CREATE INDEX IF NOT EXISTS idx_announcements_tenant ON announcements(tenant_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements(type)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON announcements(is_pinned)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(published_at DESC)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_announcement_reads_announcement ON announcement_reads(announcement_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_announcement_reads_user ON announcement_reads(user_id)'); } catch(e) {}

    saveDb();
    console.log("[迁移] P25 通知公告已就绪");
  } catch (err: any) {
    console.error("[迁移] P25 通知公告 错误:", err.message);
  }

  // ===== P26: 考勤管理（OA行政功能第一步） =====
  try {
    // 考勤记录表
    db.run(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        employee_id INTEGER NOT NULL,
        check_date DATE NOT NULL,
        check_in_time DATETIME,
        check_out_time DATETIME,
        check_in_lat REAL,
        check_in_lng REAL,
        check_out_lat REAL,
        check_out_lng REAL,
        check_in_location TEXT,
        check_out_location TEXT,
        status TEXT DEFAULT 'normal',
        work_hours REAL DEFAULT 0,
        remark TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, check_date)
      )
    `);

    // 考勤排班表（支持多班次）
    db.run(`
      CREATE TABLE IF NOT EXISTS attendance_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        department_id INTEGER,
        shift_name TEXT NOT NULL,
        work_start TIME NOT NULL,
        work_end TIME NOT NULL,
        flexible_minutes INTEGER DEFAULT 0,
        effective_from DATE,
        effective_to DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 补卡申请记录（关联 workflow 审批流）
    db.run(`
      CREATE TABLE IF NOT EXISTS attendance_supplements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        employee_id INTEGER NOT NULL,
        check_date DATE NOT NULL,
        supplement_type TEXT NOT NULL CHECK(supplement_type IN ('check_in', 'check_out', 'both')),
        reason TEXT,
        workflow_instance_id INTEGER,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
        reviewed_by INTEGER,
        reviewed_at DATETIME,
        review_comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 索引
    try { db.run('CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance_records(employee_id, check_date DESC)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_attendance_tenant ON attendance_records(tenant_id, check_date)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance_records(employee_id, status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_schedules_dept ON attendance_schedules(department_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_supplements_employee ON attendance_supplements(employee_id, check_date)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_supplements_wf ON attendance_supplements(workflow_instance_id)'); } catch(e) {}

    saveDb();
    console.log("[迁移] P26 考勤管理表已就绪");
  } catch (err: any) {
    console.error("[迁移] P26 考勤管理 错误:", err.message);
  }

  // ===== P27: 请假/报销/日报（OA行政功能第二步） =====
  try {
    // 请假申请记录表
    db.run(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        employee_id INTEGER NOT NULL,
        department_id INTEGER,
        workflow_instance_id INTEGER,
        leave_type TEXT NOT NULL CHECK(leave_type IN ('annual', 'sick', 'personal', 'marriage', 'maternity', 'bereavement', 'other')),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        total_days REAL NOT NULL,
        reason TEXT,
        substitute_employee_id INTEGER,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
        reviewed_by INTEGER,
        reviewed_at DATETIME,
        review_comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 费用报销记录表
    db.run(`
      CREATE TABLE IF NOT EXISTS expense_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        employee_id INTEGER NOT NULL,
        department_id INTEGER,
        workflow_instance_id INTEGER,
        expense_type TEXT NOT NULL CHECK(expense_type IN ('travel', 'business', 'office', 'communication', 'vehicle', 'entertainment', 'training', 'other')),
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'CNY',
        expense_date DATE NOT NULL,
        description TEXT,
        invoice_count INTEGER DEFAULT 0,
        contract_id INTEGER,
        supplier_name TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'paid', 'cancelled')),
        payment_status TEXT DEFAULT 'unpaid',
        paid_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 费用报销明细项（支持一报多票）
    db.run(`
      CREATE TABLE IF NOT EXISTS expense_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expense_record_id INTEGER NOT NULL,
        item_type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        invoice_no TEXT,
        invoice_date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 日报/周报记录表
    db.run(`
      CREATE TABLE IF NOT EXISTS daily_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        employee_id INTEGER NOT NULL,
        department_id INTEGER,
        report_type TEXT NOT NULL CHECK(report_type IN ('daily', 'weekly')),
        report_date DATE NOT NULL,
        week_number INTEGER,
        title TEXT,
        work_summary TEXT NOT NULL,
        tomorrow_plan TEXT,
        issues_blockers TEXT,
        attachments TEXT,
        submit_status TEXT DEFAULT 'submitted' CHECK(submit_status IN ('draft', 'submitted', 'approved')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, report_type, report_date)
      )
    `);

    // 日报评论表
    db.run(`
      CREATE TABLE IF NOT EXISTS daily_report_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        commenter_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 索引
    try { db.run('CREATE INDEX IF NOT EXISTS idx_leave_employee ON leave_requests(employee_id, status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_leave_dates ON leave_requests(start_date, end_date)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_leave_wf ON leave_requests(workflow_instance_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_expense_employee ON expense_records(employee_id, status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_expense_date ON expense_records(expense_date)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_expense_wf ON expense_records(workflow_instance_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_expense_items_record ON expense_items(expense_record_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_daily_employee ON daily_reports(employee_id, report_date DESC)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_daily_dept ON daily_reports(department_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_report_comments ON daily_report_comments(report_id)'); } catch(e) {}

    saveDb();
    console.log("[迁移] P27 请假/报销/日报表已就绪");
  } catch (err: any) {
    console.error("[迁移] P27 请假/报销/日报 错误:", err.message);
  }
}

// 部门英文码映射
function getDeptCode(deptName: string): string {
  const codeMap: Record<string, string> = {
    'CEO办公室': 'CEO',
    '技术部': 'TECH',
    '产品部': 'PRODUCT',
    '市场部': 'MARKET',
    '财务部': 'FINANCE',
    '人力资源部': 'HR',
  };
  
  if (codeMap[deptName]) return codeMap[deptName];
  
  const letters = deptName.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (letters.length >= 2) return letters.substring(0, Math.min(8, letters.length));
  
  return 'DEPT';
}

// ===== WorkFlow V2: 智能流程引擎表（独立迁移，不受 runMigrations 跳过影响） =====
export function ensureWorkflowV2Tables() {
  // 检查 workflow_categories 表是否已存在
  try {
    const r = db.exec("SELECT 1 FROM workflow_categories LIMIT 1");
    if (r.length > 0) {
      console.log("[迁移] WorkFlow V2 表已存在，跳过");
      return;
    }
  } catch (_) { /* 表不存在，正常创建 */ }

  // === V1 基础表（确保存在，供 V2 增强） ===
  db.run(`CREATE TABLE IF NOT EXISTS workflow_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    version INTEGER DEFAULT 1,
    status TEXT DEFAULT 'draft',
    definition TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS workflow_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    workflow_id INTEGER NOT NULL,
    title TEXT,
    status TEXT DEFAULT 'pending',
    variables TEXT,
    current_step INTEGER DEFAULT 0,
    started_by INTEGER NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS workflow_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    step_index INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT DEFAULT 'approval',
    status TEXT DEFAULT 'pending',
    assignee_id INTEGER,
    assignee_type TEXT DEFAULT 'user',
    comment TEXT,
    resolved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  try { db.run('CREATE INDEX IF NOT EXISTS idx_wf_def_tenant ON workflow_definitions(tenant_id)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_wf_inst_tenant ON workflow_instances(tenant_id, status)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_wf_task_tenant ON workflow_tasks(tenant_id, status)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_wf_task_assignee ON workflow_tasks(assignee_id, status)'); } catch(e) {}

  // === V2 新表 ===
  db.run(`CREATE TABLE IF NOT EXISTS workflow_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    form_schema TEXT,
    is_preset INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 租户分类设置
  db.run(`CREATE TABLE IF NOT EXISTS tenant_category_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    enabled INTEGER DEFAULT 1,
    visible_depts TEXT,
    default_cc_roles TEXT,
    UNIQUE(tenant_id, category_id)
  )`);

  // 模板快照（版本隔离）
  db.run(`CREATE TABLE IF NOT EXISTS workflow_definition_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    definition_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    definition TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 知会通知表
  db.run(`CREATE TABLE IF NOT EXISTS workflow_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    read_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 配置审计日志
  db.run(`CREATE TABLE IF NOT EXISTS workflow_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER,
    old_value TEXT,
    new_value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 增强现有 workflow 表
  try { db.run("ALTER TABLE workflow_definitions ADD COLUMN category_id INTEGER"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }
  try { db.run("ALTER TABLE workflow_definitions ADD COLUMN scheme_name TEXT"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }
  try { db.run("ALTER TABLE workflow_definitions ADD COLUMN icon TEXT"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }
  try { db.run("ALTER TABLE workflow_definitions ADD COLUMN sort_order INTEGER DEFAULT 0"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }
  try { db.run("ALTER TABLE workflow_definitions ADD COLUMN is_preset INTEGER DEFAULT 0"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }
  try { db.run("ALTER TABLE workflow_definitions ADD COLUMN form_schema TEXT"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }

  try { db.run("ALTER TABLE workflow_instances ADD COLUMN definition_snapshot_id INTEGER"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }
  try { db.run("ALTER TABLE workflow_instances ADD COLUMN current_node_ids TEXT"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }
  try { db.run("ALTER TABLE workflow_instances ADD COLUMN return_node_id TEXT"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }
  try { db.run("ALTER TABLE workflow_instances ADD COLUMN returned_by INTEGER"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }
  try { db.run("ALTER TABLE workflow_instances ADD COLUMN return_reason TEXT"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }
  try { db.run("ALTER TABLE workflow_instances ADD COLUMN revision_count INTEGER DEFAULT 0"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }
  try { db.run("ALTER TABLE workflow_instances ADD COLUMN closed_by INTEGER"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }
  try { db.run("ALTER TABLE workflow_instances ADD COLUMN close_reason TEXT"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }

  try { db.run("ALTER TABLE workflow_tasks ADD COLUMN node_id TEXT"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }
  try { db.run("ALTER TABLE workflow_tasks ADD COLUMN sign_order INTEGER"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }
  try { db.run("ALTER TABLE workflow_tasks ADD COLUMN is_added_sign INTEGER DEFAULT 0"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }
  try { db.run("ALTER TABLE workflow_tasks ADD COLUMN delegated_from INTEGER"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }
  try { db.run("ALTER TABLE workflow_tasks ADD COLUMN reminded_at DATETIME"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }
  try { db.run("ALTER TABLE workflow_tasks ADD COLUMN cancelled_reason TEXT"); } catch(e: any) { if (!e.message?.includes("duplicate column")) throw e; }

  // 索引
  try { db.run('CREATE INDEX IF NOT EXISTS idx_wf_cat_parent ON workflow_categories(parent_id)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_tcs_tenant ON tenant_category_settings(tenant_id)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_wf_snapshot_def ON workflow_definition_snapshots(definition_id, version)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_wf_notif_user ON workflow_notifications(tenant_id, user_id, read_at)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_wf_notif_instance ON workflow_notifications(instance_id)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_wf_audit_tenant ON workflow_audit_log(tenant_id, created_at)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_wf_inst_snapshot ON workflow_instances(definition_snapshot_id)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_wf_task_node ON workflow_tasks(instance_id, node_id, status)'); } catch(e) {}

  saveDb();
  console.log("[迁移] WorkFlow V2 智能流程引擎表已就绪");

  // ===== P28: 访问统计 + 智能助手 =====
  runMigrationP28();
}

// ===== P28: 访问统计 + 智能助手 =====
function runMigrationP28() {
  // 访客会话表
  db.run(`CREATE TABLE IF NOT EXISTS visitor_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    screen_size TEXT,
    timezone TEXT,
    language TEXT,
    referrer TEXT,
    first_visit_at DATETIME,
    last_active_at DATETIME,
    page_views INTEGER DEFAULT 1
  )`);
  try { db.run('CREATE INDEX IF NOT EXISTS idx_vs_session ON visitor_sessions(session_id)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_vs_active ON visitor_sessions(last_active_at)'); } catch(e) {}

  // 页面访问记录表
  db.run(`CREATE TABLE IF NOT EXISTS visitor_pageviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    page_url TEXT,
    page_title TEXT,
    referrer TEXT,
    dwell_seconds INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.run('CREATE INDEX IF NOT EXISTS idx_vp_session ON visitor_pageviews(session_id)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_vp_date ON visitor_pageviews(timestamp)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_vp_url ON visitor_pageviews(page_url)'); } catch(e) {}

  // 智能助手留资表
  db.run(`CREATE TABLE IF NOT EXISTS assistant_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT DEFAULT '',
    company TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    interest TEXT DEFAULT '',
    source TEXT DEFAULT 'assistant',
    status TEXT DEFAULT 'new',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT DEFAULT ''
  )`);
  try { db.run('CREATE INDEX IF NOT EXISTS idx_al_status ON assistant_leads(status)'); } catch(e) {}

  // 智能助手对话记录表
  db.run(`CREATE TABLE IF NOT EXISTS assistant_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    ip_address TEXT,
    city TEXT,
    region TEXT,
    country TEXT,
    user_agent TEXT,
    messages_json TEXT,
    message_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    lead_captured INTEGER DEFAULT 0,
    lead_info TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_ac_session ON assistant_conversations(session_id)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_ac_date ON assistant_conversations(created_at)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_ac_lead ON assistant_conversations(lead_captured)'); } catch(e) {}

  // IP地理位置缓存表
  db.run(`CREATE TABLE IF NOT EXISTS ip_geo_cache (
    ip TEXT PRIMARY KEY,
    city TEXT,
    region TEXT,
    country TEXT,
    isp TEXT,
    queried_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  saveDb();
  console.log("[迁移] P28 访问统计+智能助手表已就绪");
}
