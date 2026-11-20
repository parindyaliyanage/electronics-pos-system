import type { PaymentFrequency } from "../../api/types";
import type { Cents } from "../../lib/money";

/**
 * Client-side copy of backend/src/installments/installment-calculator.ts so
 * the cashier sees the exact schedule before confirming:
 *  - interest = financed x rate (flat, once), rounded half-up to the cent;
 *  - each installment = total / terms rounded DOWN to the cent;
 *  - the last installment takes the remainder;
 *  - due dates count from today's UTC date (as the server does).
 * The server's response is still the source of truth.
 */
export interface InstallmentPreview {
  financed: Cents;
  interest: Cents;
  totalRepayable: Cents;
  regularAmount: Cents;
  lastAmount: Cents;
  schedule: Array<{ dueDate: string; amount: Cents }>;
}

export function previewInstallments(
  financed: Cents,
  interestRate: string,
  termCount: number,
  frequency: PaymentFrequency,
  start = new Date(),
): InstallmentPreview {
  // Rate is Decimal(5,4): work in ten-thousandths so the maths stays integer.
  const rate = Math.round(Number(interestRate) * 10_000);
  const interest = Math.floor((financed * rate + 5_000) / 10_000);
  const totalRepayable = financed + interest;
  const regularAmount = Math.floor(totalRepayable / termCount);
  const lastAmount = totalRepayable - regularAmount * (termCount - 1);
  const schedule = Array.from({ length: termCount }, (_, i) => ({
    dueDate: dueDate(start, frequency, i + 1),
    amount: i === termCount - 1 ? lastAmount : regularAmount,
  }));
  return { financed, interest, totalRepayable, regularAmount, lastAmount, schedule };
}

function dueDate(start: Date, frequency: PaymentFrequency, sequence: number) {
  const base = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  if (frequency === "MONTHLY") {
    const month = base.getUTCMonth() + sequence;
    const lastDay = new Date(Date.UTC(base.getUTCFullYear(), month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(base.getUTCFullYear(), month, Math.min(base.getUTCDate(), lastDay))).toISOString().slice(0, 10);
  }
  base.setUTCDate(base.getUTCDate() + (frequency === "WEEKLY" ? 7 : 14) * sequence);
  return base.toISOString().slice(0, 10);
}

export const FREQUENCY_LABEL: Record<PaymentFrequency, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY: "Monthly",
};
