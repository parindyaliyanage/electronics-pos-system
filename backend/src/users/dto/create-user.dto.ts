import { Transform } from "class-transformer";
import { IsEmail, IsEnum, IsString, MaxLength, MinLength } from "class-validator";
import { UserRole } from "@prisma/client";
import { IsStrongPassword } from "./password.rules";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toLowerCase() : value;

export class CreateUserDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsStrongPassword()
  password!: string;
}
