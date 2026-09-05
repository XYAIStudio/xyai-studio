/**
 * V4.1 人在回路机制 - 人工审核 API 路由
 * 路径前缀：/api/reviews
 */

import express, { Request, Response } from 'express';
import { dbRun, dbGet, dbAll } from '../db';
import { authenticate } from '../middleware';

const router = express.Router();
router.use(authenticate);

// ──────────────────────────────────────
// 获取待审核列表
// ──────────────────────────────────────
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const tenantId = user.tenant_id;
    const rows = await dbAll(
      `SELECT r.*, u.nickname as initiator_name
       FROM pending_reviews r
       LEFT JOIN users u ON u.id = r.initiator_user_id
       WHERE r.tenant_id = ? AND r.status = 'pending'
       ORDER BY r.created_at DESC`,
      [tenantId]
    );
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ──────────────────────────────────────
// 获取审核详情
// ──────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const tenantId = user.tenant_id;
    const row = await dbGet(
      `SELECT r.*, u.nickname as initiator_name
       FROM pending_reviews r
       LEFT JOIN users u ON u.id = r.initiator_user_id
       WHERE r.id = ? AND r.tenant_id = ?`,
      [req.params.id, tenantId]
    );
    if (!row) return res.status(404).json({ success: false, error: '审核记录不存在' });
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ──────────────────────────────────────
// 批准 AI 方案
// ──────────────────────────────────────
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const tenantId = user.tenant_id;
    const userId = user.id;
    const { human_response } = req.body;

    const existing = await dbGet(
      'SELECT * FROM pending_reviews WHERE id = ? AND tenant_id = ?',
      [req.params.id, tenantId]
    );
    if (!existing) return res.status(404).json({ success: false, error: '审核记录不存在' });
    if (existing.status !== 'pending') {
      return res.status(400).json({ success: false, error: '该记录已处理' });
    }

    await dbRun(
      `UPDATE pending_reviews
       SET status = 'approved', human_response = ?, reviewer_user_id = ?, reviewed_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`,
      [human_response || null, userId, req.params.id, tenantId]
    );

    res.json({ success: true, message: '审核已批准' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ──────────────────────────────────────
// 驳回 AI 方案（要求重新讨论）
// ──────────────────────────────────────
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const tenantId = user.tenant_id;
    const userId = user.id;
    const { reason } = req.body;

    const existing = await dbGet(
      'SELECT * FROM pending_reviews WHERE id = ? AND tenant_id = ?',
      [req.params.id, tenantId]
    );
    if (!existing) return res.status(404).json({ success: false, error: '审核记录不存在' });

    await dbRun(
      `UPDATE pending_reviews
       SET status = 'rejected', human_response = ?, reviewer_user_id = ?, reviewed_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`,
      [reason || null, userId, req.params.id, tenantId]
    );

    res.json({ success: true, message: '审核已驳回，AI将重新讨论' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ──────────────────────────────────────
// 修改后批准
// ──────────────────────────────────────
router.post('/:id/modify', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const tenantId = user.tenant_id;
    const userId = user.id;
    const { modified_content } = req.body;

    if (!modified_content) {
      return res.status(400).json({ success: false, error: '请提供修改后的内容' });
    }

    await dbRun(
      `UPDATE pending_reviews
       SET status = 'modified', human_response = ?, reviewer_user_id = ?, reviewed_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`,
      [modified_content, userId, req.params.id, tenantId]
    );

    res.json({ success: true, message: '审核已修改并批准' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
