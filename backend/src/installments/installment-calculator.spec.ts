import { PaymentFrequency, Prisma } from "@prisma/client";
import { calculateInstallmentSchedule } from "./installment-calculator";
import { describe, it } from "node:test";

describe("calculateInstallmentSchedule", () => {
  it("adds simple interest and puts rounding remainder in the last installment", () => {
    const result = calculateInstallmentSchedule(
      new Prisma.Decimal(100),
      new Prisma.Decimal("0.10"),
      3,
      PaymentFrequency.MONTHLY,
      new Date("2026-01-31T00:00:00.000Z"),
    );

    expect(result.interestAmount.equals(10)).toBe(true);
    expect(result.totalRepayable.equals(110)).toBe(true);
    expect(result.schedules.map(({ amount }) => amount.toString())).toEqual(["36.66", "36.66", "36.68"]);
    expect(result.schedules.map(({ dueDate }) => dueDate.toISOString().slice(0, 10)))
      .toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("supports weekly schedules", () => {
    const result = calculateInstallmentSchedule(
      new Prisma.Decimal(100),
      new Prisma.Decimal(0),
      2,
      PaymentFrequency.WEEKLY,
      new Date("2026-09-17T12:00:00.000Z"),
    );

    expect(result.schedules.map(({ dueDate }) => dueDate.toISOString().slice(0, 10)))
      .toEqual(["2026-09-24", "2026-10-01"]);
  });
});
