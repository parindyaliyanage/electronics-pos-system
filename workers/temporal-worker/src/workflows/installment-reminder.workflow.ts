// FR6 — reminds customers of upcoming/overdue installment payments and
// escalates overdue schedules. Started/signalled from backend/src/workflows/.

import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "../activities/send-reminder.activity";
import type * as checkActivities from "../activities/check-payment-status.activity";
import type * as escalateActivities from "../activities/escalate-overdue.activity";

const { sendReminder } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});
const { checkPaymentStatus } = proxyActivities<typeof checkActivities>({
  startToCloseTimeout: "1 minute",
});
const { escalateOverdue } = proxyActivities<typeof escalateActivities>({
  startToCloseTimeout: "1 minute",
});

export async function installmentReminderWorkflow(scheduleId: string): Promise<void> {
  const status = await checkPaymentStatus(scheduleId);
  if (status === "OVERDUE") {
    await escalateOverdue(scheduleId);
  } else {
    await sendReminder(scheduleId);
  }
}
