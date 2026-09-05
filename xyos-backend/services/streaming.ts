/**
 * XYOS V4.3 — SSE 流式输出服务
 * 提供 Server-Sent Events 实时推送，用于前端打字机效果
 * 与 ai.ts 的 callLLMStream 配合使用
 */
import { Response } from "express";
import { callLLMStream, AIMessage, StreamCallbacks } from "./ai";

export interface SSEConfig {
  /** 每个 SSE 事件的名称（默认 "token"） */
  eventName?: string;
  /** 心跳间隔（毫秒），防止连接超时 */
  heartbeatInterval?: number;
  /** 最大 tokens 限制 */
  maxTokens?: number;
  /** 温度参数 */
  temperature?: number;
}

/**
 * 通过 Express Response 建立 SSE 连接，流式输出 LLM 响应
 * 
 * 使用方式（在路由中）：
 *   app.post("/api/ai/chat/stream", async (req, res) => {
 *     await streamToClient(req, res, messages, callbacks);
 *   });
 */
export async function streamToClient(
  req: any,
  res: Response,
  messages: AIMessage[],
  config: SSEConfig = {}
): Promise<void> {
  const {
    eventName = "token",
    heartbeatInterval = 15000,
    maxTokens = 2048,
    temperature = 0.7,
  } = config;

  // 设置 SSE 头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // 禁用 nginx 缓冲
  res.flushHeaders();

  // 心跳定时器
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let isClosed = false;

  const sendEvent = (name: string, data: unknown) => {
    if (isClosed) return;
    try {
      res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      isClosed = true;
    }
  };

  const cleanup = () => {
    isClosed = true;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  // 客户端断开连接时清理
  req.on("close", cleanup);

  // 发送连接确认
  sendEvent("connected", { status: "ok", timestamp: Date.now() });

  // 启动心跳
  heartbeatTimer = setInterval(() => {
    if (isClosed) return;
    sendEvent("heartbeat", { timestamp: Date.now() });
  }, heartbeatInterval);

  try {
    let tokenCount = 0;
    let fullContent = "";

    const callbacks: StreamCallbacks = {
      onToken: (token: string) => {
        tokenCount++;
        fullContent += token;
        sendEvent(eventName, {
          token,
          index: tokenCount,
          timestamp: Date.now(),
        });
      },
      onComplete: (content: string) => {
        sendEvent("complete", {
          content,
          totalTokens: tokenCount,
          fullContent: content,
          model: "streaming",
          timestamp: Date.now(),
        });
        cleanup();
        res.end();
      },
      onError: (error: Error) => {
        sendEvent("error", {
          message: error.message,
          code: "STREAM_ERROR",
          timestamp: Date.now(),
        });
        cleanup();
        res.end();
      },
    };

    await callLLMStream(messages, callbacks, temperature, maxTokens);
  } catch (error: any) {
    if (!isClosed) {
      sendEvent("error", {
        message: error.message || "Stream processing failed",
        code: "INTERNAL_ERROR",
        timestamp: Date.now(),
      });
    }
    cleanup();
    res.end();
  }
}

/**
 * WebSocket 流式消息辅助函数
 * 将 LLM 流式输出通过 WebSocket 广播
 */
export async function streamToWebSocket(
  ws: any,
  messages: AIMessage[],
  chatId: number,
  senderId: number,
  senderName: string,
  config: SSEConfig = {}
): Promise<void> {
  const { maxTokens = 2048, temperature = 0.7 } = config;

  let fullContent = "";
  let isCompleted = false;

  try {
    // 发送开始信号
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: "ai_stream_start",
        chatId,
        senderId,
        senderName,
        timestamp: Date.now(),
      }));
    }

    const callbacks: StreamCallbacks = {
      onToken: (token: string) => {
        fullContent += token;
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: "ai_stream_token",
            chatId,
            senderId,
            senderName,
            token,
            timestamp: Date.now(),
          }));
        }
      },
      onComplete: (content: string) => {
        isCompleted = true;
        fullContent = content || fullContent;
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: "ai_stream_complete",
            chatId,
            senderId,
            senderName,
            content: fullContent,
            timestamp: Date.now(),
          }));
        }
      },
      onError: (error: Error) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: "ai_stream_error",
            chatId,
            senderId,
            error: error.message,
            timestamp: Date.now(),
          }));
        }
      },
    };

    await callLLMStream(messages, callbacks, temperature, maxTokens);
  } catch (error: any) {
    if (ws.readyState === ws.OPEN && !isCompleted) {
      ws.send(JSON.stringify({
        type: "ai_stream_error",
        chatId,
        senderId,
        error: error.message || "Stream failed",
        timestamp: Date.now(),
      }));
    }
  }
}

export default {
  streamToClient,
  streamToWebSocket,
};
