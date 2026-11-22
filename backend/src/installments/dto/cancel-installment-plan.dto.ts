import { InstallmentCancelReason } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from "class-validator";

export class CancelInstallmentPlanDto {
  @IsEnum(InstallmentCancelReason)
  reason!: InstallmentCancelReason;

  // Free-text detail, trimmed; "" means no note. Required when the reason is OTHER.
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @ValidateIf((dto: CancelInstallmentPlanDto) => dto.reason === InstallmentCancelReason.OTHER || dto.note !== "")
  @IsString()
  @IsNotEmpty({ message: "note is required when the reason is OTHER" })
  @MaxLength(500)
  note: string = "";
}
