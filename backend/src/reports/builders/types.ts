import type { PaymentMethod } from "@prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";

/** Filters stored on report_jobs.filters (validated by CreateReportDto). */
export interface ReportFilters {
  from?: string; // YYYY-MM-DD, inclusive, store time zone
  to?: string;
  categoryId?: string;
  cashierId?: string;
  groupBy?: "DAY" | "MONTH";
  stockThreshold?: number;
  lowStockOnly?: boolean;
  status?: "ACTIVE" | "OVERDUE" | "COMPLETED";
  paymentMethod?: PaymentMethod;
}

export interface BuildContext {
  prisma: PrismaService;
  timeZone: string;
  storeName: string;
  now: Date;
}

export const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  OTHER: "Other",
};
