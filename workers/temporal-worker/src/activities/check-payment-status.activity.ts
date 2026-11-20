import type { PaymentStatus } from "../shared";
import { db } from "./db";

/** Reads the live schedule and plan status from Postgres. */
export async function checkPaymentStatus(scheduleId: string): Promise<PaymentStatus> {
  const { rows } = await db().query<{ schedule_status: string; plan_status: string }>(
    `SELECT s.status AS schedule_status, p.status AS plan_status
       FROM installment_schedules s
       JOIN installment_plans p ON p.id = s.plan_id
      WHERE s.id = $1`,
    [scheduleId],
  );
  if (!rows.length) return { scheduleStatus: "MISSING", planStatus: "MISSING" };
  return {
    scheduleStatus: rows[0].schedule_status as PaymentStatus["scheduleStatus"],
    planStatus: rows[0].plan_status as PaymentStatus["planStatus"],
  };
}
