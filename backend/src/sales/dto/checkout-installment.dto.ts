import { Type } from "class-transformer";
import { IsEnum, IsInt, Max, Min } from "class-validator";
import { PaymentFrequency } from "@prisma/client";

export class CheckoutInstallmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  termCount!: number;

  @IsEnum(PaymentFrequency)
  paymentFrequency!: PaymentFrequency;
}
