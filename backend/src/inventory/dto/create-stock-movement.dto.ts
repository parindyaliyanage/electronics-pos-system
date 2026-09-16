import { Type } from "class-transformer";
import { IsEnum, IsInt, IsUUID, NotEquals } from "class-validator";
import { StockMovementType } from "@prisma/client";

export class CreateStockMovementDto {
  @IsUUID()
  productId!: string;

  @IsEnum(StockMovementType)
  type!: StockMovementType;

  @Type(() => Number)
  @IsInt()
  @NotEquals(0)
  quantity!: number;
}
