import type { Product, SerializedUnit } from "../../api/types";
import { fromCents, parseAmountInput, toCents, type Cents } from "../../lib/money";

/**
 * One cart line. Mirrors the backend's checkout rules (sales.service.ts):
 *  - a serialized product is one line per physical unit, quantity 1;
 *  - a non-serialized product appears on one line only;
 *  - `discount` is per unit and may not exceed the unit price;
 *  - `unitPrice` must equal the current catalog price.
 */
export interface CartLine {
  key: string;
  productId: string;
  name: string;
  category: string;
  isSerialized: boolean;
  unitPrice: Cents;
  quantity: number;
  /** Stock when the product was added/refreshed (non-serialized lines). */
  stock: number;
  discountInput: string;
  serializedUnitId?: string;
  serialNumber?: string;
}

export type CartAction =
  | { type: "addProduct"; product: Product }
  | { type: "addUnit"; product: Product; unit: SerializedUnit }
  | { type: "setQuantity"; key: string; quantity: number }
  | { type: "setDiscount"; key: string; input: string }
  | { type: "remove"; key: string }
  | { type: "refresh"; products: Product[] }
  | { type: "clear" };

export function cartReducer(lines: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "addProduct": {
      const { product } = action;
      const existing = lines.find((line) => line.productId === product.id);
      if (existing) {
        return lines.map((line) => line === existing
          ? { ...line, quantity: Math.min(line.quantity + 1, Math.max(product.currentStock, line.quantity)), stock: product.currentStock }
          : line);
      }
      return [...lines, baseLine(product, product.id)];
    }
    case "addUnit": {
      if (lines.some((line) => line.serializedUnitId === action.unit.id)) return lines;
      return [...lines, { ...baseLine(action.product, action.unit.id), serializedUnitId: action.unit.id, serialNumber: action.unit.serialNumber }];
    }
    case "setQuantity":
      return lines.map((line) => line.key === action.key && !line.isSerialized
        ? { ...line, quantity: Math.max(1, Math.floor(action.quantity) || 1) }
        : line);
    case "setDiscount":
      return lines.map((line) => line.key === action.key ? { ...line, discountInput: action.input } : line);
    case "remove":
      return lines.filter((line) => line.key !== action.key);
    case "refresh": {
      const byId = new Map(action.products.map((p) => [p.id, p]));
      return lines.map((line) => {
        const product = byId.get(line.productId);
        return product
          ? { ...line, name: product.name, unitPrice: toCents(product.sellingPrice), stock: product.currentStock }
          : line;
      });
    }
    case "clear":
      return [];
  }
}

function baseLine(product: Product, key: string): CartLine {
  return {
    key,
    productId: product.id,
    name: product.name,
    category: product.category?.name ?? "",
    isSerialized: product.isSerialized,
    unitPrice: toCents(product.sellingPrice),
    quantity: 1,
    stock: product.currentStock,
    discountInput: "",
  };
}

export interface LineCheck {
  discount: Cents;
  lineTotal: Cents;
  discountError?: string;
  quantityError?: string;
}

export function checkLine(line: CartLine): LineCheck {
  const parsed = parseAmountInput(line.discountInput);
  const discount = parsed.cents ?? 0;
  let discountError = parsed.error;
  if (!discountError && discount > line.unitPrice) discountError = "Discount can't be more than the price.";
  let quantityError: string | undefined;
  if (!line.isSerialized && line.quantity > line.stock) {
    quantityError = line.stock > 0 ? `Only ${line.stock} in stock.` : "Out of stock.";
  }
  const safeDiscount = discountError ? 0 : discount;
  return { discount: safeDiscount, lineTotal: (line.unitPrice - safeDiscount) * line.quantity, discountError, quantityError };
}

export interface CartTotals {
  units: number;
  subtotal: Cents;
  totalDiscount: Cents;
  grandTotal: Cents;
  hasErrors: boolean;
}

export function cartTotals(lines: CartLine[]): CartTotals {
  let subtotal = 0;
  let totalDiscount = 0;
  let units = 0;
  let hasErrors = false;
  for (const line of lines) {
    const check = checkLine(line);
    subtotal += line.unitPrice * line.quantity;
    totalDiscount += check.discount * line.quantity;
    units += line.quantity;
    if (check.discountError || check.quantityError) hasErrors = true;
  }
  return { units, subtotal, totalDiscount, grandTotal: subtotal - totalDiscount, hasErrors };
}

/** Request body lines for POST /sales/checkout. */
export function checkoutItems(lines: CartLine[]) {
  return lines.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unitPrice: fromCents(line.unitPrice),
    discount: fromCents(checkLine(line).discount),
    ...(line.serializedUnitId ? { serializedUnitId: line.serializedUnitId } : {}),
  }));
}

/** How many more units of this non-serialized product can go in the cart. */
export function remainingStock(lines: CartLine[], product: Product) {
  const inCart = lines
    .filter((line) => line.productId === product.id)
    .reduce((sum, line) => sum + line.quantity, 0);
  return product.currentStock - inCart;
}
