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

export type InvoiceType = "INVOICE" | "RECEIPT";

export interface SaleDocument {
  id: string;
  saleId: string;
  paymentId: string | null;
  invoiceNumber: string;
  type: InvoiceType;
  issuedById: string;
  createdAt: string;
}

export type PlanStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";
export type CancelReason = "ITEM_RETURNED" | "DEBT_WRITTEN_OFF" | "CUSTOMER_REQUEST" | "CREATED_IN_ERROR" | "OTHER";
export type ScheduleStatus = "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";

export interface HistorySale {
  id: string;
  createdAt: string;
  cashierId: string;
  cashier: { id: string; email: string; role: string };
  saleItems: Array<{
    id: string;
    quantity: number;
    unitPrice: string;
    discount: string;
    product: { id: string; name: string };
    serializedUnit: { id: string; serialNumber: string; status: string } | null;
  }>;
  payments: Array<{ id: string; amount: string; method: PaymentMethod; type: "FULL" | "DEPOSIT" | "INSTALLMENT"; createdAt: string }>;
  installmentPlan: null | {
    id: string;
    status: PlanStatus;
    deposit: string;
    interestRate: string;
    termCount: number;
    paymentFrequency: PaymentFrequency;
    createdAt: string;
    completedAt: string | null;
    cancelledAt: string | null;
    cancelReason: CancelReason | null;
    cancelNote: string | null;
    schedules: Array<{
      id: string;
      dueDate: string;
      amount: string;
      status: ScheduleStatus;
      allocations: Array<{ paymentId: string; amountApplied: string }>;
    }>;
  };
  invoices: SaleDocument[];
  totals: { grandTotal: string; interest: string; totalPayable: string; amountPaid: string; outstanding: string };
}

export interface CustomerHistory {
  customer: Customer;
  sales: HistorySale[];
  meta: { page: number; limit: number; total: number };
}

export interface PlanSchedule {
  id: string;
  dueDate: string;
  amount: string;
  status: ScheduleStatus;
  overdueAt: string | null;
  amountPaid: string;
  outstanding: string;
  allocations: Array<{ id: string; paymentId: string; amountApplied: string }>;
}

export interface Plan {
  id: string;
  saleId: string;
  deposit: string;
  interestRate: string;
  termCount: number;
  paymentFrequency: PaymentFrequency;
  status: PlanStatus;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: CancelReason | null;
  cancelNote: string | null;
  sale: {
    id: string;
    createdAt: string;
    cashierId: string;
    customer: Customer;
    cashier: { id: string; email: string; role: string };
    saleItems: Array<{ id: string; quantity: number; unitPrice: string; discount: string; product: { id: string; name: string } }>;
    payments: Array<{ id: string; amount: string; method: PaymentMethod; type: "FULL" | "DEPOSIT" | "INSTALLMENT"; createdAt: string }>;
  };
  schedules: PlanSchedule[];
  summary: { outstandingBalance: string; nextDueDate: string | null; nextAmountDue: string };
}

export interface ReceiptListItem {
  id: string;
  invoiceNumber: string;
  type: InvoiceType;
  saleId: string;
  paymentId: string | null;
  issuedById: string;
  createdAt: string;
  issuedBy: { id: string; email: string; fullName: string | null };
}

export interface ReminderRecord {
  id: string;
  scheduleId: string;
  type: "REMINDER";
  channel: "EMAIL";
  recipient: string | null;
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  schedule: { id: string; dueDate: string; amount: string; status: ScheduleStatus };
}

export interface OverdueItem {
  scheduleId: string;
  planId: string;
  saleId: string;
  customer: Customer;
  dueDate: string;
  overdueAt: string | null;
  daysOverdue: number;
  amount: string;
  amountPaid: string;
  outstanding: string;
  reminder: { status: ReminderRecord["status"]; sentAt: string | null } | null;
}

export interface RecordPaymentResponse {
  payment: { id: string; amount: string; method: PaymentMethod; createdAt: string };
  receipt: { id: string; invoiceNumber: string; downloadPath: string };
  plan: Plan;
}

export interface CategoryRow {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  _count: { products: number };
}

export type StockMovementType = "PURCHASE" | "SALE" | "RETURN" | "DAMAGED" | "ADJUSTMENT";

export interface StockMovement {
  id: string;
  productId: string;
  type: StockMovementType;
  quantity: number;
  createdAt: string;
  product: { id: string; name: string };
  createdBy: { id: string; email: string; role: UserRoleName };
}

export interface ProductDetail extends Product {
  serializedUnits?: SerializedUnit[];
}

export interface ProductInput {
  categoryId: string;
  name: string;
  costPrice: number;
  sellingPrice: number;
  isSerialized: boolean;
  lowStockThreshold: number;
  warrantyMonths: number | null;
}

export type UserRoleName = "ADMINISTRATOR" | "WORKER";

export interface ManagedUser {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRoleName;
  active: boolean;
  createdAt: string;
}

export type ReportType = "SALES" | "INVENTORY" | "INSTALLMENTS" | "FINANCIAL";
export type ReportFormat = "PDF" | "CSV";
export type ReportStatus = "QUEUED" | "GENERATING" | "COMPLETED" | "FAILED" | "EXPIRED";

export interface ReportFilters {
  from?: string;
  to?: string;
  categoryId?: string;
  cashierId?: string;
  groupBy?: "DAY" | "MONTH";
  stockThreshold?: number;
  lowStockOnly?: boolean;
  status?: "ACTIVE" | "OVERDUE" | "COMPLETED";
  paymentMethod?: PaymentMethod;
}

export interface ReportJob {
  id: string;
  type: ReportType;
  format: ReportFormat;
  filters: ReportFilters;
  status: ReportStatus;
  fileName: string | null;
  errorMessage: string | null;
  attempts: number;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  requestedBy: { id: string; email: string; fullName: string | null } | null;
  downloadPath: string | null;
}

export interface DashboardSummary {
  date: string;
  timeZone: string;
  generatedAt: string;
  todaySales: { count: number; units: number; netRevenue: string; averageSale: string };
  receivedToday: { total: string; byMethod: Record<PaymentMethod, string> };
  installments: { activePlans: number; outstandingBalance: string; overdueInstallments: number; overdueAmount: string; overdueCustomers: number };
  lowStock: { count: number; items: Array<{ productId: string; name: string; category: string; stock: number; threshold: number; shortBy: number }> };
  overdue: {
    count: number;
    items: Array<{
      scheduleId: string; planId: string; customer: { id: string; fullName: string; phone: string };
      dueDate: string; daysOverdue: number; amount: string; paid: string; outstanding: string;
    }>;
  };
}

export interface PolicyDetail extends InstallmentPolicy {
  updatedAt: string;
  updatedBy: { id: string; email: string } | null;
}
