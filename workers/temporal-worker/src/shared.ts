// FR6 — contract shared between the backend (which starts/signals workflows)
// and this worker (which runs them). backend/src/workflows/workflow.contract.ts
// holds an identical copy; keep the two in sync.

export const DEFAULT_TASK_QUEUE = "smartretail-installments";
export const WORKFLOW_TYPE = "installmentReminderWorkflow";
export const RECHECK_SIGNAL = "recheckPayment";
export const STATE_QUERY = "state";

export const workflowIdFor = (scheduleId: string) => `installment-reminder-${scheduleId}`;

export interface InstallmentReminderInput {
  scheduleId: string;
  /** Installment due date, YYYY-MM-DD (UTC). */
  dueDate: string;
  /** When the backend started the workflow, ISO timestamp. */
  startedAt: string;
  reminderDaysBefore: number;
  gracePeriodDays: number;
  /**
   * Length of one "day" in milliseconds. 86 400 000 in production; a smaller
   * value (e.g. 10 000) compresses the whole timeline for demos and testing.
   */
  dayDurationMs: number;
}

export type WorkflowStage =
  | "WAITING_FOR_REMINDER"
  | "WAITING_FOR_DUE_DATE"
  | "IN_GRACE_PERIOD"
  | "SETTLED"
  | "ESCALATED";

export type ReminderOutcome = "NOT_YET" | "SENT" | "ALREADY_SENT" | "SKIPPED" | "FAILED";

export interface WorkflowState {
  stage: WorkflowStage;
  reminder: ReminderOutcome;
  reminderAt: string;
  dueAt: string;
  overdueAt: string;
  lastCheckedStatus: string | null;
  lastCheckedAt: string | null;
}

export interface PaymentStatus {
  scheduleStatus: "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "MISSING";
  planStatus: "ACTIVE" | "COMPLETED" | "CANCELLED" | "MISSING";
}
