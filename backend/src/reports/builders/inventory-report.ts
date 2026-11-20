import { Prisma } from "@prisma/client";
import type { ReportDocument } from "../report-document";
import type { BuildContext, ReportFilters } from "./types";

type D = Prisma.Decimal;

/**
 * Inventory report: current stock of every active product (stock = sum of
 * stock movements, the same rule as GET /products), valuation at cost and at
 * selling price, and low-stock items. `stockThreshold` overrides each
 * product's own low-stock threshold when given.
 */
export async function buildInventoryReport(filters: ReportFilters, ctx: BuildContext): Promise<ReportDocument> {
  const [rows, category] = await Promise.all([
    ctx.prisma.$queryRaw<Array<{
      name: string; category: string; is_serialized: boolean; cost_price: D; selling_price: D;
      low_stock_threshold: number; stock: number;
    }>>`
      SELECT p.name, c.name AS category, p.is_serialized, p.cost_price, p.selling_price, p.low_stock_threshold,
             COALESCE((SELECT SUM(m.quantity) FROM stock_movements m WHERE m.product_id = p.id), 0)::int AS stock
        FROM products p
        JOIN categories c ON c.id = p.category_id
       WHERE p.active = true
       ${filters.categoryId ? Prisma.sql`AND p.category_id = ${filters.categoryId}::uuid` : Prisma.empty}
       ORDER BY c.name, p.name`,
    filters.categoryId ? ctx.prisma.category.findUnique({ where: { id: filters.categoryId }, select: { name: true } }) : null,
  ]);

  const items = rows.map((r) => {
    const threshold = filters.stockThreshold ?? r.low_stock_threshold;
    return {
      ...r,
      threshold,
      low: r.stock < threshold,
      costValue: r.cost_price.mul(r.stock),
      retailValue: r.selling_price.mul(r.stock),
    };
  });
  const listed = filters.lowStockOnly ? items.filter((i) => i.low) : items;
  const low = items.filter((i) => i.low);
  const total = (pick: (i: (typeof items)[number]) => D) =>
    listed.reduce((acc, i) => acc.plus(pick(i)), new Prisma.Decimal(0));
  const units = listed.reduce((acc, i) => acc + i.stock, 0);

  const filterRows: Array<[string, string]> = [["Stock as at", "time of generation"]];
  if (filters.categoryId) filterRows.push(["Category", category?.name ?? filters.categoryId]);
  if (filters.stockThreshold !== undefined) filterRows.push(["Low-stock threshold", `< ${filters.stockThreshold} units`]);
  if (filters.lowStockOnly) filterRows.push(["Showing", "low-stock items only"]);

  return {
    title: "Inventory Report",
    storeName: ctx.storeName,
    generatedAt: ctx.now,
    timeZone: ctx.timeZone,
    filters: filterRows,
    summary: [
      { label: "Products", value: listed.length, type: "int" },
      { label: "Units in stock", value: units, type: "int" },
      { label: "Value at cost (LKR)", value: total((i) => i.costValue), type: "money" },
      { label: "Value at selling price (LKR)", value: total((i) => i.retailValue), type: "money" },
      { label: "Low-stock items", value: low.length, type: "int" },
    ],
    tables: [
      {
        title: filters.lowStockOnly ? "Low-stock items" : "Current stock",
        columns: [
          { header: "Product", type: "text", weight: 3 },
          { header: "Category", type: "text" },
          { header: "Serialized", type: "text", weight: 0.8 },
          { header: "In stock", type: "int" },
          { header: "Threshold", type: "int" },
          { header: "Cost price", type: "money" },
          { header: "Selling price", type: "money" },
          { header: "Value at cost", type: "money" },
          { header: "Value at price", type: "money" },
          { header: "Status", type: "text", weight: 1 },
        ],
        rows: listed.map((i) => [
          i.name, i.category, i.is_serialized ? "Yes" : "No", i.stock, i.threshold,
          i.cost_price, i.selling_price, i.costValue, i.retailValue, i.low ? "LOW STOCK" : "OK",
        ]),
        totals: ["Total", null, null, units, null, null, null, total((i) => i.costValue), total((i) => i.retailValue), null],
      },
      ...(filters.lowStockOnly ? [] : [{
        title: "Low-stock items (reorder)",
        columns: [
          { header: "Product", type: "text" as const, weight: 3 },
          { header: "Category", type: "text" as const },
          { header: "In stock", type: "int" as const },
          { header: "Threshold", type: "int" as const },
          { header: "Short by", type: "int" as const },
        ],
        rows: low.map((i) => [i.name, i.category, i.stock, i.threshold, i.threshold - i.stock]),
        emptyText: "No products are below their low-stock threshold.",
      }]),
    ],
  };
}
