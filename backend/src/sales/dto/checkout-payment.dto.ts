import { Type } from "class-transformer";
import { IsEnum, IsNumber, Min } from "class-validator";
import { PaymentMethod, PaymentType } from "@prisma/client";

export class CheckoutPaymentDto {
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsEnum(PaymentType)
  type!: PaymentType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
}
