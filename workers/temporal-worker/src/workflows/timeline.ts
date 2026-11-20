// Pure helpers used inside the workflow sandbox — no I/O, no Node APIs.
import type { InstallmentReminderInput, PaymentStatus } from "../shared";

export const REAL_DAY_MS = 86_400_000;

export interface Timeline {
  reminderAt: number;
  dueAt: number;
  overdueAt: number;
}

/**
 * Absolute (epoch ms) times for the three checkpoints of one installment.
 *
 * Real targets are: due date − reminderDaysBefore, the due date (00:00 UTC),
 * and due date + gracePeriodDays. When dayDurationMs is shorter than a real
 * day, the distance from startedAt to each target is scaled by the same
 * factor, so a weekly installment can run its whole life in a couple of
 * minutes during testing.
 */
export function buildTimeline(input: InstallmentReminderInput): Timeline {
  const start = Date.parse(input.startedAt);
  const due = Date.parse(`${input.dueDate.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(due)) {
    throw new Error("Invalid startedAt or dueDate in workflow input");
  }
  const scale = input.dayDurationMs / REAL_DAY_MS;
  const at = (realTarget: number) => start + Math.round((realTarget - start) * scale);
  return {
    reminderAt: at(due - input.reminderDaysBefore * REAL_DAY_MS),
    dueAt: at(due),
    overdueAt: at(due + input.gracePeriodDays * REAL_DAY_MS),
  };
}

/** The workflow stops for good once the installment is paid or the plan is no longer active. */
export function isSettled(status: PaymentStatus): boolean {
  return status.scheduleStatus === "PAID"
    || status.scheduleStatus === "MISSING"
    || status.planStatus !== "ACTIVE";
}
