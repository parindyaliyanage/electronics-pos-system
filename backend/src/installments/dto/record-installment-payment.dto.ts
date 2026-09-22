import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsUUID, Min } from "class-validator";
import { PaymentMethod } from "@prisma/client";

export class RecordInstallmentPaymentDto {
  @IsUUID()
  scheduleId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;
}
