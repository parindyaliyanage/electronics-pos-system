import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, Max, Min } from "class-validator";

export class UpdateInstallmentPolicyDto {
  // Decimal fraction: 0.10 means 10% simple interest.
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  interestRate!: number;

  // FR6 — days before the due date that the reminder is sent (default 3).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  reminderDaysBefore?: number;

  // FR6 — days after the due date before an unpaid installment is marked overdue (default 5).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  gracePeriodDays?: number;
}
