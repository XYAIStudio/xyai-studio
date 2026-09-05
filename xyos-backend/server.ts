import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { createServer } from "http";
import { initDatabase } from "./db";
import { authRoutes } from "./routes/auth";
import { employeeRoutes } from "./routes/employees";
import { taskRoutes } from "./routes/tasks";
import { chatRoutes } from "./routes/chats";
import { orgRoutes } from "./routes/org";
import { knowledgeRoutes } from "./routes/knowledge";
import { healthRoutes } from "./routes/health";
import { notificationRoutes } from "./routes/notifications";
import { dashboardRoutes } from "./routes/dashboard";
import { settingsRoutes } from "./routes/settings";
import { aiRoutes } from "./routes/ai";
import { tenantRoutes } from "./routes/tenants";
import { employeeCodeRoutes } from "./routes/employee-code";
import { memoryRoutes } from "./routes/memory";
import { heartbeatRoutes } from "./routes/heartbeat";
import { orchestrateRoutes } from "./routes/orchestrate";
import { goalRoutes } from "./routes/goals";
import { budgetRoutes } from "./routes/budgets";
import { routineRoutes } from "./routes/routines";
import { performanceRoutes } from "./routes/performance";
import { reflectionRoutes } from "./routes/reflections";
import { configVersionRoutes } from "./routes/config-versions";
import { orgImportRoutes } from "./routes/org-import";
import { skillsRoutes } from "./routes/skills";
import { auditRoutes } from "./routes/audit";
import { efficiencyRoutes } from "./routes/efficiency";
import { governanceRoutes } from "./routes/governance";
import { workflowRoutes } from "./routes/workflow";
import { talentRoutes } from "./routes/talent";
import { pluginRoutes } from "./routes/plugins";
import adminRoutes from "./routes/admin";
import { contractRoutes } from "./routes/contracts";
import { assetRoutes } from "./routes/assets";
import { paymentRoutes } from "./routes/payments";
import reviewsRoutes from "./routes/reviews";
import { announcementRoutes } from "./routes/announcements";
import { analyticsRoutes } from "./routes/analytics";
import { assistantRoutes } from "./routes/assistant";
import { runtimeRoutes } from "./routes/runtime";
import { subscriptionRoutes } from "./routes/subscription";
import { h2a2a2hRoutes } from "./routes/h2a2a2h";
import { systemRoutes } from "./routes/system";
import { industryAgentRoutes } from "./routes/industry-agent";
import { capabilityRoutes } from "./routes/capabilities";
import { paymentNotifyRoutes } from "./routes/payment-notify";
import { initRuntimeGateway } from "./services/runtime/registry";
import { checkExpiredSubscriptions } from "./services/subscription";
import { seedDatabase } from "./seed";
import { authenticate } from "./middleware";
import { setupWebSocket } from "./services/websocket";
import { globalErrorHandler } from "./utils/error-handler";

