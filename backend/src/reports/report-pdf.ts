// FR8 — renders a ReportDocument as a landscape A4 PDF.
import PDFDocument from "pdfkit";
import { formatCell, formatTimestamp, type ReportDocument, type ReportTable } from "./report-document";

const MARGIN = 40;
const GREY = "#555555";
const RULE = "#cccccc";
const ZEBRA = "#f5f5f5";

type Doc = PDFKit.PDFDocument;

const DEFAULT_WEIGHT = { text: 2, int: 0.8, money: 1.2, date: 1.1, percent: 0.8 } as const;

export function renderReportPdf(report: ReportDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = doc.page.width - MARGIN * 2;
    header(doc, report, width);
    summary(doc, report, width);
    for (const table of report.tables) drawTable(doc, table, width);

    const range = doc.bufferedPageRange();
    const stamp = `${report.storeName} - ${report.title} - generated ${formatTimestamp(report.generatedAt, report.timeZone)}`;
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0; // writing in the margin must not add a page
      doc.font("Helvetica").fontSize(7).fillColor(GREY)
        .text(stamp, MARGIN, doc.page.height - MARGIN / 2 - 6, { width, align: "left", lineBreak: false })
        .text(`Page ${i + 1} of ${range.count}`, MARGIN, doc.page.height - MARGIN / 2 - 6, { width, align: "right", lineBreak: false });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  });
}

function header(doc: Doc, report: ReportDocument, width: number) {
  doc.font("Helvetica-Bold").fontSize(9).fillColor(GREY).text(report.storeName.toUpperCase(), MARGIN, MARGIN, { width });
  doc.font("Helvetica-Bold").fontSize(18).fillColor("black").text(report.title, { width });
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(9).fillColor(GREY);
  const parts = [...report.filters.map(([k, v]) => `${k}: ${v}`), `Generated: ${formatTimestamp(report.generatedAt, report.timeZone)}`];
  doc.text(parts.join("   |   "), { width });
  doc.moveDown(0.5);
  rule(doc, width);
}

function summary(doc: Doc, report: ReportDocument, width: number) {
  if (!report.summary.length) return;
  const perRow = Math.min(report.summary.length, 5);
  const boxWidth = width / perRow;
  for (let i = 0; i < report.summary.length; i += perRow) {
    const y = doc.y;
    report.summary.slice(i, i + perRow).forEach((item, j) => {
      const x = MARGIN + j * boxWidth;
      doc.font("Helvetica").fontSize(8).fillColor(GREY).text(item.label, x, y, { width: boxWidth - 8 });
      doc.font("Helvetica-Bold").fontSize(13).fillColor("black")
        .text(formatCell(item.value, item.type, "pdf"), x, y + 11, { width: boxWidth - 8 });
    });
    doc.y = y + 34;
  }
  doc.moveDown(0.3);
  rule(doc, width);
}

function rule(doc: Doc, width: number) {
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + width, doc.y).strokeColor(RULE).lineWidth(0.7).stroke();
  doc.moveDown(0.5);
}

function drawTable(doc: Doc, table: ReportTable, width: number) {
  const pageBottom = () => doc.page.height - MARGIN - 16;
  const weights = table.columns.map((c) => c.weight ?? DEFAULT_WEIGHT[c.type ?? "text"]);
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / total) * width);
  const alignOf = (i: number) => (["int", "money", "percent"].includes(table.columns[i].type ?? "text") ? "right" : "left");

  // Keep the title with at least a few rows.
  if (doc.y + 70 > pageBottom()) doc.addPage();
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("black").text(table.title, MARGIN, doc.y, { width });
  if (table.note) doc.font("Helvetica-Oblique").fontSize(8).fillColor(GREY).text(table.note, { width });
  doc.moveDown(0.3);

  const drawRow = (cells: string[], options: { bold?: boolean; fill?: string }) => {
    doc.font(options.bold ? "Helvetica-Bold" : "Helvetica").fontSize(8);
    const height = Math.max(10, ...cells.map((cell, i) => doc.heightOfString(cell, { width: widths[i] - 6 }))) + 4;
    if (doc.y + height > pageBottom()) {
      doc.addPage();
      drawRow(table.columns.map((c) => c.header), { bold: true, fill: "#e8e8e8" }); // repeat header
      doc.font(options.bold ? "Helvetica-Bold" : "Helvetica").fontSize(8);
    }
    const y = doc.y;
    if (options.fill) doc.rect(MARGIN, y, width, height).fill(options.fill);
    let x = MARGIN;
    cells.forEach((cell, i) => {
      doc.fillColor("black").text(cell, x + 3, y + 2, { width: widths[i] - 6, align: alignOf(i) });
      x += widths[i];
    });
    doc.y = y + height;
  };

  drawRow(table.columns.map((c) => c.header), { bold: true, fill: "#e8e8e8" });
  if (!table.rows.length) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(GREY)
      .text(table.emptyText ?? "No data for the selected filters.", MARGIN + 3, doc.y + 3, { width });
    doc.moveDown(0.5);
  }
  table.rows.forEach((row, index) => {
    drawRow(row.map((cell, i) => formatCell(cell, table.columns[i].type, "pdf")), { fill: index % 2 ? ZEBRA : undefined });
  });
  if (table.totals) {
    drawRow(table.totals.map((cell, i) => (cell === null || cell === undefined ? "" : formatCell(cell, table.columns[i].type, "pdf"))), { bold: true });
  }
  doc.moveDown(0.6);
}
