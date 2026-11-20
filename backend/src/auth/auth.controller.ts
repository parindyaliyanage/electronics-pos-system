import { Body, Controller, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import type { AuthenticatedUser } from "./auth.types";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("login")
  login(@Body() credentials: LoginDto) {
    return this.auth.login(credentials);
  }

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  // FR1 — any signed-in user (Administrator or Worker) changes their own password.
  // Older tokens stop working; the response carries a fresh one.
  @HttpCode(HttpStatus.OK)
  @Post("change-password")
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() input: ChangePasswordDto) {
    return this.auth.changePassword(user.id, input);
  }

  @HttpCode(HttpStatus.OK)
  @Post("logout")
  logout() {
    return { message: "Logged out" };
  }
}
