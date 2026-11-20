import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { UserRole } from "@prisma/client";

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
};

export class UserQueryDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  active?: boolean;

  /** Matches email or full name, case-insensitive. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
