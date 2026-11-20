import { IsString, MinLength } from "class-validator";
import { IsStrongPassword } from "../../users/dto/password.rules";

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsStrongPassword()
  newPassword!: string;
}