async function main() {
  const app = express();
  const server = createServer(app);
  const PORT = Number(process.env.PORT || 3000);

  // 信任 nginx 代理（修复 X-Forwarded-For 报错）
  app.set("trust proxy", 1);

  // 安全头
  app.use(helmet({
    contentSecurityPolicy: false,        // CSP 由 Vite 构建层管理
    crossOriginEmbedderPolicy: false,
  }));

  // CORS — 白名单 + WebView 兼容
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map(s => s.trim())
    : [
        "http://localhost:5173", "http://localhost:5174", "http://localhost:3000",
        "http://localhost:3030", "http://127.0.0.1:5173", "http://127.0.0.1:5174",
        "http://127.0.0.1:3000", "http://127.0.0.1:3030",
        "https://os.cnxy.tech", "https://www.os.cnxy.tech",
        "https://cnxyai.cn", "https://www.cnxyai.cn",
      ];
  // 开发模式：允许鸿蒙 WebView local 访问
  const isDev = !process.env.NODE_ENV || process.env.NODE_ENV !== "production";
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    // WebView 从 resource:// rawfile 加载时 origin 为空/null，本地开发放行
    if (!origin) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
      if (req.method === "OPTIONS") return res.sendStatus(200);
      return next();
    }
    // 同源请求始终放行（页面从本服务加载时的子资源/API 请求带同源 Origin）
    let sameOrigin = false;
    // XYAI Studio 桌面端：本机回环来源（任意端口）始终放行——桌面 app 从 127.0.0.1:<动态端口> 加载，
    // 端口随启动变化，无法静态白名单；仅放行回环主机名，不放宽其它来源。
    let loopbackDesktop = false;
    try {
      const reqHost = (req.headers.host || "").split(":")[0];
      const originHost = new URL(origin).hostname;
      sameOrigin = originHost === reqHost;
      loopbackDesktop = originHost === "127.0.0.1" || originHost === "localhost";
    } catch { /* 非法 origin 走白名单 */ }
    cors({
      origin: (o, cb) => {
        if (!o || sameOrigin || loopbackDesktop || allowedOrigins.includes(o)) {
          cb(null, true);
        } else {
          cb(new Error("CORS blocked"));
        }
      },
      credentials: true,
    })(req, res, next);
  });

  app.use(express.json({ limit: "10mb" }));
  const cookieSecret = process.env.COOKIE_SECRET;
  if (!cookieSecret) {
  console.error("[FATAL] COOKIE_SECRET not set, check .env");
  process.exit(1);
}
app.use(cookieParser(cookieSecret));

  // 全局速率限制（每个IP每分钟300次）
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "请求过于频繁，请稍后再试" },
  });
  app.use("/api", globalLimiter);

  // AI接口严格限流（每IP每分钟20次）
  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "AI请求频率超限，请稍后再试" },
  });
  app.use("/api/ai", aiLimiter);

  // 登录接口严格限流（每IP每分钟10次，防暴力破解）
  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "登录尝试过多，请稍后再试" },
  });
  app.use("/api/auth/login", authLimiter);

  const distPath = process.env.XYOS_DIST_DIR || path.join(__dirname, "../dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
  }

  // 知识库上传文件静态服务
  const uploadPath = process.env.XYOS_UPLOAD_DIR || path.join(__dirname, "../uploads");
  if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
  // 文件上传目录 — 需认证访问（租户隔离）
  app.use("/uploads", authenticate, (req: any, res, next) => {
    const tenantId = req.user?.tenant_id;
    if (tenantId) {
      res.setHeader("X-Tenant-ID", String(tenantId));
    }
    next();
  }, express.static(uploadPath));

  app.use("/api/auth", authRoutes);
  app.use("/api/employees", employeeRoutes);
  app.use("/api/employee-code", employeeCodeRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/chats", chatRoutes);
  app.use("/api/org", orgRoutes);
  app.use("/api/knowledge", knowledgeRoutes);
  app.use("/api/health", healthRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/ai", aiRoutes);
  app.use("/api/tenants", tenantRoutes);
    app.use("/api/memory", memoryRoutes);
  app.use("/api/heartbeat", heartbeatRoutes);
  app.use("/api/orchestrate", orchestrateRoutes);
  app.use("/api/goals", goalRoutes);
  app.use("/api/budgets", budgetRoutes);
  app.use("/api/routines", routineRoutes);
  app.use("/api/performance", performanceRoutes);
  app.use("/api/reflections", reflectionRoutes);
  app.use("/api/config-versions", configVersionRoutes);
  app.use("/api/org-import", orgImportRoutes);
  app.use("/api/skills", skillsRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/efficiency", efficiencyRoutes);
  app.use("/api/governance", governanceRoutes);
  app.use("/api/workflows", workflowRoutes);
app.use("/api/talent", talentRoutes);
app.use("/api/plugins", pluginRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/contracts", contractRoutes);
app.use("/api/assets", assetRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/payment", paymentNotifyRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/reviews", reviewsRoutes);  // V4.1 人在回路
app.use("/api/announcements", announcementRoutes);  // P25 通知公告
app.use("/api/analytics", analyticsRoutes);          // P28 访问统计
app.use("/api/assistant", assistantRoutes);          // P28 智能助手
app.use("/api/runtime", runtimeRoutes);              // 雄元智脑XYOS — Runtime Gateway
app.use("/api/h2a2a2h", h2a2a2hRoutes);              // V1.0 H2A2A2H 状态机
app.use("/api/system", systemRoutes);                 // V1.0 版本/Flags/治理可视化
app.use("/api/industry-agent", industryAgentRoutes);  // V1.0 行业智能体生成器
app.use("/api/capabilities", capabilityRoutes);        // DSH+ / XYOS 统一能力目录

  // 全局错误处理中间件（必须在所有路由之后注册）
  app.use(globalErrorHandler);

  // V4: 数据库管理页面（页面内 JS 自行鉴权）
app.get("/admin/database", (req, res) => {
  res.sendFile(path.join(__dirname, "../dist/database-admin.html"));
});

  app.get("*", (req, res) => {
    const indexPath = fs.existsSync(path.join(distPath, "index.html"))
      ? path.join(distPath, "index.html")
      : path.join(__dirname, "../frontend/index.html");
    res.sendFile(indexPath);
  });

  await initDatabase();
  seedDatabase();

  // V1.0 治理：启动时对所有租户种子默认治理规则（权限矩阵/通信规则/流程模板）
  // 之前是惰性种子（首次 AI 动作才触发），导致治理可视化在系统刚启动时显示空矩阵。
  try {
    const { ensureGovernanceDefaults } = await import("./services/authorization");
    const { dbAll } = await import("./db");
    const tenants = dbAll("SELECT id FROM tenants") as any[];
    for (const t of tenants) ensureGovernanceDefaults(t.id);
    console.log(`[治理] 已为 ${tenants.length} 个租户种子默认治理规则`);
  } catch (err: any) {
    console.warn("[治理] 默认规则种子失败:", err?.message);
  }

  await initRuntimeGateway();   // 注册 mock / dsh 运行时 Provider

  // SaaS 订阅：启动时 + 每小时检查到期订阅并降级
  try {
    const expired = checkExpiredSubscriptions();
    if (expired) console.log(`[订阅] ${expired} 个租户订阅已到期，降级为免费版`);
    setInterval(() => {
      try { checkExpiredSubscriptions(); } catch { /* 忽略定时检查错误 */ }
    }, 60 * 60 * 1000);
  } catch (err: any) {
    console.warn("[订阅] 到期检查初始化失败:", err.message);
  }

  setupWebSocket(server);

  // XYOS 业务空间由“系统设置 → AI大模型”的受控 OpenAI 兼容通道提供回答。
  // 最新 DSH 只驻留开发空间，不能在业务服务启动时抢占另一套 credentials/profile。

  server.listen(PORT, '127.0.0.1', () => {
    const address = server.address();
    const boundPort = typeof address === "object" && address !== null ? address.port : PORT;
    console.log(`\n  🏢 雄元智脑XYOS V0.1 (Studio) — 雄元智能工作室`);
    console.log(`  ─────────────────────────────────────`);
    console.log(`  Server:     http://localhost:${boundPort}`);
    console.log(`  WebSocket:  ws://localhost:${boundPort}/ws`);
    console.log(`  Status:     ✅ Running\n`);
    // 桌面端 supervisor 就绪检测行（readiness prefix）
    console.log(`xyos backend: http://127.0.0.1:${boundPort}`);
  });
}

// ═══════════════════════════════════════════════════════════
// 全局未捕获异常处理 — 防进程崩溃
// ═══════════════════════════════════════════════════════════
process.on("uncaughtException", (err) => {
  console.error("[FATAL] 未捕获的同步异常:", err.message);
  console.error("[FATAL] Stack:", err.stack?.slice(0, 500));
  if (process.env.NODE_ENV === "production") {
    console.error("[FATAL] exiting, container will restart");
    process.exit(1);
  } // PM2 会在检测到进程僵死时自动重启
});

process.on("unhandledRejection", (reason: any, promise) => {
  console.error("[FATAL] 未处理的Promise rejection:", reason?.message || reason);
  if (reason?.stack) console.error("[FATAL] Stack:", reason.stack.slice(0, 500));
  if (process.env.NODE_ENV === "production") {
    console.error("[FATAL] exiting, container will restart");
    process.exit(1);
  }
});

main().catch(console.error);
