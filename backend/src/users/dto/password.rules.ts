import { applyDecorators } from "@nestjs/common";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";

// bcrypt only uses the first 72 bytes, so longer passwords are rejected
// rather than silently truncated.
export const IsStrongPassword = () => applyDecorators(
  IsString(),
  MinLength(8),
  MaxLength(72),
  Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: "password must contain at least one letter and one number",
  }),
);
