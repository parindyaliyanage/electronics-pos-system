import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { isUUID } from "class-validator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { CheckoutDto } from "./dto/checkout.dto";
import { SalesService } from "./sales.service";

@Controller("sales")
@Roles(UserRole.ADMINISTRATOR, UserRole.WORKER)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post("checkout")
  checkout(
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CheckoutDto,
    @CurrentUser() cashier: AuthenticatedUser,
  ) {
    if (!idempotencyKey || !isUUID(idempotencyKey)) {
      throw new BadRequestException("Idempotency-Key header must be a UUID");
    }
    return this.sales.checkout(input, cashier.id, idempotencyKey);
  }

  @Get(":id")
  findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.sales.findOne(id, requester);
  }
}
