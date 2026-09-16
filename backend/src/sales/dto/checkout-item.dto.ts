import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, IsUUID, Min } from "class-validator";

export class CheckoutItemDto {
  @IsUUID()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  // The catalog price shown to the cashier. Checkout rejects stale prices.
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;

  // Discount per physical unit, not the total discount for the line.
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount: number = 0;

  @IsOptional()
  @IsUUID()
  serializedUnitId?: string;
}
