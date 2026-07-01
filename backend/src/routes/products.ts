import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { query } from '../database/pool';
import { authenticate, authorize, validate, AppError } from '../middleware';
import { getPaginationParams, buildPaginatedResponse } from '../utils/pagination';
import { config } from '../config';

const router = Router();
router.use(authenticate);

// Multer setup
const uploadDir = path.resolve(config.upload.dir);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `product-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: config.upload.maxFileSize } });

// Schemas
const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  categoryId: z.string().uuid().optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  modelNumber: z.string().max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  purchaseCost: z.number().min(0),
  sellingPrice: z.number().min(0),
  stockQuantity: z.number().int().min(0).default(0),
  reorderLevel: z.number().int().min(0).default(5),
  warrantyMonths: z.number().int().min(0).default(0),
});
const updateProductSchema = createProductSchema.partial();

// GET /api/products
router.get('/', async (req: Request, res: Response) => {
  const { page, limit, offset, search } = getPaginationParams(req);
  const categoryId = req.query.categoryId as string | undefined;
  const stockStatus = req.query.stockStatus as string | undefined;
  const conditions: string[] = ['p.is_deleted = false'];
  const params: any[] = [];
  let idx = 1;
  if (search) { conditions.push(`(p.name ILIKE $${idx} OR p.brand ILIKE $${idx} OR p.model_number ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
  if (categoryId) { conditions.push(`p.category_id = $${idx}`); params.push(categoryId); idx++; }
  if (stockStatus === 'out') conditions.push(`p.stock_quantity = 0`);
  else if (stockStatus === 'low') conditions.push(`p.stock_quantity > 0 AND p.stock_quantity <= p.reorder_level`);
  else if (stockStatus === 'in') conditions.push(`p.stock_quantity > p.reorder_level`);
  const where = `WHERE ${conditions.join(' AND ')}`;
  const countResult = await query(`SELECT COUNT(*) FROM products p ${where}`, params);
  const total = parseInt(countResult.rows[0].count);
  const { rows } = await query(
    `SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id ${where} ORDER BY p.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );
  res.json(buildPaginatedResponse(rows, total, { page, limit, offset, search }));
});

// GET /api/products/low-stock
router.get('/low-stock', async (_req: Request, res: Response) => {
  const { rows } = await query(
    `SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_deleted = false AND p.stock_quantity <= p.reorder_level ORDER BY p.stock_quantity ASC`
  );
  res.json(rows);
});

// GET /api/products/:id
router.get('/:id', async (req: Request, res: Response) => {
  const { rows } = await query(
    `SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = $1 AND p.is_deleted = false`, [req.params.id]
  );
  if (rows.length === 0) throw new AppError('Product not found', 404);
  res.json(rows[0]);
});

// POST /api/products (admin)
router.post('/', authorize('admin'), validate(createProductSchema), async (req: Request, res: Response) => {
  const b = req.body;
  const { rows } = await query(
    `INSERT INTO products (name, category_id, brand, model_number, description, purchase_cost, selling_price, stock_quantity, reorder_level, warranty_months) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [b.name, b.categoryId||null, b.brand, b.modelNumber, b.description, b.purchaseCost, b.sellingPrice, b.stockQuantity, b.reorderLevel, b.warrantyMonths]
  );
  if (b.stockQuantity > 0) {
    await query(`INSERT INTO inventory_movements (product_id, type, quantity, reason, created_by) VALUES ($1, 'received', $2, 'Initial stock', $3)`, [rows[0].id, b.stockQuantity, req.user!.userId]);
  }
  res.status(201).json(rows[0]);
});

// POST /api/products/:id/image (admin)
router.post('/:id/image', authorize('admin'), upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) throw new AppError('No image', 400);
  const { rows } = await query(`UPDATE products SET image_url = $1 WHERE id = $2 AND is_deleted = false RETURNING *`, [`/uploads/${req.file.filename}`, req.params.id]);
  if (rows.length === 0) throw new AppError('Product not found', 404);
  res.json(rows[0]);
});

// PUT /api/products/:id (admin)
router.put('/:id', authorize('admin'), validate(updateProductSchema), async (req: Request, res: Response) => {
  const existing = await query(`SELECT * FROM products WHERE id = $1 AND is_deleted = false`, [req.params.id]);
  if (existing.rows.length === 0) throw new AppError('Product not found', 404);
  const b = req.body; const updates: string[] = []; const params: any[] = []; let i = 1;
  if (b.name !== undefined) { updates.push(`name = $${i++}`); params.push(b.name); }
  if (b.categoryId !== undefined) { updates.push(`category_id = $${i++}`); params.push(b.categoryId); }
  if (b.brand !== undefined) { updates.push(`brand = $${i++}`); params.push(b.brand); }
  if (b.modelNumber !== undefined) { updates.push(`model_number = $${i++}`); params.push(b.modelNumber); }
  if (b.description !== undefined) { updates.push(`description = $${i++}`); params.push(b.description); }
  if (b.purchaseCost !== undefined) { updates.push(`purchase_cost = $${i++}`); params.push(b.purchaseCost); }
  if (b.sellingPrice !== undefined) { updates.push(`selling_price = $${i++}`); params.push(b.sellingPrice); }
  if (b.reorderLevel !== undefined) { updates.push(`reorder_level = $${i++}`); params.push(b.reorderLevel); }
  if (b.warrantyMonths !== undefined) { updates.push(`warranty_months = $${i++}`); params.push(b.warrantyMonths); }
  if (b.stockQuantity !== undefined) {
    const diff = b.stockQuantity - existing.rows[0].stock_quantity;
    if (diff !== 0) {
      updates.push(`stock_quantity = $${i++}`); params.push(b.stockQuantity);
      await query(`INSERT INTO inventory_movements (product_id, type, quantity, reason, created_by) VALUES ($1, 'adjustment', $2, 'Manual adjustment', $3)`, [req.params.id, diff, req.user!.userId]);
    }
  }
  if (updates.length === 0) throw new AppError('No fields to update', 400);
  params.push(req.params.id);
  const { rows } = await query(`UPDATE products SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`, params);
  res.json(rows[0]);
});

// DELETE /api/products/:id (admin, soft)
router.delete('/:id', authorize('admin'), async (req: Request, res: Response) => {
  const { rows } = await query(`UPDATE products SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING id`, [req.params.id]);
  if (rows.length === 0) throw new AppError('Product not found', 404);
  res.json({ message: 'Product deleted' });
});

export default router;
