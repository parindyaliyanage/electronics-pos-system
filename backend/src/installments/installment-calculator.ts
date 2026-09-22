import { PaymentFrequency, Prisma } from "@prisma/client";

function addMonthsClamped(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

function dueDateFor(startDate: Date, frequency: PaymentFrequency, sequence: number) {
  const date = new Date(Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  ));
  if (frequency === PaymentFrequency.MONTHLY) return addMonthsClamped(date, sequence);
  const days = frequency === PaymentFrequency.WEEKLY ? 7 : 14;
  date.setUTCDate(date.getUTCDate() + days * sequence);
  return date;
}

export function calculateInstallmentSchedule(
  financedAmount: Prisma.Decimal,
  interestRate: Prisma.Decimal,
  termCount: number,
  paymentFrequency: PaymentFrequency,
  startDate = new Date(),
) {
  const interestAmount = financedAmount.mul(interestRate).toDecimalPlaces(2);
  const totalRepayable = financedAmount.plus(interestAmount).toDecimalPlaces(2);
  const regularAmount = totalRepayable
    .div(termCount)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const schedules = Array.from({ length: termCount }, (_, index) => ({
    dueDate: dueDateFor(startDate, paymentFrequency, index + 1),
    amount: index === termCount - 1
      ? totalRepayable.minus(regularAmount.mul(termCount - 1))
      : regularAmount,
  }));
  return { interestAmount, totalRepayable, schedules };
}
