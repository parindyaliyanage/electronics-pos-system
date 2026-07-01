import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../database/pool';
import { authenticate, authorize, validate, AppError } from '../middleware';
import { getPaginationParams, buildPaginatedResponse } from '../utils/pagination';

const router = Router();
router.use(authenticate);

// GET /api/inventory/movements
router.get('/movements', async (req: Request, res: Response) => {
  const { page, limit, offset, search } = getPaginationParams(req);
  const productId = req.query.productId as string;
  const type = req.query.type as string;
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (search) { conditions.push(`p.name ILIKE $${idx}`); params.push(`%${search}%`); idx++; }
  if (productId) { conditions.push(`im.product_id = $${idx}`); params.push(productId); idx++; }
  if (type) { conditions.push(`im.type = $${idx}`); params.push(type); idx++; }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const countResult = await query(
    `SELECT COUNT(*) FROM inventory_movements im JOIN products p ON im.product_id = p.id ${where}`, params
  );
  const total = parseInt(countResult.rows[0].count);
  const { rows } = await query(
    `SELECT im.*, p.name as product_name, p.brand, u.full_name as created_by_name
     FROM inventory_movements im JOIN products p ON im.product_id = p.id LEFT JOIN users u ON im.created_by = u.id
     ${where} ORDER BY im.created_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
    [...params, limit, offset]
  );
  res.json(buildPaginatedResponse(rows, total, { page, limit, offset, search }));
});

// POST /api/inventory/receive (record received stock)
const receiveSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1),
  reason: z.string().optional(),
});

router.post('/receive', validate(receiveSchema), async (req: Request, res: Response) => {
  const { productId, quantity, reason } = req.body;
  const product = await query(`SELECT id, name FROM products WHERE id = $1 AND is_deleted = false`, [productId]);
  if (product.rows.length === 0) throw new AppError('Product not found', 404);
  await query(`UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2`, [quantity, productId]);
  await query(
    `INSERT INTO inventory_movements (product_id, type, quantity, reason, created_by) VALUES ($1, 'received', $2, $3, $4)`,
    [productId, quantity, reason || 'Stock received', req.user!.userId]
  );
  const { rows } = await query(`SELECT * FROM products WHERE id = $1`, [productId]);
  res.status(201).json({ message: 'Stock received', product: rows[0] });
});

// POST /api/inventory/damaged (record damaged items)
const damagedSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1),
  reason: z.string().min(1, 'Reason is required for damaged items'),
});

router.post('/damaged', validate(damagedSchema), async (req: Request, res: Response) => {
  const { productId, quantity, reason } = req.body;
  const product = await query(`SELECT id, stock_quantity FROM products WHERE id = $1 AND is_deleted = false`, [productId]);
  if (product.rows.length === 0) throw new AppError('Product not found', 404);
  if (product.rows[0].stock_quantity < quantity) throw new AppError('Insufficient stock', 400);
  await query(`UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2`, [quantity, productId]);
  await query(
    `INSERT INTO inventory_movements (product_id, type, quantity, reason, created_by) VALUES ($1, 'damaged', $2, $3, $4)`,
    [productId, -quantity, reason, req.user!.userId]
  );
  const { rows } = await query(`SELECT * FROM products WHERE id = $1`, [productId]);
  res.json({ message: 'Damaged stock recorded', product: rows[0] });
});

// POST /api/inventory/adjust (admin only)
const adjustSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int(),
  reason: z.string().min(1, 'Reason is required'),
});

router.post('/adjust', authorize('admin'), validate(adjustSchema), async (req: Request, res: Response) => {
  const { productId, quantity, reason } = req.body;
  const product = await query(`SELECT id, stock_quantity FROM products WHERE id = $1 AND is_deleted = false`, [productId]);
  if (product.rows.length === 0) throw new AppError('Product not found', 404);
  const newQty = product.rows[0].stock_quantity + quantity;
  if (newQty < 0) throw new AppError('Adjustment would result in negative stock', 400);
  await query(`UPDATE products SET stock_quantity = $1 WHERE id = $2`, [newQty, productId]);
  await query(
    `INSERT INTO inventory_movements (product_id, type, quantity, reason, created_by) VALUES ($1, 'adjustment', $2, $3, $4)`,
    [productId, quantity, reason, req.user!.userId]
  );
  const { rows } = await query(`SELECT * FROM products WHERE id = $1`, [productId]);
  res.json({ message: 'Stock adjusted', product: rows[0] });
});

export default router;
