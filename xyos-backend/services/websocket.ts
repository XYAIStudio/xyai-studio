import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { dbGet, dbRun, dbAll } from "../db";
import { getRuntimeConfig } from "../config/runtime";
import { verifyWsTicket } from "../routes/ws-ticket";

const runtime = getRuntimeConfig();
const JWT_SECRET = runtime.jwtSecret;

interface AuthSocket extends WebSocket {
  userId?: number;
  tenantId?: number;
  nickname?: string;
  chatId?: number;
}

const clients = new Map<number, Set<AuthSocket>>();

export function setupWebSocket(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: AuthSocket, req) => {
    // V0.50 R0-P0-04: 优先验证短期票据（xyos-ws-ticket.<ticket>），
    // 兼容旧版 JWT 模式（xyos-auth.<jwt>）以便平滑迁移。
    const protocolHeader = req.headers["sec-websocket-protocol"];
    const ticketToken = getWsTicketToken(protocolHeader);
    const legacyJwtToken = !ticketToken ? getLegacyJwtToken(protocolHeader) : null;
    const token = ticketToken || legacyJwtToken;

    if (!token) {
      ws.close(1008, "Authentication required");
      return;
    }

    try {
      let userId: number;
      let tenantId: number;

      if (ticketToken) {
        // 验证短期票据
        const payload = verifyWsTicket(ticketToken);
        if (!payload) {
          ws.close(1008, "Invalid or expired connection ticket");
          return;
        }
        userId = payload.uid;
        tenantId = payload.tid;
      } else {
        // 兼容旧版 JWT
        const decoded = jwt.verify(legacyJwtToken!, JWT_SECRET) as any;
        userId = decoded.id;
        tenantId = decoded.tenant_id;
      }

      const principal = getActivePrincipal(userId, tenantId);
      if (!principal) {
        ws.close(1008, "Account or tenant is inactive");
        return;
      }

      ws.userId = principal.id;
      ws.tenantId = principal.tenant_id;
      ws.nickname = principal.nickname;

      if (!clients.has(principal.id)) {
        clients.set(principal.id, new Set());
      }
      clients.get(principal.id)!.add(ws);

      broadcastToTenant(principal.tenant_id, {
        type: "user_online",
        userId: principal.id,
        nickname: principal.nickname,
      }, principal.id);
    } catch {
      ws.close(1008, "Invalid token");
      return;
    }

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        void handleMessage(ws, message).catch(() => {
          ws.send(JSON.stringify({ type: "error", message: "WebSocket request rejected" }));
        });
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
      }
    });

    ws.on("close", () => {
      if (ws.userId) {
        const userClients = clients.get(ws.userId);
        if (userClients) {
          userClients.delete(ws);
          if (userClients.size === 0) {
            clients.delete(ws.userId);
            broadcastToTenant(ws.tenantId!, {
              type: "user_offline",
              userId: ws.userId,
              nickname: ws.nickname,
            }, ws.userId);
          }
        }
      }
    });

    ws.send(JSON.stringify({ type: "connected", message: "Welcome to XYOS WebSocket" }));
  });

  console.log("[WebSocket] 服务已启动");
  return wss;
}

/**
 * 从 Sec-WebSocket-Protocol 中提取短期票据
 * 格式: xyos-ws-ticket.<base64.sig>
 */
function getWsTicketToken(protocolHeader: string | string[] | undefined): string | null {
  const protocols = parseProtocolHeader(protocolHeader);
  const protocolToken = protocols.find(v => v.startsWith("xyos-ws-ticket."));
  return protocolToken ? protocolToken.slice("xyos-ws-ticket.".length) : null;
}

/**
 * 从 Sec-WebSocket-Protocol 中提取旧版 JWT（向后兼容）
 * 格式: xyos-auth.<jwt>
 */
function getLegacyJwtToken(protocolHeader: string | string[] | undefined): string | null {
  const protocols = parseProtocolHeader(protocolHeader);
  const protocolToken = protocols.find(v => v.startsWith("xyos-auth."));
  return protocolToken ? protocolToken.slice("xyos-auth.".length) : null;
}

function parseProtocolHeader(protocolHeader: string | string[] | undefined): string[] {
  return (Array.isArray(protocolHeader) ? protocolHeader.join(",") : protocolHeader || "")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);
}

