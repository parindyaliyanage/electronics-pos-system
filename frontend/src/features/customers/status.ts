import type { HistorySale, ScheduleStatus } from "../../api/types";
import type { Tone } from "../../components/StatusBadge";

export function saleStatus(sale: HistorySale): { label: string; tone: Tone } {
  const plan = sale.installmentPlan;
  if (!plan) return { label: "Paid in full", tone: "success" };
  if (plan.status === "COMPLETED") return { label: "Plan completed", tone: "success" };
  if (plan.status === "CANCELLED") return { label: "Plan cancelled", tone: "neutral" };
  if (plan.schedules.some((s) => s.status === "OVERDUE")) return { label: "Overdue", tone: "danger" };
  return { label: "Paying installments", tone: "info" };
}

const SCHEDULE: Record<ScheduleStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "neutral" },
  PARTIALLY_PAID: { label: "Part paid", tone: "warning" },
  PAID: { label: "Paid", tone: "success" },
  OVERDUE: { label: "Overdue", tone: "danger" },
};

/** The backend keeps a part-paid installment OVERDUE (so it stays on the overdue list); say so. */
export function scheduleStatus(status: ScheduleStatus, paidCents = 0): { label: string; tone: Tone } {
  if (status === "OVERDUE" && paidCents > 0) return { label: "Overdue · part paid", tone: "danger" };
  return SCHEDULE[status];
}

export const PAYMENT_TYPE_LABEL = {
  FULL: "Full payment",
  DEPOSIT: "Deposit",
  INSTALLMENT: "Installment",
} as const;
