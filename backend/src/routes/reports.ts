import { Router, Request, Response } from 'express';
import { query } from '../database/pool';
import { authenticate, authorize } from '../middleware';

const router = Router();
router.use(authenticate, authorize('admin'));

// GET /api/reports/dashboard
router.get('/dashboard', async (_req: Request, res: Response) => {
  const [revenue, customers, products, inventory, installments, overdue, todaySales] = await Promise.all([
    query(`SELECT COALESCE(SUM(total), 0) as total_revenue FROM sales`),
    query(`SELECT COUNT(*) as total FROM customers`),
    query(`SELECT COUNT(*) as total FROM products WHERE is_deleted = false`),
    query(`SELECT COALESCE(SUM(stock_quantity * purchase_cost), 0) as value FROM products WHERE is_deleted = false`),
    query(`SELECT COUNT(*) as total FROM installment_plans WHERE status = 'active'`),
    query(`SELECT COUNT(*) as total FROM installment_plans WHERE status IN ('overdue') OR (status = 'active' AND next_due_date < CURRENT_DATE)`),
    query(`SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count FROM sales WHERE sale_date::date = CURRENT_DATE`),
  ]);
  res.json({
    totalRevenue: Number(revenue.rows[0].total_revenue),
    totalCustomers: parseInt(customers.rows[0].total),
    totalProducts: parseInt(products.rows[0].total),
    inventoryValue: Number(inventory.rows[0].value),
    activeInstallments: parseInt(installments.rows[0].total),
    overduePayments: parseInt(overdue.rows[0].total),
    todayRevenue: Number(todaySales.rows[0].total),
    todaySalesCount: parseInt(todaySales.rows[0].count),
  });
});

// GET /api/reports/sales-chart?period=daily|weekly|monthly
router.get('/sales-chart', async (req: Request, res: Response) => {
  const period = (req.query.period as string) || 'daily';
  let groupBy: string, dateFormat: string, interval: string;
  switch (period) {
    case 'weekly':
      groupBy = `date_trunc('week', sale_date)`;
      dateFormat = `to_char(date_trunc('week', sale_date), 'YYYY-MM-DD')`;
      interval = '12 weeks';
      break;
    case 'monthly':
      groupBy = `date_trunc('month', sale_date)`;
      dateFormat = `to_char(date_trunc('month', sale_date), 'YYYY-MM')`;
      interval = '12 months';
      break;
    default:
      groupBy = `sale_date::date`;
      dateFormat = `to_char(sale_date::date, 'YYYY-MM-DD')`;
      interval = '30 days';
  }
  const { rows } = await query(
    `SELECT ${dateFormat} as period, COALESCE(SUM(total), 0) as revenue, COUNT(*) as count
     FROM sales WHERE sale_date >= NOW() - INTERVAL '${interval}'
     GROUP BY ${groupBy} ORDER BY ${groupBy} ASC`
  );
  res.json(rows);
});

// GET /api/reports/top-products
router.get('/top-products', async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const { rows } = await query(
    `SELECT p.id, p.name, p.brand, SUM(si.quantity) as total_sold, SUM(si.quantity * si.unit_price) as total_revenue
     FROM sale_items si JOIN products p ON si.product_id = p.id
     GROUP BY p.id, p.name, p.brand ORDER BY total_sold DESC LIMIT $1`,
    [limit]
  );
  res.json(rows);
});

// GET /api/reports/revenue-summary
router.get('/revenue-summary', async (_req: Request, res: Response) => {
  const { rows } = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN sale_date::date = CURRENT_DATE THEN total ELSE 0 END), 0) as today,
       COALESCE(SUM(CASE WHEN sale_date >= date_trunc('week', CURRENT_DATE) THEN total ELSE 0 END), 0) as this_week,
       COALESCE(SUM(CASE WHEN sale_date >= date_trunc('month', CURRENT_DATE) THEN total ELSE 0 END), 0) as this_month,
       COALESCE(SUM(total), 0) as all_time
     FROM sales`
  );
  const { rows: outstandingRows } = await query(
    `SELECT COALESCE(SUM(remaining_balance), 0) as outstanding FROM installment_plans WHERE status IN ('active', 'overdue')`
  );
  res.json({ ...rows[0], outstanding_installments: Number(outstandingRows[0].outstanding) });
});

export default router;
