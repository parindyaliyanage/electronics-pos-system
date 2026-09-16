import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service";

// audit_logs writer, used by other modules
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
