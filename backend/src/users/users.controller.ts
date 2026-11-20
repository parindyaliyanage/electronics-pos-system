import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { CreateUserDto } from "./dto/create-user.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserQueryDto } from "./dto/user-query.dto";
import { UsersService } from "./users.service";

// FR1 — user management (Administrator only)
@Controller("users")
@Roles(UserRole.ADMINISTRATOR)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll(@Query() query: UserQueryDto) {
    return this.users.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.users.findOne(id);
  }

  @Post()
  create(@Body() input: CreateUserDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.users.create(input, admin.id);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateUserDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.users.update(id, input, admin.id);
  }

  @Patch(":id/deactivate")
  deactivate(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.users.deactivate(id, admin.id);
  }

  @Patch(":id/activate")
  activate(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.users.activate(id, admin.id);
  }

  @Patch(":id/password")
  resetPassword(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ResetPasswordDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.users.resetPassword(id, input.password, admin.id);
  }
}
