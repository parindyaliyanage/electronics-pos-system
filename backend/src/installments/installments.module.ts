import { Module } from "@nestjs/common";
import { InstallmentsController } from "./installments.controller";
import { InstallmentsService } from "./installments.service";

// FR5 — plans, schedules
@Module({
  controllers: [InstallmentsController],
  providers: [InstallmentsService],
  exports: [InstallmentsService],
})
export class InstallmentsModule {}
