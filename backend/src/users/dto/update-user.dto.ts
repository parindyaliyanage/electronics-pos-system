import { Transform } from "class-transformer";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { UserRole } from "@prisma/client";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

// Email is the login identifier and is deliberately not editable; create a
// new account instead so login and audit history stay unambiguous.
export class UpdateUserDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
