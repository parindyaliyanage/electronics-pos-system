// Shapes returned by the backend. Decimal columns arrive as strings ("120000", "20166.66").

export interface Page<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  category: Category;
  costPrice: string;
  sellingPrice: string;
  isSerialized: boolean;
  lowStockThreshold: number;
  warrantyMonths: number | null;
  active: boolean;
  currentStock: number;
  lowStock: boolean;
}

export type SerializedUnitStatus = "IN_STOCK" | "SOLD" | "RETURNED";

export interface SerializedUnit {
  id: string;
  productId: string;
  serialNumber: string;
  status: SerializedUnitStatus;
  warrantyStartDate: string | null;
}

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  address: string | null;
  createdAt: string;
  _count?: { sales: number };
}

export interface CreateCustomerResult {
  customer: Customer;
  warnings: Array<{
    code: "DUPLICATE_PHONE";
    message: string;
    matches: Array<{ id: string; fullName: string; phone: string }>;
  }>;
}

export interface InstallmentPolicy {
  id: string;
  /** Flat rate applied once to the financed amount, e.g. "0.1000" = 10%. */
  interestRate: string;
  reminderDaysBefore: number;
  gracePeriodDays: number;
}

export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "OTHER";
export type PaymentFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY";

export interface CheckoutRequest {
  customerId: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    serializedUnitId?: string;
  }>;
  payment: { method: PaymentMethod; type: "FULL" | "DEPOSIT"; amount: number };
  installment?: { termCount: number; paymentFrequency: PaymentFrequency };
}

export interface CheckoutResponse {
  id: string;
  createdAt: string;
  customer: Customer;
  saleItems: Array<{
    id: string;
    productId: string;
    quantity: number;
    unitPrice: string;
    discount: string;
    product: { id: string; name: string; isSerialized: boolean };
    serializedUnit: SerializedUnit | null;
  }>;
  payments: Array<{ id: string; amount: string; method: PaymentMethod; type: string }>;
  installmentPlan: null | {
    id: string;
    deposit: string;
    interestRate: string;
    termCount: number;
    paymentFrequency: PaymentFrequency;
    schedules: Array<{ id: string; dueDate: string; amount: string; status: string }>;
  };
  totals: { subtotal: string; totalDiscount: string; grandTotal: string; amountPaid: string };
  invoice: { id: string; invoiceNumber: string; downloadPath: string };
}
