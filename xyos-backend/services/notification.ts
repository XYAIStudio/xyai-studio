import { dbRun, dbGet, dbAll } from "../db";
import { sendToUser } from "./websocket";

export interface NotificationData {
  userId: number;
  type: string;
  title: string;
  content: string;
  link?: string;
  tenantId?: number;
}

export function createNotification(data: NotificationData) {
  const result = dbRun(
    "INSERT INTO notifications (user_id, type, title, content, link, tenant_id) VALUES (?, ?, ?, ?, ?, ?)",
    [data.userId, data.type, data.title, data.content, data.link || null, data.tenantId || 1]
  );

  sendToUser(data.userId, {
    type: "notification",
    id: result.lastInsertRowid,
    userId: data.userId,
    notificationType: data.type,
    title: data.title,
    content: data.content,
    link: data.link,
    read: 0,
    created_at: new Date().toISOString(),
  });

  return result.lastInsertRowid;
}

export function getNotifications(userId: number, limit = 20, unreadOnly = false) {
  let sql = "SELECT * FROM notifications WHERE user_id = ?";
  const params: any[] = [userId];
  if (unreadOnly) sql += " AND read = 0";
  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);
  return dbAll(sql, params);
}

export function markNotificationRead(notificationId: number, userId: number) {
  dbRun("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?", [notificationId, userId]);
}

export function markAllNotificationsRead(userId: number) {
  dbRun("UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0", [userId]);
}

export function getUnreadCount(userId: number): number {
  const result = dbGet("SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0", [userId]) as any;
  return result?.c || 0;
}

export function notifyTaskAssigned(taskId: number, taskTitle: string, assigneeId: number, assignerName: string) {
  createNotification({
    userId: assigneeId,
    type: "task_assigned",
    title: "新任务分配",
    content: `${assignerName} 给您分配了新任务：${taskTitle}`,
    link: `/tasks`,
  });
}

export function notifyTaskStatusChanged(taskId: number, taskTitle: string, newStatus: string, creatorId: number, updaterName: string) {
  const statusLabels: Record<string, string> = {
    in_progress: "开始执行",
    review: "提交评审",
    done: "已完成",
  };

  createNotification({
    userId: creatorId,
    type: "task_status",
    title: "任务状态更新",
    content: `${updaterName} 将任务「${taskTitle}」标记为${statusLabels[newStatus] || newStatus}`,
    link: `/tasks`,
  });
}

export function notifyChatMention(chatId: number, chatTitle: string, mentionedUserId: number, senderName: string) {
  createNotification({
    userId: mentionedUserId,
    type: "chat_mention",
    title: "聊天提及",
    content: `${senderName} 在「${chatTitle}」中提到了您`,
    link: `/chat`,
  });
}

export function logActivity(data: {
  userId?: number;
  employeeId?: number;
  action: string;
  entityType?: string;
  entityId?: number;
  details?: string;
  tenantId?: number;
  targetType?: string;
  targetId?: number | string;
}) {
  dbRun(
    "INSERT INTO activity_logs (user_id, employee_id, action, entity_type, entity_id, details, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [data.userId || null, data.employeeId || null, data.action, data.entityType || null, data.entityId || null, data.details || null, data.tenantId || 1]
  );
}

export function getRecentActivities(tenantId: number, limit = 50) {
  return dbAll(
    `SELECT al.*, 
      CASE WHEN al.user_id IS NOT NULL THEN (SELECT nickname FROM users WHERE id = al.user_id) ELSE NULL END as user_name,
      CASE WHEN al.employee_id IS NOT NULL THEN (SELECT name FROM employees WHERE id = al.employee_id) ELSE NULL END as employee_name
     FROM activity_logs al 
     WHERE al.tenant_id = ? 
     ORDER BY al.created_at DESC LIMIT ?`,
    [tenantId, limit]
  );
}
