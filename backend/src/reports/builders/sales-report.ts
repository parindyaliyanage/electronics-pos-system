import { Prisma } from "@prisma/client";
import type { ReportDocument } from "../report-document";
import { describePeriod, periodBounds, type Period } from "../report-period";
import type { BuildContext, ReportFilters } from "./types";

type D = Prisma.Decimal;

/**
 * Sales report: revenue by day/month, by product, by category and by cashier.
 * Revenue is net of line discounts. With a category filter only that
 * category's lines count, and "sales" means sales containing such a line.
 */
export async function buildSalesReport(filters: ReportFilters, ctx: BuildContext): Promise<ReportDocument> {
  const period: Period = { from: filters.from!, to: filters.to! };
  const { start, end } = periodBounds(period, ctx.timeZone);
  const tz = ctx.timeZone;
  const lines = Prisma.sql`
    SELECT s.id AS sale_id, s.created_at, s.cashier_id,
           p.id AS product_id, p.name AS product_name,
           c.id AS category_id, c.name AS category_name,
           si.quantity,
           si.unit_price * si.quantity AS gross,
           si.discount * si.quantity AS discount
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      JOIN products p ON p.id = si.product_id
      JOIN categories c ON c.id = p.category_id
     WHERE s.created_at >= ${start} AND s.created_at < ${end}
     ${filters.categoryId ? Prisma.sql`AND c.id = ${filters.categoryId}::uuid` : Prisma.empty}
     ${filters.cashierId ? Prisma.sql`AND s.cashier_id = ${filters.cashierId}::uuid` : Prisma.empty}`;

  const monthly = filters.groupBy === "MONTH";
  const unit = monthly ? "month" : "day";
  const fmt = monthly ? "YYYY-MM" : "YYYY-MM-DD";

  const [[totals], byPeriod, byProduct, byCategory, byCashier, category, cashier] = await Promise.all([
    ctx.prisma.$queryRaw<Array<{ sales: number; units: number; gross: D | null; discount: D | null }>>`
      WITH l AS (${lines})
      SELECT COUNT(DISTINCT sale_id)::int AS sales, COALESCE(SUM(quantity), 0)::int AS units,
             SUM(gross) AS gross, SUM(discount) AS discount
        FROM l`,
    ctx.prisma.$queryRaw<Array<{ period: string; sales: number; units: number; gross: D; discount: D; net: D }>>`
      WITH l AS (${lines})
      SELECT to_char(date_trunc(${unit}, created_at AT TIME ZONE ${tz}), ${fmt}) AS period,
             COUNT(DISTINCT sale_id)::int AS sales, SUM(quantity)::int AS units,
             SUM(gross) AS gross, SUM(discount) AS discount, SUM(gross - discount) AS net
        FROM l GROUP BY 1 ORDER BY 1`,
    ctx.prisma.$queryRaw<Array<{ product: string; category: string; units: number; gross: D; discount: D; net: D }>>`
      WITH l AS (${lines})
      SELECT product_name AS product, category_name AS category, SUM(quantity)::int AS units,
             SUM(gross) AS gross, SUM(discount) AS discount, SUM(gross - discount) AS net
        FROM l GROUP BY product_id, product_name, category_name ORDER BY net DESC, product`,
    ctx.prisma.$queryRaw<Array<{ category: string; sales: number; units: number; net: D }>>`
      WITH l AS (${lines})
      SELECT category_name AS category, COUNT(DISTINCT sale_id)::int AS sales,
             SUM(quantity)::int AS units, SUM(gross - discount) AS net
        FROM l GROUP BY category_id, category_name ORDER BY net DESC, category`,
    ctx.prisma.$queryRaw<Array<{ cashier: string; email: string; sales: number; units: number; net: D }>>`
      WITH l AS (${lines})
      SELECT COALESCE(u.full_name, u.email) AS cashier, u.email, COUNT(DISTINCT l.sale_id)::int AS sales,
             SUM(l.quantity)::int AS units, SUM(l.gross - l.discount) AS net
        FROM l JOIN users u ON u.id = l.cashier_id
       GROUP BY u.id, u.full_name, u.email ORDER BY net DESC, cashier`,
    filters.categoryId ? ctx.prisma.category.findUnique({ where: { id: filters.categoryId }, select: { name: true } }) : null,
    filters.cashierId ? ctx.prisma.user.findUnique({ where: { id: filters.cashierId }, select: { fullName: true, email: true } }) : null,
  ]);

  const gross = new Prisma.Decimal(totals.gross ?? 0);
  const discount = new Prisma.Decimal(totals.discount ?? 0);
  const net = gross.minus(discount);
  const average = totals.sales ? net.div(totals.sales).toDecimalPlaces(2) : new Prisma.Decimal(0);
  const sum = (rows: Array<{ net: D }>) => rows.reduce((acc, r) => acc.plus(r.net), new Prisma.Decimal(0));

  const filterRows: Array<[string, string]> = [["Period", describePeriod(period)]];
  if (filters.categoryId) filterRows.push(["Category", category?.name ?? filters.categoryId]);
  if (filters.cashierId) filterRows.push(["Cashier", cashier ? cashier.fullName || cashier.email : filters.cashierId]);

  return {
    title: "Sales Report",
    storeName: ctx.storeName,
    generatedAt: ctx.now,
    timeZone: ctx.timeZone,
    filters: filterRows,
    summary: [
      { label: "Sales", value: totals.sales, type: "int" },
      { label: "Units sold", value: totals.units, type: "int" },
      { label: "Gross sales (LKR)", value: gross, type: "money" },
      { label: "Discounts (LKR)", value: discount, type: "money" },
      { label: "Net revenue (LKR)", value: net, type: "money" },
      { label: "Average sale (LKR)", value: average, type: "money" },
    ],
    tables: [
      {
        title: monthly ? "Revenue by month" : "Revenue by day",
        columns: [
          { header: monthly ? "Month" : "Date", type: "text" },
          { header: "Sales", type: "int" },
          { header: "Units", type: "int" },
          { header: "Gross", type: "money" },
          { header: "Discount", type: "money" },
          { header: "Net revenue", type: "money" },
        ],
        rows: byPeriod.map((r) => [r.period, r.sales, r.units, r.gross, r.discount, r.net]),
        totals: ["Total", totals.sales, totals.units, gross, discount, net],
      },
      {
        title: "Sales by product",
        columns: [
          { header: "Product", type: "text", weight: 3 },
          { header: "Category", type: "text" },
          { header: "Units", type: "int" },
          { header: "Gross", type: "money" },
          { header: "Discount", type: "money" },
          { header: "Net revenue", type: "money" },
        ],
        rows: byProduct.map((r) => [r.product, r.category, r.units, r.gross, r.discount, r.net]),
        totals: ["Total", null, totals.units, gross, discount, net],
      },
      {
        title: "Sales by category",
        columns: [
          { header: "Category", type: "text", weight: 3 },
          { header: "Sales", type: "int" },
          { header: "Units", type: "int" },
          { header: "Net revenue", type: "money" },
        ],
        rows: byCategory.map((r) => [r.category, r.sales, r.units, r.net]),
        totals: ["Total", null, totals.units, sum(byCategory)],
      },
      {
        title: "Sales by cashier",
        columns: [
          { header: "Cashier", type: "text", weight: 2 },
          { header: "Email", type: "text", weight: 2.5 },
          { header: "Sales", type: "int" },
          { header: "Units", type: "int" },
          { header: "Net revenue", type: "money" },
        ],
        // Email disambiguates two staff members with the same name.
        rows: byCashier.map((r) => [r.cashier, r.email, r.sales, r.units, r.net]),
        totals: ["Total", null, totals.sales, totals.units, sum(byCashier)],
      },
    ],
  };
}
