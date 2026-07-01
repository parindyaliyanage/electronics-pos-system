import { Router, Request, Response } from 'express';
import { query } from '../database/pool';
import { authenticate, AppError } from '../middleware';

const router = Router();
router.use(authenticate);

// GET /api/notifications
router.get('/', async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const unreadOnly = req.query.unread === 'true';
  const where = unreadOnly
    ? `WHERE user_id = $1 AND is_read = false`
    : `WHERE user_id = $1`;
  const { rows } = await query(
    `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT $2`,
    [req.user!.userId, limit]
  );
  const { rows: countRows } = await query(
    `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false`,
    [req.user!.userId]
  );
  res.json({ notifications: rows, unreadCount: parseInt(countRows[0].count) });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', async (req: Request, res: Response) => {
  const { rows } = await query(
    `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *`,
    [req.params.id, req.user!.userId]
  );
  if (rows.length === 0) throw new AppError('Notification not found', 404);
  res.json(rows[0]);
});

// PUT /api/notifications/read-all
router.put('/read-all', async (req: Request, res: Response) => {
  await query(`UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`, [req.user!.userId]);
  res.json({ message: 'All notifications marked as read' });
});

export default router;
