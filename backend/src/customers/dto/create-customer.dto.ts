import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
const optionalTrim = ({ value }: { value: unknown }) => {
  if (typeof value !== "string") return value;
  return value.trim() || undefined;
};
const normalizePhone = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.replace(/[\s()-]/g, "") : value;

export class CreateCustomerDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @Transform(normalizePhone)
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, {
    message: "phone must contain 7 to 15 digits and may start with +",
  })
  phone!: string;

  @IsOptional()
  @Transform(optionalTrim)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(500)
  address?: string;
}
