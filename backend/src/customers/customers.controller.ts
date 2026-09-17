import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { CustomerQueryDto } from "./dto/customer-query.dto";

@Controller("customers")
@Roles(UserRole.ADMINISTRATOR, UserRole.WORKER)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  create(@Body() input: CreateCustomerDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.customers.create(input, actor.id);
  }

  @Get()
  findAll(@Query() query: CustomerQueryDto) {
    return this.customers.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.customers.findOne(id);
  }

  @Get(":id/history")
  history(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: CustomerQueryDto,
  ) {
    return this.customers.history(id, query);
  }
}
