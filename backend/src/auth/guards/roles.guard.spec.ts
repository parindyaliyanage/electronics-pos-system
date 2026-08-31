import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { AuditService } from "../../audit/audit.service";
import { RolesGuard } from "./roles.guard";

describe("RolesGuard", () => {
  const getAllAndOverride = jest.fn();
  const recordAuthorizationDenied = jest.fn();
  const reflector = { getAllAndOverride } as unknown as Reflector;
  const audit = { recordAuthorizationDenied } as unknown as AuditService;
  const guard = new RolesGuard(reflector, audit);
  const worker = {
    id: "8a8c209b-efad-4a81-9ea7-e0fbc7c01049",
    email: "worker@example.com",
    role: UserRole.WORKER,
    createdAt: new Date(),
  };
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user: worker }) }),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    recordAuthorizationDenied.mockResolvedValue({});
  });

  it("allows a role listed on the endpoint", async () => {
    getAllAndOverride.mockReturnValue([UserRole.WORKER]);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(recordAuthorizationDenied).not.toHaveBeenCalled();
  });

  it("audits and rejects a Worker from an Administrator endpoint", async () => {
    getAllAndOverride.mockReturnValue([UserRole.ADMINISTRATOR]);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(recordAuthorizationDenied).toHaveBeenCalledWith(worker.id);
  });
});
