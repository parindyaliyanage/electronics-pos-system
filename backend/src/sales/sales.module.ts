import { Module } from "@nestjs/common";
import { WorkflowsModule } from "../workflows/workflows.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

// FR3 — checkout, sale items (the ACID transaction lives here)
@Module({
  imports: [WorkflowsModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
