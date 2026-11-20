import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentMethod, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { periodBounds, todayIn } from "../reports/report-period";

type D = Prisma.Decimal;

/** How many rows the dashboard's overdue and low-stock lists show. */
export const DASHBOARD_LIST_LIMIT = 10;

const zero = () => new Prisma.Decimal(0);

/**
 * Administrator dashboard summary (SRS 3.9.1): today's sales, outstanding
 * installment balance, low-stock items and overdue installments, plus short
 * lists behind the last two cards. Uses the same rules as the FR8 reports
 * (net revenue, stock = sum of movements, outstanding = amount - allocations,
 * "today" in the store time zone), so the figures agree with them.
 */
@Injectable()
export class DashboardService {
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.timeZone = config.get("STORE_TIMEZONE") ?? "Asia/Colombo";
  }

  async summary(now = new Date()) {
    const tz = this.timeZone;
    const today = todayIn(tz, now);
    const { start, end } = periodBounds({ from: today, to: today }, tz);

    // Unpaid part of every installment on an active plan.
    const openSchedules = Prisma.sql`
      SELECT s.id, s.plan_id, s.due_date, s.amount, s.status,
             sa.customer_id, cu.full_name AS customer, cu.phone,
             COALESCE((SELECT SUM(a.amount_applied) FROM payment_allocations a WHERE a.schedule_id = s.id), 0) AS paid
        FROM installment_schedules s
        JOIN installment_plans p ON p.id = s.plan_id
        JOIN sales sa ON sa.id = p.sale_id
        JOIN customers cu ON cu.id = sa.customer_id
       WHERE p.status = 'ACTIVE' AND s.status <> 'PAID'`;

    const stock = Prisma.sql`
      SELECT p.id, p.name, c.name AS category, p.low_stock_threshold AS threshold,
             COALESCE((SELECT SUM(m.quantity) FROM stock_movements m WHERE m.product_id = p.id), 0)::int AS stock
        FROM products p JOIN categories c ON c.id = p.category_id
       WHERE p.active = true`;

    const [[sales], received, [installments], overdueList, [lowCount], lowList] = await Promise.all([
      this.prisma.$queryRaw<Array<{ count: number; units: number; revenue: D | null }>>`
        SELECT COUNT(DISTINCT s.id)::int AS count, COALESCE(SUM(si.quantity), 0)::int AS units,
               SUM((si.unit_price - si.discount) * si.quantity) AS revenue
          FROM sales s JOIN sale_items si ON si.sale_id = s.id
         WHERE s.created_at >= ${start} AND s.created_at < ${end}`,
      this.prisma.$queryRaw<Array<{ method: PaymentMethod; total: D }>>`
        SELECT method, SUM(amount) AS total FROM payments
         WHERE created_at >= ${start} AND created_at < ${end}
         GROUP BY method`,
      this.prisma.$queryRaw<Array<{
        active_plans: number; outstanding: D | null; overdue_count: number; overdue_amount: D | null; overdue_customers: number;
      }>>`
        WITH s AS (${openSchedules})
        SELECT (SELECT COUNT(*)::int FROM installment_plans WHERE status = 'ACTIVE') AS active_plans,
               SUM(GREATEST(amount - paid, 0)) AS outstanding,
               COUNT(*) FILTER (WHERE status = 'OVERDUE')::int AS overdue_count,
               SUM(GREATEST(amount - paid, 0)) FILTER (WHERE status = 'OVERDUE') AS overdue_amount,
               COUNT(DISTINCT customer_id) FILTER (WHERE status = 'OVERDUE')::int AS overdue_customers
          FROM s`,
      this.prisma.$queryRaw<Array<{
        id: string; plan_id: string; due_date: string; amount: D; paid: D;
        customer_id: string; customer: string; phone: string; days: number;
      }>>`
        WITH s AS (${openSchedules})
        SELECT id, plan_id, to_char(due_date, 'YYYY-MM-DD') AS due_date, amount, paid,
               customer_id, customer, phone, (${today}::date - due_date)::int AS days
          FROM s WHERE status = 'OVERDUE'
         ORDER BY due_date, customer LIMIT ${DASHBOARD_LIST_LIMIT}`,
      this.prisma.$queryRaw<Array<{ count: number }>>`
        WITH st AS (${stock}) SELECT COUNT(*)::int AS count FROM st WHERE stock < threshold`,
      this.prisma.$queryRaw<Array<{ id: string; name: string; category: string; threshold: number; stock: number }>>`
        WITH st AS (${stock})
        SELECT * FROM st WHERE stock < threshold
         ORDER BY (threshold - stock) DESC, name LIMIT ${DASHBOARD_LIST_LIMIT}`,
    ]);

    const byMethod = Object.fromEntries(Object.values(PaymentMethod).map((m) => [m, zero()])) as Record<PaymentMethod, D>;
    for (const row of received) byMethod[row.method] = new Prisma.Decimal(row.total);
    const receivedTotal = Object.values(byMethod).reduce((acc, v) => acc.plus(v), zero());
    const revenue = new Prisma.Decimal(sales.revenue ?? 0);

    return {
      date: today,
      timeZone: tz,
      generatedAt: now.toISOString(),
      todaySales: {
        count: sales.count,
        units: sales.units,
        netRevenue: revenue,
        averageSale: sales.count ? revenue.div(sales.count).toDecimalPlaces(2) : zero(),
      },
      // Money actually taken today (full payments, deposits and installments).
      receivedToday: { total: receivedTotal, byMethod },
      installments: {
        activePlans: installments.active_plans,
        outstandingBalance: new Prisma.Decimal(installments.outstanding ?? 0),
        overdueInstallments: installments.overdue_count,
        overdueAmount: new Prisma.Decimal(installments.overdue_amount ?? 0),
        overdueCustomers: installments.overdue_customers,
      },
      lowStock: {
        count: lowCount.count,
        items: lowList.map((r) => ({
          productId: r.id,
          name: r.name,
          category: r.category,
          stock: r.stock,
          threshold: r.threshold,
          shortBy: r.threshold - r.stock,
        })),
      },
      overdue: {
        count: installments.overdue_count,
        items: overdueList.map((r) => ({
          scheduleId: r.id,
          planId: r.plan_id,
          customer: { id: r.customer_id, fullName: r.customer, phone: r.phone },
          dueDate: r.due_date,
          daysOverdue: r.days,
          amount: r.amount,
          paid: r.paid,
          outstanding: Prisma.Decimal.max(new Prisma.Decimal(r.amount).minus(r.paid), 0),
        })),
      },
    };
  }
}
