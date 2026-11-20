import { formatCell, formatTimestamp, type ReportDocument } from "./report-document";

/**
 * Escapes one CSV field (RFC 4180) and neutralises spreadsheet formula
 * injection: a value starting with = + @ (or - not followed by a digit) is
 * prefixed with ' so Excel treats it as text. Negative numbers are left alone.
 */
export function csvField(value: string) {
  let safe = value;
  if (/^[=+@\t\r]/.test(safe) || /^-(?![\d.])/.test(safe)) safe = `'${safe}`;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const line = (fields: string[]) => fields.map(csvField).join(",");

/**
 * One CSV file with labelled sections separated by blank lines, which opens
 * cleanly in Excel / Google Sheets. Amounts are plain numbers (no thousands
 * separators) so they stay numeric in a spreadsheet.
 */
export function renderReportCsv(doc: ReportDocument): Buffer {
  const out: string[] = [];
  out.push(line([`${doc.storeName} - ${doc.title}`]));
  for (const [label, value] of doc.filters) out.push(line([label, value]));
  out.push(line(["Generated", formatTimestamp(doc.generatedAt, doc.timeZone)]));

  if (doc.summary.length) {
    out.push("", line(["Summary"]), line(["Metric", "Value"]));
    for (const item of doc.summary) out.push(line([item.label, formatCell(item.value, item.type, "csv")]));
  }

  for (const table of doc.tables) {
    out.push("", line([table.title]));
    if (table.note) out.push(line([table.note]));
    out.push(line(table.columns.map((c) => c.header)));
    for (const row of table.rows) {
      out.push(line(row.map((cell, i) => formatCell(cell, table.columns[i]?.type, "csv"))));
    }
    if (table.totals) out.push(line(table.totals.map((cell, i) => formatCell(cell, table.columns[i]?.type, "csv"))));
  }
  // UTF-8 BOM so Excel detects the encoding (customer names, etc.).
  return Buffer.from(`\uFEFF${out.join("\r\n")}\r\n`, "utf8");
}
