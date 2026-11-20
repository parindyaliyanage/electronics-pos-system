import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { InvoicesController, SaleDocumentsController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";

// FR7 — PDF generation, storage refs
@Module({
  imports: [StorageModule],
  controllers: [InvoicesController, SaleDocumentsController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
