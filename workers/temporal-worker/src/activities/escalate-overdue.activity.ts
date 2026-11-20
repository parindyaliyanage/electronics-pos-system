import { log } from "@temporalio/activity";
import { db } from "./db";

/**
 * Marks an unpaid installment OVERDUE so it appears in GET /installments/overdue
 * (the Administrator dashboard list). Idempotent: a retry or replay that runs
 * after the row is already OVERDUE/PAID changes nothing.
 */
export async function escalateOverdue(scheduleId: string): Promise<boolean> {
  const { rowCount } = await db().query(
    `UPDATE installment_schedules s
        SET status = 'OVERDUE', overdue_at = now(), updated_at = now()
       FROM installment_plans p
      WHERE s.id = $1
        AND p.id = s.plan_id
        AND p.status = 'ACTIVE'
        AND s.status IN ('PENDING', 'PARTIALLY_PAID')`,
    [scheduleId],
  );
  const escalated = rowCount === 1;
  log.info("Overdue escalation", { scheduleId, escalated });
  return escalated;
}
