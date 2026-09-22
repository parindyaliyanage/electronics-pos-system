import { Type } from "class-transformer";
import { IsNumber, Max, Min } from "class-validator";

export class UpdateInstallmentPolicyDto {
  // Decimal fraction: 0.10 means 10% simple interest.
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  interestRate!: number;
}
