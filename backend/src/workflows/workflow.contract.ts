// FR6 — copy of workers/temporal-worker/src/shared.ts (the subset the backend
// needs). Keep both files in sync when the workflow contract changes.

export const DEFAULT_TASK_QUEUE = "smartretail-installments";
export const WORKFLOW_TYPE = "installmentReminderWorkflow";
export const RECHECK_SIGNAL = "recheckPayment";
export const STATE_QUERY = "state";
export const REAL_DAY_MS = 86_400_000;

export const workflowIdFor = (scheduleId: string) => `installment-reminder-${scheduleId}`;

export interface InstallmentReminderInput {
  scheduleId: string;
  dueDate: string;
  startedAt: string;
  reminderDaysBefore: number;
  gracePeriodDays: number;
  dayDurationMs: number;
}
