import { IsStrongPassword } from "./password.rules";

export class ResetPasswordDto {
  @IsStrongPassword()
  password!: string;
}
