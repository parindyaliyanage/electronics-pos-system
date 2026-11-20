import { Prisma } from "@prisma/client";
import type { ReportDocument } from "../report-document";
import { describePeriod, periodBounds, todayIn, type Period } from "../report-period";
import { METHOD_LABEL, type BuildContext, type ReportFilters } from "./types";

type D = Prisma.Decimal;

const TYPE_LABEL: Record<string, string> = { FULL: "Full payment", DEPOSIT: "Deposit", INSTALLMENT: "Installment" };

/**
 * Financial report: money received in the period (by payment type and
 * method), a daily cash summary, and outstanding receivables on active
 * installment plans aged by due date (as at generation time).
 */
export async function buildFinancialReport(filters: ReportFilters, ctx: BuildContext): Promise<ReportDocument> {
  const period: Period = { from: filters.from!, to: filters.to! };
  const { start, end } = periodBounds(period, ctx.timeZone);
  const tz = ctx.timeZone;
  const today = todayIn(ctx.timeZone, ctx.now);
  const payments = Prisma.sql`
    SELECT pay.amount, pay.method, pay.type, pay.created_at
      FROM payments pay
     WHERE pay.created_at >= ${start} AND pay.created_at < ${end}
     ${filters.paymentMethod ? Prisma.sql`AND pay.method = ${filters.paymentMethod}::payment_method` : Prisma.empty}`;

  const [summary, daily, aging] = await Promise.all([
    ctx.prisma.$queryRaw<Array<{ type: string; method: string; count: number; total: D }>>`
      WITH p AS (${payments})
      SELECT type::text AS type, method::text AS method, COUNT(*)::int AS count, SUM(amount) AS total
        FROM p GROUP BY type, method ORDER BY type, method`,
    ctx.prisma.$queryRaw<Array<{ day: string; count: number; cash: D; card: D; bank: D; other: D; total: D }>>`
      WITH p AS (${payments})
      SELECT to_char((created_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count,
             COALESCE(SUM(amount) FILTER (WHERE method = 'CASH'), 0) AS cash,
             COALESCE(SUM(amount) FILTER (WHERE method = 'CARD'), 0) AS card,
             COALESCE(SUM(amount) FILTER (WHERE method = 'BANK_TRANSFER'), 0) AS bank,
             COALESCE(SUM(amount) FILTER (WHERE method = 'OTHER'), 0) AS other,
             SUM(amount) AS total
        FROM p GROUP BY 1 ORDER BY 1`,
    ctx.prisma.$queryRaw<Array<{ bucket: string; sort: number; installments: number; outstanding: D }>>`
      WITH s AS (
        SELECT s.due_date,
               GREATEST(s.amount - COALESCE((SELECT SUM(a.amount_applied) FROM payment_allocations a WHERE a.schedule_id = s.id), 0), 0) AS outstanding
          FROM installment_schedules s
          JOIN installment_plans p ON p.id = s.plan_id
         WHERE p.status = 'ACTIVE'
      ), b AS (
        SELECT outstanding, (${today}::date - due_date) AS days_late FROM s WHERE outstanding > 0
      )
      SELECT CASE WHEN days_late <= 0 THEN 'Not yet due'
                  WHEN days_late <= 30 THEN '1-30 days overdue'
                  WHEN days_late <= 60 THEN '31-60 days overdue'
                  WHEN days_late <= 90 THEN '61-90 days overdue'
                  ELSE 'Over 90 days overdue' END AS bucket,
             CASE WHEN days_late <= 0 THEN 0 WHEN days_late <= 30 THEN 1 WHEN days_late <= 60 THEN 2
                  WHEN days_late <= 90 THEN 3 ELSE 4 END AS sort,
             COUNT(*)::int AS installments, SUM(outstanding) AS outstanding
        FROM b GROUP BY 1, 2 ORDER BY 2`,
  ]);

  const zero = new Prisma.Decimal(0);
  const totalReceived = summary.reduce((acc, r) => acc.plus(r.total), zero);
  const byType = (type: string) => summary.filter((r) => r.type === type).reduce((acc, r) => acc.plus(r.total), zero);
  const receivables = aging.reduce((acc, r) => acc.plus(r.outstanding), zero);
  const dailyTotal = (pick: (r: (typeof daily)[number]) => D) => daily.reduce((acc, r) => acc.plus(pick(r)), zero);

  const filterRows: Array<[string, string]> = [["Period", describePeriod(period)]];
  if (filters.paymentMethod) filterRows.push(["Payment method", METHOD_LABEL[filters.paymentMethod] ?? filters.paymentMethod]);

  return {
    title: "Financial Report",
    storeName: ctx.storeName,
    generatedAt: ctx.now,
    timeZone: ctx.timeZone,
    filters: filterRows,
    summary: [
      { label: "Total received (LKR)", value: totalReceived, type: "money" },
      { label: "Payments", value: summary.reduce((acc, r) => acc + r.count, 0), type: "int" },
      { label: "Full payments (LKR)", value: byType("FULL"), type: "money" },
      { label: "Deposits (LKR)", value: byType("DEPOSIT"), type: "money" },
      { label: "Installments collected (LKR)", value: byType("INSTALLMENT"), type: "money" },
      { label: "Outstanding receivables (LKR)", value: receivables, type: "money" },
    ],
    tables: [
      {
        title: "Payment summary",
        columns: [
          { header: "Payment type", type: "text", weight: 2 },
          { header: "Method", type: "text", weight: 2 },
          { header: "Payments", type: "int" },
          { header: "Amount", type: "money" },
        ],
        rows: summary.map((r) => [TYPE_LABEL[r.type] ?? r.type, METHOD_LABEL[r.method] ?? r.method, r.count, r.total]),
        totals: ["Total", null, summary.reduce((acc, r) => acc + r.count, 0), totalReceived],
      },
      {
        title: "Daily cash summary",
        columns: [
          { header: "Date", type: "text" },
          { header: "Payments", type: "int" },
          { header: "Cash", type: "money" },
          { header: "Card", type: "money" },
          { header: "Bank transfer", type: "money" },
          { header: "Other", type: "money" },
          { header: "Total", type: "money" },
        ],
        rows: daily.map((r) => [r.day, r.count, r.cash, r.card, r.bank, r.other, r.total]),
        totals: [
          "Total", daily.reduce((acc, r) => acc + r.count, 0),
          dailyTotal((r) => r.cash), dailyTotal((r) => r.card), dailyTotal((r) => r.bank), dailyTotal((r) => r.other), totalReceived,
        ],
      },
      {
        title: "Outstanding receivables (installment plans)",
        note: `As at ${today}, aged by installment due date. Not limited to the report period.`,
        columns: [
          { header: "Age", type: "text", weight: 2.5 },
          { header: "Installments", type: "int" },
          { header: "Outstanding", type: "money" },
        ],
        rows: aging.map((r) => [r.bucket, r.installments, r.outstanding]),
        totals: ["Total", aging.reduce((acc, r) => acc + r.installments, 0), receivables],
        emptyText: "No outstanding receivables.",
      },
    ],
  };
}