/** 为向后兼容保留别名 */
const getWebSocketToken = getLegacyJwtToken;

function getActivePrincipal(userId: unknown, tenantId: unknown): { id: number; tenant_id: number; nickname: string } | null {
  if (!Number.isInteger(userId) || !Number.isInteger(tenantId)) return null;
  return dbGet(
    `SELECT u.id, u.tenant_id, u.nickname
     FROM users u
     INNER JOIN tenants t ON t.id = u.tenant_id
     WHERE u.id = ? AND u.tenant_id = ? AND t.status IN ('active', 'trial')`,
    [userId, tenantId]
  ) as { id: number; tenant_id: number; nickname: string } | null;
}

function parsePositiveId(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isChatMember(ws: AuthSocket, chatId: number): boolean {
  if (!ws.userId || !ws.tenantId) return false;
  return Boolean(dbGet(
    `SELECT 1
     FROM chat_members cm
     INNER JOIN chats c ON c.id = cm.chat_id AND c.tenant_id = cm.tenant_id
     WHERE cm.chat_id = ? AND cm.user_id = ? AND cm.tenant_id = ?`,
    [chatId, ws.userId, ws.tenantId]
  ));
}

function canReadMessage(ws: AuthSocket, messageId: number): boolean {
  if (!ws.userId || !ws.tenantId) return false;
  return Boolean(dbGet(
    `SELECT 1
     FROM messages m
     INNER JOIN chats c ON c.id = m.chat_id AND c.tenant_id = m.tenant_id
     INNER JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.tenant_id = m.tenant_id
     WHERE m.id = ? AND m.tenant_id = ? AND cm.user_id = ?`,
    [messageId, ws.tenantId, ws.userId]
  ));
}

async function handleMessage(ws: AuthSocket, message: any): Promise<void> {
  if (!message || typeof message.type !== "string" || !ws.userId || !ws.tenantId) {
    ws.close(1008, "Unauthenticated connection");
    return;
  }
  switch (message.type) {
    case "ping":
      ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      break;

    case "join_chat":
      {
        const chatId = parsePositiveId(message.chatId);
        if (!chatId || !isChatMember(ws, chatId)) {
          ws.send(JSON.stringify({ type: "error", message: "无权加入该群聊" }));
          return;
        }
        ws.chatId = chatId;
      }
      break;

    case "leave_chat":
      delete ws.chatId;
      break;

    case "typing":
      if (ws.chatId && isChatMember(ws, ws.chatId)) {
        broadcastToChat(ws.chatId, {
          type: "typing",
          chatId: ws.chatId,
          userId: ws.userId,
          nickname: ws.nickname,
        }, ws.userId);
      }
      break;

    case "read_message":
      {
        const messageId = parsePositiveId(message.messageId);
        if (messageId && canReadMessage(ws, messageId)) {
        dbRun(
          "INSERT OR IGNORE INTO read_receipts (message_id, user_id) VALUES (?, ?)",
            [messageId, ws.userId]
        );
        } else {
          ws.send(JSON.stringify({ type: "error", message: "无权标记该消息" }));
        }
      }
      break;
  }
}

export function broadcastToTenant(tenantId: number, data: any, excludeUserId?: number) {
  const message = JSON.stringify(data);
  clients.forEach((sockets, userId) => {
    if (userId !== excludeUserId) {
      sockets.forEach(ws => {
        if (ws.tenantId === tenantId && ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    }
  });
}

export function broadcastToChat(chatId: number, data: any, excludeUserId?: number) {
  const message = JSON.stringify(data);
  clients.forEach((sockets, userId) => {
    if (userId !== excludeUserId) {
      sockets.forEach(ws => {
        // 成员被移出群后，已有连接必须立即失去接收资格。R0 以实时复核
        // 优先保证安全；R2 再以成员变更事件和缓存失效优化性能。
        if (ws.chatId === chatId && ws.readyState === WebSocket.OPEN && isChatMember(ws, chatId)) {
          ws.send(message);
        }
      });
    }
  });
}

export function sendToUser(userId: number, data: any) {
  const message = JSON.stringify(data);
  const userClients = clients.get(userId);
  if (userClients) {
    userClients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }
}

export function getOnlineUsers(): number[] {
  return Array.from(clients.keys());
}

export function isUserOnline(userId: number): boolean {
  return clients.has(userId);
}
