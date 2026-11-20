import { Module } from "@nestjs/common";
import { DocumentStorageService } from "./document-storage.service";

// Object storage (MinIO / S3) shared by invoices (FR7) and reports (FR8).
@Module({
  providers: [DocumentStorageService],
  exports: [DocumentStorageService],
})
export class StorageModule {}
