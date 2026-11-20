import { Module } from "@nestjs/common";
import { InvoicesModule } from "../invoices/invoices.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

// FR3 — checkout, sale items (the ACID transaction lives here)
@Module({
  imports: [WorkflowsModule, InvoicesModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
