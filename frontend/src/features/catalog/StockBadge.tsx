import type { Product } from "../../api/types";

/** Stock number with the low-stock indicator (stock below the product's threshold). */
export function StockBadge({ product }: { product: Pick<Product, "currentStock" | "lowStock" | "lowStockThreshold"> }) {
  if (product.currentStock <= 0) return <span className="stock-pill out" title="Out of stock">0 · out</span>;
  if (product.lowStock) {
    return <span className="stock-pill low" title={`Low: below ${product.lowStockThreshold}`}>{product.currentStock} · low</span>;
  }
  return <span className="stock-pill">{product.currentStock}</span>;
}
