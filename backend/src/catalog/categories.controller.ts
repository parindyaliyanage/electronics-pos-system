import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

@Controller("categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Roles(UserRole.ADMINISTRATOR, UserRole.WORKER)
  findAll() {
    return this.categories.findAll();
  }

  @Post()
  @Roles(UserRole.ADMINISTRATOR)
  create(@Body() input: CreateCategoryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.categories.create(input, actor.id);
  }

  @Patch(":id")
  @Roles(UserRole.ADMINISTRATOR)
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateCategoryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.categories.update(id, input, actor.id);
  }

  @Patch(":id/deactivate")
  @Roles(UserRole.ADMINISTRATOR)
  deactivate(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.categories.deactivate(id, actor.id);
  }
}
