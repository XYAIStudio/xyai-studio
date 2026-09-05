/**
 * 全局错误处理工具
 * - 统一错误脱敏：生产环境不暴露内部错误详情
 * - 生成 traceId 方便后台排查
 * - 分类处理不同错误类型
 */
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/** 生成简短 traceId（8位十六进制） */
function traceId(): string {
  return crypto.randomBytes(4).toString("hex");
}

/** 安全错误脱敏：无论什么错误都返回统一的用户友好消息 */
export function safeErr(err: unknown): string {
  if (process.env.NODE_ENV === "development" && err instanceof Error) {
    return `服务器内部错误 (trace: ${err.message.slice(0, 80)})`;
  }
  return "服务器内部错误，请稍后重试或联系管理员";
}

/** 将错误信息写入日志（不返回给客户端） */
export function logError(context: string, err: unknown): string {
  const tid = traceId();
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[Error][${tid}] ${context}:`, message);
  return tid;
}

/**
 * Express 全局错误处理中间件
 * 捕获所有未处理的错误，统一脱敏后返回
 *
 * 使用方式：
 *   app.use(globalErrorHandler);
 * 必须在所有路由之后注册
 */
export function globalErrorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const tid = logError(`${req.method} ${req.path}`, err);
  // DEBUG: 开发模式下输出完整错误
  if (process.env.NODE_ENV === "development") {
    console.error(`[Error][${tid}] Full stack:`, err.stack);
  }
  // 确保只发送一次
  if (res.headersSent) {
    console.warn(`[Error][${tid}] Headers already sent, cannot send error response`);
    return;
  }
  res.status(500).json({
    success: false,
    error: "服务器内部错误，请稍后重试或联系管理员",
    traceId: tid,
  });
}

/**
 * 路由级错误处理包装器
 * 用于 async 路由处理函数，自动捕获异常并脱敏
 *
 * 使用方式：
 *   router.get("/path", asyncHandler(async (req, res) => { ... }));
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
