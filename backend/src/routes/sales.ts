import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, transaction } from '../database/pool';
import { authenticate, validate, AppError } from '../middleware';
import { getPaginationParams, buildPaginatedResponse } from '../utils/pagination';

const router = Router();
router.use(authenticate);

const saleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1),
});

const createSaleSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  items: z.array(saleItemSchema).min(1),
  discount: z.number().min(0).default(0),
  paymentMethod: z.enum(['cash', 'card', 'bank_transfer', 'online', 'installment']),
  // Installment fields (required when paymentMethod = 'installment')
  installmentDuration: z.number().int().optional(),
});

// GET /api/sales
router.get('/', async (req: Request, res: Response) => {
  const { page, limit, offset, search } = getPaginationParams(req);
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (search) {
    conditions.push(`(c.name ILIKE $${idx} OR s.id::text ILIKE $${idx})`);
    params.push(`%${search}%`); idx++;
  }
  const dateFrom = req.query.dateFrom as string;
  const dateTo = req.query.dateTo as string;
  if (dateFrom) { conditions.push(`s.sale_date >= $${idx}`); params.push(dateFrom); idx++; }
  if (dateTo) { conditions.push(`s.sale_date <= $${idx}`); params.push(dateTo); idx++; }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const countResult = await query(`SELECT COUNT(*) FROM sales s LEFT JOIN customers c ON s.customer_id = c.id ${where}`, params);
  const total = parseInt(countResult.rows[0].count);
  const { rows } = await query(
    `SELECT s.*, c.name as customer_name, c.phone as customer_phone, u.full_name as employee_name
     FROM sales s LEFT JOIN customers c ON s.customer_id = c.id JOIN users u ON s.employee_id = u.id
     ${where} ORDER BY s.sale_date DESC LIMIT $${idx} OFFSET $${idx+1}`,
    [...params, limit, offset]
  );
  res.json(buildPaginatedResponse(rows, total, { page, limit, offset, search }));
});

// GET /api/sales/:id
router.get('/:id', async (req: Request, res: Response) => {
  const { rows: saleRows } = await query(
    `SELECT s.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email, c.address as customer_address, u.full_name as employee_name
     FROM sales s LEFT JOIN customers c ON s.customer_id = c.id JOIN users u ON s.employee_id = u.id WHERE s.id = $1`,
    [req.params.id]
  );
  if (saleRows.length === 0) throw new AppError('Sale not found', 404);
  const { rows: items } = await query(
    `SELECT si.*, p.name as product_name, p.brand, p.model_number FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = $1`,
    [req.params.id]
  );
  const { rows: payments } = await query(`SELECT * FROM payments WHERE sale_id = $1 ORDER BY paid_at`, [req.params.id]);
  const { rows: plans } = await query(`SELECT * FROM installment_plans WHERE sale_id = $1`, [req.params.id]);
  res.json({ ...saleRows[0], items, payments, installmentPlan: plans[0] || null });
});

