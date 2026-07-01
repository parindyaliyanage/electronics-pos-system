import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../database/pool';
import { authenticate, authorize, validate, AppError } from '../middleware';
import { getPaginationParams, buildPaginatedResponse } from '../utils/pagination';

const router = Router();
router.use(authenticate);

// ── Schemas ──
const categorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});

// ── GET /api/categories ──
router.get('/', async (req: Request, res: Response) => {
  const { page, limit, offset, search } = getPaginationParams(req);

  let whereClause = '';
  const params: any[] = [];

  if (search) {
    whereClause = `WHERE name ILIKE $1`;
    params.push(`%${search}%`);
  }

  const countResult = await query(`SELECT COUNT(*) FROM categories ${whereClause}`, params);
  const total = parseInt(countResult.rows[0].count);

  const { rows } = await query(
    `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_deleted = false) as product_count
     FROM categories c ${whereClause}
     ORDER BY c.name ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  res.json(buildPaginatedResponse(rows, total, { page, limit, offset, search }));
});

// ── GET /api/categories/:id ──
router.get('/:id', async (req: Request, res: Response) => {
  const { rows } = await query(
    `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_deleted = false) as product_count
     FROM categories c WHERE c.id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) throw new AppError('Category not found', 404);
  res.json(rows[0]);
});

// ── POST /api/categories (admin only) ──
router.post('/', authorize('admin'), validate(categorySchema), async (req: Request, res: Response) => {
  const { name } = req.body;

  const existing = await query(`SELECT id FROM categories WHERE name = $1`, [name]);
  if (existing.rows.length > 0) throw new AppError('Category already exists', 409);

  const { rows } = await query(
    `INSERT INTO categories (name) VALUES ($1) RETURNING *`,
    [name]
  );
  res.status(201).json(rows[0]);
});

// ── PUT /api/categories/:id (admin only) ──
router.put('/:id', authorize('admin'), validate(categorySchema), async (req: Request, res: Response) => {
  const { name } = req.body;

  const dup = await query(`SELECT id FROM categories WHERE name = $1 AND id != $2`, [name, req.params.id]);
  if (dup.rows.length > 0) throw new AppError('Category name already exists', 409);

  const { rows } = await query(
    `UPDATE categories SET name = $1 WHERE id = $2 RETURNING *`,
    [name, req.params.id]
  );
  if (rows.length === 0) throw new AppError('Category not found', 404);
  res.json(rows[0]);
});

// ── DELETE /api/categories/:id (admin only) ──
router.delete('/:id', authorize('admin'), async (req: Request, res: Response) => {
  // Check if products exist in this category
  const products = await query(
    `SELECT COUNT(*) FROM products WHERE category_id = $1 AND is_deleted = false`,
    [req.params.id]
  );
  if (parseInt(products.rows[0].count) > 0) {
    throw new AppError('Cannot delete category with active products', 400);
  }

  const { rows } = await query(`DELETE FROM categories WHERE id = $1 RETURNING id`, [req.params.id]);
  if (rows.length === 0) throw new AppError('Category not found', 404);
  res.json({ message: 'Category deleted' });
});

export default router;
