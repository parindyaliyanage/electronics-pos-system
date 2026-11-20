import { Module } from "@nestjs/common";
import { WorkflowsModule } from "../workflows/workflows.module";
import { InstallmentsController } from "./installments.controller";
import { InstallmentsService } from "./installments.service";

// FR5 — plans, schedules; FR6 — overdue list and reminder log
@Module({
  imports: [WorkflowsModule],
  controllers: [InstallmentsController],
  providers: [InstallmentsService],
  exports: [InstallmentsService],
})
export class InstallmentsModule {}
