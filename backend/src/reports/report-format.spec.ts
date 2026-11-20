import { Prisma } from "@prisma/client";
import { csvField, renderReportCsv } from "./report-csv";
import { formatCell, type ReportDocument } from "./report-document";
import { renderReportPdf } from "./report-pdf";
import { addDays, daysInPeriod, isIsoDate, todayIn } from "./report-period";

const doc: ReportDocument = {
  title: "Sales Report",
  storeName: "Test Store",
  generatedAt: new Date("2026-11-20T04:30:00Z"),
  timeZone: "Asia/Colombo",
  filters: [["Period", "2026-11-01 to 2026-11-30"]],
  summary: [
    { label: "Sales", value: 2, type: "int" },
    { label: "Net revenue (LKR)", value: new Prisma.Decimal("125800"), type: "money" },
  ],
  tables: [{
    title: "Sales by product",
    columns: [{ header: "Product" }, { header: "Units", type: "int" }, { header: "Net", type: "money" }],
    rows: [
      ["Galaxy A55, 128GB", 1, new Prisma.Decimal("120000")],
      ['=HYPERLINK("http://x")', 2, new Prisma.Decimal("-5.5")],
    ],
    totals: ["Total", 3, new Prisma.Decimal("119994.5")],
  }],
};

describe("CSV rendering", () => {
  it("quotes commas/quotes and blocks formula injection but keeps negative numbers", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("=1+1")).toBe("'=1+1");
    expect(csvField("@cmd")).toBe("'@cmd");
    expect(csvField("-x")).toBe("'-x");
    expect(csvField("-5.50")).toBe("-5.50");
  });

  it("writes a BOM, sections, plain numeric amounts and CRLF line endings", () => {
    const csv = renderReportCsv(doc).toString("utf8");
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Test Store - Sales Report");
    expect(lines).toContain("Net revenue (LKR),125800.00");
    expect(lines).toContain('"Galaxy A55, 128GB",1,120000.00');
    expect(lines).toContain(`"'=HYPERLINK(""http://x"")",2,-5.50`);
    expect(lines).toContain("Total,3,119994.50");
  });
});

describe("formatCell", () => {
  it("formats money for PDF with separators and for CSV without", () => {
    expect(formatCell(new Prisma.Decimal("1234567.5"), "money", "pdf")).toBe("1,234,567.50");
    expect(formatCell(new Prisma.Decimal("1234567.5"), "money", "csv")).toBe("1234567.50");
  });
  it("formats dates and empty cells", () => {
    expect(formatCell(new Date("2026-11-27T00:00:00Z"), "date")).toBe("2026-11-27");
    expect(formatCell(null, "money", "pdf")).toBe("-");
    expect(formatCell(null, "money", "csv")).toBe("");
  });
});

describe("periods", () => {
  it("validates real calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("26-2-1")).toBe(false);
  });
  it("counts days inclusively and adds days", () => {
    expect(daysInPeriod({ from: "2026-11-01", to: "2026-11-30" })).toBe(30);
    expect(daysInPeriod({ from: "2026-11-20", to: "2026-11-20" })).toBe(1);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("uses the store time zone for 'today'", () => {
    // 20:00 UTC on 20 Nov is already 21 Nov in Colombo (UTC+5:30).
    expect(todayIn("Asia/Colombo", new Date("2026-11-20T20:00:00Z"))).toBe("2026-11-21");
  });
});

describe("PDF rendering", () => {
  it("renders a valid single-page landscape PDF", async () => {
    const pdf = await renderReportPdf(doc);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
  });

  it("paginates long tables", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => [`Product ${i}`, i, new Prisma.Decimal(i)]);
    const pdf = await renderReportPdf({ ...doc, tables: [{ ...doc.tables[0], rows }] });
    expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });
});
