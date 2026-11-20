// FR7 — pure functions that turn database rows into exactly what is printed.
// Kept free of I/O so every figure on an invoice/receipt is unit-tested.
import { Prisma } from "@prisma/client";

const ZERO = new Prisma.Decimal(0);

export interface StoreDetails {
  name: string;
  address?: string;
  phone?: string;
  timeZone: string;
}

// ---- input shapes (subset of the Prisma rows used) -------------------------

export interface SaleForInvoice {
  id: string;
  createdAt: Date;
  customer: { fullName: string; phone: string; email: string | null; address: string | null };
  cashier: { email: string; fullName: string | null };
  saleItems: Array<{
    quantity: number;
    unitPrice: Prisma.Decimal;
    discount: Prisma.Decimal;
    product: { name: string; warrantyMonths: number | null };
    serializedUnit: { serialNumber: string; warrantyStartDate: Date | null } | null;
  }>;
  payments: Array<{ id: string; amount: Prisma.Decimal; method: string; type: string; createdAt: Date }>;
  installmentPlan: {
    deposit: Prisma.Decimal;
    interestRate: Prisma.Decimal;
    termCount: number;
    paymentFrequency: string;
    schedules: Array<{ dueDate: Date; amount: Prisma.Decimal }>;
  } | null;
}

export interface PaymentForReceipt {
  id: string;
  amount: Prisma.Decimal;
  method: string;
  createdAt: Date;
  allocations: Array<{ scheduleId: string; amountApplied: Prisma.Decimal }>;
}

export interface PlanForReceipt {
  schedules: Array<{
    id: string;
    dueDate: Date;
    amount: Prisma.Decimal;
    allocations: Array<{ amountApplied: Prisma.Decimal; payment: { id: string; createdAt: Date } }>;
  }>;
}

// ---- output shapes ---------------------------------------------------------

export interface InvoiceLine {
  description: string;
  details: string[];
  quantity: number;
  unitPrice: string;
  discount: string;
  lineTotal: string;
}

export interface InvoiceView {
  number: string;
  issuedAt: string;
  saleId: string;
  customer: SaleForInvoice["customer"];
  cashierName: string;
  lines: InvoiceLine[];
  subtotal: string;
  totalDiscount: string;
  grandTotal: string;
  payments: Array<{ label: string; method: string; amount: string }>;
  installment: {
    deposit: string;
    financedAmount: string;
    interestRatePercent: string;
    interestAmount: string;
    totalRepayable: string;
    termCount: number;
    paymentFrequency: string;
    schedule: Array<{ number: number; dueDate: string; amount: string }>;
  } | null;
}

export interface ReceiptView {
  number: string;
  issuedAt: string;
  saleId: string;
  invoiceNumber: string | null;
  customer: SaleForInvoice["customer"];
  receivedBy: string;
  amount: string;
  method: string;
  settles: Array<{
    installment: string;
    dueDate: string;
    amountDue: string;
    amountApplied: string;
    balanceAfter: string;
    status: "SETTLED" | "PARTIALLY PAID";
  }>;
  planBalanceAfter: string;
}

// ---- formatting helpers ----------------------------------------------------

