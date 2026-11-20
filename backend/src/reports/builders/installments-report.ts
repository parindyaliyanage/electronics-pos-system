import { Prisma } from "@prisma/client";
import type { ReportDocument } from "../report-document";
import { addDays, describePeriod, todayIn, type Period } from "../report-period";
import type { BuildContext, ReportFilters } from "./types";

type D = Prisma.Decimal;

/**
 * Installments report.
 *  - Date range = due-date window for "Upcoming payments" (default: today + 30 days).
 *  - Status filters which plans are included everywhere:
 *      ACTIVE    – active plans
 *      OVERDUE   – active plans with at least one OVERDUE installment
 *      COMPLETED – fully paid plans
 *    (no status = active and completed plans; cancelled plans are excluded)
 * Balances are live as at generation time.
 */
export async function buildInstallmentsReport(filters: ReportFilters, ctx: BuildContext): Promise<ReportDocument> {
  const today = todayIn(ctx.timeZone, ctx.now);
  const window: Period = { from: filters.from ?? today, to: filters.to ?? addDays(today, 30) };

  const planFilter = (() => {
    switch (filters.status) {
      case "ACTIVE": return Prisma.sql`p.status = 'ACTIVE'`;
      case "COMPLETED": return Prisma.sql`p.status = 'COMPLETED'`;
      case "OVERDUE": return Prisma.sql`p.status = 'ACTIVE' AND EXISTS (
        SELECT 1 FROM installment_schedules o WHERE o.plan_id = p.id AND o.status = 'OVERDUE')`;
      default: return Prisma.sql`p.status IN ('ACTIVE', 'COMPLETED')`;
    }
  })();

  // One row per installment with what has been paid against it so far.
  const schedules = Prisma.sql`
    SELECT s.id, s.plan_id, s.due_date, s.amount, s.status, s.overdue_at, p.status AS plan_status,
           cu.id AS customer_id, cu.full_name AS customer, cu.phone,
           COALESCE((SELECT SUM(a.amount_applied) FROM payment_allocations a WHERE a.schedule_id = s.id), 0) AS paid
      FROM installment_schedules s
      JOIN installment_plans p ON p.id = s.plan_id
      JOIN sales sa ON sa.id = p.sale_id
      JOIN customers cu ON cu.id = sa.customer_id
     WHERE ${planFilter}`;

  const [upcoming, overdue, byCustomer, plans] = await Promise.all([
    ctx.prisma.$queryRaw<Array<{ customer: string; phone: string; due_date: Date; amount: D; paid: D; status: string }>>`
      WITH s AS (${schedules})
      SELECT customer, phone, due_date, amount, paid, status FROM s
       WHERE plan_status = 'ACTIVE' AND status IN ('PENDING', 'PARTIALLY_PAID')
         AND due_date BETWEEN ${window.from}::date AND ${window.to}::date
       ORDER BY due_date, customer`,
    ctx.prisma.$queryRaw<Array<{ customer: string; phone: string; due_date: Date; amount: D; paid: D; days: number }>>`
      WITH s AS (${schedules})
      SELECT customer, phone, due_date, amount, paid, (${today}::date - due_date)::int AS days FROM s
       WHERE plan_status = 'ACTIVE' AND status = 'OVERDUE'
       ORDER BY due_date, customer`,
    ctx.prisma.$queryRaw<Array<{ customer: string; phone: string; plans: number; outstanding: D; overdue: D; next_due: Date | null }>>`
      WITH s AS (${schedules})
      SELECT customer, phone, COUNT(DISTINCT plan_id)::int AS plans,
             SUM(GREATEST(amount - paid, 0)) AS outstanding,
             COALESCE(SUM(GREATEST(amount - paid, 0)) FILTER (WHERE status = 'OVERDUE'), 0) AS overdue,
             MIN(due_date) FILTER (WHERE status <> 'PAID') AS next_due
        FROM s WHERE plan_status = 'ACTIVE'
       GROUP BY customer_id, customer, phone
      HAVING SUM(GREATEST(amount - paid, 0)) > 0
       ORDER BY outstanding DESC, customer`,
    ctx.prisma.$queryRaw<Array<{ customer: string; created_at: Date; status: string; terms: number; repayable: D; paid: D; overdue_count: number }>>`
      WITH s AS (${schedules})
      SELECT MIN(s.customer) AS customer, MIN(p.created_at) AS created_at, MIN(s.plan_status::text) AS status,
             COUNT(*)::int AS terms, SUM(s.amount) AS repayable, SUM(LEAST(s.paid, s.amount)) AS paid,
             COUNT(*) FILTER (WHERE s.status = 'OVERDUE')::int AS overdue_count
        FROM s JOIN installment_plans p ON p.id = s.plan_id
       GROUP BY s.plan_id ORDER BY MIN(p.created_at) DESC`,
  ]);

  const out = (amount: D, paid: D) => Prisma.Decimal.max(amount.minus(paid), 0);
  const sumOut = <T extends { amount: D; paid: D }>(rows: T[]) => rows.reduce((acc, r) => acc.plus(out(r.amount, r.paid)), new Prisma.Decimal(0));
  const totalOutstanding = byCustomer.reduce((acc, r) => acc.plus(r.outstanding), new Prisma.Decimal(0));

  const filterRows: Array<[string, string]> = [
    ["Upcoming window (due date)", describePeriod(window)],
    ["Plan status", filters.status ?? "ACTIVE + COMPLETED"],
  ];

  return {
    title: "Installments Report",
    storeName: ctx.storeName,
    generatedAt: ctx.now,
    timeZone: ctx.timeZone,
    filters: filterRows,
    summary: [
      { label: "Plans", value: plans.length, type: "int" },
      { label: "Outstanding balance (LKR)", value: totalOutstanding, type: "money" },
      { label: "Overdue installments", value: overdue.length, type: "int" },
      { label: "Overdue amount (LKR)", value: sumOut(overdue), type: "money" },
      { label: "Due in window (LKR)", value: sumOut(upcoming), type: "money" },
    ],
    tables: [
      {
        title: "Upcoming payments",
        note: `Unpaid installments due ${describePeriod(window)}.`,
        columns: [
          { header: "Due date", type: "date" },
          { header: "Customer", type: "text", weight: 2.5 },
          { header: "Phone", type: "text", weight: 1.4 },
          { header: "Amount", type: "money" },
          { header: "Paid", type: "money" },
          { header: "Outstanding", type: "money" },
          { header: "Status", type: "text", weight: 1.3 },
        ],
        rows: upcoming.map((r) => [r.due_date, r.customer, r.phone, r.amount, r.paid, out(r.amount, r.paid), r.status]),
        totals: ["Total", null, null, null, null, sumOut(upcoming), null],
        emptyText: "No installments fall due in this window.",
      },
      {
        title: "Overdue accounts",
        columns: [
          { header: "Due date", type: "date" },
          { header: "Customer", type: "text", weight: 2.5 },
          { header: "Phone", type: "text", weight: 1.4 },
          { header: "Days overdue", type: "int" },
          { header: "Amount", type: "money" },
          { header: "Paid", type: "money" },
          { header: "Outstanding", type: "money" },
        ],
        rows: overdue.map((r) => [r.due_date, r.customer, r.phone, r.days, r.amount, r.paid, out(r.amount, r.paid)]),
        totals: ["Total", null, null, null, null, null, sumOut(overdue)],
        emptyText: "No overdue installments.",
      },
      {
        title: "Outstanding balance by customer",
        columns: [
          { header: "Customer", type: "text", weight: 2.5 },
          { header: "Phone", type: "text", weight: 1.4 },
          { header: "Active plans", type: "int" },
          { header: "Next due", type: "date" },
          { header: "Overdue", type: "money" },
          { header: "Outstanding", type: "money" },
        ],
        rows: byCustomer.map((r) => [r.customer, r.phone, r.plans, r.next_due, r.overdue, r.outstanding]),
        totals: ["Total", null, null, null, byCustomer.reduce((a, r) => a.plus(r.overdue), new Prisma.Decimal(0)), totalOutstanding],
        emptyText: "No outstanding balances.",
      },
      {
        title: "Plans",
        columns: [
          { header: "Created", type: "date" },
          { header: "Customer", type: "text", weight: 2.5 },
          { header: "Status", type: "text" },
          { header: "Terms", type: "int" },
          { header: "Overdue", type: "int" },
          { header: "Total repayable", type: "money" },
          { header: "Paid", type: "money" },
          { header: "Outstanding", type: "money" },
        ],
        rows: plans.map((r) => [r.created_at, r.customer, r.status, r.terms, r.overdue_count, r.repayable, r.paid, out(r.repayable, r.paid)]),
      },
    ],
  };
}
