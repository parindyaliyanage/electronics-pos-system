import { Router, Request, Response } from 'express';
import { query } from '../database/pool';
import { authenticate, AppError } from '../middleware';
import { getPaginationParams, buildPaginatedResponse } from '../utils/pagination';

const router = Router();
router.use(authenticate);

// GET /api/payments
router.get('/', async (req: Request, res: Response) => {
  const { page, limit, offset, search } = getPaginationParams(req);
  const method = req.query.method as string;
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (search) { conditions.push(`(c.name ILIKE $${idx} OR s.id::text ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
  if (method) { conditions.push(`p.method = $${idx}`); params.push(method); idx++; }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const countResult = await query(
    `SELECT COUNT(*) FROM payments p JOIN sales s ON p.sale_id = s.id LEFT JOIN customers c ON s.customer_id = c.id ${where}`, params
  );
  const total = parseInt(countResult.rows[0].count);
  const { rows } = await query(
    `SELECT p.*, s.total as sale_total, c.name as customer_name
     FROM payments p JOIN sales s ON p.sale_id = s.id LEFT JOIN customers c ON s.customer_id = c.id
     ${where} ORDER BY p.paid_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
    [...params, limit, offset]
  );
  res.json(buildPaginatedResponse(rows, total, { page, limit, offset, search }));
});

export default router;
