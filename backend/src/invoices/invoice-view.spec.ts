import { InvoiceType, Prisma } from "@prisma/client";
import { formatDocumentNumber } from "./document-number";
import { renderInvoicePdf, renderReceiptPdf } from "./invoice-pdf";
import {
  addMonthsClamped,
  buildInvoiceView,
  buildReceiptView,
  money,
  type SaleForInvoice,
  type StoreDetails,
} from "./invoice-view";

const D = (v: string | number) => new Prisma.Decimal(v);
const store: StoreDetails = { name: "Test Store", address: "1 Main St", phone: "011 000 0000", timeZone: "Asia/Colombo" };
const customer = { fullName: "Kamala Silva", phone: "+94711234567", email: "k@example.com", address: null };

function sale(overrides: Partial<SaleForInvoice> = {}): SaleForInvoice {
  return {
    id: "sale-1",
    createdAt: new Date("2026-11-20T04:30:00.000Z"), // 10:00 in Colombo
    customer,
    cashier: { email: "cashier@shop.lk", fullName: "Sunil Fernando" },
    saleItems: [
      {
        quantity: 2,
        unitPrice: D("1500"),
        discount: D("100"),
        product: { name: "USB-C Cable", warrantyMonths: null },
        serializedUnit: null,
      },
      {
        quantity: 1,
        unitPrice: D("120000"),
        discount: D("0"),
        product: { name: "Galaxy A55", warrantyMonths: 12 },
        serializedUnit: { serialNumber: "IMEI-356789012345678", warrantyStartDate: null },
      },
    ],
    payments: [{ id: "p0", amount: D("122800"), method: "CARD", type: "FULL", createdAt: new Date() }],
    installmentPlan: null,
    ...overrides,
  };
}

