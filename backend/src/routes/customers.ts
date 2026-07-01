import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../database/pool';
import { authenticate, validate, AppError } from '../middleware';
import { getPaginationParams, buildPaginatedResponse } from '../utils/pagination';

const router = Router();
router.use(authenticate);

const createCustomerSchema = z.object({
  name: z.string().min(1).max(255),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
});
const updateCustomerSchema = createCustomerSchema.partial();

// GET /api/customers
router.get('/', async (req: Request, res: Response) => {
  const { page, limit, offset, search } = getPaginationParams(req);
  let where = ''; const params: any[] = [];
  if (search) { where = `WHERE name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1`; params.push(`%${search}%`); }
  const countResult = await query(`SELECT COUNT(*) FROM customers ${where}`, params);
  const total = parseInt(countResult.rows[0].count);
  const { rows } = await query(
    `SELECT * FROM customers ${where} ORDER BY created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
    [...params, limit, offset]
  );
  res.json(buildPaginatedResponse(rows, total, { page, limit, offset, search }));
});

// GET /api/customers/:id
router.get('/:id', async (req: Request, res: Response) => {
  const { rows } = await query(`SELECT * FROM customers WHERE id = $1`, [req.params.id]);
  if (rows.length === 0) throw new AppError('Customer not found', 404);
  res.json(rows[0]);
});

// GET /api/customers/:id/purchases
router.get('/:id/purchases', async (req: Request, res: Response) => {
  const { rows } = await query(
    `SELECT s.*, u.full_name as employee_name FROM sales s JOIN users u ON s.employee_id = u.id WHERE s.customer_id = $1 ORDER BY s.sale_date DESC`,
    [req.params.id]
  );
  res.json(rows);
});

// GET /api/customers/:id/installments
router.get('/:id/installments', async (req: Request, res: Response) => {
  const { rows } = await query(
    `SELECT ip.*, ir.duration_months as rate_duration FROM installment_plans ip LEFT JOIN interest_rates ir ON ip.interest_rate_id = ir.id WHERE ip.customer_id = $1 ORDER BY ip.created_at DESC`,
    [req.params.id]
  );
  res.json(rows);
});

// POST /api/customers
router.post('/', validate(createCustomerSchema), async (req: Request, res: Response) => {
  const { name, phone, email, address } = req.body;
  const { rows } = await query(
    `INSERT INTO customers (name, phone, email, address) VALUES ($1,$2,$3,$4) RETURNING *`,
    [name, phone||null, email||null, address||null]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/customers/:id
router.put('/:id', validate(updateCustomerSchema), async (req: Request, res: Response) => {
  const b = req.body; const updates: string[] = []; const params: any[] = []; let i = 1;
  if (b.name !== undefined) { updates.push(`name = $${i++}`); params.push(b.name); }
  if (b.phone !== undefined) { updates.push(`phone = $${i++}`); params.push(b.phone); }
  if (b.email !== undefined) { updates.push(`email = $${i++}`); params.push(b.email); }
  if (b.address !== undefined) { updates.push(`address = $${i++}`); params.push(b.address); }
  if (updates.length === 0) throw new AppError('No fields to update', 400);
  params.push(req.params.id);
  const { rows } = await query(`UPDATE customers SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`, params);
  if (rows.length === 0) throw new AppError('Customer not found', 404);
  res.json(rows[0]);
});

export default router;
