import type { CancelReason, Plan, ReminderRecord } from "../../api/types";
import type { Tone } from "../../components/StatusBadge";
import { formatDate } from "../../lib/documents";

export function planStatus(plan: Pick<Plan, "status" | "schedules">): { label: string; tone: Tone } {
  if (plan.status === "COMPLETED") return { label: "Paid off", tone: "success" };
  if (plan.status === "CANCELLED") return { label: "Cancelled", tone: "neutral" };
  const overdue = plan.schedules.filter((s) => s.status === "OVERDUE").length;
  if (overdue) return { label: overdue > 1 ? `${overdue} overdue` : "Overdue", tone: "danger" };
  return { label: "Active", tone: "info" };
}

/** FR6 reminder state for one installment, from GET /installments/:id/reminders. */
export function reminderLabel(reminder: ReminderRecord | undefined): { text: string; title?: string } {
  if (!reminder) return { text: "—" };
  switch (reminder.status) {
    case "SENT":
      return { text: `Sent ${reminder.sentAt ? formatDate(reminder.sentAt) : ""}`, title: reminder.recipient ?? undefined };
    case "PENDING":
      return { text: "Waiting to send" };
    case "SKIPPED":
      return { text: "Skipped", title: reminder.lastError ?? "No email address on file" };
    case "FAILED":
      return { text: `Failed (${reminder.attempts} tries)`, title: reminder.lastError ?? undefined };
  }
}

export const CANCEL_REASON_LABEL: Record<CancelReason, string> = {
  ITEM_RETURNED: "Item returned by the customer",
  DEBT_WRITTEN_OFF: "Debt written off",
  CUSTOMER_REQUEST: "Customer asked to cancel",
  CREATED_IN_ERROR: "Plan created by mistake",
  OTHER: "Other",
};

/** "Debt written off: customer moved abroad", or that the reason wasn't recorded (older plans). */
export function describeCancellation(plan: { cancelReason: CancelReason | null; cancelNote: string | null }) {
  if (!plan.cancelReason) return "Reason not recorded (cancelled before reasons were required).";
  const label = CANCEL_REASON_LABEL[plan.cancelReason];
  if (!plan.cancelNote) return label;
  return plan.cancelReason === "OTHER" ? plan.cancelNote : `${label}: ${plan.cancelNote}`;
}
