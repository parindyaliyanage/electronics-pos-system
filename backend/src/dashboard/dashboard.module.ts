import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

// Administrator dashboard (SRS 3.9.1): one call returns every summary card.
@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
