// FR6 — one workflow per installment schedule, started by the backend at plan
// creation. Timeline:
//   reminderAt (due − N days) → send reminder (retried with backoff)
//   dueAt (due date)          → check payment
//   overdueAt (due + grace)   → check again, mark OVERDUE if still unpaid
// Every wait is a durable Temporal timer, so a worker/backend restart resumes
// at the same point. A "recheckPayment" signal (sent by the backend whenever a
// payment is recorded or the plan is cancelled) wakes the workflow early to
// check; if the installment is settled the workflow ends with no further action.

import {
  ActivityFailure,
  condition,
  defineQuery,
  defineSignal,
  log,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";
import type * as activities from "../activities";
import {
  RECHECK_SIGNAL,
  STATE_QUERY,
  type InstallmentReminderInput,
  type WorkflowStage,
  type WorkflowState,
} from "../shared";
import { buildTimeline, isSettled } from "./timeline";

export const recheckPaymentSignal = defineSignal(RECHECK_SIGNAL);
export const stateQuery = defineQuery<WorkflowState>(STATE_QUERY);

// Database reads/writes: retried until the DB is reachable again.
const { checkPaymentStatus, escalateOverdue } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
  retry: { initialInterval: "5 seconds", backoffCoefficient: 2, maximumInterval: "5 minutes" },
});

// Notification: a limited number of attempts with exponential backoff
// (10s, 20s, 40s, 80s), per FR6. Exhaustion is recorded, not silent.
const { sendReminder } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
  retry: {
    initialInterval: "10 seconds",
    backoffCoefficient: 2,
    maximumInterval: "2 minutes",
    maximumAttempts: 5,
  },
});

export async function installmentReminderWorkflow(input: InstallmentReminderInput): Promise<WorkflowStage> {
  const timeline = buildTimeline(input);
  const state: WorkflowState = {
    stage: "WAITING_FOR_REMINDER",
    reminder: "NOT_YET",
    reminderAt: new Date(timeline.reminderAt).toISOString(),
    dueAt: new Date(timeline.dueAt).toISOString(),
    overdueAt: new Date(timeline.overdueAt).toISOString(),
    lastCheckedStatus: null,
    lastCheckedAt: null,
  };
  let recheckRequested = false;
  setHandler(recheckPaymentSignal, () => {
    recheckRequested = true;
  });
  setHandler(stateQuery, () => state);

  const check = async () => {
    const status = await checkPaymentStatus(input.scheduleId);
    state.lastCheckedStatus = `${status.scheduleStatus}/${status.planStatus}`;
    state.lastCheckedAt = new Date().toISOString();
    return isSettled(status);
  };

  /** Sleeps until `target`; returns true if a signal-triggered check found the installment settled. */
  const sleepUntil = async (target: number): Promise<boolean> => {
    for (;;) {
      const remaining = target - Date.now(); // deterministic workflow clock
      if (remaining <= 0) return false;
      recheckRequested = false;
      const woken = await condition(() => recheckRequested, remaining);
      if (!woken) return false;
      if (await check()) return true;
    }
  };

  const finish = (stage: WorkflowStage) => {
    state.stage = stage;
    log.info("Installment workflow finished", { scheduleId: input.scheduleId, stage });
    return stage;
  };

  // 1. Reminder
  if (await sleepUntil(timeline.reminderAt)) return finish("SETTLED");
  if (await check()) return finish("SETTLED");
  try {
    state.reminder = await sendReminder(input.scheduleId);
  } catch (error) {
    if (!(error instanceof ActivityFailure)) throw error;
    // Retries exhausted; the failure is stored on the notification row.
    // Carry on to the due-date check rather than stopping the escalation.
    state.reminder = "FAILED";
    log.warn("Reminder could not be sent after retries", { scheduleId: input.scheduleId });
  }

  // 2. Due date
  state.stage = "WAITING_FOR_DUE_DATE";
  if (await sleepUntil(timeline.dueAt)) return finish("SETTLED");
  if (await check()) return finish("SETTLED");

  // 3. Grace period, then escalate
  state.stage = "IN_GRACE_PERIOD";
  if (await sleepUntil(timeline.overdueAt)) return finish("SETTLED");
  if (await check()) return finish("SETTLED");
  await escalateOverdue(input.scheduleId);
  return finish("ESCALATED");
}
