import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { InstallmentQueryDto } from "./dto/installment-query.dto";
import { RecordInstallmentPaymentDto } from "./dto/record-installment-payment.dto";
import { UpdateInstallmentPolicyDto } from "./dto/update-installment-policy.dto";
import { InstallmentsService } from "./installments.service";

@Controller("installments")
export class InstallmentsController {
  constructor(private readonly installments: InstallmentsService) {}

  @Get("policy")
  @Roles(UserRole.ADMINISTRATOR, UserRole.WORKER)
  getPolicy() {
    return this.installments.getPolicy();
  }

  @Put("policy")
  @Roles(UserRole.ADMINISTRATOR)
  updatePolicy(
    @Body() input: UpdateInstallmentPolicyDto,
    @CurrentUser() administrator: AuthenticatedUser,
  ) {
    return this.installments.updatePolicy(input, administrator.id);
  }

  @Get()
  @Roles(UserRole.ADMINISTRATOR, UserRole.WORKER)
  findAll(@Query() query: InstallmentQueryDto) {
    return this.installments.findAll(query);
  }

  @Get(":id")
  @Roles(UserRole.ADMINISTRATOR, UserRole.WORKER)
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.installments.findOne(id);
  }

  @Post(":id/payments")
  @Roles(UserRole.ADMINISTRATOR, UserRole.WORKER)
  recordPayment(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: RecordInstallmentPaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.installments.recordPayment(id, input, actor.id);
  }

  @Patch(":id/cancel")
  @Roles(UserRole.ADMINISTRATOR)
  cancel(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() administrator: AuthenticatedUser,
  ) {
    return this.installments.cancel(id, administrator.id);
  }
}
