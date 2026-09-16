import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { CreateSerializedUnitDto } from "./dto/create-serialized-unit.dto";
import { CreateStockMovementDto } from "./dto/create-stock-movement.dto";
import { InventoryQueryDto } from "./dto/inventory-query.dto";
import { InventoryService } from "./inventory.service";

@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Post("movements")
  @Roles(UserRole.ADMINISTRATOR)
  createMovement(
    @Body() input: CreateStockMovementDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventory.createMovement(input, actor.id);
  }

  @Get("movements")
  @Roles(UserRole.ADMINISTRATOR)
  findMovements(@Query() query: InventoryQueryDto) {
    return this.inventory.findMovements(query);
  }

  @Post("serialized-units")
  @Roles(UserRole.ADMINISTRATOR)
  registerSerializedUnit(
    @Body() input: CreateSerializedUnitDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventory.registerSerializedUnit(input, actor.id);
  }

  @Get("serialized-units")
  @Roles(UserRole.ADMINISTRATOR, UserRole.WORKER)
  findSerializedUnits(@Query() query: InventoryQueryDto) {
    return this.inventory.findSerializedUnits(query);
  }
}
