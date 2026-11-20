import { Module } from "@nestjs/common";
import { DocumentStorageService } from "./document-storage.service";
import { InvoicesController, SaleDocumentsController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";

// FR7 — PDF generation, storage refs
@Module({
  controllers: [InvoicesController, SaleDocumentsController],
  providers: [InvoicesService, DocumentStorageService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
