// FR7 — renders InvoiceView / ReceiptView to PDF. Layout only: every figure
// comes pre-computed from invoice-view.ts.
import PDFDocument from "pdfkit";
import type { InvoiceView, ReceiptView, StoreDetails } from "./invoice-view";

const MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const GREY = "#555555";
const RULE = "#cccccc";

interface Column {
  header: string;
  width: number;
  align?: "left" | "right";
}

type Doc = PDFKit.PDFDocument;

function render(build: (doc: Doc) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    build(doc);
    // Page numbers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      // Writing inside the bottom margin would make PDFKit start a new page,
      // so lift the margin while drawing the page number.
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(8).fillColor(GREY)
        .text(`Page ${i + 1} of ${range.count}`, MARGIN, doc.page.height - MARGIN / 2 - 8, { width: CONTENT_WIDTH, align: "center", lineBreak: false });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  });
}

function header(doc: Doc, store: StoreDetails, title: string, number: string, issuedAt: string) {
  const top = doc.y;
  doc.font("Helvetica-Bold").fontSize(16).fillColor("black").text(store.name, MARGIN, top, { width: CONTENT_WIDTH / 2 });
  doc.font("Helvetica").fontSize(9).fillColor(GREY);
  if (store.address) doc.text(store.address, { width: CONTENT_WIDTH / 2 });
  if (store.phone) doc.text(`Tel: ${store.phone}`, { width: CONTENT_WIDTH / 2 });
  const leftBottom = doc.y;

  doc.font("Helvetica-Bold").fontSize(18).fillColor("black")
    .text(title, MARGIN + CONTENT_WIDTH / 2, top, { width: CONTENT_WIDTH / 2, align: "right" });
  doc.font("Helvetica").fontSize(10)
    .text(`No: ${number}`, { width: CONTENT_WIDTH / 2, align: "right" })
    .text(`Date: ${issuedAt}`, { width: CONTENT_WIDTH / 2, align: "right" });
  doc.y = Math.max(leftBottom, doc.y) + 10;
  rule(doc);
}

function rule(doc: Doc) {
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).strokeColor(RULE).lineWidth(0.8).stroke();
  doc.moveDown(0.6);
}

function section(doc: Doc, title: string) {
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("black").text(title, MARGIN, doc.y);
  doc.moveDown(0.3);
}

function keyValues(doc: Doc, rows: Array<[string, string | null | undefined]>, x = MARGIN, width = CONTENT_WIDTH) {
  for (const [key, value] of rows) {
    if (!value) continue;
    const y = doc.y;
    doc.font("Helvetica").fontSize(9).fillColor(GREY).text(key, x, y, { width: 110 });
    doc.font("Helvetica").fontSize(9).fillColor("black").text(value, x + 110, y, { width: width - 110 });
    doc.moveDown(0.15);
  }
}

function table(doc: Doc, columns: Column[], rows: Array<Array<string | string[]>>) {
  const drawHeader = () => {
    let x = MARGIN;
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("black");
    for (const column of columns) {
      doc.text(column.header, x + 2, y, { width: column.width - 4, align: column.align ?? "left" });
      x += column.width;
    }
    doc.y = y + 14;
    rule(doc);
  };
  drawHeader();
  for (const row of rows) {
    // Measure the tallest cell so long descriptions wrap cleanly.
    doc.font("Helvetica").fontSize(9);
    const height = Math.max(...row.map((cell, i) => {
      const text = Array.isArray(cell) ? cell.join("\n") : cell;
      return doc.heightOfString(text, { width: columns[i].width - 4 });
    }));
    if (doc.y + height > 842 - MARGIN - 20) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    let x = MARGIN;
    row.forEach((cell, i) => {
      const column = columns[i];
      if (Array.isArray(cell)) {
        const [first, ...rest] = cell;
        doc.font("Helvetica").fontSize(9).fillColor("black").text(first, x + 2, y, { width: column.width - 4 });
        if (rest.length) doc.fontSize(8).fillColor(GREY).text(rest.join("\n"), x + 2, doc.y, { width: column.width - 4 });
      } else {
        doc.font("Helvetica").fontSize(9).fillColor("black")
          .text(cell, x + 2, y, { width: column.width - 4, align: column.align ?? "left" });
      }
      x += column.width;
    });
    doc.y = y + height + 6;
  }
  rule(doc);
}