// POST /api/sales
router.post('/', validate(createSaleSchema), async (req: Request, res: Response) => {
  const { customerId, items, discount, paymentMethod, installmentDuration } = req.body;
  const employeeId = req.user!.userId;

  // Validate installment requirements
  if (paymentMethod === 'installment') {
    if (!customerId) throw new AppError('Customer required for installment', 400);
    if (!installmentDuration) throw new AppError('Duration required for installment', 400);
  }

  const result = await transaction(async (txQuery) => {
    // Get tax rate
    const { rows: settingsRows } = await txQuery(`SELECT value FROM settings WHERE key = 'tax_rate'`);
    const taxRate = settingsRows.length > 0 ? parseFloat(settingsRows[0].value) : 0;

    // Validate products and calculate subtotal
    let subtotal = 0;
    const saleItems: Array<{ productId: string; quantity: number; unitPrice: number }> = [];

    for (const item of items) {
      const { rows: productRows } = await txQuery(
        `SELECT id, selling_price, stock_quantity, name FROM products WHERE id = $1 AND is_deleted = false FOR UPDATE`,
        [item.productId]
      );
      if (productRows.length === 0) throw new AppError(`Product ${item.productId} not found`, 404);
      const product = productRows[0];
      if (product.stock_quantity < item.quantity) {
        throw new AppError(`Insufficient stock for ${product.name} (available: ${product.stock_quantity})`, 400);
      }
      const unitPrice = Number(product.selling_price);
      subtotal += unitPrice * item.quantity;
      saleItems.push({ productId: item.productId, quantity: item.quantity, unitPrice });
    }

    const tax = subtotal * (taxRate / 100);
    const total = subtotal - discount + tax;

    // Create sale
    const { rows: [sale] } = await txQuery(
      `INSERT INTO sales (customer_id, employee_id, subtotal, discount, tax, total, payment_method) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [customerId || null, employeeId, subtotal, discount, tax, total, paymentMethod]
    );

    // Create sale items and deduct stock
    for (const item of saleItems) {
      await txQuery(`INSERT INTO sale_items (sale_id, product_id, quantity, unit_price) VALUES ($1,$2,$3,$4)`, [sale.id, item.productId, item.quantity, item.unitPrice]);
      await txQuery(`UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2`, [item.quantity, item.productId]);
      await txQuery(`INSERT INTO inventory_movements (product_id, type, quantity, reason, created_by) VALUES ($1, 'sold', $2, $3, $4)`, [item.productId, -item.quantity, `Sale ${sale.id}`, employeeId]);
    }

    // Handle payment
    if (paymentMethod !== 'installment') {
      await txQuery(`INSERT INTO payments (sale_id, amount, method) VALUES ($1,$2,$3)`, [sale.id, total, paymentMethod]);
    } else {
      // Installment plan
      const { rows: rateRows } = await txQuery(
        `SELECT id, rate FROM interest_rates WHERE duration_months = $1 AND is_active = true LIMIT 1`,
        [installmentDuration]
      );
      if (rateRows.length === 0) throw new AppError(`No active interest rate for ${installmentDuration} months`, 400);
      const rateId = rateRows[0].id;
      const rateValue = Number(rateRows[0].rate);
      const totalInterest = total * (rateValue / 100);
      const totalRepayment = total + totalInterest;
      const monthlyPayment = Math.round((totalRepayment / installmentDuration!) * 100) / 100;

      await txQuery(
        `INSERT INTO installment_plans (sale_id, customer_id, interest_rate_id, principal, interest_rate, duration_months, monthly_payment, remaining_balance, next_due_date, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,(CURRENT_DATE + INTERVAL '1 month')::date,'active')`,
        [sale.id, customerId, rateId, total, rateValue, installmentDuration, monthlyPayment, totalRepayment]
      );
    }

    // Check low stock and create notifications
    for (const item of saleItems) {
      const { rows: stockRows } = await txQuery(`SELECT stock_quantity, reorder_level, name FROM products WHERE id = $1`, [item.productId]);
      if (stockRows.length > 0) {
        const p = stockRows[0];
        if (p.stock_quantity <= p.reorder_level) {
          const type = p.stock_quantity === 0 ? 'out_of_stock' : 'low_stock';
          const title = p.stock_quantity === 0 ? 'Out of Stock' : 'Low Stock Alert';
          const msg = p.stock_quantity === 0 ? `${p.name} is out of stock` : `${p.name} is low (${p.stock_quantity} remaining, reorder at ${p.reorder_level})`;
          // Notify all admins
          await txQuery(
            `INSERT INTO notifications (user_id, type, title, message, metadata)
             SELECT id, $1, $2, $3, $4 FROM users WHERE role = 'admin' AND is_active = true`,
            [type, title, msg, JSON.stringify({ product_id: item.productId, current_stock: p.stock_quantity })]
          );
        }
      }
    }

    return sale;
  });

  // Fetch full sale details
  const { rows: saleRows } = await query(
    `SELECT s.*, c.name as customer_name, u.full_name as employee_name FROM sales s LEFT JOIN customers c ON s.customer_id = c.id JOIN users u ON s.employee_id = u.id WHERE s.id = $1`,
    [result.id]
  );
  res.status(201).json(saleRows[0]);
});

export default router;
