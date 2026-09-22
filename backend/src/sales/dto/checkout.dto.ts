import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsOptional, IsUUID, ValidateNested } from "class-validator";
import { CheckoutItemDto } from "./checkout-item.dto";
import { CheckoutInstallmentDto } from "./checkout-installment.dto";
import { CheckoutPaymentDto } from "./checkout-payment.dto";

export class CheckoutDto {
  @IsUUID()
  customerId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @ValidateNested()
  @Type(() => CheckoutPaymentDto)
  payment!: CheckoutPaymentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutInstallmentDto)
  installment?: CheckoutInstallmentDto;
}
