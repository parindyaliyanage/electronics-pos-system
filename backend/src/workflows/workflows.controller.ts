import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/decorators/roles.decorator";
import { InstallmentWorkflowsService } from "./installment-workflows.service";

// FR6 — operational endpoints for the installment reminder workflows.
@Controller("workflows")
@Roles(UserRole.ADMINISTRATOR)
export class WorkflowsController {
  constructor(private readonly workflows: InstallmentWorkflowsService) {}

  @Get("health")
  health() {
    return this.workflows.health();
  }

  @Post("installments/sync")
  @HttpCode(200)
  sync() {
    return this.workflows.sync();
  }

  @Get("installments/:scheduleId")
  describe(@Param("scheduleId", ParseUUIDPipe) scheduleId: string) {
    return this.workflows.describeSchedule(scheduleId);
  }

  @Post("installments/:scheduleId/recheck")
  @HttpCode(202)
  recheck(@Param("scheduleId", ParseUUIDPipe) scheduleId: string) {
    return this.workflows.recheckSchedule(scheduleId);
  }
}
