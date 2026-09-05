import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware";
import { getNotifications, markNotificationRead, markAllNotificationsRead, getUnreadCount } from "../services/notification";

export const notificationRoutes = Router();
notificationRoutes.use(authenticate);

notificationRoutes.get("/", (req: AuthRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const unreadOnly = req.query.unread === "true";
    const notifications = getNotifications(req.user!.id, limit, unreadOnly);
    const unreadCount = getUnreadCount(req.user!.id);
    res.json({ success: true, data: { notifications, unreadCount } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

notificationRoutes.get("/unread-count", (req: AuthRequest, res) => {
  try {
    const count = getUnreadCount(req.user!.id);
    res.json({ success: true, data: { count } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

notificationRoutes.post("/:id/read", (req: AuthRequest, res) => {
  try {
    markNotificationRead(parseInt(req.params.id as string), req.user!.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

notificationRoutes.post("/read-all", (req: AuthRequest, res) => {
  try {
    markAllNotificationsRead(req.user!.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
