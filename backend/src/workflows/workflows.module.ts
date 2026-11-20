import { Module } from "@nestjs/common";
import { InstallmentWorkflowsService } from "./installment-workflows.service";
import { TemporalService } from "./temporal.service";
import { WorkflowsController } from "./workflows.controller";

// FR6 — Temporal client calls (starts/signals workflows; executed by workers/temporal-worker)
@Module({
  controllers: [WorkflowsController],
  providers: [TemporalService, InstallmentWorkflowsService],
  exports: [InstallmentWorkflowsService],
})
export class WorkflowsModule {}
