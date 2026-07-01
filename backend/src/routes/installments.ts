import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../database/pool';
import { authenticate, authorize, validate, AppError } from '../middleware';
import { getPaginationParams, buildPaginatedResponse } from '../utils/pagination';

const router = Router();
router.use(authenticate);

// GET /api/installments
router.get('/', async (req: Request, res: Response) => {
  const { page, limit, offset, search } = getPaginationParams(req);
  const status = req.query.status as string;
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (search) { conditions.push(`c.name ILIKE $${idx}`); params.push(`%${search}%`); idx++; }
  if (status) { conditions.push(`ip.status = $${idx}`); params.push(status); idx++; }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const countResult = await query(
    `SELECT COUNT(*) FROM installment_plans ip JOIN customers c ON ip.customer_id = c.id ${where}`, params
  );
  const total = parseInt(countResult.rows[0].count);
  const { rows } = await query(
    `SELECT ip.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
     FROM installment_plans ip JOIN customers c ON ip.customer_id = c.id
     ${where} ORDER BY ip.created_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
    [...params, limit, offset]
  );
  // Compute derived values on read
  const enriched = rows.map((plan: any) => {
    const principal = Number(plan.principal);
    const rate = Number(plan.interest_rate);
    const totalInterest = principal * (rate / 100);
    const totalRepayment = principal + totalInterest;
    return { ...plan, total_interest: totalInterest, total_repayment: totalRepayment };
  });
  res.json(buildPaginatedResponse(enriched, total, { page, limit, offset, search }));
});

// GET /api/installments/:id
router.get('/:id', async (req: Request, res: Response) => {
  const { rows } = await query(
    `SELECT ip.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email, c.address as customer_address
     FROM installment_plans ip JOIN customers c ON ip.customer_id = c.id WHERE ip.id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) throw new AppError('Installment plan not found', 404);
  const plan = rows[0];
  const principal = Number(plan.principal);
  const rate = Number(plan.interest_rate);
  const totalInterest = principal * (rate / 100);
  const totalRepayment = principal + totalInterest;

  const { rows: payments } = await query(
    `SELECT * FROM installment_payments WHERE plan_id = $1 ORDER BY paid_at DESC`, [req.params.id]
  );
  const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);

  res.json({ ...plan, total_interest: totalInterest, total_repayment: totalRepayment, total_paid: totalPaid, payments });
});

// POST /api/installments/:id/pay
const paySchema = z.object({
  amount: z.number().positive(),
});

router.post('/:id/pay', validate(paySchema), async (req: Request, res: Response) => {
  const { amount } = req.body;
  const planId = req.params.id;

  const { rows } = await query(`SELECT * FROM installment_plans WHERE id = $1`, [planId]);
  if (rows.length === 0) throw new AppError('Plan not found', 404);
  const plan = rows[0];
  if (plan.status === 'completed') throw new AppError('Plan already completed', 400);
  if (plan.status === 'defaulted') throw new AppError('Plan is defaulted', 400);

  const remaining = Number(plan.remaining_balance);
  if (amount > remaining) throw new AppError(`Amount exceeds remaining balance (${remaining.toFixed(2)})`, 400);

  // Record payment
  const { rows: [payment] } = await query(
    `INSERT INTO installment_payments (plan_id, amount) VALUES ($1, $2) RETURNING *`,
    [planId, amount]
  );

  const newRemaining = remaining - amount;
  const newStatus = newRemaining <= 0.01 ? 'completed' : plan.status;
  // Advance next_due_date by 1 month if not completed
  const nextDueUpdate = newStatus === 'completed'
    ? `next_due_date = next_due_date`
    : `next_due_date = (next_due_date + INTERVAL '1 month')::date`;

  await query(
    `UPDATE installment_plans SET remaining_balance = $1, status = $2, ${nextDueUpdate} WHERE id = $3`,
    [Math.max(0, newRemaining), newStatus, planId]
  );

  // Notify if completed
  if (newStatus === 'completed') {
    await query(
      `INSERT INTO notifications (user_id, type, title, message, metadata)
       SELECT id, 'installment_completed', 'Installment Completed', $1, $2
       FROM users WHERE role = 'admin' AND is_active = true`,
      [`Installment plan for customer completed. Plan ID: ${planId}`, JSON.stringify({ plan_id: planId })]
    );
  }

  res.json({ payment, newRemaining: Math.max(0, newRemaining), status: newStatus });
});

// GET /api/installments/overdue (admin view)
router.get('/status/overdue', async (_req: Request, res: Response) => {
  const { rows } = await query(
    `SELECT ip.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
     FROM installment_plans ip JOIN customers c ON ip.customer_id = c.id
     WHERE ip.status IN ('overdue', 'active') AND ip.next_due_date < CURRENT_DATE
     ORDER BY ip.next_due_date ASC`
  );
  res.json(rows);
});

export default router;
