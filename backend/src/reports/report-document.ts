// FR8 — format-independent report model. Builders produce a ReportDocument
// from the database; report-pdf.ts and report-csv.ts render the same document,
// so the PDF and CSV of a report always contain identical figures.
import { Prisma } from "@prisma/client";
import { money } from "../invoices/invoice-view";

export type ColumnType = "text" | "int" | "money" | "date" | "percent";

export interface ReportColumn {
  header: string;
  type?: ColumnType; // default "text"
  weight?: number; // relative PDF column width
}

export type CellValue = string | number | Prisma.Decimal | Date | null | undefined;

export interface ReportTable {
  title: string;
  columns: ReportColumn[];
  rows: CellValue[][];
  totals?: CellValue[];
  note?: string;
  emptyText?: string;
}

export interface SummaryItem {
  label: string;
  value: CellValue;
  type?: ColumnType;
}

export interface ReportDocument {
  title: string;
  storeName: string;
  generatedAt: Date;
  timeZone: string;
  filters: Array<[string, string]>;
  summary: SummaryItem[];
  tables: ReportTable[];
}

export type RenderMode = "pdf" | "csv";

export function formatCell(value: CellValue, type: ColumnType = "text", mode: RenderMode = "pdf"): string {
  if (value === null || value === undefined) return mode === "pdf" ? "-" : "";
  switch (type) {
    case "money": {
      const decimal = new Prisma.Decimal(value instanceof Date ? 0 : value);
      return mode === "pdf" ? money(decimal) : decimal.toFixed(2);
    }
    case "int":
      return String(Math.trunc(Number(value)));
    case "percent":
      return `${new Prisma.Decimal(value instanceof Date ? 0 : value).toDecimalPlaces(2).toString()}%`;
    case "date":
      return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
    default:
      return value instanceof Date ? value.toISOString() : String(value);
  }
}

export function formatTimestamp(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}