describe("money / document numbers / dates", () => {
  it("formats amounts with thousands separators and 2 decimals", () => {
    expect(money(D("1234567.5"))).toBe("1,234,567.50");
    expect(money(D("0"))).toBe("0.00");
    expect(money(D("-1500"))).toBe("-1,500.00");
  });

  it("pads sequential document numbers per type", () => {
    expect(formatDocumentNumber(InvoiceType.INVOICE, 1)).toBe("INV-000001");
    expect(formatDocumentNumber(InvoiceType.RECEIPT, 1234)).toBe("RCP-001234");
  });

  it("clamps warranty end dates to the end of shorter months", () => {
    expect(addMonthsClamped(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
  });
});

describe("buildInvoiceView", () => {
  it("prints line items, per-line discounts, totals, cashier name and payment method", () => {
    const view = buildInvoiceView("INV-000007", sale(), store);
    expect(view.number).toBe("INV-000007");
    expect(view.cashierName).toBe("Sunil Fernando");
    expect(view.issuedAt).toContain("10:00");
    expect(view.lines[0]).toMatchObject({ quantity: 2, unitPrice: "1,500.00", discount: "200.00", lineTotal: "2,800.00" });
    expect(view.subtotal).toBe("123,000.00");
    expect(view.totalDiscount).toBe("200.00");
    expect(view.grandTotal).toBe("122,800.00");
    expect(view.payments).toEqual([{ label: "Payment", method: "Card", amount: "122,800.00" }]);
    expect(view.installment).toBeNull();
  });

  it("shows serial/IMEI and the warranty period for a serialized unit", () => {
    const view = buildInvoiceView("INV-000001", sale(), store);
    expect(view.lines[1].details).toEqual([
      "Serial/IMEI: IMEI-356789012345678",
      "Warranty: 12 months (2026-11-20 to 2027-11-20)",
    ]);
    expect(view.lines[0].details).toEqual([]); // no serial, no warranty
  });

  it("starts the warranty from the unit's own warranty start date when set", () => {
    const base = sale();
    base.saleItems[1].serializedUnit!.warrantyStartDate = new Date("2026-10-01T00:00:00Z");
    expect(buildInvoiceView("INV-1", base, store).lines[1].details[1])
      .toBe("Warranty: 12 months (2026-10-01 to 2027-10-01)");
  });

  it("falls back to the cashier email when no name is set", () => {
    expect(buildInvoiceView("INV-1", sale({ cashier: { email: "c@shop.lk", fullName: null } }), store).cashierName)
      .toBe("c@shop.lk");
  });

  it("adds deposit, financed amount, interest and the full schedule for an installment sale", () => {
    const view = buildInvoiceView("INV-000002", sale({
      saleItems: [{
        quantity: 2, unitPrice: D("1500"), discount: D("0"),
        product: { name: "Power Bank", warrantyMonths: null }, serializedUnit: null,
      }],
      payments: [
        { id: "p1", amount: D("1000"), method: "CASH", type: "DEPOSIT", createdAt: new Date() },
        { id: "p2", amount: D("733.33"), method: "CASH", type: "INSTALLMENT", createdAt: new Date() },
      ],
      installmentPlan: {
        deposit: D("1000"),
        interestRate: D("0.1"),
        termCount: 3,
        paymentFrequency: "WEEKLY",
        schedules: [
          { dueDate: new Date("2026-12-11T00:00:00Z"), amount: D("733.34") },
          { dueDate: new Date("2026-11-27T00:00:00Z"), amount: D("733.33") },
          { dueDate: new Date("2026-12-04T00:00:00Z"), amount: D("733.33") },
        ],
      },
    }), store);
    expect(view.installment).toMatchObject({
      deposit: "1,000.00",
      financedAmount: "2,000.00",
      interestRatePercent: "10",
      interestAmount: "200.00",
      totalRepayable: "2,200.00",
      termCount: 3,
    });
    expect(view.installment!.schedule.map((s) => s.dueDate)).toEqual(["2026-11-27", "2026-12-04", "2026-12-11"]);
    // Later installment payments belong on receipts, not on the invoice.
    expect(view.payments).toEqual([{ label: "Deposit", method: "Cash", amount: "1,000.00" }]);
  });
});

describe("buildReceiptView", () => {
  const t = (iso: string) => new Date(iso);
  const plan = {
    schedules: [
      {
        id: "s1", dueDate: t("2026-11-27T00:00:00Z"), amount: D("733.33"),
        allocations: [
          { amountApplied: D("500"), payment: { id: "pay-1", createdAt: t("2026-11-21T00:00:00Z") } },
          { amountApplied: D("233.33"), payment: { id: "pay-2", createdAt: t("2026-11-22T00:00:00Z") } },
        ],
      },
      {
        id: "s2", dueDate: t("2026-12-04T00:00:00Z"), amount: D("733.33"),
        allocations: [
          { amountApplied: D("100"), payment: { id: "pay-2", createdAt: t("2026-11-22T00:00:00Z") } },
          { amountApplied: D("633.33"), payment: { id: "pay-3", createdAt: t("2026-11-23T00:00:00Z") } },
        ],
      },
      { id: "s3", dueDate: t("2026-12-11T00:00:00Z"), amount: D("733.34"), allocations: [] },
    ],
  };

  it("lists each installment the payment settles with balances as at that payment", () => {
    const view = buildReceiptView({
      number: "RCP-000002",
      invoiceNumber: "INV-000002",
      saleId: "sale-1",
      customer,
      receivedBy: { email: "w@shop.lk", fullName: "Sunil" },
      payment: {
        id: "pay-2", amount: D("333.33"), method: "CASH", createdAt: t("2026-11-22T00:00:00Z"),
        allocations: [{ scheduleId: "s1", amountApplied: D("233.33") }, { scheduleId: "s2", amountApplied: D("100") }],
      },
      plan,
      store,
    });
    expect(view.invoiceNumber).toBe("INV-000002");
    expect(view.amount).toBe("333.33");
    expect(view.settles).toEqual([
      { installment: "1 of 3", dueDate: "2026-11-27", amountDue: "733.33", amountApplied: "233.33", balanceAfter: "0.00", status: "SETTLED" },
      { installment: "2 of 3", dueDate: "2026-12-04", amountDue: "733.33", amountApplied: "100.00", balanceAfter: "633.33", status: "PARTIALLY PAID" },
    ]);
    // pay-3 came later, so it must not reduce the balance shown on this receipt.
    expect(view.planBalanceAfter).toBe("1,366.67");
  });
});

describe("PDF rendering", () => {
  it("produces a valid PDF for an invoice and a receipt", async () => {
    const invoice = await renderInvoicePdf(buildInvoiceView("INV-000001", sale(), store), store);
    expect(invoice.subarray(0, 5).toString()).toBe("%PDF-");
    expect(invoice.length).toBeGreaterThan(1000);
    // Exactly one page (the page-number footer must not spill onto a new page).
    expect(invoice.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);

    const receipt = await renderReceiptPdf(buildReceiptView({
      number: "RCP-000001", invoiceNumber: null, saleId: "sale-1", customer,
      receivedBy: { email: "w@shop.lk", fullName: null },
      payment: { id: "pay-1", amount: D("500"), method: "CASH", createdAt: t0(), allocations: [] },
      plan: { schedules: [] },
      store,
    }), store);
    expect(receipt.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

function t0() {
  return new Date("2026-11-21T00:00:00Z");
}