function totals(doc: Doc, rows: Array<[string, string, boolean?]>) {
  const labelX = MARGIN + CONTENT_WIDTH - 260;
  for (const [label, value, bold] of rows) {
    const y = doc.y;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 9).fillColor("black")
      .text(label, labelX, y, { width: 160 })
      .text(value, labelX + 160, y, { width: 100, align: "right" });
    doc.moveDown(0.2);
  }
}

function footer(doc: Doc, text: string) {
  doc.moveDown(1.5);
  doc.font("Helvetica-Oblique").fontSize(8).fillColor(GREY).text(text, MARGIN, doc.y, { width: CONTENT_WIDTH, align: "center" });
}

export function renderInvoicePdf(view: InvoiceView, store: StoreDetails): Promise<Buffer> {
  return render((doc) => {
    header(doc, store, view.installment ? "INSTALLMENT INVOICE" : "INVOICE", view.number, view.issuedAt);

    section(doc, "Bill to");
    keyValues(doc, [
      ["Customer", view.customer.fullName],
      ["Phone", view.customer.phone],
      ["Email", view.customer.email],
      ["Address", view.customer.address],
      ["Cashier", view.cashierName],
      ["Sale reference", view.saleId],
    ]);

    section(doc, "Items");
    table(doc, [
      { header: "#", width: 22 },
      { header: "Item", width: 205 },
      { header: "Qty", width: 35, align: "right" },
      { header: "Unit price", width: 78, align: "right" },
      { header: "Discount", width: 70, align: "right" },
      { header: "Amount", width: 85, align: "right" },
    ], view.lines.map((line, index) => [
      String(index + 1),
      [line.description, ...line.details],
      String(line.quantity),
      line.unitPrice,
      line.discount,
      line.lineTotal,
    ]));

    totals(doc, [
      ["Subtotal", view.subtotal],
      ["Discount", view.totalDiscount === "0.00" ? "0.00" : `-${view.totalDiscount}`],
      ["Total (LKR)", view.grandTotal, true],
    ]);

    section(doc, "Payment at sale");
    for (const payment of view.payments) keyValues(doc, [[payment.label, `${payment.amount} (${payment.method})`]]);

    if (view.installment) {
      const plan = view.installment;
      section(doc, "Installment plan");
      keyValues(doc, [
        ["Deposit paid", plan.deposit],
        ["Financed amount", plan.financedAmount],
        ["Interest", `${plan.interestAmount} (${plan.interestRatePercent}%)`],
        ["Total repayable", plan.totalRepayable],
        ["Terms", `${plan.termCount} × ${plan.paymentFrequency.toLowerCase()}`],
      ]);
      section(doc, "Installment schedule");
      table(doc, [
        { header: "#", width: 40 },
        { header: "Due date", width: 200 },
        { header: "Amount (LKR)", width: 255, align: "right" },
      ], plan.schedule.map((s) => [String(s.number), s.dueDate, s.amount]));
    }

    footer(doc, "Thank you for your purchase. Please keep this invoice for warranty claims.");
  });
}

export function renderReceiptPdf(view: ReceiptView, store: StoreDetails): Promise<Buffer> {
  return render((doc) => {
    header(doc, store, "PAYMENT RECEIPT", view.number, view.issuedAt);

    section(doc, "Received from");
    keyValues(doc, [
      ["Customer", view.customer.fullName],
      ["Phone", view.customer.phone],
      ["Original invoice", view.invoiceNumber],
      ["Sale reference", view.saleId],
      ["Received by", view.receivedBy],
    ]);

    section(doc, "Payment");
    totals(doc, [[`Amount received (${view.method})`, view.amount, true]]);

    section(doc, "Installments settled by this payment");
    table(doc, [
      { header: "Installment", width: 75 },
      { header: "Due date", width: 80 },
      { header: "Amount due", width: 85, align: "right" },
      { header: "Paid now", width: 85, align: "right" },
      { header: "Balance", width: 80, align: "right" },
      { header: "Status", width: 90, align: "right" },
    ], view.settles.map((s) => [s.installment, s.dueDate, s.amountDue, s.amountApplied, s.balanceAfter, s.status]));

    totals(doc, [["Remaining plan balance (LKR)", view.planBalanceAfter, true]]);
    footer(doc, "Thank you. This receipt confirms the payment above.");
  });
}
