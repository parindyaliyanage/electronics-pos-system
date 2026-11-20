import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { isUUID } from "class-validator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { InstallmentQueryDto } from "./dto/installment-query.dto";
import { OverdueQueryDto } from "./dto/overdue-query.dto";
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

  // FR6 — declared before ":id" so "overdue" is not parsed as a plan id.
  @Get("overdue")
  @Roles(UserRole.ADMINISTRATOR)
  findOverdue(@Query() query: OverdueQueryDto) {
    return this.installments.findOverdue(query);
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

  @Get(":id/reminders")
  @Roles(UserRole.ADMINISTRATOR, UserRole.WORKER)
  findReminders(@Param("id", ParseUUIDPipe) id: string) {
    return this.installments.findReminders(id);
  }

  @Post(":id/payments")
  @Roles(UserRole.ADMINISTRATOR, UserRole.WORKER)
  recordPayment(
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: RecordInstallmentPaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!idempotencyKey || !isUUID(idempotencyKey)) {
      throw new BadRequestException("Idempotency-Key header must be a UUID");
    }
    return this.installments.recordPayment(id, input, actor.id, idempotencyKey);
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
