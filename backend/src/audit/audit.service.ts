import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(actorId: string, action: string, entity: string, entityId?: string) {
    return this.prisma.auditLog.create({
      data: { actorId, action, entity, entityId },
    });
  }

  recordAuthorizationDenied(actorId: string) {
    return this.record(actorId, "AUTHORIZATION_DENIED", "AUTHORIZATION");
  }
}
