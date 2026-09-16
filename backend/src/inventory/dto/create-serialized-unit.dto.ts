import { Transform, Type } from "class-transformer";
import { IsDate, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreateSerializedUnitDto {
  @IsUUID()
  productId!: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  serialNumber!: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  warrantyStartDate?: Date;
}
