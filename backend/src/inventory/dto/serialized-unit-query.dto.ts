import { SerializedUnitStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";
import { InventoryQueryDto } from "./inventory-query.dto";

export class SerializedUnitQueryDto extends InventoryQueryDto {
  // e.g. IN_STOCK: only the units the POS can still sell.
  @IsOptional()
  @IsEnum(SerializedUnitStatus)
  status?: SerializedUnitStatus;
}
