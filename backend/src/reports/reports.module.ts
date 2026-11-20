import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { ReportWorkerService } from "./report-worker.service";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

// FR8 — report jobs, background queue
@Module({
  imports: [StorageModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportWorkerService],
})
export class ReportsModule {}
