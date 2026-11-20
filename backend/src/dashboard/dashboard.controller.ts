import { Controller, Get } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/decorators/roles.decorator";
import { DashboardService } from "./dashboard.service";

// The dashboard shows revenue and receivables, so it is Administrator-only.
@Controller("dashboard")
@Roles(UserRole.ADMINISTRATOR)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("summary")
  summary() {
    return this.dashboard.summary();
  }
}
