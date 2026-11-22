import type { PlanSchedule } from "../../api/types";
import { toCents, type Cents } from "../../lib/money";

/**
 * Mirrors InstallmentsService.recordPaymentOnce: a payment recorded against
 * one installment fills that installment, then carries forward to the later
 * ones in due-date order (never back to earlier ones). The most that can be
 * taken is everything still owed from the chosen installment onward.
 */
export interface Allocation {
  scheduleId: string;
  index: number;
  applied: Cents;
  settles: boolean;
}

export function owed(schedule: PlanSchedule): Cents {
  return Math.max(toCents(schedule.amount) - toCents(schedule.amountPaid), 0);
}

export function maxPayable(schedules: PlanSchedule[], fromIndex: number): Cents {
  return schedules.slice(fromIndex).reduce((sum, s) => sum + owed(s), 0);
}

export function allocate(schedules: PlanSchedule[], fromIndex: number, amount: Cents): Allocation[] {
  const result: Allocation[] = [];
  let left = amount;
  for (let i = fromIndex; i < schedules.length && left > 0; i += 1) {
    const remaining = owed(schedules[i]);
    if (remaining === 0) continue;
    const applied = Math.min(left, remaining);
    result.push({ scheduleId: schedules[i].id, index: i, applied, settles: applied === remaining });
    left -= applied;
  }
  return result;
}

/** Unpaid installments before the chosen one: this payment won't touch them. */
export function earlierUnpaid(schedules: PlanSchedule[], fromIndex: number) {
  return schedules.slice(0, fromIndex).map((s, i) => ({ s, i })).filter(({ s }) => owed(s) > 0);
}
