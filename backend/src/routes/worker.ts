import { Router, Request, Response } from 'express';
import { query } from '../database/pool';
import { authenticate, authorize } from '../middleware';

const router = Router();
router.use(authenticate, authorize('worker'));

// GET /api/worker/dashboard
router.get('/dashboard', async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const [todaySales, recentOrders, lowStock, recentPayments] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(total), 0) as revenue, COUNT(*) as count
       FROM sales WHERE employee_id = $1 AND sale_date::date = CURRENT_DATE`,
      [userId]
    ),
    query(
      `SELECT s.id, s.total, s.payment_method, s.sale_date, c.name as customer_name
       FROM sales s LEFT JOIN customers c ON s.customer_id = c.id
       WHERE s.employee_id = $1 ORDER BY s.sale_date DESC LIMIT 10`,
      [userId]
    ),
    query(
      `SELECT id, name, brand, stock_quantity, reorder_level
       FROM products WHERE is_deleted = false AND stock_quantity <= reorder_level
       ORDER BY stock_quantity ASC LIMIT 10`
    ),
    query(
      `SELECT ip.amount, ip.paid_at, c.name as customer_name, ipl.id as plan_id
       FROM installment_payments ip
       JOIN installment_plans ipl ON ip.plan_id = ipl.id
       JOIN customers c ON ipl.customer_id = c.id
       ORDER BY ip.paid_at DESC LIMIT 10`
    ),
  ]);

  res.json({
    todayRevenue: Number(todaySales.rows[0].revenue),
    todaySalesCount: parseInt(todaySales.rows[0].count),
    recentOrders: recentOrders.rows,
    lowStockProducts: lowStock.rows,
    recentPayments: recentPayments.rows,
  });
});

export default router;
