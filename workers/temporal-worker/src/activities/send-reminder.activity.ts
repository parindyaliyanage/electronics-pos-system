import { Context, log } from "@temporalio/activity";
import type { ReminderOutcome } from "../shared";
import { db } from "./db";
import { sendEmail } from "./mailer";

interface ReminderRow {
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
}

interface ScheduleDetails {
  due_date: string; // YYYY-MM-DD, formatted in SQL to avoid local-timezone shifts
  amount: string;
  amount_paid: string;
  full_name: string;
  email: string | null;
}

/**
 * Sends the FR6 email reminder for one installment.
 *
 * Duplicate protection: installment_notifications has UNIQUE (schedule_id, type),
 * and a row already marked SENT short-circuits. So a workflow replay, a worker
 * restart, or an activity retry after a successful send never emails twice.
 * A provider error is stored on the row and re-thrown so Temporal retries with
 * backoff; once retries run out, the row stays FAILED with the last error.
 */
export async function sendReminder(scheduleId: string): Promise<ReminderOutcome> {
  const pool = db();
  await pool.query(
    `INSERT INTO installment_notifications (id, schedule_id, type, channel, status, updated_at)
     VALUES (gen_random_uuid(), $1, 'REMINDER', 'EMAIL', 'PENDING', now())
     ON CONFLICT (schedule_id, type) DO NOTHING`,
    [scheduleId],
  );
  const { rows: [existing] } = await pool.query<ReminderRow>(
    `SELECT status FROM installment_notifications WHERE schedule_id = $1 AND type = 'REMINDER'`,
    [scheduleId],
  );
  if (existing?.status === "SENT") return "ALREADY_SENT";
  if (existing?.status === "SKIPPED") return "SKIPPED";

  const { rows: [details] } = await pool.query<ScheduleDetails>(
    `SELECT to_char(s.due_date, 'YYYY-MM-DD') AS due_date, s.amount,
            COALESCE((SELECT SUM(a.amount_applied) FROM payment_allocations a WHERE a.schedule_id = s.id), 0) AS amount_paid,
            c.full_name, c.email
       FROM installment_schedules s
       JOIN installment_plans p ON p.id = s.plan_id
       JOIN sales sa ON sa.id = p.sale_id
       JOIN customers c ON c.id = sa.customer_id
      WHERE s.id = $1`,
    [scheduleId],
  );
  if (!details) throw new Error(`Installment schedule ${scheduleId} not found`);

  if (!details.email) {
    await pool.query(
      `UPDATE installment_notifications
          SET status = 'SKIPPED', last_error = 'Customer has no email address', updated_at = now()
        WHERE schedule_id = $1 AND type = 'REMINDER'`,
      [scheduleId],
    );
    log.warn("Reminder skipped: customer has no email", { scheduleId });
    return "SKIPPED";
  }

  const dueDate = details.due_date;
  const outstanding = (Number(details.amount) - Number(details.amount_paid)).toFixed(2);
  await pool.query(
    `UPDATE installment_notifications
        SET attempts = attempts + 1, recipient = $2, updated_at = now()
      WHERE schedule_id = $1 AND type = 'REMINDER'`,
    [scheduleId, details.email],
  );
  try {
    await sendEmail({
      to: details.email,
      subject: `Installment reminder: ${outstanding} due on ${dueDate}`,
      text: [
        `Dear ${details.full_name},`,
        "",
        `This is a reminder that your installment of ${outstanding} is due on ${dueDate}.`,
        "Please visit the store to make your payment. If you have already paid, please ignore this message.",
        "",
        "SmartRetail",
      ].join("\n"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(
      `UPDATE installment_notifications
          SET status = 'FAILED', last_error = $2, updated_at = now()
        WHERE schedule_id = $1 AND type = 'REMINDER'`,
      [scheduleId, message.slice(0, 500)],
    );
    log.warn("Reminder send failed; Temporal will retry", {
      scheduleId,
      attempt: Context.current().info.attempt,
      error: message,
    });
    throw error;
  }

  await pool.query(
    `UPDATE installment_notifications
        SET status = 'SENT', sent_at = now(), last_error = NULL, updated_at = now()
      WHERE schedule_id = $1 AND type = 'REMINDER'`,
    [scheduleId],
  );
  log.info("Reminder sent", { scheduleId, to: details.email });
  return "SENT";
}