export function money(value: Prisma.Decimal | number | string) {
  const fixed = new Prisma.Decimal(value).toFixed(2);
  const [whole, cents] = fixed.split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = sign ? whole.slice(1) : whole;
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

export function formatDateTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Calendar date stored as @db.Date (UTC midnight). */
export function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addMonthsClamped(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

const PAYMENT_LABEL: Record<string, string> = {
  FULL: "Payment",
  DEPOSIT: "Deposit",
  INSTALLMENT: "Installment payment",
};
const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  OTHER: "Other",
};
export const methodLabel = (method: string) => METHOD_LABEL[method] ?? method;

// ---- builders --------------------------------------------------------------

export function buildInvoiceView(number: string, sale: SaleForInvoice, store: StoreDetails): InvoiceView {
  let subtotal = ZERO;
  let totalDiscount = ZERO;
  const saleDay = new Date(Date.UTC(
    sale.createdAt.getUTCFullYear(),
    sale.createdAt.getUTCMonth(),
    sale.createdAt.getUTCDate(),
  ));

  const lines = sale.saleItems.map((item) => {
    const gross = item.unitPrice.mul(item.quantity);
    const discount = item.discount.mul(item.quantity);
    subtotal = subtotal.plus(gross);
    totalDiscount = totalDiscount.plus(discount);

    const details: string[] = [];
    if (item.serializedUnit) details.push(`Serial/IMEI: ${item.serializedUnit.serialNumber}`);
    const months = item.product.warrantyMonths;
    if (months && months > 0) {
      const start = item.serializedUnit?.warrantyStartDate ?? saleDay;
      const end = addMonthsClamped(start, months);
      details.push(`Warranty: ${months} month${months === 1 ? "" : "s"} (${formatDate(start)} to ${formatDate(end)})`);
    }
    return {
      description: item.product.name,
      details,
      quantity: item.quantity,
      unitPrice: money(item.unitPrice),
      discount: money(discount),
      lineTotal: money(gross.minus(discount)),
    };
  });
  const grandTotal = subtotal.minus(totalDiscount);

  // The invoice records what was paid at the point of sale (FULL or DEPOSIT);
  // later installment payments get their own receipts.
  const payments = sale.payments
    .filter((payment) => payment.type !== "INSTALLMENT")
    .map((payment) => ({
      label: PAYMENT_LABEL[payment.type] ?? payment.type,
      method: methodLabel(payment.method),
      amount: money(payment.amount),
    }));

  let installment: InvoiceView["installment"] = null;
  if (sale.installmentPlan) {
    const plan = sale.installmentPlan;
    const financed = grandTotal.minus(plan.deposit);
    const totalRepayable = plan.schedules.reduce((sum, s) => sum.plus(s.amount), ZERO);
    installment = {
      deposit: money(plan.deposit),
      financedAmount: money(financed),
      interestRatePercent: plan.interestRate.mul(100).toDecimalPlaces(2).toString(),
      interestAmount: money(totalRepayable.minus(financed)),
      totalRepayable: money(totalRepayable),
      termCount: plan.termCount,
      paymentFrequency: plan.paymentFrequency,
      schedule: [...plan.schedules]
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
        .map((s, index) => ({ number: index + 1, dueDate: formatDate(s.dueDate), amount: money(s.amount) })),
    };
  }

  return {
    number,
    issuedAt: formatDateTime(sale.createdAt, store.timeZone),
    saleId: sale.id,
    customer: sale.customer,
    cashierName: sale.cashier.fullName || sale.cashier.email,
    lines,
    subtotal: money(subtotal),
    totalDiscount: money(totalDiscount),
    grandTotal: money(grandTotal),
    payments,
    installment,
  };
}

/**
 * Snapshot "as at this payment": balances only count allocations from
 * payments made up to and including this one, so a receipt regenerated later
 * still shows what was true when the money was taken.
 */
export function buildReceiptView(input: {
  number: string;
  invoiceNumber: string | null;
  saleId: string;
  customer: SaleForInvoice["customer"];
  receivedBy: { email: string; fullName: string | null };
  payment: PaymentForReceipt;
  plan: PlanForReceipt;
  store: StoreDetails;
}): ReceiptView {
  const { payment, plan } = input;
  const ordered = [...plan.schedules].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  const isUpToThisPayment = (p: { id: string; createdAt: Date }) =>
    p.id === payment.id || p.createdAt.getTime() < payment.createdAt.getTime();
  const paidAsAt = (schedule: PlanForReceipt["schedules"][number]) => schedule.allocations
    .filter((allocation) => isUpToThisPayment(allocation.payment))
    .reduce((sum, allocation) => sum.plus(allocation.amountApplied), ZERO);

  const settles = ordered.flatMap((schedule, index) => {
    const allocation = payment.allocations.find((a) => a.scheduleId === schedule.id);
    if (!allocation) return [];
    const balance = Prisma.Decimal.max(schedule.amount.minus(paidAsAt(schedule)), 0);
    return [{
      installment: `${index + 1} of ${ordered.length}`,
      dueDate: formatDate(schedule.dueDate),
      amountDue: money(schedule.amount),
      amountApplied: money(allocation.amountApplied),
      balanceAfter: money(balance),
      status: balance.equals(0) ? "SETTLED" as const : "PARTIALLY PAID" as const,
    }];
  });
  const planBalanceAfter = ordered.reduce(
    (sum, schedule) => sum.plus(Prisma.Decimal.max(schedule.amount.minus(paidAsAt(schedule)), 0)),
    ZERO,
  );

  return {
    number: input.number,
    issuedAt: formatDateTime(payment.createdAt, input.store.timeZone),
    saleId: input.saleId,
    invoiceNumber: input.invoiceNumber,
    customer: input.customer,
    receivedBy: input.receivedBy.fullName || input.receivedBy.email,
    amount: money(payment.amount),
    method: methodLabel(payment.method),
    settles,
    planBalanceAfter: money(planBalanceAfter),
  };
}
