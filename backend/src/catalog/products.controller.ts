import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { CreateProductDto } from "./dto/create-product.dto";
import { ProductQueryDto } from "./dto/product-query.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { ProductsService } from "./products.service";

@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @Roles(UserRole.ADMINISTRATOR, UserRole.WORKER)
  findAll(@Query() query: ProductQueryDto) {
    return this.products.findAll(query);
  }

  @Get(":id")
  @Roles(UserRole.ADMINISTRATOR, UserRole.WORKER)
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.products.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMINISTRATOR)
  create(@Body() input: CreateProductDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.products.create(input, actor.id);
  }

  @Patch(":id")
  @Roles(UserRole.ADMINISTRATOR)
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateProductDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.products.update(id, input, actor.id);
  }

  @Patch(":id/deactivate")
  @Roles(UserRole.ADMINISTRATOR)
  deactivate(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.products.deactivate(id, actor.id);
  }
}
